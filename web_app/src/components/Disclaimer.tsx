/**
 * Der Hinweis, dass das hier nicht von WarEra kommt.
 *
 * Eigene Komponente, damit ein Test festhalten kann, dass er da ist: er darf
 * nicht hinter einem Aufklapp-Abschnitt liegen und nicht bei einem Umbau des
 * Fußes verschwinden.
 */
import type { Translate } from '../lib/i18n'

export function DisclaimerNotice({ t }: { t: Translate }) {
  return (
    <div className="rounded-[6px] border border-line bg-surface/50 px-4 py-3">
      <h2 className="mb-1 text-[0.8rem] font-semibold tracking-[0.12em] text-muted uppercase">
        {t('disclaimer.title')}
      </h2>
      <p className="max-w-prose text-[0.82rem] leading-relaxed text-faint">{t('disclaimer.full')}</p>
    </div>
  )
}
