/**
 * Der Client für die öffentliche tRPC-Schnittstelle von WarEra.
 *
 * Alle verwendeten Endpunkte sind öffentlich und ausschließlich lesend. Es
 * wird kein API-Key benötigt, es werden keine Zugangsdaten gespeichert und es
 * wird nichts geschrieben — der Spielername genügt.
 *
 * Unterschied zur Terminal-App: den browserähnlichen User-Agent und den
 * Origin-Header setzt hier der Browser selbst, sie lassen sich aus JavaScript
 * gar nicht setzen. Nötig ist das auch nicht — die API antwortet fremden
 * Herkunftsadressen mit `access-control-allow-origin: *`. Es bleibt bei einer
 * „simple request“ ohne Vorabfrage, deshalb steht hier außer `Accept` kein
 * Header.
 */

export const DEFAULT_BASE_URL = 'https://api2.warera.io/trpc'

/**
 * Die Fehler, die den Nutzer betreffen, tragen einen Code: die Oberfläche
 * übersetzt ihn in die eingestellte Sprache. Alles andere ist technisch und
 * wird unübersetzt durchgereicht — deshalb sind jene Texte englisch, wie im
 * Go-Code.
 */
export type WareraErrorCode = 'noUsername' | 'notFound' | 'ambiguous' | 'technical'

export class WareraError extends Error {
  readonly code: WareraErrorCode
  /** Bei `notFound` und `ambiguous`: der gesuchte Name. */
  readonly username: string

  constructor(code: WareraErrorCode, message: string, username = '') {
    super(message)
    this.name = 'WareraError'
    this.code = code
    this.username = username
  }
}

/**
 * Ein Eintrag aus `skills.*` in `user.getUserLite`.
 *
 * Für die Berechnung zählen drei Felder: `total` ist der Maximalwert inklusive
 * aller Boni, `currentBarValue` der aktuelle Füllstand (fraktional möglich)
 * und `hourlyBarRegen` die Gutschrift pro Tick. Letzteres entspricht
 * `total/10`, wird aber direkt übernommen statt nachgerechnet — falls WarEra
 * die Formel ändert, stimmt der Wert trotzdem.
 */
export interface Skill {
  level: number
  total: number
  currentBarValue: number
  hourlyBarRegen: number
}

/**
 * Die aktiven Effekte. Für uns zählt das Ende des Pillen-Debuffs: bis dahin
 * lohnt es nicht, Pillen zu nehmen, und genau dann sollen die Leisten wieder
 * voll sein.
 *
 * Ist kein Debuff aktiv, fehlt `debuffEndAt` oder liegt in der Vergangenheit.
 */
export interface Buffs {
  debuffCodes: string[]
  /** Millisekunden seit Epoch, oder `null`, wenn nichts läuft. */
  debuffEndAt: number | null
}

/** Der für uns relevante Ausschnitt aus `user.getUserLite`. */
export interface UserLite {
  id: string
  username: string
  level: number
  buffs: Buffs
  skills: Record<string, Skill>
}

/** Alles, was ein API-Abruf für die Berechnung liefert. */
export interface Snapshot {
  user: UserLite
  /** Tick-Anchor aus `gameConfig.getDates`, oder `null`, wenn er fehlt. */
  nextRegenAt: number | null
  fetchedAt: number
}

/** Die tRPC-Hülle um jede Antwort. */
interface Envelope {
  result?: { data?: unknown }
  error?: { message?: string }
}

function emptySkill(): Skill {
  return { level: 0, total: 0, currentBarValue: 0, hourlyBarRegen: 0 }
}

function numberOr(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function parseTime(v: unknown): number | null {
  if (typeof v !== 'string' || v === '') return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

function parseSkill(v: unknown): Skill {
  const o = record(v)
  return {
    level: numberOr(o['level']),
    total: numberOr(o['total']),
    currentBarValue: numberOr(o['currentBarValue']),
    hourlyBarRegen: numberOr(o['hourlyBarRegen']),
  }
}

function parseUser(v: unknown): UserLite {
  const o = record(v)
  const skills = record(o['skills'])
  const buffs = record(o['buffs'])
  const codes = buffs['debuffCodes']
  const out: Record<string, Skill> = {}
  for (const key of Object.keys(skills)) out[key] = parseSkill(skills[key])
  if (out['health'] === undefined) out['health'] = emptySkill()
  if (out['hunger'] === undefined) out['hunger'] = emptySkill()

  return {
    id: typeof o['_id'] === 'string' ? o['_id'] : '',
    username: typeof o['username'] === 'string' ? o['username'] : '',
    level: numberOr(record(o['leveling'])['level']),
    buffs: {
      debuffCodes: Array.isArray(codes) ? codes.filter((c): c is string => typeof c === 'string') : [],
      debuffEndAt: parseTime(buffs['debuffEndAt']),
    },
    skills: out,
  }
}

export interface ClientOptions {
  baseUrl?: string
  timeoutMs?: number
  /** Nur für Tests: ein eigenes `fetch`. */
  fetchImpl?: typeof fetch
}

/**
 * Ruft eine Prozedur auf und liefert `result.data`.
 *
 * Die Aufrufe sind GET, nicht POST — so steht es in der offiziellen Doku
 * („every call is in GET and not POST“); die Eingabe steckt JSON-kodiert im
 * Query-Parameter `input`.
 */
async function call(procedure: string, input: unknown, opts: ClientOptions): Promise<unknown> {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const doFetch = opts.fetchImpl ?? fetch
  let url = `${baseUrl}/${procedure}`
  if (input !== undefined) url += `?input=${encodeURIComponent(JSON.stringify(input))}`

  let response: Response
  try {
    response = await doFetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new WareraError('technical', `${procedure}: ${reason}`)
  }

  const body = await response.text()
  let envelope: Envelope
  try {
    envelope = JSON.parse(body) as Envelope
  } catch {
    throw new WareraError('technical', `${procedure}: response is not JSON (HTTP ${response.status})`)
  }
  if (envelope.error !== undefined) {
    throw new WareraError('technical', `${procedure}: ${envelope.error.message ?? 'unknown error'}`)
  }
  if (!response.ok) {
    throw new WareraError('technical', `${procedure}: HTTP ${response.status}`)
  }
  const data = envelope.result?.data
  if (data === undefined || data === null) {
    throw new WareraError('technical', `${procedure}: empty response`)
  }
  return data
}

/**
 * Sucht die `userId` zu einem Spielernamen.
 *
 * Die Suche matcht unscharf und liefert bei mehrdeutigen Namen mehrere
 * Treffer, deshalb wird jeder Kandidat geladen und auf exakte Namensgleichheit
 * geprüft.
 */
export async function resolveUser(username: string, opts: ClientOptions = {}): Promise<string> {
  const name = username.trim()
  if (name === '') throw new WareraError('noUsername', 'no player name given')

  const data = record(await call('search.searchAnything', { searchText: name }, opts))
  const ids = Array.isArray(data['userIds'])
    ? data['userIds'].filter((id): id is string => typeof id === 'string')
    : []

  if (ids.length === 0) throw new WareraError('notFound', `player ${name} not found`, name)
  // Bei einem eindeutigen Treffer sparen wir uns die Gegenprobe.
  if (ids.length === 1) return ids[0]!

  for (const id of ids) {
    try {
      const user = await getUserLite(id, opts)
      if (user.username.toLowerCase() === name.toLowerCase()) return id
    } catch {
      continue
    }
  }
  throw new WareraError('ambiguous', `player name ${name} is ambiguous (${ids.length} matches)`, name)
}

/** Ein Treffer der Spielersuche, so wie ihn die Vorschlagsliste braucht. */
export interface UserHit {
  id: string
  username: string
  level: number
}

/** Wie viele Treffer die Suche höchstens auflöst. */
export const SEARCH_LIMIT = 6

/** Ab wie vielen Zeichen überhaupt gesucht wird. */
export const SEARCH_MIN_LENGTH = 3

/**
 * Sucht Spieler und löst die Treffer zu Namen auf.
 *
 * `search.searchAnything` liefert **nur IDs** — einen Sammel-Endpunkt für
 * mehrere Profile gibt es nicht. Jeder Treffer kostet deshalb einen eigenen
 * Abruf, und die Liste ist auf `SEARCH_LIMIT` gedeckelt. Bei 100 erlaubten
 * Anfragen pro Minute ist das reichlich, solange der Aufrufer entprellt.
 *
 * Einzelne Fehlschläge werden übersprungen: ein Treffer, dessen Profil sich
 * nicht laden lässt, soll nicht die ganze Liste verhindern.
 */
export async function searchUsers(text: string, opts: ClientOptions = {}): Promise<UserHit[]> {
  const query = text.trim()
  if (query.length < SEARCH_MIN_LENGTH) return []

  const data = record(await call('search.searchAnything', { searchText: query }, opts))
  const ids = Array.isArray(data['userIds'])
    ? data['userIds'].filter((id): id is string => typeof id === 'string').slice(0, SEARCH_LIMIT)
    : []

  const hits = await Promise.all(
    ids.map(async (id): Promise<UserHit | null> => {
      try {
        const user = await getUserLite(id, opts)
        return { id, username: user.username, level: user.level }
      } catch {
        return null
      }
    }),
  )
  return hits.filter((hit): hit is UserHit => hit !== null && hit.username !== '')
}

/** Lädt das öffentliche Profil samt Leisten-Werten. */
export async function getUserLite(userId: string, opts: ClientOptions = {}): Promise<UserLite> {
  return parseUser(await call('user.getUserLite', { userId }, opts))
}

/**
 * Liefert den nächsten Regen-Tick und damit das Tick-Raster.
 *
 * Der Wert kommt bewusst aus der API statt als „volle Stunde UTC“ fest im Code
 * zu stehen: verschiebt WarEra das Raster, rechnet das Tool weiterhin richtig.
 */
export async function nextRegenAt(opts: ClientOptions = {}): Promise<number> {
  const data = record(await call('gameConfig.getDates', {}, opts))
  const t = parseTime(data['nextRegenAt'])
  if (t === null) throw new WareraError('technical', 'gameConfig.getDates: nextRegenAt is missing')
  return t
}

/**
 * Holt in einem Rutsch alles, was für eine Berechnung gebraucht wird.
 *
 * `userId` darf leer sein; dann wird sie aus `username` aufgelöst. Der
 * Aufrufer bekommt die (womöglich neu ermittelte) ID zurück, um sie zu cachen.
 */
export async function fetchSnapshot(
  username: string,
  userId: string,
  opts: ClientOptions = {},
): Promise<{ snapshot: Snapshot; userId: string }> {
  let id = userId.trim()
  if (id === '') id = await resolveUser(username, opts)

  const user = await getUserLite(id, opts)

  // Ein fehlender Tick-Anchor ist kein Grund, die Leisten-Werte wegzuwerfen:
  // der Aufrufer fällt dafür auf die volle Stunde UTC zurück.
  let anchor: number | null = null
  try {
    anchor = await nextRegenAt(opts)
  } catch {
    anchor = null
  }

  return { snapshot: { user, nextRegenAt: anchor, fetchedAt: Date.now() }, userId: id }
}
