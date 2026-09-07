/**
 * „Wie das funktioniert“ am Seitenende, zugeklappt.
 *
 * Das ist der Ersatz für die beiden Textseiten der Terminal-App: der
 * Erklärtext zum Stunden-Tick und die Liste der Balken-Zonen. Eine Tastenhilfe
 * braucht eine Webseite nicht.
 */
import type { Translate } from '../lib/i18n'
import { GAME_URL, RELEASES_URL, REPO_URL } from '../lib/meta'
import type { Settings } from '../lib/settings'
import { apiMode } from '../lib/state'
import type { Snapshot } from '../lib/warera'
import { formatClock } from '../lib/zone'
import { ZONE_STYLE, type ZoneKind } from './BarCard'

const ZONE_HELP: [ZoneKind, string][] = [
  ['keep', 'help.bar.keep'],
  ['spendable', 'help.bar.spend'],
  ['missing', 'help.bar.missing'],
  ['used', 'help.bar.used'],
]

export function Explainer({
  t,
  settings,
  snap,
  zone,
  onToggle,
}: {
  t: Translate
  settings: Settings
  snap: Snapshot | null
  zone: string
  onToggle: (open: boolean) => void
}) {
  return (
    <details
      open={settings.explainerOpen}
      onToggle={(event) => onToggle(event.currentTarget.open)}
      className="ring-game rounded-[6px] border border-line bg-surface/60"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-[0.88rem] font-medium text-muted hover:text-ink sm:px-5">
        <span aria-hidden="true" className="mr-2 text-faint">
          ▸
        </span>
        {t('explain.title')}
      </summary>

      <div className="grid gap-6 border-t border-line px-4 py-5 sm:px-5">
        <div className="grid max-w-prose gap-3 text-[0.9rem] leading-relaxed text-muted">
          {t('explain.text')
            .split('\n\n')
            .map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
        </div>

        <div>
          <h3 className="mb-2 text-[0.78rem] font-semibold tracking-[0.14em] text-ink uppercase">
            {t('explain.bar.title')}
          </h3>
          <p className="mb-2 text-[0.85rem] text-muted">{t('help.bar.range')}</p>
          <ul className="grid gap-2 text-[0.85rem] text-muted">
            {ZONE_HELP.map(([kind, helpID]) => (
              <li key={kind} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  style={ZONE_STYLE[kind]}
                  className="mt-1 inline-block h-3 w-6 shrink-0 rounded-[2px] border border-line"
                />
                <span>
                  <span className="text-ink">{t(`legend.${kind}`)}</span> — {t(helpID)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 text-[0.78rem] font-semibold tracking-[0.14em] text-ink uppercase">
            {t('explain.values.title')}
          </h3>
          <dl className="grid gap-x-4 gap-y-1 text-[0.85rem] text-muted sm:grid-cols-[auto_1fr]">
            <dt className="text-faint">{t('explain.values.source')}</dt>
            <dd>
              {apiMode(settings)
                ? t('explain.values.api', settings.username)
                : t('explain.values.manual')}
            </dd>
            <dt className="text-faint">{t('explain.values.userid')}</dt>
            <dd className="font-mono break-all">
              {settings.userId === '' ? t('explain.values.none') : settings.userId}
            </dd>
            <dt className="text-faint">{t('explain.values.fetched')}</dt>
            <dd className="tabular">
              {snap === null ? t('explain.values.none') : formatClock(snap.fetchedAt, zone)}
            </dd>
          </dl>
          <p className="mt-3 max-w-prose text-[0.85rem] leading-relaxed text-muted">
            {t('explain.privacy')}
          </p>
        </div>

        <p className="text-[0.85rem] text-muted">
          {t('explain.terminal')}{' '}
          <a className="text-accent underline decoration-dotted hover:no-underline" href={REPO_URL}>
            GitHub
          </a>
          {' · '}
          <a className="text-accent underline decoration-dotted hover:no-underline" href={RELEASES_URL}>
            Releases
          </a>
          {' · '}
          <a className="text-accent underline decoration-dotted hover:no-underline" href={GAME_URL}>
            WarEra
          </a>
        </p>
      </div>
    </details>
  )
}
