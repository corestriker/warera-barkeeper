/**
 * Eine Leiste: Kopf mit Ist- und Maximalwert, der Balken über die volle Breite
 * von 0 bis Max, und darunter die Zahl, um die es geht.
 *
 * Die vier Zonen des Balkens sind dieselben wie in der Terminal-App —
 * behalten, ausgebbar, Fehlbetrag, verbraucht — und sie unterscheiden sich
 * **nicht nur in der Farbe**, sondern auch im Muster: gestreift, gegengestreift
 * und gepunktet. Wer Farben schlecht unterscheidet, sieht die Grenzen
 * trotzdem. Wer eine Zone ändert, ändert sie an drei Stellen mit: hier, in
 * `Legend` und in der Liste im Erklärabschnitt.
 */
import type { CSSProperties } from 'react'
import { num, pct } from '../lib/format'
import type { Translate } from '../lib/i18n'
import type { BarResult, Result } from '../lib/regen'
import { formatClock } from '../lib/zone'
import { Card } from './ui'

export type ZoneKind = 'keep' | 'spendable' | 'missing' | 'used'

/**
 * Die vier Zonen. Jede setzt **zwei** Eigenschaften: `backgroundColor` als
 * Vollton und darüber `backgroundImage` mit dem Muster. Das ist der Rückfall
 * für alte Browser — kennt einer `color-mix()` nicht, verwirft er das Muster
 * und die Zone bleibt trotzdem farbig sichtbar, statt zu verschwinden.
 */
export const ZONE_STYLE: Record<ZoneKind, CSSProperties> = {
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

function Gauge({ t, br }: { t: Translate; br: BarResult }) {
  const zones = zonesFor(br)
  const label = zones
    .filter((z) => z.share > 0)
    .map((z) => `${t(`legend.${z.kind === 'spendable' ? 'spendable' : z.kind}`)} ${pct(z.share * 100)}`)
    .join(', ')

  return (
    <div
      role="img"
      aria-label={label}
      className="ring-game flex h-7 overflow-hidden rounded-[3px] border border-line bg-ground"
    >
      {zones.map((zone, index) => (
        <div
          key={zone.kind + String(index)}
          style={{ ...ZONE_STYLE[zone.kind], width: `${zone.share * 100}%` }}
          className="h-full"
        />
      ))}
    </div>
  )
}

export function BarCard({ t, br, zone }: { t: Translate; br: BarResult; zone: string }) {
  // Angezeigt wird nur die verlässliche Zählweise: ein Tick exakt auf der
  // Zielzeit bleibt außen vor, weil er eine Sekunde zu spät kommen kann. Wer
  // ihn mitnehmen will, verschiebt die Zielzeit — dafür gibt es den Hinweis.
  //
  // Ausgegeben werden darf nur, was über dem Zielwert liegt: mit Ist-Wert ist
  // das der Abstand von dort nach unten, ohne Ist-Wert das ganze
  // Regenerationsbudget.
  const spend = br.hasCurrent ? br.leftSafe : br.safe.budget
  const shortfall = br.hasCurrent && br.deficitSafe > 0

  return (
    <Card tone={shortfall ? 'danger' : 'plain'} pad="large">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[0.88rem] font-semibold tracking-[0.16em] text-ink">{br.bar.label}</h3>
        <p className="tabular text-[0.88rem] text-muted">
          {br.hasCurrent ? (
            <>
              <span className="font-medium text-ink">{num(br.current)}</span> / {num(br.bar.max)}
            </>
          ) : (
            t('bar.max', num(br.bar.max))
          )}
        </p>
      </div>

      {/* Das hier ist die Antwort der ganzen Seite — sie darf nicht neben
          irgendetwas anderem gleich groß stehen. */}
      {shortfall ? (
        <div className="mb-4">
          <div className="mb-0.5 text-[0.75rem] font-medium tracking-[0.14em] text-danger uppercase">
            {t('bar.not_full')}
          </div>
          <div className="tabular text-[2.6rem] leading-none font-semibold text-hint sm:text-[3rem]">
            {br.fullAt === null ? t('bar.later') : formatClock(br.fullAt, zone)}
          </div>
          <div className="mt-1 text-[0.85rem] text-muted">
            {t('bar.full_at')} · {t('bar.missing')}{' '}
            <span className="tabular text-ink">{num(br.deficitSafe)}</span>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <div className="mb-0.5 text-[0.75rem] font-medium tracking-[0.14em] text-muted uppercase">
            {t('bar.spend')}
          </div>
          <div className="tabular text-[3rem] leading-none font-semibold text-safe sm:text-[3.6rem]">
            {num(spend)}
          </div>
        </div>
      )}

      <Gauge t={t} br={br} />

      <div className="tabular mt-2 flex flex-wrap gap-x-2 text-[0.82rem] text-faint">
        <span>
          {t('bar.down_to')} <span className="text-muted">{num(br.safe.floor)}</span> (
          {pct(br.safe.floorPct)})
        </span>
        <span>·</span>
        <span>{t('bar.ticks', br.safe.ticks)}</span>
        <span>·</span>
        <span>{t('bar.per_tick', num(br.bar.hourlyRegen))}</span>
      </div>

      {br.safe.capped && <p className="mt-2 text-[0.8rem] text-faint">{t('bar.capped')}</p>}
    </Card>
  )
}

/**
 * Die Legende zeigt genau die Zonen, die gerade vorkommen: ohne Ist-Wert gibt
 * es kein „verbraucht“, ohne Fehlbetrag kein „fehlt“.
 */
export function Legend({ t, result }: { t: Translate; result: Result }) {
  const hasCurrent = result.bars.some((br) => br.hasCurrent)
  const hasDeficit = result.bars.some((br) => br.hasCurrent && br.deficitSafe > 0)

  const entries: ZoneKind[] = ['keep', 'spendable']
  if (hasDeficit) entries.push('missing')
  if (hasCurrent) entries.push('used')

  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 px-1 text-[0.8rem] text-muted">
      {entries.map((kind) => (
        <li key={kind} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            style={ZONE_STYLE[kind]}
            className="inline-block h-3 w-6 rounded-[2px] border border-line"
          />
          {t(`legend.${kind}`)}
        </li>
      ))}
    </ul>
  )
}
