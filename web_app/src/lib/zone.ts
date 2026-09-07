/**
 * Zeitzonen-Rechnung ohne Bibliothek.
 *
 * Die Go-Fassung rechnet mit `time.Time` in einer `*time.Location`. Im Browser
 * gibt es das nicht: ein `Date` ist ein nackter Zeitpunkt, die Zone kennt nur
 * `Intl`. Also wird hier genau das nachgebaut, was `regen` aus Go braucht —
 * Wanduhrzeit lesen, aus Wanduhrzeit einen Zeitpunkt bauen, kalendarisch einen
 * Tag weiterschalten.
 *
 * Zeitpunkte sind durchgehend Millisekunden seit Epoch (`number`), nicht
 * `Date`: damit ist die Tick-Arithmetik ganzzahlig und es gibt keine
 * versehentlich veränderten Objekte.
 */

/** Eine Wanduhrzeit in einer bestimmten Zone. */
export interface WallTime {
  year: number
  month: number // 1–12, nicht 0-basiert wie in Date
  day: number
  hour: number
  minute: number
  second: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone)
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(zone, f)
  }
  return f
}

/** Die Zone des Browsers — der Standard, wenn nichts eingestellt ist. */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Prüft eine IANA-Zone. Der leere String gilt als „Systemzone“ und ist gültig. */
export function isValidZone(zone: string): boolean {
  const z = zone.trim()
  if (z === '') return true
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z })
    return true
  } catch {
    return false
  }
}

/**
 * Löst die eingestellte Zone auf. Leer oder unbekannt fällt auf die Zone des
 * Browsers zurück — wie `config.Location()` auf `time.Local`.
 */
export function zoneOr(zone: string | undefined): string {
  const z = (zone ?? '').trim()
  if (z === '' || !isValidZone(z)) return browserZone()
  return z
}

/** Die Wanduhrzeit eines Zeitpunkts in einer Zone. */
export function wallTime(instant: number, zone: string): WallTime {
  const parts = formatter(zone).formatToParts(new Date(instant))
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type)
    return part === undefined ? 0 : Number(part.value)
  }
  return {
    year: field('year'),
    month: field('month'),
    day: field('day'),
    hour: field('hour'),
    minute: field('minute'),
    second: field('second'),
  }
}

/**
 * Der Zonen-Offset zu einem Zeitpunkt, in Millisekunden.
 *
 * Getrickst wird über den Umweg „Wanduhrzeit als UTC lesen“: die Differenz zum
 * echten Zeitpunkt ist genau der Offset. Sekundenbruchteile fallen dabei weg,
 * deshalb wird auf die Sekunde abgerundet — Offsets sind ohnehin volle Minuten.
 */
function offsetAt(instant: number, zone: string): number {
  const w = wallTime(instant, zone)
  const asUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return asUTC - Math.floor(instant / 1000) * 1000
}

/**
 * Baut aus einer Wanduhrzeit einen Zeitpunkt.
 *
 * Zwei Durchgänge, weil der Offset selbst vom Ergebnis abhängt: der erste
 * schätzt mit dem Offset der als UTC gelesenen Zeit, der zweite korrigiert mit
 * dem Offset, der dort tatsächlich gilt. Das ist die Stelle, an der die
 * Zeitumstellung sonst eine Stunde verschluckt.
 *
 * Über- und untergelaufene Felder (Tag 32, Monat 0) normalisiert `Date.UTC`
 * von selbst — genau wie `time.Date` in Go.
 */
export function instantFromWall(
  zone: string,
  w: { year: number; month: number; day: number; hour: number; minute: number; second?: number },
): number {
  const asUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second ?? 0)
  const first = asUTC - offsetAt(asUTC, zone)
  return asUTC - offsetAt(first, zone)
}

/**
 * Legt eine Uhrzeit auf denselben Kalendertag wie `ref`, in dessen Zone.
 * Entspricht `regen.AtClock`.
 */
export function atClock(ref: number, zone: string, hour: number, minute: number): number {
  const w = wallTime(ref, zone)
  return instantFromWall(zone, { year: w.year, month: w.month, day: w.day, hour, minute })
}

/**
 * Schaltet kalendarisch Tage weiter — nicht 24 Stunden.
 *
 * Das ist der Unterschied, der an einem 23- oder 25-Stunden-Tag zählt: 14:05
 * bleibt 14:05. In Go macht das `AddDate`.
 */
export function addWallDays(instant: number, zone: string, days: number): number {
  const w = wallTime(instant, zone)
  return instantFromWall(zone, { ...w, day: w.day + days })
}

/** Uhrzeit als `HH:MM` in der angegebenen Zone. */
export function formatClock(instant: number, zone: string): string {
  const w = wallTime(instant, zone)
  return `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`
}

/** Liegen zwei Zeitpunkte auf demselben Kalendertag der Zone? */
export function sameWallDay(a: number, b: number, zone: string): boolean {
  const x = wallTime(a, zone)
  const y = wallTime(b, zone)
  return x.year === y.year && x.month === y.month && x.day === y.day
}
