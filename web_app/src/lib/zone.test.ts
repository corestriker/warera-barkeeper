import { describe, expect, it } from 'vitest'
import {
  addWallDays,
  atClock,
  formatClock,
  instantFromWall,
  isValidZone,
  sameWallDay,
  wallTime,
  zoneOr,
} from './zone'
import { BERLIN } from './testing'

describe('Wanduhrzeit und Zeitpunkt', () => {
  it('rechnet in beide Richtungen dasselbe', () => {
    const t = instantFromWall(BERLIN, { year: 2026, month: 9, day: 1, hour: 14, minute: 5 })
    expect(wallTime(t, BERLIN)).toMatchObject({ year: 2026, month: 9, day: 1, hour: 14, minute: 5 })
    expect(formatClock(t, BERLIN)).toBe('14:05')
    // Sommerzeit: Berlin liegt im September zwei Stunden vor UTC.
    expect(formatClock(t, 'UTC')).toBe('12:05')
  })

  it('trifft die Sommerzeit-Umstellung im Frühjahr', () => {
    // 2026 wird am 29. März um 02:00 auf 03:00 vorgestellt.
    const before = instantFromWall(BERLIN, { year: 2026, month: 3, day: 29, hour: 1, minute: 30 })
    const after = instantFromWall(BERLIN, { year: 2026, month: 3, day: 29, hour: 3, minute: 30 })
    // Wanduhr-Abstand zwei Stunden, echter Abstand nur eine.
    expect(after - before).toBe(60 * 60 * 1000)
  })

  it('trifft die Umstellung im Herbst', () => {
    // 2026 wird am 25. Oktober um 03:00 auf 02:00 zurückgestellt.
    const before = instantFromWall(BERLIN, { year: 2026, month: 10, day: 25, hour: 1, minute: 30 })
    const after = instantFromWall(BERLIN, { year: 2026, month: 10, day: 25, hour: 4, minute: 30 })
    // Wanduhr-Abstand drei Stunden, echter Abstand vier.
    expect(after - before).toBe(4 * 60 * 60 * 1000)
  })

  it('schaltet kalendarisch einen Tag weiter, nicht 24 Stunden', () => {
    // Der 25. Oktober 2026 hat in Berlin 25 Stunden. 14:05 bleibt trotzdem 14:05.
    const t = instantFromWall(BERLIN, { year: 2026, month: 10, day: 25, hour: 14, minute: 5 })
    const next = addWallDays(t, BERLIN, 1)
    expect(formatClock(next, BERLIN)).toBe('14:05')
    expect(wallTime(next, BERLIN).day).toBe(26)
    // Über den Monatswechsel hinaus normalisiert sich das Datum von selbst.
    expect(wallTime(addWallDays(t, BERLIN, 7), BERLIN)).toMatchObject({ month: 11, day: 1 })
  })

  it('legt eine Uhrzeit auf den Kalendertag des Bezugszeitpunkts', () => {
    const ref = instantFromWall(BERLIN, { year: 2026, month: 9, day: 1, hour: 23, minute: 50 })
    expect(formatClock(atClock(ref, BERLIN, 7, 0), BERLIN)).toBe('07:00')
    expect(wallTime(atClock(ref, BERLIN, 7, 0), BERLIN).day).toBe(1)
    expect(sameWallDay(ref, atClock(ref, BERLIN, 7, 0), BERLIN)).toBe(true)
  })

  it('prüft Zonen und fällt auf die Browser-Zone zurück', () => {
    expect(isValidZone('Europe/Berlin')).toBe(true)
    expect(isValidZone('')).toBe(true)
    expect(isValidZone('Mars/Olympus')).toBe(false)
    expect(zoneOr('Europe/Berlin')).toBe('Europe/Berlin')
    expect(zoneOr('  ')).not.toBe('')
    expect(zoneOr('Mars/Olympus')).not.toBe('Mars/Olympus')
  })
})
