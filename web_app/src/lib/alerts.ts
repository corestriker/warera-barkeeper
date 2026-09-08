/**
 * Welche Meldung ist fällig?
 *
 * Die Entscheidung steht hier als reine Funktion, ohne Browser-API: sie ist
 * die Stelle, an der man sich vertut (eine Meldung zweimal, eine Meldung für
 * ein Ereignis von gestern), und so lässt sie sich prüfen.
 *
 * Zwei Ereignisse zählen: eine Leiste erreicht wieder 100 %, und der
 * Pillen-Debuff läuft ab. Beide kennen wir **vorher** — `fullAt` kommt aus der
 * Rechnung, `debuffEnd` aus dem Abruf —, gemeldet wird, sobald der Zeitpunkt
 * vorbei ist.
 */
import type { Result } from './regen'
import type { State } from './state'

export type AlertKind = 'full' | 'debuff'

export interface Alert {
  /** Eindeutig je Ereignis, damit nichts zweimal gemeldet wird. */
  key: string
  kind: AlertKind
  at: number
  /** Bei `full`: die Leiste, um die es geht. */
  bar?: string
}

/**
 * Die Ereignisse, die jetzt zu melden sind.
 *
 * `armedAt` ist der Zeitpunkt, ab dem gemeldet werden darf — sonst käme beim
 * Öffnen der Seite eine Meldung für eine Leiste, die schon vor Stunden voll
 * wurde. `fired` enthält die Schlüssel, die schon gemeldet wurden.
 */
export function dueAlerts(
  state: State,
  result: Result,
  now: number,
  armedAt: number,
  fired: ReadonlySet<string>,
): Alert[] {
  const candidates: Alert[] = []

  for (const br of result.bars) {
    // Ohne Ist-Wert gibt es keinen Auffüll-Zeitpunkt: dann wissen wir nicht,
    // wann die Leiste voll ist, und erfinden es auch nicht.
    if (!br.hasCurrent || br.fullAt === null) continue
    candidates.push({
      key: `full:${br.bar.key}:${br.fullAt}`,
      kind: 'full',
      at: br.fullAt,
      bar: br.bar.label,
    })
  }

  if (state.debuffEnd !== null) {
    candidates.push({ key: `debuff:${state.debuffEnd}`, kind: 'debuff', at: state.debuffEnd })
  }

  return candidates.filter((a) => a.at <= now && a.at > armedAt && !fired.has(a.key))
}
