/**
 * Übernommen aus `internal/ui/state_test.go`. Diese Fälle halten die Regel
 * „entweder API oder eigene Werte, nie gemischt“ fest — sie ist schon einmal
 * kaputtgegangen.
 */
import { describe, expect, it } from 'vitest'
import { apiMode, buildState, computeState } from './state'
import { BAR_HEALTH } from './settings'
import { formatClock, instantFromWall } from './zone'
import { BERLIN, testSettings, testSnapshot } from './testing'
import type { Snapshot } from './warera'

function healthBar(s: ReturnType<typeof buildState>): { max: number; regen: number } {
  const bar = s.bars.find((b) => b.key === BAR_HEALTH)
  return { max: bar?.max ?? 0, regen: bar?.hourlyRegen ?? 0 }
}

const NOW = instantFromWall(BERLIN, { year: 2026, month: 9, day: 2, hour: 8, minute: 31 })

describe('Betriebsarten', () => {
  it('nimmt im API-Modus ausschließlich die API-Werte', () => {
    const s = testSettings()
    s.username = 'Beispiel'
    s.bars[BAR_HEALTH] = { max: 999 }

    const st = buildState(s, testSnapshot(), NOW)
    expect(healthBar(st)).toEqual({ max: 140, regen: 14 })
    expect(st.live).toBe(true)
    expect(st.current[BAR_HEALTH]).toBe(117.5)
  })

  it('nimmt ohne Spielername ausschließlich die eigenen Werte und keinen Ist-Wert', () => {
    const s = testSettings()
    s.bars[BAR_HEALTH] = { max: 120 }

    // Selbst mit vorliegendem Snapshot: ohne Spielername zählt er nicht.
    const st = buildState(s, testSnapshot(), NOW)
    expect(healthBar(st)).toEqual({ max: 120, regen: 12 })  // 120 / 10
    expect(st.live).toBe(false)
    expect(Object.keys(st.current)).toHaveLength(0)
  })

  it('behandelt abgeschalteten Abruf als manuellen Betrieb', () => {
    const s = testSettings()
    s.username = 'Beispiel'
    s.api.enabled = false
    s.bars[BAR_HEALTH] = { max: 120 }

    expect(apiMode(s)).toBe(false)
    expect(healthBar(buildState(s, testSnapshot(), NOW)).max).toBe(120)
  })

  it('erfindet im API-Modus ohne Antwort keinen Ist-Wert', () => {
    const s = testSettings()
    s.username = 'Beispiel'

    const st = buildState(s, null, NOW)
    expect(Object.keys(st.current)).toHaveLength(0)
    expect(st.live).toBe(false)
    // Rückfall auf die eigenen Werte, hier der Standard.
    expect(healthBar(st).max).toBe(100)
  })

  it('leitet die Regen-Rate aus dem Maximum ab', () => {
    // Die Rate ist keine Einstellung: WarEra schreibt pro Tick max / 10 gut.
    const s = testSettings()
    s.bars[BAR_HEALTH] = { max: 150 }
    expect(healthBar(buildState(s, null, NOW)).regen).toBe(15)

    s.bars[BAR_HEALTH] = { max: 4 }
    expect(healthBar(buildState(s, null, NOW)).regen).toBeCloseTo(0.4, 9)
  })
})

describe('Zielzeit', () => {
  const end = NOW + 6 * 3_600_000 + 3 * 60_000 // 14:34

  function snapWith(endAt: number | null): Snapshot {
    const snap = testSnapshot()
    snap.user.buffs = { debuffCodes: ['cocain'], debuffEndAt: endAt }
    return snap
  }

  it('übernimmt das Debuff-Ende unverändert', () => {
    const s = testSettings()
    s.username = 'Beispiel'
    s.targetMode = 'debuff'

    const st = buildState(s, snapWith(end), NOW)
    expect(st.target).toBe('debuff')
    expect(st.params.target).toBe(end)
    expect(st.debuffEnd).toBe(end)
    expect(formatClock(st.params.target, BERLIN)).toBe('14:34')
  })

  it('fällt ohne aktiven Debuff auf die Uhrzeit zurück', () => {
    const s = testSettings()
    s.username = 'Beispiel'
    s.targetMode = 'debuff'

    // Abgelaufener Debuff zählt nicht.
    const stale = buildState(s, snapWith(NOW - 60_000), NOW)
    expect(stale.target).toBe('clock')
    expect(formatClock(stale.params.target, BERLIN)).toBe('14:05')

    // Kein Debuff-Feld im Snapshot: ebenfalls Rückfall.
    expect(buildState(s, testSnapshot(), NOW).target).toBe('clock')

    // Ohne Abruf (offline, manueller Betrieb) gibt es keine Debuff-Daten.
    expect(buildState(s, null, NOW).target).toBe('clock')
  })

  it('ignoriert den Debuff im Uhrzeit-Modus', () => {
    const s = testSettings()
    s.username = 'Beispiel'
    s.targetMode = 'clock'

    const st = buildState(s, snapWith(end), NOW)
    expect(st.target).toBe('clock')
    expect(formatClock(st.params.target, BERLIN)).toBe('14:05')
    // Der Debuff wird trotzdem gemeldet — er ist die Alternative.
    expect(st.debuffEnd).toBe(end)
  })

  it('hebt das Debuff-Ende auf den Tick danach, plus fünf Minuten', () => {
    const s = testSettings()
    s.username = 'Beispiel'
    s.targetMode = 'debuff_hour'

    const st = buildState(s, snapWith(end), NOW)
    expect(st.target).toBe('debuffTick')
    expect(formatClock(st.params.target, BERLIN)).toBe('15:05')

    // Ein Tick mehr als beim exakten Ende — das ist der ganze Zweck.
    const exact = buildState({ ...s, targetMode: 'debuff' }, snapWith(end), NOW)
    const withTick = computeState(st, s).result.bars[0]!.safe.ticks
    const withoutTick = computeState(exact, s).result.bars[0]!.safe.ticks
    expect(withTick).toBe(withoutTick + 1)
  })

  it('rechnet auf Wunsch ab einer festen Basiszeit', () => {
    const s = testSettings()
    s.baseMode = 'fixed'
    s.baseTime = '07:00'

    const st = buildState(s, null, NOW)
    expect(formatClock(st.params.base, BERLIN)).toBe('07:00')
    expect(formatClock(st.params.target, BERLIN)).toBe('14:05')
  })

  it('rollt eine vergangene Zielzeit auf morgen', () => {
    const s = testSettings()
    s.targetTime = '07:00'

    const st = buildState(s, null, NOW)
    expect(formatClock(st.params.target, BERLIN)).toBe('07:00')
    expect(st.params.target).toBeGreaterThan(NOW)
    expect(st.params.target - NOW).toBeGreaterThan(20 * 3_600_000)
  })

  it('nimmt den Tick-Anchor aus der API, wenn er da ist', () => {
    const s = testSettings()
    s.username = 'Beispiel'
    const snap = testSnapshot()
    // Ein verschobenes Raster: WarEra tickt hier zur halben Stunde.
    snap.nextRegenAt = instantFromWall('UTC', { year: 2026, month: 9, day: 2, hour: 7, minute: 30 })

    const st = buildState(s, snap, NOW)
    expect(st.params.tickAnchor).toBe(snap.nextRegenAt)
  })
})
