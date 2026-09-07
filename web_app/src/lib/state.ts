/**
 * Setzt Zeitparameter und Leisten-Werte zusammen — die Übersetzung von
 * `internal/ui/state.go`.
 *
 * Entweder-oder: mit Spielername und aktivem Abruf gelten ausschließlich die
 * Werte aus der API — Maximum, Regen-Rate und Ist-Wert. Ohne beides gelten
 * ausschließlich die selbst eingetragenen Werte, und es wird angenommen, dass
 * die Leisten gerade voll sind. Gemischt wird nicht, sonst stünde im Kopf ein
 * Maximum aus den eigenen Werten neben einem Ist-Wert aus dem Spiel.
 *
 * Der eine Sonderfall: im API-Modus ohne Antwort (Netz weg, Name unbekannt)
 * bleiben nur die eigenen Werte. Das Abzeichen im Kopf zeigt dann „⚠ offline“,
 * und ein Ist-Wert wird bewusst nicht erfunden.
 */
import { computeHint, targetAfterTick, type Hint } from './hint'
import { DEFAULT_TICK_PERIOD, compute, type Bar, type Params, type Result } from './regen'
import { nextOccurrence, nextWholeHourUTC, parseClock } from './schedule'
import { BAR_HEALTH, BAR_HUNGER, hintWindowMs, regenFor, type Settings } from './settings'
import type { Skill, Snapshot } from './warera'
import { atClock, zoneOr } from './zone'

/** Die Reihenfolge der Anzeige. */
export const BAR_ORDER = [BAR_HEALTH, BAR_HUNGER] as const

const BAR_LABELS: Record<string, string> = {
  [BAR_HEALTH]: 'HEALTH',
  [BAR_HUNGER]: 'HUNGER',
}

/** Die Herkunft der Zielzeit. */
export type TargetSource =
  /** Die eingestellte Uhrzeit. */
  | 'clock'
  /** Das Ende des Pillen-Debuffs, unverändert. */
  | 'debuff'
  /** Der Tick nach dem Debuff-Ende plus Sicherheitsabstand. */
  | 'debuffTick'

/**
 * Alles, was für eine Berechnung gebraucht wird — entweder aus der API oder
 * aus den eigenen Werten, nie aus beiden.
 */
export interface State {
  params: Params
  bars: Bar[]
  current: Record<string, number>
  /** true, wenn die Werte aus der API stammen. */
  live: boolean
  target: TargetSource
  /**
   * Das Ende eines laufenden Pillen-Debuffs — unabhängig davon, ob die
   * Zielzeit daran hängt. Die Seite zeigt ihn auch im Uhrzeit-Modus an, weil er
   * dort die Alternative ist.
   *
   * Welche Pille es war, steht in der API (`buffs.debuffCodes`), wird aber
   * nicht angezeigt: „Pillen-Debuff“ sagt alles, was für die Rechnung zählt.
   */
  debuffEnd: number | null
  /** Die aufgelöste Zone, in der die Uhrzeiten angezeigt werden. */
  zone: string
}

/**
 * Sagt, ob mit API-Werten gerechnet wird: dafür braucht es einen Spielernamen
 * und einen eingeschalteten Abruf.
 */
export function apiMode(s: Settings): boolean {
  return s.api.enabled && s.username.trim() !== ''
}

/** Das Ende eines noch laufenden Debuffs, sonst `null`. */
function debuffEnd(snap: Snapshot | null, now: number): number | null {
  if (snap === null) return null
  const end = snap.user.buffs.debuffEndAt
  if (end !== null && end > now) return end
  return null
}

function skillFor(snap: Snapshot | null, key: string): Skill | undefined {
  if (snap === null) return undefined
  return snap.user.skills[key]
}

export function buildState(s: Settings, snap: Snapshot | null, now: number): State {
  const zone = zoneOr(s.timezone)

  let base = now
  if (s.baseMode === 'fixed') {
    const c = parseClock(s.baseTime)
    if (c !== null) base = atClock(now, zone, c.hour, c.minute)
  }

  let target = base + 60 * 60 * 1000
  const targetClock = parseClock(s.targetTime)
  if (targetClock !== null) target = nextOccurrence(base, zone, targetClock.hour, targetClock.minute)

  // Das Tick-Raster steht vor der Zielzeit, weil die Debuff-Variante
  // „nächste Stunde“ darauf aufsetzt.
  let anchor = nextWholeHourUTC(now)
  if (snap !== null && snap.nextRegenAt !== null) anchor = snap.nextRegenAt

  const params: Params = { base, target, tickAnchor: anchor, tickPeriod: DEFAULT_TICK_PERIOD }

  const st: State = {
    params,
    bars: [],
    current: {},
    live: false,
    target: 'clock',
    debuffEnd: null,
    zone,
  }

  // Zielzeit aus dem Pillen-Debuff: bis dahin bringt die nächste Pille nichts,
  // und genau dann sollen die Leisten voll sein. Der Wert ist ein absoluter
  // Zeitpunkt, kein Uhrzeit-Muster — er braucht deshalb kein nextOccurrence.
  // Ohne aktiven Debuff (fehlend, abgelaufen, kein Abruf) bleibt es bei der
  // eingestellten Uhrzeit.
  const end = debuffEnd(snap, now)
  if (end !== null) {
    st.debuffEnd = end
    if (s.targetMode === 'debuff') {
      st.params.target = end
      st.target = 'debuff'
    } else if (s.targetMode === 'debuff_hour') {
      st.params.target = targetAfterTick(st.params, end)
      st.target = 'debuffTick'
    }
  }

  const useAPI = apiMode(s) && snap !== null
  for (const key of BAR_ORDER) {
    const bar: Bar = { key, label: BAR_LABELS[key] ?? key, max: 0, hourlyRegen: 0 }
    const skill = skillFor(snap, key)

    if (useAPI && skill !== undefined && skill.total > 0) {
      bar.max = skill.total
      bar.hourlyRegen = skill.hourlyBarRegen
      st.current[key] = skill.currentBarValue
      st.live = true
    } else {
      const own = s.bars[key]
      if (own !== undefined) {
        bar.max = own.max
        // Die Rate ist keine Einstellung, sondern eine Rechnung: max / 10.
        bar.hourlyRegen = regenFor(own.max)
      }
    }

    // Notnagel für den API-Fall: liefert der Abruf ein Maximum, aber keine
    // Rate, gilt dieselbe Rechnung.
    if (bar.hourlyRegen <= 0 && bar.max > 0) bar.hourlyRegen = regenFor(bar.max)

    st.bars.push(bar)
  }

  return st
}

/** Führt die Berechnung inklusive Hinweis aus. */
export function computeState(st: State, s: Settings): { result: Result; hint: Hint | null } {
  return {
    result: compute(st.params, st.bars, st.current),
    hint: computeHint(st.params, st.bars, hintWindowMs(s)),
  }
}
