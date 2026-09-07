/** Übernommen aus `TestComputeHint` und `TestTargetAfterTick` in Go. */
import { describe, expect, it } from 'vitest'
import { computeHint, targetAfterTick } from './hint'
import type { Bar } from './regen'
import { formatClock } from './zone'
import { BERLIN, clock, paramsAt } from './testing'

const bars: Bar[] = [{ key: 'health', label: 'Health', max: 110, hourlyRegen: 11 }]
const WINDOW = 15 * 60 * 1000

describe('computeHint', () => {
  it('Zielzeit exakt auf Tick', () => {
    const h = computeHint(paramsAt(clock(8, 36), clock(14, 0)), bars, WINDOW)!
    expect(h).not.toBeNull()
    expect(h.kind).toBe('onTick')
    expect(h.gap).toBe(0)
    expect(h.suggested).toBe(clock(14, 5))
    expect(h.extra['health']).toBe(11)
  })

  it('Zielzeit kurz vor Tick', () => {
    const h = computeHint(paramsAt(clock(8, 36), clock(13, 50)), bars, WINDOW)!
    expect(h).not.toBeNull()
    expect(h.kind).toBe('nearTick')
    expect(h.gap).toBe(10 * 60 * 1000)
    expect(formatClock(h.suggested, BERLIN)).toBe('14:05')
  })

  it('Zielzeit weit weg vom Tick', () => {
    expect(computeHint(paramsAt(clock(8, 36), clock(13, 20)), bars, WINDOW)).toBeNull()
  })

  it('kein Hinweis, wenn ohnehin voll auffüllbar', () => {
    expect(computeHint(paramsAt(clock(1, 0), clock(14, 0)), bars, WINDOW)).toBeNull()
  })

  it('kein Hinweis ohne Fenster', () => {
    expect(computeHint(paramsAt(clock(8, 36), clock(14, 0)), bars, 0)).toBeNull()
  })
})

describe('targetAfterTick', () => {
  const p = paramsAt(clock(8, 36), clock(14, 5))
  const cases: { name: string; input: number; want: string }[] = [
    // Debuff endet mitten in der Stunde: der 15:00-Tick zählt, plus 5 Minuten.
    { name: 'mitten in der Stunde', input: clock(14, 34), want: '15:05' },
    // Genau auf dem Tick: dieser Tick zählt, es wird keine Stunde verschenkt.
    { name: 'genau auf einem Tick', input: clock(15, 0), want: '15:05' },
    // Eine Sekunde nach dem Tick: der nächste ist gemeint.
    { name: 'kurz nach einem Tick', input: clock(15, 0) + 1000, want: '16:05' },
  ]
  for (const tc of cases) {
    it(tc.name, () => expect(formatClock(targetAfterTick(p, tc.input), BERLIN)).toBe(tc.want))
  }
})
