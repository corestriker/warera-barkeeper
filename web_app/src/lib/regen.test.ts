/**
 * Die Testfälle sind aus `internal/regen/regen_test.go` übernommen. Sie sind
 * die Klammer, die verhindert, dass Terminal-App und Webapp verschieden
 * rechnen: wer einen Fall hier ändert, ändert ihn dort mit.
 */
import { describe, expect, it } from 'vitest'
import {
  compute,
  countTicks,
  evaluate,
  fullAt,
  ticksToFull,
  upcomingTicks,
  type Bar,
} from './regen'
import { nextOccurrence, parseClock } from './schedule'
import { formatClock, instantFromWall } from './zone'
import { BERLIN, clock, paramsAt } from './testing'

const health: Bar = { key: 'health', label: 'Health', max: 110, hourlyRegen: 11 }

describe('countTicks', () => {
  const cases: { name: string; base: number; target: number; safe: number; risky: number }[] = [
    {
      // Der Fall aus der README: 08:36 -> 14:00.
      // Ticks 09,10,11,12,13 sicher; der 14:00-Tick nur riskant.
      name: 'Zielzeit exakt auf einem Tick',
      base: clock(8, 36),
      target: clock(14, 0),
      safe: 5,
      risky: 6,
    },
    {
      // Fünf Minuten später und der 14:00-Tick ist sicher drin.
      name: 'Zielzeit fünf Minuten nach dem Tick',
      base: clock(8, 36),
      target: clock(14, 5),
      safe: 6,
      risky: 6,
    },
    { name: 'Zielzeit kurz vor einem Tick', base: clock(8, 36), target: clock(13, 50), safe: 5, risky: 5 },
    {
      name: 'Basis exakt auf einem Tick zählt diesen nicht mit',
      base: clock(9, 0),
      target: clock(12, 0),
      safe: 2,
      risky: 3,
    },
    { name: 'Zielzeit gleich Basis', base: clock(9, 30), target: clock(9, 30), safe: 0, risky: 0 },
    { name: 'Zielzeit vor der Basis', base: clock(15, 0), target: clock(14, 0), safe: 0, risky: 0 },
    { name: 'Weniger als eine Stunde Vorlauf', base: clock(13, 10), target: clock(13, 50), safe: 0, risky: 0 },
  ]

  for (const tc of cases) {
    it(tc.name, () => {
      const p = paramsAt(tc.base, tc.target)
      expect(countTicks(p, false)).toBe(tc.safe)
      expect(countTicks(p, true)).toBe(tc.risky)
    })
  }
})

describe('compute', () => {
  it('rechnet das Health-Beispiel', () => {
    const got = compute(paramsAt(clock(8, 36), clock(14, 0)), [health]).bars[0]!
    expect(got.safe).toMatchObject({ ticks: 5, budget: 55, floor: 55 })
    expect(got.safe.floorPct).toBeCloseTo(50, 9)
    expect(got.risky).toMatchObject({ ticks: 6, budget: 66, floor: 44 })
    expect(got.risky.floorPct).toBeCloseTo(40, 9)
  })

  it('deckelt beim Maximum', () => {
    // Zwölf Stunden Vorlauf regenerieren mehr als eine volle Leiste.
    const got = compute(paramsAt(clock(1, 0), clock(14, 5)), [health]).bars[0]!
    expect(got.safe.capped).toBe(true)
    expect(got.safe).toMatchObject({ budget: 110, floor: 0, floorPct: 0 })
    // Ungedeckelt ist die Regeneration größer als das Budget.
    expect(got.safe.regen).toBeGreaterThan(got.safe.budget)
  })

  it('rechnet Hunger fraktional', () => {
    // Hunger hat auf Skill-Level 0 nur max 4 und regeneriert 0,4 pro Tick.
    const hunger: Bar = { key: 'hunger', label: 'Hunger', max: 4, hourlyRegen: 0.4 }
    const got = compute(paramsAt(clock(8, 36), clock(14, 5)), [hunger]).bars[0]!
    expect(got.safe.ticks).toBe(6)
    expect(got.safe.budget).toBeCloseTo(2.4, 9)
    expect(got.safe.floor).toBeCloseTo(1.6, 9)
  })

  it('rechnet mit Ist-Werten', () => {
    const p = paramsAt(clock(8, 36), clock(14, 0))
    // Floor sicher ist 55. Bei 70 Ist-Wert bleiben also noch 15 übrig.
    const got = compute(p, [health], { health: 70 }).bars[0]!
    expect(got.hasCurrent).toBe(true)
    expect(got.current).toBe(70)
    expect(got.leftSafe).toBe(15)
    expect(got.leftRisky).toBe(26)

    // Wer schon unter dem Floor liegt, darf nichts mehr ausgeben (nicht negativ).
    expect(compute(p, [health], { health: 30 }).bars[0]!.leftSafe).toBe(0)
  })

  it('beziffert das Defizit', () => {
    // Wer schon unter dem Zielwert liegt, schafft die 100 % nicht mehr. Das ist
    // die wichtigere Aussage als „0 ausgebbar“.
    const p = paramsAt(clock(8, 36), clock(14, 0))
    const got = compute(p, [health], { health: 18.6 }).bars[0]!
    expect(got.deficitSafe).toBeCloseTo(36.4, 9)
    expect(got.deficitRisky).toBeCloseTo(25.4, 9)

    // Über dem Zielwert gibt es kein Defizit.
    const over = compute(p, [health], { health: 80 }).bars[0]!
    expect(over.deficitSafe).toBe(0)
    expect(over.deficitRisky).toBe(0)
  })

  it('liefert den Auffüll-Zeitpunkt, sobald ein Ist-Wert da ist', () => {
    const p = paramsAt(clock(11, 12), clock(14, 5))
    const bars: Bar[] = [{ key: 'health', label: 'Health', max: 140, hourlyRegen: 14 }]

    // 80 von 140: Zielwert ist 98, der Ist-Wert liegt darunter — die Leiste
    // wird zur Zielzeit nicht voll, sondern erst um 16:00 (fünf Ticks).
    const got = compute(p, bars, { health: 80 }).bars[0]!
    expect(got.deficitSafe).toBe(18)
    expect(got.ticksToFull).toBe(5)
    expect(formatClock(got.fullAt!, BERLIN)).toBe('16:00')

    // Ohne Ist-Wert bleibt das Feld leer.
    expect(compute(p, bars).bars[0]!.fullAt).toBeNull()
  })
})

describe('ticksToFull und fullAt', () => {
  const big: Bar = { key: 'health', label: 'Health', max: 140, hourlyRegen: 14 }
  const hunger: Bar = { key: 'hunger', label: 'Hunger', max: 7, hourlyRegen: 0.7 }

  const cases: { name: string; bar: Bar; current: number; want: number }[] = [
    { name: 'schon voll', bar: big, current: 140, want: 0 },
    { name: 'über voll', bar: big, current: 150, want: 0 },
    { name: 'genau ein Tick fehlt', bar: big, current: 126, want: 1 },
    { name: 'ein halber Tick fehlt — trotzdem ein ganzer Tick', bar: big, current: 133, want: 1 },
    { name: 'anderthalb Ticks fehlen', bar: big, current: 119, want: 2 },
    { name: 'leer', bar: big, current: 0, want: 10 },
    { name: 'fraktional', bar: hunger, current: 6.1, want: 2 },
    { name: 'keine Regeneration', bar: { key: 'x', label: 'x', max: 100, hourlyRegen: 0 }, current: 50, want: 0 },
  ]
  for (const tc of cases) {
    it(tc.name, () => expect(ticksToFull(tc.bar, tc.current)).toBe(tc.want))
  }

  // fullAt muss auf einem Tick landen, nicht auf einer krummen Uhrzeit — und
  // der erste Tick zählt schon als Auffüllung.
  it('landet auf einem Tick', () => {
    const p = paramsAt(clock(11, 12), clock(14, 5))

    // 117,5 von 140: es fehlen 22,5, also zwei Ticks — 12:00 und 13:00.
    const two = fullAt(p, big, 117.5)!
    expect(two.ticks).toBe(2)
    expect(formatClock(two.at, BERLIN)).toBe('13:00')

    // Ein einzelner fehlender Tick ist mit dem nächsten Tick erledigt.
    const one = fullAt(p, big, 130)!
    expect(one.ticks).toBe(1)
    expect(formatClock(one.at, BERLIN)).toBe('12:00')

    // Volle Leiste: kein Zeitpunkt.
    expect(fullAt(p, big, 140)).toBeNull()
  })
})

describe('upcomingTicks', () => {
  it('zählt ab dem ersten Tick nach der Basis und nicht über die Zielzeit hinaus', () => {
    const p = paramsAt(clock(8, 36), clock(14, 5))
    const got = upcomingTicks(p, 3)
    expect(got).toHaveLength(3)
    expect(formatClock(got[0]!, BERLIN)).toBe('09:00')
    expect(upcomingTicks(p, 50)).toHaveLength(6)
  })
})

describe('nextOccurrence', () => {
  it('rollt auf morgen, sobald die Uhrzeit vorbei ist', () => {
    const base = clock(8, 36)
    expect(nextOccurrence(base, BERLIN, 14, 5)).toBe(clock(14, 5))

    // Liegt die Zielzeit schon hinter der Basis, rollt sie auf morgen.
    const morgen = instantFromWall(BERLIN, { year: 2026, month: 9, day: 2, hour: 7, minute: 0 })
    expect(nextOccurrence(base, BERLIN, 7, 0)).toBe(morgen)

    // Zielzeit exakt gleich der Basis zählt als vergangen.
    const gleich = instantFromWall(BERLIN, { year: 2026, month: 9, day: 2, hour: 8, minute: 36 })
    expect(nextOccurrence(base, BERLIN, 8, 36)).toBe(gleich)
  })
})

describe('Zeitumstellung', () => {
  it('zählt an einem 25-Stunden-Tag eine Stunde mehr', () => {
    // In der Nacht vom 25. auf den 26. Oktober 2026 wird in Europa die Uhr um
    // 03:00 auf 02:00 zurückgestellt. Der Kalendertag hat 25 Stunden, das
    // Tick-Raster läuft aber stur in UTC weiter.
    const base = instantFromWall(BERLIN, { year: 2026, month: 10, day: 25, hour: 0, minute: 30 })
    const target = nextOccurrence(base, BERLIN, 14, 5)
    expect(formatClock(target, BERLIN)).toBe('14:05')

    // Von 00:30 aus liegen an diesem 25-Stunden-Tag 15 Ticks vor 14:05.
    expect(countTicks(paramsAt(base, target), false)).toBe(15)

    // Gegenprobe: derselbe Wanduhr-Abstand an einem normalen Tag ergibt einen
    // Tick weniger.
    const normal = instantFromWall(BERLIN, { year: 2026, month: 10, day: 24, hour: 0, minute: 30 })
    expect(countTicks(paramsAt(normal, nextOccurrence(normal, BERLIN, 14, 5)), false)).toBe(14)
  })
})

describe('parseClock', () => {
  const ok: [string, number, number][] = [
    ['14:05', 14, 5],
    ['07:00', 7, 0],
    ['0:00', 0, 0],
    [' 23:59 ', 23, 59],
  ]
  for (const [input, hour, minute] of ok) {
    it(`liest ${input.trim()}`, () => expect(parseClock(input)).toEqual({ hour, minute }))
  }
  for (const input of ['24:00', '12:60', '1400', '', 'ab:cd', '14:05:00', '-1:00', '14,05']) {
    it(`weist ${JSON.stringify(input)} zurück`, () => expect(parseClock(input)).toBeNull())
  }
})

describe('evaluate', () => {
  it('gibt bei negativen Ticks kein negatives Budget zurück', () => {
    expect(evaluate(health, 0)).toMatchObject({ budget: 0, floor: 110, floorPct: 100 })
  })
})
