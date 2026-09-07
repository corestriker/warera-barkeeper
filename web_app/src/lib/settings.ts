/**
 * Die Benutzereinstellungen.
 *
 * Entspricht `internal/config/config.go` der Terminal-App: dieselben Felder,
 * dieselben Standardwerte, dasselbe `normalize`, das von Hand verdrehte Werte
 * repariert. Gespeichert wird im `localStorage` statt in einer TOML-Datei, und
 * jede Änderung wird sofort geschrieben — im Browser erwartet niemand einen
 * Speichern-Knopf.
 */

/** Leisten-Keys. */
export const BAR_HEALTH = 'health'
export const BAR_HUNGER = 'hunger'

/** Woher die Zielzeit kommt. */
export type TargetMode =
  /** Die feste Uhrzeit aus `targetTime`. */
  | 'clock'
  /** Das Ende des Pillen-Debuffs; ohne aktiven Debuff gilt `targetTime`. */
  | 'debuff'
  /** Das Debuff-Ende, gehoben auf den Tick danach — ein Tick mehr Budget. */
  | 'debuff_hour'

/** Ab wann gerechnet wird. */
export type BaseMode = 'now' | 'fixed'

/**
 * Der Fallback-Wert einer Leiste, falls die API nicht erreichbar ist.
 *
 * Nur das Maximum: die Gutschrift pro Tick ist **keine Einstellung**, sondern
 * eine Rechnung des Spiels (`gameConfig: regenDividedBy`) — WarEra schreibt pro
 * Tick `max / 10` gut. Sie einstellbar zu machen hieße, dem Nutzer eine Frage
 * zu stellen, deren Antwort feststeht.
 */
export interface BarSettings {
  max: number
}

/** WarEra schreibt pro Tick `max / REGEN_DIVIDER` gut. */
export const REGEN_DIVIDER = 10

/** Die Gutschrift pro Tick, abgeleitet aus dem Maximum. */
export function regenFor(max: number): number {
  return max / REGEN_DIVIDER
}

/** Der Zugriff auf die öffentliche WarEra-Schnittstelle. */
export interface ApiSettings {
  enabled: boolean
  baseUrl: string
  timeoutSeconds: number
  cacheMinutes: number
}

/** Der komplette Satz Benutzereinstellungen. */
export interface Settings {
  username: string
  userId: string

  targetMode: TargetMode
  targetTime: string
  timezone: string
  /** Sprachkürzel; leer heißt „aus dem Browser“. */
  language: string

  baseMode: BaseMode
  baseTime: string

  hintWindowMinutes: number
  /** Ist der Abschnitt „Wie das funktioniert“ aufgeklappt? */
  explainerOpen: boolean

  bars: Record<string, BarSettings>
  api: ApiSettings
}

export const DEFAULT_BASE_URL = 'https://api2.warera.io/trpc'

/** Einstellungen mit sinnvollen Startwerten. */
export function defaults(): Settings {
  return {
    username: '',
    userId: '',
    // Debuff als Standard: läuft einer, ist sein Ende die interessante Frist;
    // läuft keiner, gilt ohnehin die Uhrzeit. Ohne Spielernamen bleibt es
    // immer bei der Uhrzeit.
    targetMode: 'debuff',
    targetTime: '14:05',
    timezone: '',
    language: '',
    baseMode: 'now',
    baseTime: '07:00',
    hintWindowMinutes: 15,
    explainerOpen: false,
    bars: {
      // Level 0 der jeweiligen Skills — nur für den manuellen Betrieb; mit
      // Spielername kommen die echten Werte aus der API.
      [BAR_HEALTH]: { max: 100 },
      [BAR_HUNGER]: { max: 4 },
    },
    api: {
      enabled: true,
      baseUrl: DEFAULT_BASE_URL,
      timeoutSeconds: 8,
      cacheMinutes: 10,
    },
  }
}

function isTargetMode(v: unknown): v is TargetMode {
  return v === 'clock' || v === 'debuff' || v === 'debuff_hour'
}

/**
 * Repariert leere oder unsinnige Werte, damit die App mit einem von Hand
 * bearbeiteten `localStorage` nicht in einen kaputten Zustand läuft.
 */
export function normalize(s: Settings): Settings {
  const def = defaults()
  const out: Settings = { ...s, bars: { ...s.bars }, api: { ...s.api } }

  for (const [key, d] of Object.entries(def.bars)) {
    const bar = out.bars[key]
    if (bar === undefined || !(bar.max > 0)) {
      out.bars[key] = { ...d }
      continue
    }
    // Ein alter Stand kann noch eine eigene Regen-Rate enthalten; die fällt
    // weg, weil sie sich aus dem Maximum ergibt.
    out.bars[key] = { max: bar.max }
  }

  if (out.baseMode !== 'fixed') out.baseMode = 'now'
  if (!isTargetMode(out.targetMode)) out.targetMode = 'clock'
  if (!(out.hintWindowMinutes >= 0)) out.hintWindowMinutes = 0
  if (out.api.baseUrl.trim() === '') out.api.baseUrl = def.api.baseUrl
  if (!(out.api.timeoutSeconds > 0)) out.api.timeoutSeconds = def.api.timeoutSeconds
  if (!(out.api.cacheMinutes >= 0)) out.api.cacheMinutes = 0

  out.username = out.username.trim()
  out.userId = out.userId.trim()
  out.timezone = out.timezone.trim()
  // Eine unbekannte Sprache wird nicht stillschweigend korrigiert: die Anzeige
  // fällt auf Englisch zurück, der Wert bleibt aber stehen, damit ein
  // Tippfehler nicht unbemerkt verschwindet.
  out.language = out.language.toLowerCase().trim()
  return out
}

/** Das HTTP-Timeout in Millisekunden. */
export function timeoutMs(s: Settings): number {
  return s.api.timeoutSeconds * 1000
}

/** Das Hinweis-Fenster in Millisekunden. */
export function hintWindowMs(s: Settings): number {
  return s.hintWindowMinutes * 60 * 1000
}

const STORAGE_KEY = 'barkeeper.settings.v1'

/**
 * Liest die Einstellungen. Wie `config.Load` wird **auf die Standardwerte
 * draufgelesen**, damit neue Felder in alten Ständen ihren Standardwert
 * behalten. `exists` ist false, wenn noch nichts gespeichert war — das ist der
 * erste Besuch, kein Fehler.
 */
export function loadSettings(): { settings: Settings; exists: boolean } {
  const def = defaults()
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Privates Fenster oder gesperrter Speicher: dann gilt der Standard.
    return { settings: def, exists: false }
  }
  if (raw === null) return { settings: def, exists: false }

  try {
    const parsed = JSON.parse(raw) as Partial<Settings>
    const merged: Settings = {
      ...def,
      ...parsed,
      bars: { ...def.bars, ...(parsed.bars ?? {}) },
      api: { ...def.api, ...(parsed.api ?? {}) },
    }
    return { settings: normalize(merged), exists: true }
  } catch {
    return { settings: def, exists: false }
  }
}

/** Schreibt die Einstellungen zurück. Ein gesperrter Speicher ist kein Fehler. */
export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // Nicht speichern zu können ist unschön, aber kein Grund, die Anzeige
    // abzubrechen — gerechnet wird trotzdem richtig.
  }
}

/** Entfernt den gespeicherten Stand. Danach ist der nächste Aufruf ein Erstbesuch. */
export function clearSettings(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // siehe saveSettings
  }
}
