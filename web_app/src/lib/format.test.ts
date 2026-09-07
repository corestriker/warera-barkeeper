import { describe, expect, it } from 'vitest'
import { fmtDuration, fmtDurationShort, num, pct } from './format'

describe('num', () => {
  it('formatiert ganze Zahlen ohne Nachkommastelle', () => {
    expect(num(140)).toBe('140')
    expect(num(0)).toBe('0')
  })
  it('formatiert gebrochene Werte mit einer Stelle — Hunger regeneriert 0,4', () => {
    expect(num(117.5)).toBe('117.5')
    expect(num(0.4)).toBe('0.4')
    expect(num(2.4000000000000004)).toBe('2.4')
  })
})

describe('pct', () => {
  it('lässt unnötige Nachkommastellen weg', () => {
    expect(pct(80)).toBe('80%')
    expect(pct(82.5)).toBe('82.5%')
  })
})

describe('Dauern', () => {
  it('formatiert wie die TUI', () => {
    expect(fmtDuration(2 * 3_600_000 + 48 * 60_000)).toBe('2h 48m 00s')
    expect(fmtDuration(48 * 60_000 + 5000)).toBe('48m 05s')
    expect(fmtDuration(9000)).toBe('9s')
    expect(fmtDuration(-5000)).toBe('0s')
  })
  it('formatiert die Kurzform ohne Sekunden', () => {
    expect(fmtDurationShort(6 * 3_600_000)).toBe('6h 00m')
    expect(fmtDurationShort(12 * 60_000 + 59_000)).toBe('12m')
  })
})
