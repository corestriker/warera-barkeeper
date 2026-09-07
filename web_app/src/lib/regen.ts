/**
 * Berechnet, wie weit eine WarEra-Leiste (Health, Hunger, …) leergespielt
 * werden darf, damit sie zu einem Zielzeitpunkt wieder voll ist.
 *
 * Der entscheidende Punkt: WarEra regeneriert nicht kontinuierlich, sondern in
 * Stunden-Ticks. Zu jedem Tick werden max/10 gutgeschrieben, gedeckelt bei
 * max. Ob ein Tick noch vor die Zielzeit fällt oder knapp dahinter, macht also
 * immer gleich eine ganze Regenerationsstunde Unterschied.
 *
 * Dieses Modul ist die Übersetzung von `internal/regen/regen.go` der
 * Terminal-App und hält sich bewusst an dessen Aufbau: dieselben Funktionen,
 * dieselben Namen, dieselben Testfälle. Wer hier etwas ändert, ändert es dort
 * mit — sonst rechnen die beiden Apps verschieden.
 *
 * Zeitpunkte und Dauern sind Millisekunden (`number`), wo Go `time.Time` und
 * `time.Duration` benutzt.
 */

/** Der Abstand zwischen zwei Regen-Ticks. */
export const DEFAULT_TICK_PERIOD = 60 * 60 * 1000

/** Eine regenerierende Leiste. */
export interface Bar {
  key: string // "health", "hunger"
  label: string // Anzeigename
  max: number // Maximalwert (skills.<bar>.total)
  hourlyRegen: number // Gutschrift pro Tick (skills.<bar>.hourlyBarRegen)
}

/** Die Zeitparameter einer Berechnung. */
export interface Params {
  base: number // Zeitpunkt, ab dem gerechnet wird
  target: number // Zeitpunkt, zu dem alles wieder voll sein soll
  tickAnchor: number // ein bekannter Tick-Zeitpunkt (aus gameConfig.getDates)
  tickPeriod: number // Abstand der Ticks, normalerweise eine Stunde
}

/** Das Ergebnis einer der beiden Zählweisen. */
export interface Variant {
  ticks: number // Anzahl der Ticks bis zur Zielzeit
  regen: number // ungedeckelte Regeneration: ticks * hourlyRegen
  budget: number // was tatsächlich ausgegeben werden darf
  floor: number // Wert, auf den man runter darf
  floorPct: number // floor in Prozent von max
  capped: boolean // true, wenn die Regeneration für ein volles Auffüllen reicht
}

/**
 * Das Gesamtergebnis für eine Leiste.
 *
 * Angezeigt wird ausschließlich `safe`: eine Zahl, die hält. `risky` bleibt
 * gerechnet, weil es die Mechanik vollständig abbildet und die Grundlage für
 * den Hinweis ist („Zielzeit fünf Minuten später, dann zählt der Tick mit“) —
 * als zweite Zahl in der Oberfläche hat es sich nicht bewährt.
 */
export interface BarResult {
  bar: Bar
  safe: Variant // Tick exakt auf der Zielzeit zählt NICHT — das ist die angezeigte Zahl
  risky: Variant // Tick exakt auf der Zielzeit zählt MIT — nur intern

  // Nur befüllt, wenn mit echten Ist-Werten gerechnet wird.
  hasCurrent: boolean
  current: number
  leftSafe: number // wie viel vom Ist-Wert aus noch ausgegeben werden darf
  leftRisky: number

  /**
   * Der Betrag, der bis zur Zielzeit fehlt, wenn der Ist-Wert schon unter dem
   * Zielwert liegt. Dann ist die Leiste nicht mehr rechtzeitig voll — die
   * wichtigere Information als „0 ausgebbar“.
   */
  deficitSafe: number
  deficitRisky: number

  /**
   * Der Tick, zu dem die Leiste von `current` aus wieder bei `max` steht. Nur
   * gesetzt, wenn ein Ist-Wert vorliegt und die Leiste noch nicht voll ist —
   * sonst `null`.
   */
  fullAt: number | null
  ticksToFull: number
}

/** Die Ergebnisse aller Leisten samt Zeitkontext. */
export interface Result {
  params: Params
  bars: BarResult[]
}

/** Teilt abrundend Richtung minus unendlich (JS trunkiert Richtung null). */
export function floorDiv(a: number, b: number): number {
  const q = Math.trunc(a / b)
  if (a % b !== 0 && a < 0 !== b < 0) return q - 1
  return q
}

/** Teilt aufrundend Richtung plus unendlich. */
export function ceilDiv(a: number, b: number): number {
  const q = Math.trunc(a / b)
  if (a % b !== 0 && a < 0 === b < 0) return q + 1
  return q
}

function period(p: Params): number {
  return p.tickPeriod > 0 ? p.tickPeriod : DEFAULT_TICK_PERIOD
}

/** Das größte k mit anchor + k*period <= t. */
function lastTickIndexAtOrBefore(p: Params, t: number): number {
  return floorDiv(t - p.tickAnchor, period(p))
}

/** Das größte k mit anchor + k*period < t. */
function lastTickIndexBefore(p: Params, t: number): number {
  return ceilDiv(t - p.tickAnchor, period(p)) - 1
}

/**
 * Zählt die Regen-Ticks zwischen `base` und `target`.
 *
 * `inclusive = false` zählt das offene Intervall (base, target): ein Tick, der
 * exakt auf der Zielzeit liegt, wird nicht mitgezählt. `inclusive = true`
 * zählt (base, target] und nimmt ihn mit.
 */
export function countTicks(p: Params, inclusive: boolean): number {
  if (p.target <= p.base) return 0
  const from = lastTickIndexAtOrBefore(p, p.base)
  const to = inclusive ? lastTickIndexAtOrBefore(p, p.target) : lastTickIndexBefore(p, p.target)
  if (to <= from) return 0
  return to - from
}

/** Der erste Tick, der auf oder nach `t` liegt. */
export function tickAtOrAfter(p: Params, t: number): number {
  const k = ceilDiv(t - p.tickAnchor, period(p))
  return p.tickAnchor + k * period(p)
}

/** Der erste Tick echt nach `t`. */
export function tickAfter(p: Params, t: number): number {
  const k = floorDiv(t - p.tickAnchor, period(p)) + 1
  return p.tickAnchor + k * period(p)
}

/** Bis zu `limit` Tick-Zeitpunkte im Intervall (base, target]. */
export function upcomingTicks(p: Params, limit: number): number[] {
  const out: number[] = []
  let t = tickAfter(p, p.base)
  while (out.length < limit && t <= p.target) {
    out.push(t)
    t += period(p)
  }
  return out
}

/** Rechnet eine Tick-Anzahl in ein Budget für eine Leiste um. */
export function evaluate(b: Bar, ticks: number): Variant {
  const regen = ticks * b.hourlyRegen
  let budget = regen
  let capped = false
  if (budget >= b.max) {
    budget = b.max
    capped = true
  }
  if (budget < 0) budget = 0
  const floor = b.max - budget
  return {
    ticks,
    regen,
    budget,
    floor,
    floorPct: b.max > 0 ? (floor / b.max) * 100 : 0,
    capped,
  }
}

/**
 * Zählt die Ticks, bis eine Leiste von `current` aus wieder bei `max` steht.
 * 0 heißt: schon voll (oder es gibt keine Regeneration).
 */
export function ticksToFull(b: Bar, current: number): number {
  const missing = b.max - current
  if (missing <= 0 || b.hourlyRegen <= 0) return 0
  // Aufrunden: ein halber Tick füllt nichts auf, es zählt der Tick, der die
  // Leiste über die Kante schiebt.
  return Math.ceil(missing / b.hourlyRegen)
}

/**
 * Der Zeitpunkt, zu dem die Leiste von `current` aus wieder voll ist, oder
 * `null`, wenn sie das schon ist oder nicht regeneriert.
 *
 * Gezählt wird ab dem ersten Tick echt nach `base` — genau die Ticks, die auch
 * `countTicks` zählt, damit beide Zahlen dieselbe Wirklichkeit beschreiben.
 */
export function fullAt(p: Params, b: Bar, current: number): { at: number; ticks: number } | null {
  const n = ticksToFull(b, current)
  if (n === 0) return null
  const first = tickAfter(p, p.base)
  return { at: first + (n - 1) * period(p), ticks: n }
}

/**
 * Berechnet für jede Leiste, wie weit sie leergespielt werden darf.
 *
 * `current` ordnet Leisten-Keys ihren echten Ist-Wert zu und darf leer sein.
 * Ohne Ist-Werte gilt die Annahme, dass zum Zeitpunkt `base` alles voll ist.
 */
export function compute(p: Params, bars: Bar[], current?: Record<string, number>): Result {
  const safeTicks = countTicks(p, false)
  const riskyTicks = countTicks(p, true)

  const out: BarResult[] = bars.map((b) => {
    const safe = evaluate(b, safeTicks)
    const risky = evaluate(b, riskyTicks)
    const br: BarResult = {
      bar: b,
      safe,
      risky,
      hasCurrent: false,
      current: 0,
      leftSafe: 0,
      leftRisky: 0,
      deficitSafe: 0,
      deficitRisky: 0,
      fullAt: null,
      ticksToFull: 0,
    }

    const cur = current === undefined ? undefined : current[b.key]
    if (cur !== undefined) {
      br.hasCurrent = true
      br.current = cur
      br.leftSafe = Math.max(0, cur - safe.floor)
      br.leftRisky = Math.max(0, cur - risky.floor)
      br.deficitSafe = Math.max(0, safe.floor - cur)
      br.deficitRisky = Math.max(0, risky.floor - cur)
      const full = fullAt(p, b, cur)
      if (full !== null) {
        br.fullAt = full.at
        br.ticksToFull = full.ticks
      }
    }
    return br
  })

  return { params: p, bars: out }
}
