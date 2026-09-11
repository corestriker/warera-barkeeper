import { describe, expect, it } from 'vitest'
import { dueAlerts, predictAlerts, type Alert } from './alerts'
import { compute, type Bar, type Params } from './regen'
import { defaults } from './settings'
import { buildState, computeState, type State } from './state'
import type { Snapshot } from './warera'

const HOUR = 3_600_000
const NOW = Date.parse('2026-09-07T12:00:00Z')

const bars: Bar[] = [{ key: 'health', label: 'HEALTH', max: 140, hourlyRegen: 14 }]
const params: Params = {
  base: NOW - 3 * HOUR,
  target: NOW + 2 * HOUR,
  tickAnchor: Date.parse('2026-09-07T07:00:00Z'),
  tickPeriod: HOUR,
}

/** Vorlauf der Überlauf-Warnung, wie der Standard der Einstellungen. */
const LEAD = 15 * 60_000

function state(debuffEnd: number | null = null): State {
  return {
    params,
    bars,
    current: {},
    live: true,
    target: 'clock',
    debuffEnd,
    zone: 'Europe/Berlin',
  }
}

/** Merkt Vorhersagen so, wie die Seite es tut: je Platz die letzte. */
function remember(pending: Map<string, Alert>, alerts: Alert[]): Map<string, Alert> {
  for (const a of alerts) pending.set(a.slot, a)
  return pending
}

describe('predictAlerts', () => {
  it('sagt den Auffüll-Zeitpunkt einer Leiste vorher', () => {
    const result = compute(params, bars, { health: 126 })
    const due = predictAlerts(state(), result, NOW, LEAD)
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ kind: 'full', bar: 'HEALTH', slot: 'full:health' })
    expect(due[0]!.at).toBe(result.bars[0]!.fullAt)
  })

  it('sagt das Ende des Pillen-Debuffs vorher', () => {
    const result = compute(params, bars, { health: 140 })
    const end = NOW + HOUR
    const due = predictAlerts(state(end), result, NOW, LEAD).filter((a) => a.kind === 'debuff')
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ kind: 'debuff', at: end, slot: 'debuff' })
  })

  it('sagt ohne Ist-Wert nichts vorher — dann ist der Zeitpunkt unbekannt', () => {
    // Ohne Abruf wird angenommen, die Leisten seien voll; einen
    // Auffüll-Zeitpunkt gibt es dann nicht.
    expect(predictAlerts(state(), compute(params, bars), NOW, LEAD)).toEqual([])
  })

  it('sagt für eine volle Leiste keinen Auffüll-Zeitpunkt mehr vorher', () => {
    const due = predictAlerts(state(), compute(params, bars, { health: 140 }), NOW, LEAD)
    expect(due.filter((a) => a.kind === 'full')).toEqual([])
  })

  it('warnt vor dem Tick, der die Gutschrift verschenkt', () => {
    // Volle Leiste: der nächste Tick schreibt 14 gut, gedeckelt wird bei 140 —
    // die ganze Gutschrift verfällt.
    const due = predictAlerts(state(), compute(params, bars, { health: 140 }), NOW, LEAD)
    const over = due.filter((a) => a.kind === 'overflow')
    expect(over).toHaveLength(1)
    expect(over[0]).toMatchObject({ slot: 'overflow:health', bar: 'HEALTH', lost: 14 })
    // Gewarnt wird vor dem Tick, nicht danach.
    expect(over[0]!.at).toBe(NOW + HOUR - LEAD)
  })

  it('nennt auch den Teil-Überlauf', () => {
    // 130 + 14 = 144, gedeckelt bei 140: vier gehen verloren.
    const due = predictAlerts(state(), compute(params, bars, { health: 130 }), NOW, LEAD)
    expect(due.filter((a) => a.kind === 'overflow')[0]).toMatchObject({ lost: 4 })
  })

  it('warnt nicht, wenn der Tick genau aufgeht', () => {
    // 126 + 14 = 140: nichts verfällt.
    const due = predictAlerts(state(), compute(params, bars, { health: 126 }), NOW, LEAD)
    expect(due.filter((a) => a.kind === 'overflow')).toEqual([])
  })
})

describe('dueAlerts', () => {
  it('meldet ein gemerktes Ereignis, sobald sein Zeitpunkt vorbei ist', () => {
    const alert: Alert = { slot: 'full:health', key: 'k', kind: 'full', at: NOW - 1, bar: 'HEALTH' }
    expect(dueAlerts([alert], NOW, NOW - HOUR, new Set())).toHaveLength(1)
  })

  it('meldet noch nicht, was erst kommt', () => {
    const alert: Alert = { slot: 'full:health', key: 'k', kind: 'full', at: NOW + 1, bar: 'HEALTH' }
    expect(dueAlerts([alert], NOW, NOW - HOUR, new Set())).toEqual([])
  })

  it('meldet nichts, was vor dem Einschalten passiert ist', () => {
    const alert: Alert = { slot: 'full:health', key: 'k', kind: 'full', at: NOW - HOUR, bar: 'H' }
    expect(dueAlerts([alert], NOW, NOW, new Set())).toEqual([])
  })

  it('meldet nichts zweimal', () => {
    const alert: Alert = { slot: 'full:health', key: 'k', kind: 'full', at: NOW - 1, bar: 'H' }
    expect(dueAlerts([alert], NOW, NOW - HOUR, new Set(['k']))).toEqual([])
  })
})

/**
 * Die Regression, wegen der es diese zwei Schritte gibt.
 *
 * Vorher entschied eine einzige Funktion aus `state` und `result`, was fällig
 * ist. Beide Ereignisse sind dort aber nur *vorher* sichtbar: `fullAt` zählt ab
 * dem ersten Tick nach `Params.base`, und `base` ist im Normalfall `now` — der
 * Zeitpunkt lag damit immer in der Zukunft. `State.debuffEnd` wird auf `null`
 * gesetzt, sobald das Ende vorbei ist. Es kam nie eine Meldung an.
 */
describe('im echten Datenfluss der Seite', () => {
  const settings = { ...defaults(), username: 'c0re', notify: true }
  const TICK = Date.parse('2026-09-10T12:00:00Z')

  function snapshot(health: number, debuffEndAt: number | null = null): Snapshot {
    return {
      fetchedAt: TICK - HOUR,
      nextRegenAt: TICK,
      user: {
        id: 'u1',
        username: 'c0re',
        buffs: { debuffEndAt, debuffCodes: [] },
        skills: {
          health: { level: 4, total: 140, currentBarValue: health, hourlyBarRegen: 14 },
          // Hunger bleibt bewusst unter dem Rand: sonst warnt jeder Ablauf
          // hier auch über dessen Überlauf.
          hunger: { level: 4, total: 7, currentBarValue: 6, hourlyBarRegen: 0.7 },
        },
      },
    } as unknown as Snapshot
  }

  it('der Auffüll-Zeitpunkt liegt immer in der Zukunft — deshalb wird gemerkt', () => {
    for (const offset of [-HOUR, -1000, 0, 1000]) {
      const now = TICK + offset
      const { result } = computeState(buildState(settings, snapshot(126), now), settings)
      const at = result.bars[0]!.fullAt
      if (at !== null) expect(at, `${offset} ms zum Tick`).toBeGreaterThan(now)
    }
  })

  it('meldet die volle Leiste über den Tick hinweg', () => {
    const pending = new Map<string, Alert>()
    const fired = new Set<string>()
    const armedAt = TICK - 2 * HOUR
    const seen: Alert[] = []

    for (let now = TICK - 5000; now <= TICK + 5000; now += 1000) {
      // Am Tick bringt der Abruf den neuen Ist-Wert: die Leiste ist voll,
      // die Vorhersage verschwindet — gemeldet wird trotzdem.
      const snap = now < TICK ? snapshot(126) : snapshot(140)
      const st = buildState(settings, snap, now)
      const { result } = computeState(st, settings)
      // Reihenfolge wie in der Seite: erst zustellen, dann neu merken.
      for (const a of dueAlerts(pending.values(), now, armedAt, fired)) {
        fired.add(a.key)
        seen.push(a)
      }
      remember(pending, predictAlerts(st, result, now, LEAD))
    }

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ kind: 'full', bar: 'HEALTH', at: TICK })
  })

  it('meldet auch, wenn der Abruf am Tick ausbleibt und der alte Wert stehen bleibt', () => {
    const pending = new Map<string, Alert>()
    const fired = new Set<string>()
    const seen: Alert[] = []

    for (let now = TICK - 5000; now <= TICK + 5000; now += 1000) {
      // Kein neuer Abruf: die Leiste steht weiter auf 126, die Vorhersage
      // rueckt auf den naechsten Tick weiter.
      const st = buildState(settings, snapshot(126), now)
      const { result } = computeState(st, settings)
      for (const a of dueAlerts(pending.values(), now, TICK - 2 * HOUR, fired)) {
        fired.add(a.key)
        seen.push(a)
      }
      remember(pending, predictAlerts(st, result, now, LEAD))
    }

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ kind: 'full', at: TICK })
  })

  it('warnt einmal je Tick vor dem Überlauf, nicht im Sekundentakt', () => {
    const pending = new Map<string, Alert>()
    const fired = new Set<string>()
    const seen: Alert[] = []
    // Volle Leiste, eine Stunde am Stück beobachtet.
    for (let now = TICK + 1000; now <= TICK + HOUR + 5000; now += 1000) {
      const st = buildState(settings, snapshot(140), now)
      const { result } = computeState(st, settings)
      for (const a of dueAlerts(pending.values(), now, TICK, fired)) {
        fired.add(a.key)
        seen.push(a)
      }
      remember(pending, predictAlerts(st, result, now, LEAD))
    }

    // 3600 Durchläufe, eine Warnung: die für den Tick um TICK+1h. Die für den
    // Tick danach liegt hinter dem Ende der Schleife.
    expect(seen.filter((a) => a.kind === 'overflow')).toHaveLength(1)
    expect(seen[0]).toMatchObject({ kind: 'overflow', bar: 'HEALTH', lost: 14 })
    expect(seen[0]!.at).toBe(TICK + HOUR - LEAD)
  })

  it('meldet das Debuff-Ende, obwohl der Zustand es dann nicht mehr kennt', () => {
    const end = TICK + 30_000
    const pending = new Map<string, Alert>()
    const fired = new Set<string>()
    const seen: Alert[] = []

    for (let now = TICK; now <= TICK + 60_000; now += 1000) {
      const st = buildState(settings, snapshot(140, end), now)
      const { result } = computeState(st, settings)
      // Nach dem Ende kennt der Zustand den Debuff nicht mehr.
      if (now > end) expect(st.debuffEnd).toBeNull()
      for (const a of dueAlerts(pending.values(), now, TICK - HOUR, fired)) {
        fired.add(a.key)
        seen.push(a)
      }
      remember(pending, predictAlerts(st, result, now, LEAD))
    }

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ kind: 'debuff', at: end })
  })
})

describe('Fließkomma am Rand', () => {
  it('warnt nicht wegen eines Überschusses in der zwölften Nachkommastelle', () => {
    const hunger: Bar[] = [{ key: 'hunger', label: 'HUNGER', max: 7, hourlyRegen: 0.7 }]
    const st = { ...state(), bars: hunger }
    // Gebrochene Werte kommen aus dem Abruf, nicht aus einem sauberen Raster.
    // Ein Überschuss von 10^-12 ist Rechenrauschen, kein verlorener Hunger.
    const result = compute(params, hunger, { hunger: 6.3 + 1e-12 })
    expect(predictAlerts(st, result, NOW, LEAD).filter((a) => a.kind === 'overflow')).toEqual([])
  })

  it('warnt aber sehr wohl über einen echten kleinen Verlust', () => {
    const hunger: Bar[] = [{ key: 'hunger', label: 'HUNGER', max: 7, hourlyRegen: 0.7 }]
    const st = { ...state(), bars: hunger }
    const result = compute(params, hunger, { hunger: 6.5 })
    const over = predictAlerts(st, result, NOW, LEAD).filter((a) => a.kind === 'overflow')
    expect(over).toHaveLength(1)
    expect(over[0]!.lost).toBeCloseTo(0.2, 9)
  })
})
