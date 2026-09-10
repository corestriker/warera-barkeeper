/**
 * Die Zonen einer Leiste — behalten, ausgebbar, Fehlbetrag, verbraucht.
 *
 * Steht hier und nicht in `components/BarCard.tsx`, weil auch das Userscript
 * (`tampermonkey/`) sie braucht und dort kein React läuft. Die Darstellung
 * bleibt in `BarCard`, die Einteilung ist reine Rechnung.
 *
 * **Wer eine Zone ändert, ändert sie an drei Stellen mit:** hier, in `Legend`
 * (BarCard.tsx) und in der ausführlichen Liste im `Explainer`.
 */
import type { BarResult } from './regen'

export type ZoneKind = 'keep' | 'spendable' | 'missing' | 'used'

/**
 * Fehlbetrag und Ausgebbar haben **verschiedene Muster**, nicht nur
 * verschiedene Farben: die Anzeige muss auch ohne Farbe lesbar bleiben.
 *
 * Die Werte sind CSS-Deklarationen, keine React-Typen — so lassen sie sich
 * sowohl in ein `style`-Objekt spreizen als auch in einen Stylesheet-Text
 * schreiben.
 */
export const ZONE_STYLE: Record<ZoneKind, Record<string, string>> = {
  keep: { backgroundColor: 'var(--color-keep)' },
  spendable: {
    backgroundColor: 'var(--color-safe)',
    backgroundImage:
      'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-safe) 100%, transparent) 0 6px, color-mix(in srgb, var(--color-safe) 62%, transparent) 6px 12px)',
  },
  missing: {
    backgroundColor: 'var(--color-danger)',
    backgroundImage:
      'repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-danger) 100%, transparent) 0 5px, color-mix(in srgb, var(--color-danger) 55%, transparent) 5px 10px)',
  },
  used: {
    backgroundColor: 'var(--color-ground)',
    backgroundImage:
      'radial-gradient(circle at 3px 3px, color-mix(in srgb, var(--color-line-soft) 100%, transparent) 1px, transparent 1.4px)',
    backgroundSize: '6px 6px',
  },
}

/** Die Zonen einer Leiste, in Anteilen von 0 bis 1. */
export function zonesFor(br: BarResult): { kind: ZoneKind; share: number }[] {
  const max = br.bar.max
  if (max <= 0) return []
  const clamp = (v: number) => Math.min(1, Math.max(0, v / max))
  const floor = clamp(br.safe.floor)

  if (!br.hasCurrent) {
    return [
      { kind: 'keep', share: floor },
      { kind: 'spendable', share: 1 - floor },
    ]
  }
  const current = clamp(br.current)
  if (current < floor) {
    // Fehlbetrag: bis zum Zielwert reicht die Regeneration nicht mehr.
    return [
      { kind: 'keep', share: current },
      { kind: 'missing', share: floor - current },
      { kind: 'used', share: 1 - floor },
    ]
  }
  return [
    { kind: 'keep', share: floor },
    { kind: 'spendable', share: current - floor },
    { kind: 'used', share: 1 - current },
  ]
}
