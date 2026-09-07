/**
 * Der Kopf, in zwei Teilen.
 *
 * `TopBar` ist eine schmale Zeile: Name, wessen Werte gelten, Zustand, und die
 * zwei Knöpfe. Bewusst keine Karte — sie soll nicht mit der Antwort
 * konkurrieren.
 *
 * `TargetLine` nennt den Rahmen der Rechnung in einer Zeile: bis wann, wie
 * lange noch, wann der nächste Tick kommt. Früher standen dafür vier
 * gleichgroße Kennzahlen in einer Karte — die haben die eigentliche Zahl
 * erschlagen.
 */
import { fmtDuration } from '../lib/format'
import type { Translate } from '../lib/i18n'
import { APP_NAME } from '../lib/meta'
import { tickAfter } from '../lib/regen'
import type { Settings } from '../lib/settings'
import { apiMode, type State } from '../lib/state'
import { formatClock, sameWallDay } from '../lib/zone'
import { Badge, Button } from './ui'

/**
 * Der Zustand des letzten Abrufs. `stale` heißt: es liegen Werte vor, aber zu
 * einem anderen Spielernamen als dem, der jetzt im Feld steht.
 */
export type ApiState = 'off' | 'loading' | 'ok' | 'failed' | 'stale'

function badgeFor(t: Translate, api: ApiState) {
  switch (api) {
    case 'ok':
      return <Badge tone="ok">{t('badge.api')}</Badge>
    case 'loading':
      return <Badge tone="muted">{t('badge.loading')}</Badge>
    case 'failed':
      return <Badge tone="danger">{t('badge.offline')}</Badge>
    case 'stale':
      return <Badge tone="muted">{t('badge.stale')}</Badge>
    default:
      return <Badge tone="muted">{t('badge.manual')}</Badge>
  }
}

export function TopBar({
  t,
  settings,
  api,
  settingsOpen,
  onFetch,
  onToggleSettings,
}: {
  t: Translate
  settings: Settings
  api: ApiState
  settingsOpen: boolean
  onFetch: () => void
  onToggleSettings: () => void
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
      <div className="min-w-0">
        <h1 className="text-[1.05rem] leading-none font-semibold text-accent">{APP_NAME}</h1>
        {/* Der Fan-Projekt-Vermerk steht bewusst hier und nicht nur im Fuß:
            sichtbar, ohne zu scrollen und ohne etwas aufzuklappen. */}
        <p className="mt-1 text-[0.8rem] text-faint">
          {t('app.tagline')} <span className="mx-0.5">·</span> {t('disclaimer.short')}
        </p>
      </div>

      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        {apiMode(settings) && (
          <span className="max-w-40 truncate text-[0.88rem] font-medium text-muted">
            {settings.username}
          </span>
        )}
        {badgeFor(t, api)}
        {apiMode(settings) && (
          <Button onClick={onFetch} disabled={api === 'loading'} title={t('menu.f.fetch.help')}>
            {t('menu.f.fetch')}
          </Button>
        )}
        <Button variant={settingsOpen ? 'accent' : 'plain'} onClick={onToggleSettings}>
          {t('menu.show')}
        </Button>
      </div>
    </header>
  )
}

export function TargetLine({
  t,
  settings,
  state,
  now,
}: {
  t: Translate
  settings: Settings
  state: State
  now: number
}) {
  const zone = state.zone
  const target = state.params.target
  const base = state.params.base
  const nextTick = tickAfter(state.params, now)

  // Kommt die Zielzeit aus dem Debuff, sagt das Label das — sonst hielte man
  // eine fremde Uhrzeit für die eingestellte. Im Debuff-Modus ohne aktiven
  // Debuff wird umgekehrt der Rückfall vermerkt.
  let label = t('head.target')
  let note = ''
  if (state.target === 'debuff') {
    label = t('head.debuff_end')
  } else if (state.target === 'debuffTick') {
    label = t('head.target_after_debuff')
  } else if (settings.targetMode !== 'clock' && apiMode(settings)) {
    // Ohne Abruf kann von einem Debuff niemand wissen — dort wäre der Vermerk
    // nur Lärm.
    note = t('head.no_debuff')
  }
  if (!sameWallDay(target, base, zone)) note = t('head.tomorrow')

  // Mit abgerufenen Ist-Werten und einer Basis in der Vergangenheit zählt die
  // Rechnung Ticks mit, die im Ist-Wert schon stecken — dann steht hier eine zu
  // großzügige Zahl, und das muss dabeistehen.
  const baseWarning = apiMode(settings) && settings.baseMode === 'fixed'

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[0.75rem] font-medium tracking-[0.12em] text-muted uppercase">
            {label}
          </span>
          <span className="tabular text-[1.45rem] leading-none font-semibold text-accent">
            {formatClock(target, zone)}
          </span>
          {note !== '' && <span className="text-[0.8rem] text-faint">{note}</span>}
          <span className="tabular text-[0.88rem] text-muted">
            {t('head.left')} {fmtDuration(target - now)}
          </span>
        </p>

        <p className="tabular text-[0.82rem] text-faint">
          {/* Die Basis steht nur da, wenn sie nicht „jetzt“ ist — sonst wäre sie
              bloß die Uhrzeit ein zweites Mal. */}
          {settings.baseMode === 'fixed' && (
            <>
              {t('head.base')} {formatClock(base, zone)}
              <span className="mx-2">·</span>
            </>
          )}
          {t('head.next_tick')} {formatClock(nextTick, zone)}{' '}
          {t('head.in', fmtDuration(nextTick - now))}
        </p>
      </div>

      {baseWarning && (
        <p className="flex items-start gap-2 text-[0.82rem] text-hint">
          <span aria-hidden="true">⚠</span>
          {t('menu.f.base_time.warn')}
        </p>
      )}
    </div>
  )
}
