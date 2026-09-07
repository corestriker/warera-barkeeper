/**
 * Die Übersetzungen der Oberfläche.
 *
 * Aufbau wie `internal/i18n` der Terminal-App: eine Sprache ist eine Datei mit
 * einem Katalog Message-ID → Text. Neue Sprachen kommen dazu, indem eine Datei
 * nach dem Muster von `en.ts` angelegt und in `REGISTRY` eingetragen wird — die
 * Auswahl in den Einstellungen findet sie darüber von selbst.
 *
 * Fehlt in einem Katalog eine ID, greift der englische Text; fehlt der auch,
 * erscheint `!id`, damit die Lücke auffällt statt leer zu bleiben.
 *
 * Platzhalter sind `{0}`, `{1}`, … — nicht die Sprintf-Verben der Go-Fassung.
 * Damit entfällt auch deren Falle mit dem verdoppelten Prozentzeichen: hier
 * steht „100 %“ einfach als „100 %“.
 */

import { de } from './de'
import { en } from './en'

/** Ordnet Message-IDs ihren Text zu. */
export type Catalog = Record<string, string>

/** Eine registrierte Sprache. */
export interface Lang {
  /** Kürzel wie „de“, so steht es in den Einstellungen. */
  code: string
  /** Eigenname, so steht es in der Auswahl: „Deutsch“. */
  name: string
  msg: Catalog
}

/** Die Sprache, die einspringt, wenn eine ID fehlt oder die Sprache unbekannt ist. */
export const FALLBACK = 'en'

/**
 * Alle Sprachen. Bewusst eine ausgeschriebene Liste statt einer Registrierung
 * aus dem jeweiligen Modul heraus: die Kataloge importieren dann nichts aus
 * dieser Datei, und es gibt keinen Ringschluss beim Laden.
 */
const REGISTRY: Lang[] = [en, de]

const langs = new Map<string, Lang>(REGISTRY.map((lang) => [lang.code, lang]))

/** Alle registrierten Sprachen, alphabetisch. */
export function codes(): string[] {
  return [...langs.keys()].sort()
}

/** Der Katalog einer Sprache — für die Tests, die die Kataloge vergleichen. */
export function catalog(code: string): Catalog | undefined {
  return langs.get(code)?.msg
}

/** Der Eigenname einer Sprache, oder der Code selbst, wenn sie unbekannt ist. */
export function langName(code: string): string {
  const lang = langs.get(code)
  return lang !== undefined && lang.name !== '' ? lang.name : code
}

/** Ist die Sprache registriert? */
export function known(code: string): boolean {
  return langs.has(code)
}

/**
 * Liest die Sprache aus dem Browser. Aus „de-DE“ wird „de“. Ist nichts zu
 * holen oder die Sprache nicht vorhanden, gilt `FALLBACK`.
 */
export function detect(): string {
  const wanted: readonly string[] =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages !== undefined && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language]

  for (const raw of wanted) {
    if (raw === undefined || raw === '') continue
    const code = raw.toLowerCase().split(/[-_]/, 1)[0] ?? ''
    if (known(code)) return code
  }
  return FALLBACK
}

/**
 * Macht aus einem Einstellungswert eine vorhandene Sprache: leer heißt „aus
 * dem Browser“, unbekannt heißt `FALLBACK`.
 */
export function resolve(code: string): string {
  const c = code.trim().toLowerCase()
  if (c === '') return detect()
  if (known(c)) return c
  return FALLBACK
}

/** Übersetzt eine Message-ID; weitere Argumente füllen `{0}`, `{1}`, … */
export type Translate = (id: string, ...args: (string | number)[]) => string

function lookup(code: string, id: string): string | undefined {
  const text = langs.get(code)?.msg[id]
  return text === undefined || text === '' ? undefined : text
}

/** Baut eine Übersetzungsfunktion für eine feste Sprache. */
export function printer(code: string): Translate {
  const resolved = resolve(code)
  return (id, ...args) => {
    // Sichtbar statt still: eine fehlende ID soll auffallen.
    const text = lookup(resolved, id) ?? lookup(FALLBACK, id) ?? `!${id}`
    if (args.length === 0) return text
    return text.replace(/\{(\d+)\}/g, (match, index: string) => {
      const arg = args[Number(index)]
      return arg === undefined ? match : String(arg)
    })
  }
}
