import { describe, expect, it } from 'vitest'
import { dueAlerts } from './alerts'
import { compute, type Bar, type Params } from './regen'
import type { State } from './state'

const HOUR = 3_600_000
const NOW = Date.parse('2026-09-07T12:00:00Z')

const bars: Bar[] = [{ key: 'health', label: 'HEALTH', max: 140, hourlyRegen: 14 }]
const params: Params = {
  base: NOW - 3 * HOUR,
  target: NOW + 2 * HOUR,
  tickAnchor: Date.parse('2026-09-07T07:00:00Z'),
  tickPeriod: HOUR,
}

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

describe('dueAlerts', () => {
  it('meldet eine Leiste, sobald ihr Auffüll-Zeitpunkt vorbei ist', () => {
    // 126 von 140: ein Tick fehlt, und der liegt in der Vergangenheit.
    const result = compute(params, bars, { health: 126 })
    const fullAt = result.bars[0]!.fullAt!
    expect(fullAt).toBeLessThan(NOW)

    const due = dueAlerts(state(), result, NOW, fullAt - 1, new Set())
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ kind: 'full', bar: 'HEALTH' })
  })

  it('meldet nichts, was vor dem Einschalten passiert ist', () => {
    const result = compute(params, bars, { health: 126 })
    // Erst jetzt eingeschaltet: die Leiste war vorher voll, das ist keine
    // Nachricht mehr.
    expect(dueAlerts(state(), result, NOW, NOW, new Set())).toEqual([])
  })

  it('meldet nichts zweimal', () => {
    const result = compute(params, bars, { health: 126 })
    const fullAt = result.bars[0]!.fullAt!
    const first = dueAlerts(state(), result, NOW, fullAt - 1, new Set())
    const fired = new Set(first.map((a) => a.key))
    expect(dueAlerts(state(), result, NOW, fullAt - 1, fired)).toEqual([])
  })

  it('meldet noch nicht, was erst kommt', () => {
    const result = compute(params, bars, { health: 20 })
    expect(result.bars[0]!.fullAt).toBeGreaterThan(NOW)
    expect(dueAlerts(state(), result, NOW, NOW - HOUR, new Set())).toEqual([])
  })

  it('meldet das Ende des Pillen-Debuffs', () => {
    const result = compute(params, bars, { health: 140 })
    const end = NOW - 60_000
    const due = dueAlerts(state(end), result, NOW, end - 1, new Set())
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ kind: 'debuff', at: end })
  })

  it('meldet ohne Ist-Wert nichts — dann ist der Zeitpunkt unbekannt', () => {
    // Ohne Abruf wird angenommen, die Leisten seien voll; einen
    // Auffüll-Zeitpunkt gibt es dann nicht.
    const result = compute(params, bars)
    expect(dueAlerts(state(), result, NOW, NOW - HOUR, new Set())).toEqual([])
  })
})
