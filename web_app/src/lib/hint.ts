/**
 * Der Hinweis auf eine minimal verschobene Zielzeit.
 *
 * Übersetzung von `internal/regen/hint.go`.
 */
import { countTicks, evaluate, tickAtOrAfter, type Bar, type Params } from './regen'

/** Warum ein Hinweis ausgelöst wurde. */
export type HintKind =
  /** Die Zielzeit liegt exakt auf einem Tick. */
  | 'onTick'
  /** Kurz nach der Zielzeit käme noch ein Tick. */
  | 'nearTick'

/** Der Sicherheitsabstand, um den der Vorschlag hinter dem Tick liegt. */
export const HINT_OFFSET = 5 * 60 * 1000

/**
 * Eine Zielzeit, die den Tick um `t` herum verlässlich mitnimmt: den ersten
 * Tick auf oder nach `t`, plus `HINT_OFFSET`.
 *
 * Gedacht für eine Zielzeit, die aus einem Ereignis kommt (Ende des
 * Pillen-Debuffs) und auf das Tick-Raster gehoben werden soll. Der Zuschlag
 * ist nicht Kosmetik: genau auf dem Tick wäre die Gutschrift ein Münzwurf.
 */
export function targetAfterTick(p: Params, t: number): number {
  return tickAtOrAfter(p, t) + HINT_OFFSET
}

/**
 * Ein Vorschlag für eine minimal verschobene Zielzeit, die einen weiteren Tick
 * mitnimmt. Das ist der eigentliche Trick am Regen in Stunden-Ticks: fünf
 * Minuten später anfangen zu wollen kann eine ganze Regenerationsstunde
 * schenken.
 */
export interface Hint {
  kind: HintKind
  tick: number // der Tick, um den es geht
  suggested: number // vorgeschlagene neue Zielzeit
  gap: number // Abstand von der Zielzeit zum Tick, in Millisekunden
  extra: Record<string, number> // zusätzliches Budget je Leisten-Key
}

/**
 * Prüft, ob die Zielzeit dicht an einem Tick liegt, und beziffert den Gewinn
 * einer Verschiebung. Liefert `null`, wenn nichts zu holen ist.
 */
export function computeHint(p: Params, bars: Bar[], windowMs: number): Hint | null {
  if (windowMs <= 0 || p.target <= p.base) return null

  const tick = tickAtOrAfter(p, p.target)
  const gap = tick - p.target
  if (gap > windowMs) return null

  const hint: Hint = {
    kind: gap === 0 ? 'onTick' : 'nearTick',
    tick,
    suggested: tick + HINT_OFFSET,
    gap,
    extra: {},
  }

  const now = countTicks(p, false)
  const then = countTicks({ ...p, target: hint.suggested }, false)
  if (then <= now) return null

  let any = false
  for (const b of bars) {
    const diff = evaluate(b, then).budget - evaluate(b, now).budget
    hint.extra[b.key] = diff
    if (diff > 0) any = true
  }
  // Sind alle Leisten schon voll auffüllbar, bringt die Verschiebung nichts.
  if (!any) return null
  return hint
}
