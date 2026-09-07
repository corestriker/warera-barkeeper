import { describe, expect, it, vi } from 'vitest'
import { WareraError, fetchSnapshot, getUserLite, nextRegenAt, resolveUser } from './warera'

/** Ein `fetch`, das je URL-Fragment eine vorbereitete Antwort liefert. */
function fakeFetch(routes: Record<string, unknown>, status = 200): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    const hit = Object.keys(routes).find((k) => url.includes(k))
    if (hit === undefined) throw new Error(`unerwarteter Aufruf: ${url}`)
    return new Response(JSON.stringify(routes[hit]), { status }) as Response
  }) as unknown as typeof fetch
}

const opts = (fetchImpl: typeof fetch) => ({ fetchImpl, timeoutMs: 500 })

describe('resolveUser', () => {
  it('nimmt einen eindeutigen Treffer ohne Gegenprobe', async () => {
    const fetchImpl = fakeFetch({ 'search.searchAnything': { result: { data: { userIds: ['abc'] } } } })
    await expect(resolveUser('c0re', opts(fetchImpl))).resolves.toBe('abc')
  })

  it('prüft bei mehreren Treffern auf exakte Namensgleichheit', async () => {
    let call = 0
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('search.searchAnything')) {
        return new Response(JSON.stringify({ result: { data: { userIds: ['a', 'b'] } } }))
      }
      call++
      const username = call === 1 ? 'c0reXL' : 'c0re'
      return new Response(JSON.stringify({ result: { data: { _id: 'b', username, skills: {} } } }))
    }) as unknown as typeof fetch

    await expect(resolveUser('c0re', opts(fetchImpl))).resolves.toBe('b')
  })

  it('meldet einen unbekannten Namen als notFound', async () => {
    const fetchImpl = fakeFetch({ 'search.searchAnything': { result: { data: { userIds: [] } } } })
    await expect(resolveUser('niemand', opts(fetchImpl))).rejects.toMatchObject({ code: 'notFound' })
  })

  it('meldet einen mehrdeutigen Namen als ambiguous', async () => {
    const fetchImpl = fakeFetch({
      'search.searchAnything': { result: { data: { userIds: ['a', 'b'] } } },
      'user.getUserLite': { result: { data: { _id: 'a', username: 'jemand anders', skills: {} } } },
    })
    await expect(resolveUser('c0re', opts(fetchImpl))).rejects.toMatchObject({ code: 'ambiguous' })
  })

  it('verlangt überhaupt einen Namen', async () => {
    await expect(resolveUser('   ')).rejects.toMatchObject({ code: 'noUsername' })
  })
})

describe('getUserLite', () => {
  it('liest Skills und Debuff-Ende', async () => {
    const fetchImpl = fakeFetch({
      'user.getUserLite': {
        result: {
          data: {
            _id: 'u1',
            username: 'c0re',
            leveling: { level: 12 },
            buffs: { debuffCodes: ['cocain'], debuffEndAt: '2026-09-07T12:34:00.000Z' },
            skills: {
              health: { level: 3, total: 140, currentBarValue: 117.5, hourlyBarRegen: 14 },
              hunger: { level: 3, total: 7, currentBarValue: 6.1, hourlyBarRegen: 0.7 },
            },
          },
        },
      },
    })

    const user = await getUserLite('u1', opts(fetchImpl))
    expect(user.username).toBe('c0re')
    expect(user.level).toBe(12)
    expect(user.skills['health']).toEqual({ level: 3, total: 140, currentBarValue: 117.5, hourlyBarRegen: 14 })
    expect(user.buffs.debuffEndAt).toBe(Date.parse('2026-09-07T12:34:00.000Z'))
  })

  it('verträgt eine Antwort ohne Skills und ohne Debuff', async () => {
    const fetchImpl = fakeFetch({ 'user.getUserLite': { result: { data: { _id: 'u1', username: 'c0re' } } } })
    const user = await getUserLite('u1', opts(fetchImpl))
    expect(user.buffs.debuffEndAt).toBeNull()
    expect(user.skills['health']).toEqual({ level: 0, total: 0, currentBarValue: 0, hourlyBarRegen: 0 })
  })
})

describe('Fehler der Hülle', () => {
  it('reicht einen tRPC-Fehler technisch durch', async () => {
    const fetchImpl = fakeFetch({ 'gameConfig.getDates': { error: { message: 'kaputt' } } }, 500)
    const err = await nextRegenAt(opts(fetchImpl)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(WareraError)
    expect(err).toMatchObject({ code: 'technical' })
    expect((err as WareraError).message).toContain('kaputt')
  })

  it('meldet eine Antwort, die kein JSON ist', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>Cloudflare</html>')) as unknown as typeof fetch
    await expect(nextRegenAt(opts(fetchImpl))).rejects.toMatchObject({ code: 'technical' })
  })

  it('meldet ein fehlendes nextRegenAt', async () => {
    const fetchImpl = fakeFetch({ 'gameConfig.getDates': { result: { data: { nextDayAt: 'x' } } } })
    await expect(nextRegenAt(opts(fetchImpl))).rejects.toMatchObject({ code: 'technical' })
  })
})

describe('fetchSnapshot', () => {
  const user = {
    _id: 'u1',
    username: 'c0re',
    skills: { health: { total: 140, currentBarValue: 117.5, hourlyBarRegen: 14 } },
  }

  it('holt Werte und Tick-Raster und gibt die aufgelöste ID zurück', async () => {
    const fetchImpl = fakeFetch({
      'search.searchAnything': { result: { data: { userIds: ['u1'] } } },
      'user.getUserLite': { result: { data: user } },
      'gameConfig.getDates': { result: { data: { nextRegenAt: '2026-09-07T07:00:00.000Z' } } },
    })

    const got = await fetchSnapshot('c0re', '', opts(fetchImpl))
    expect(got.userId).toBe('u1')
    expect(got.snapshot.user.skills['health']?.total).toBe(140)
    expect(got.snapshot.nextRegenAt).toBe(Date.parse('2026-09-07T07:00:00.000Z'))
  })

  it('behält die Leisten-Werte, wenn nur das Tick-Raster fehlt', async () => {
    // Ein fehlender Anchor ist kein Grund, den Abruf wegzuwerfen — der
    // Aufrufer fällt auf die volle Stunde UTC zurück.
    const fetchImpl = fakeFetch({
      'user.getUserLite': { result: { data: user } },
      'gameConfig.getDates': { error: { message: 'weg' } },
    })

    const got = await fetchSnapshot('c0re', 'u1', opts(fetchImpl))
    expect(got.snapshot.nextRegenAt).toBeNull()
    expect(got.snapshot.user.skills['health']?.total).toBe(140)
  })

  it('spart die Namensauflösung, wenn die ID schon bekannt ist', async () => {
    const fetchImpl = fakeFetch({
      'user.getUserLite': { result: { data: user } },
      'gameConfig.getDates': { result: { data: { nextRegenAt: '2026-09-07T07:00:00.000Z' } } },
    })
    await expect(fetchSnapshot('c0re', 'u1', opts(fetchImpl))).resolves.toMatchObject({ userId: 'u1' })
  })
})
