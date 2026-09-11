/**
 * Welche Meldung ist fällig?
 *
 * Die Entscheidung steht hier als reine Funktion, ohne Browser-API: sie ist
 * die Stelle, an der man sich vertut (eine Meldung zweimal, eine Meldung für
 * ein Ereignis von gestern), und so lässt sie sich prüfen.
 *
 * Drei Ereignisse zählen: eine Leiste erreicht wieder 100 %, eine Leiste läuft
 * beim nächsten Tick über (die Gutschrift wird gedeckelt, der Überschuss
 * verfällt), und der Pillen-Debuff läuft ab.
 *
 * **Der Grund für die zwei Schritte:** Beide Ereignisse kennt die Rechnung nur
 * *vorher*. `fullAt` zählt ab dem ersten Tick nach `Params.base`, und `base`
 * ist im Normalfall `now` — der Zeitpunkt liegt damit immer in der Zukunft und
 * wird nie „jetzt“. `State.debuffEnd` verschwindet aus demselben Grund in dem
 * Moment, in dem der Debuff abläuft. Wer erst beim Eintreten nachsieht, sieht
 * nichts mehr. Deshalb wird die Vorhersage gemerkt (`predictAlerts`) und
 * getrennt davon zugestellt (`dueAlerts`).
 */
import { tickAfter, type Result } from './regen'
import type { State } from './state'

export type AlertKind = 'full' | 'overflow' | 'debuff'

export interface Alert {
  /**
   * Welches Ereignis — eine Leiste oder der Debuff. Der Platz, unter dem die
   * Vorhersage gemerkt wird: eine neue Vorhersage ersetzt die alte, damit nach
   * einem Schluck Wasser nicht die alte Uhrzeit stehen bleibt.
   */
  slot: string
  /** Platz **und** Zeitpunkt, damit nichts zweimal gemeldet wird. */
  key: string
  kind: AlertKind
  at: number
  /** Bei `full` und `overflow`: die Leiste, um die es geht. */
  bar?: string
  /** Bei `overflow`: wie viel der nächste Tick verschenkt. */
  lost?: number
}

/**
 * Die Ereignisse, die aus dem aktuellen Zustand vorhersehbar sind.
 *
 * Sie liegen alle in der Zukunft — gemeldet wird nichts davon sofort. Der
 * Aufrufer merkt sie sich je `slot` und reicht sie später an `dueAlerts`.
 *
 * `leadMs` ist der Vorlauf für die Überlauf-Warnung: die soll **vor** dem Tick
 * kommen, der die Gutschrift verschenkt, sonst kommt sie zu spät zum Handeln.
 */
export function predictAlerts(
  state: State,
  result: Result,
  now: number,
  leadMs: number,
): Alert[] {
  const out: Alert[] = []
  const tick = tickAfter(state.params, now)

  for (const br of result.bars) {
    // Ohne Ist-Wert gibt es keinen Auffüll-Zeitpunkt: dann wissen wir nicht,
    // wann die Leiste voll ist, und erfinden es auch nicht.
    if (!br.hasCurrent || br.fullAt === null) continue
    out.push({
      slot: `full:${br.bar.key}`,
      key: `full:${br.bar.key}:${br.fullAt}`,
      kind: 'full',
      at: br.fullAt,
      bar: br.bar.label,
    })
  }

  // Der Überlauf: WarEra deckelt die Gutschrift bei `max`, der Überschuss
  // verfällt. Gewarnt wird deshalb vor dem Tick, nicht danach — nachher ist
  // die Gutschrift weg und es gibt nichts mehr zu entscheiden.
  for (const br of result.bars) {
    if (!br.hasCurrent) continue
    const lost = br.current + br.bar.hourlyRegen - br.bar.max
    // Der Schwellwert ist kein Geschmack, sondern Fließkomma: Hunger 6,3 plus
    // 0,7 ergibt 7,000000000000001, und das wäre eine Warnung über einen
    // Verlust in der sechzehnten Nachkommastelle. Dieselbe Toleranz wie in
    // `format.num`.
    if (lost <= 1e-9) continue
    out.push({
      slot: `overflow:${br.bar.key}`,
      key: `overflow:${br.bar.key}:${tick}`,
      kind: 'overflow',
      at: tick - leadMs,
      bar: br.bar.label,
      lost,
    })
  }

  if (state.debuffEnd !== null) {
    out.push({
      slot: 'debuff',
      key: `debuff:${state.debuffEnd}`,
      kind: 'debuff',
      at: state.debuffEnd,
    })
  }

  return out
}

/**
 * Aus den gemerkten Vorhersagen die, die jetzt zu melden sind.
 *
 * `armedAt` ist der Zeitpunkt, ab dem gemeldet werden darf — sonst käme beim
 * Öffnen der Seite eine Meldung für eine Leiste, die schon vor Stunden voll
 * wurde. `fired` enthält die Schlüssel, die schon gemeldet wurden.
 */
export function dueAlerts(
  pending: Iterable<Alert>,
  now: number,
  armedAt: number,
  fired: ReadonlySet<string>,
): Alert[] {
  const out: Alert[] = []
  for (const a of pending) {
    if (a.at <= now && a.at > armedAt && !fired.has(a.key)) out.push(a)
  }
  return out
}
