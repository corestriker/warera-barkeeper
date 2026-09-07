/**
 * Der Hinweis auf eine minimal verschobene Zielzeit — der eigentliche Kniff am
 * Regen in Stunden-Ticks: fünf Minuten später anfangen zu wollen kann eine
 * ganze Regenerationsstunde schenken.
 *
 * Das eine, was die Webapp besser kann als das Terminal: der Vorschlag ist ein
 * Knopf und keine Anleitung.
 */
import { fmtDuration, num } from '../lib/format'
import type { Hint } from '../lib/hint'
import type { Translate } from '../lib/i18n'
import type { Result } from '../lib/regen'
import { formatClock } from '../lib/zone'
import { Button, Card } from './ui'

export function HintCard({
  t,
  hint,
  result,
  zone,
  onApply,
}: {
  t: Translate
  hint: Hint
  result: Result
  zone: string
  onApply: (clock: string) => void
}) {
  const suggested = formatClock(hint.suggested, zone)
  const lead =
    hint.kind === 'onTick'
      ? t('hint.on_tick', formatClock(hint.tick, zone))
      : t('hint.near_tick', fmtDuration(hint.gap), formatClock(hint.tick, zone))

  const gains = result.bars
    .filter((br) => (hint.extra[br.bar.key] ?? 0) > 0)
    .map((br) => `${br.bar.label} +${num(hint.extra[br.bar.key] ?? 0)}`)
    .join(', ')

  return (
    <Card tone="hint">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="mb-1 text-[0.78rem] font-semibold tracking-[0.14em] text-hint uppercase">
            {t('hint.title')}
          </h2>
          <p className="text-[0.85rem] text-ink">{t('hint.body', lead, suggested, gains)}</p>
        </div>
        <Button variant="hint" onClick={() => onApply(suggested)}>
          {t('hint.apply', suggested)}
        </Button>
      </div>
    </Card>
  )
}
