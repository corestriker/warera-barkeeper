/**
 * Meldet einen laufenden Pillen-Debuff samt Restzeit — **in jedem Modus**.
 * Hängt die Zielzeit daran, ist die Restzeit die eigentliche Frist; hängt sie
 * nicht daran, ist der Debuff die Alternative, die einen Klick weit weg in den
 * Einstellungen liegt.
 *
 * Welche Pille es war, steht in der API (`buffs.debuffCodes`), wird aber
 * bewusst nicht angezeigt: „Pillen-Debuff“ sagt alles, was für die Rechnung
 * zählt. Ein Test verbietet, dass der Code in einer Ansicht auftaucht.
 */
import { fmtDurationShort } from '../lib/format'
import type { Translate } from '../lib/i18n'
import type { State } from '../lib/state'
import { formatClock } from '../lib/zone'

export function DebuffNote({ t, state, now }: { t: Translate; state: State; now: number }) {
  if (state.debuffEnd === null) return null

  const clock = formatClock(state.debuffEnd, state.zone)
  const left = fmtDurationShort(state.debuffEnd - now)
  const drivesTarget = state.target === 'debuff' || state.target === 'debuffTick'

  // Jede Fassung sagt nur, was der Kopf nicht schon zeigt: hängt die Zielzeit
  // direkt am Debuff, nennt der Kopf dessen Uhrzeit — dann bleibt hier die
  // Restzeit.
  const text =
    state.target === 'debuff'
      ? t('dash.debuff_basis', left)
      : state.target === 'debuffTick'
        ? t('dash.debuff_hour', clock, left)
        : t('dash.debuff', clock, left)

  return (
    <p
      className={`flex items-center gap-2 px-1 text-[0.85rem] ${drivesTarget ? 'text-hint' : 'text-muted'}`}
    >
      <span aria-hidden="true">◈</span>
      {text}
    </p>
  )
}
