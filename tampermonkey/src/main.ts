/**
 * Das Userscript: dieselbe Rechnung wie die Webapp, aber im Spiel.
 *
 * Zwei Eingriffe in `app.warera.io`, beide additiv — es wird nichts entfernt
 * und nichts angeklickt:
 *
 *  1. Ein Knopf neben der Benachrichtigungsglocke öffnet die Einstellungen
 *     (Spielername, Zielzeit, Modus, Zone).
 *  2. Die Leisten für Leben und Hunger in der Kopfzeile bekommen die Zonen der
 *     Webapp übergelegt: behalten, ausgebbar, Fehlbetrag, verbraucht.
 *
 * **Gerechnet wird nicht hier.** `regen`, `state`, `zones` und der API-Client
 * kommen aus `web_app/src/lib` und werden beim Bauen mit hineingezogen. Eine
 * dritte Fassung der Tick-Rechnung wäre eine dritte Stelle, die ausein­ander­-
 * läuft; genau das soll das Projekt vermeiden.
 */
import { num } from '../../web_app/src/lib/format'
import { BAR_HEALTH, BAR_HUNGER, defaults, normalize, timeoutMs, type Settings, type TargetMode } from '../../web_app/src/lib/settings'
import { buildState, computeState } from '../../web_app/src/lib/state'
import { WareraError, fetchSnapshot, type Snapshot } from '../../web_app/src/lib/warera'
import { formatClock, zoneOr } from '../../web_app/src/lib/zone'
import { ZONE_STYLE, zonesFor } from '../../web_app/src/lib/zones'

/** Eigener Schlüssel: die Webapp liegt auf einer anderen Domain, aber ein
 * gleicher Name wäre trotzdem eine Falle beim Umziehen. */
const STORE_KEY = 'barkeeper.userscript.v1'

/** Die vier Leisten der Kopfzeile in ihrer Reihenfolge im Spiel. */
const BAR_SLOTS = [BAR_HEALTH, BAR_HUNGER, 'energy', 'entrepreneurship'] as const

const TEXTS = {
  de: {
    title: 'Barkeeper',
    username: 'Spieler',
    detected: 'von der Seite übernommen',
    noUser: 'Nicht eingeloggt? Auf der Seite wurde kein Spieler gefunden.',
    target: 'Zielzeit',
    mode: 'Zielzeit-Modus',
    zone: 'Zeitzone',
    modeClock: 'Uhrzeit',
    modeDebuff: 'Debuff-Ende',
    modeDebuffHour: 'Debuff, nächste Stunde',
    load: 'Werte holen',
    loading: 'lädt …',
    spend: 'ausgeben',
    fullAt: 'voll um',
    notFound: 'Spieler nicht gefunden.',
    ambiguous: 'Name ist mehrdeutig.',
    offline: 'Kein Abruf möglich — es gelten keine Ist-Werte.',
    noBars: 'Die Leisten in der Kopfzeile wurden nicht gefunden. Die Zahlen stimmen trotzdem.',
    hint: 'Zielzeit',
    close: 'Schließen',
  },
  en: {
    title: 'Barkeeper',
    username: 'Player',
    detected: 'taken from the page',
    noUser: 'Not signed in? No player found on the page.',
    target: 'Target time',
    mode: 'Target mode',
    zone: 'Time zone',
    modeClock: 'Clock',
    modeDebuff: 'Debuff end',
    modeDebuffHour: 'Debuff, next hour',
    load: 'Fetch values',
    loading: 'loading …',
    spend: 'spend',
    fullAt: 'full at',
    notFound: 'Player not found.',
    ambiguous: 'Name is ambiguous.',
    offline: 'No fetch — running without live values.',
    noBars: 'Could not find the bars in the top bar. The numbers below still hold.',
    hint: 'Target',
    close: 'Close',
  },
} as const

type Lang = keyof typeof TEXTS
let lang: Lang = 'en'
const T = (k: keyof (typeof TEXTS)['de']): string => TEXTS[lang][k]

// ---------------------------------------------------------------- Zustand

let settings: Settings = load()
let snap: Snapshot | null = null
let snapFor = ''
let status = ''
let busy = false
let lastTick = 0

function load(): Settings {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (raw === null) return defaults()
    // Wie `config.Load` in der Terminal-App: auf die Vorgaben drauf, damit
    // neue Felder in alten Ständen ihren Standardwert behalten.
    return normalize({ ...defaults(), ...(JSON.parse(raw) as Partial<Settings>) } as Settings)
  } catch {
    return defaults()
  }
}

function save(): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(settings))
  } catch {
    // Privates Fenster: dann gilt die Eingabe eben nur für diese Sitzung.
  }
}

/**
 * Die eigene User-ID aus der Seite.
 *
 * In der Kopfzeile stehen mehrere Links auf das eigene Profil — Avatar, Stufe
 * und das Inventar unter `/user/<id>/inventory`. Die ID ist eine 24-stellige
 * Hex-Zahl; das reicht als Erkennungsmerkmal und kommt ohne Klassennamen aus.
 *
 * Mit der ID braucht es keine Namenssuche mehr: `fetchSnapshot` fragt direkt
 * `user.getUserLite` und liefert den Namen gleich mit.
 */
function detectUserId(): string {
  const menu = topBar()
  const scope: ParentNode = menu ?? document
  for (const a of scope.querySelectorAll<HTMLAnchorElement>('a[href^="/user/"]')) {
    const id = /^\/user\/([0-9a-f]{24})(?:[/?#]|$)/.exec(a.getAttribute('href') ?? '')?.[1]
    if (id !== undefined) return id
  }
  return ''
}

// ---------------------------------------------------------------- Rechnung

function view() {
  const now = Date.now()
  const live = settings.username.trim().toLowerCase() === snapFor ? snap : null
  const state = buildState(settings, live, now)
  const { result } = computeState(state, settings)
  return { now, state, result }
}

async function fetchNow(): Promise<void> {
  const id = detectUserId()
  if (id === '') {
    status = T('noUser')
    refresh()
    return
  }
  busy = true
  status = ''
  refresh()
  try {
    // Nur die ID zählt: `fetchSnapshot` überspringt die Namenssuche, sobald
    // sie gesetzt ist. Den Namen liefert die Antwort mit.
    const got = await fetchSnapshot('', id, {
      baseUrl: settings.api.baseUrl,
      timeoutMs: timeoutMs(settings),
    })
    snap = got.snapshot
    snapFor = got.snapshot.user.username.toLowerCase()
    // `buildState` rechnet nur dann mit den Abrufwerten, wenn ein Name steht —
    // der kommt jetzt aus dem Abruf, nicht aus einem Eingabefeld.
    if (settings.username !== got.snapshot.user.username || settings.userId !== id) {
      settings = normalize({ ...settings, username: got.snapshot.user.username, userId: id })
      save()
    }
    status = ''
  } catch (err) {
    snap = null
    snapFor = ''
    status =
      err instanceof WareraError
        ? err.code === 'notFound'
          ? T('notFound')
          : err.code === 'ambiguous'
            ? T('ambiguous')
            : T('offline')
        : T('offline')
  } finally {
    busy = false
    refresh()
  }
}

// ---------------------------------------------------------------- DOM

/**
 * Die Muster der vier Zonen kommen aus `ZONE_STYLE` — derselben Quelle wie in
 * der Webapp, damit beide gleich aussehen und gleich bleiben. Nur die vier
 * Farbwerte stehen hier noch einmal: `theme.css` der Webapp ist ein
 * Tailwind-`@theme`-Block und lässt sich nicht als Modul einlesen.
 */
const TOKENS = `
[data-bk] {
  --color-keep:#35484f; --color-safe:#a2dcb6; --color-danger:#ec8f91;
  --color-ground:#0a0e10; --color-line-soft:#45595f;
  --bk-spendable:${ZONE_STYLE.spendable.backgroundImage};
  --bk-missing:${ZONE_STYLE.missing.backgroundImage};
  --bk-used:${ZONE_STYLE.used.backgroundImage};
}`

const CSS = `
/*
 * Umgestylt wird die Leiste des Spiels selbst — kein eigener Balken darüber.
 * Zwei Elemente sind beteiligt: die Bahn (der Hintergrund über die volle
 * Breite) und die Füllung, die das Spiel per transform: scaleX() auf den
 * Ist-Wert staucht.
 *
 * Deshalb "!important" und CSS-Variablen: React schreibt "background" auf der
 * Füllung als inline-Style. Eine Regel aus dem Stylesheet mit !important
 * sticht das, und die veränderlichen Zahlen reicht das Skript als
 * Custom Properties nach — die fasst React nicht an.
 */
[data-bk="track"] {
  background-color: var(--color-ground) !important;
  background-image: var(--bk-missing), var(--bk-used) !important;
  background-size: var(--bk-band-w, 0px) 100%, 6px 6px !important;
  background-position: var(--bk-band-x, 0px) 0, 0 0 !important;
  background-repeat: no-repeat, repeat !important;
}
[data-bk="fill"] {
  background-color: transparent !important;
  background-image:
    linear-gradient(90deg, var(--color-keep) 0 var(--bk-split, 100%), transparent var(--bk-split, 100%)),
    var(--bk-spendable) !important;
  border-color: transparent !important;
}

#bk-button { display:flex; align-items:center; justify-content:center; width:30px; height:30px;
  border:1px solid #33454c; border-radius:4px; background:#0f1517; color:#f4b374; cursor:pointer;
  font:600 15px/1 system-ui, sans-serif; flex-shrink:0; }
#bk-button:hover { border-color:#e18a8c; }
#bk-panel { position:fixed; top:52px; right:10px; z-index:99999; width:270px; max-width:calc(100vw - 20px);
  background:#0f1517; color:#eef5f7; border:1px solid #33454c; border-radius:6px; padding:12px 13px;
  font:400 13px/1.5 'Saira', system-ui, sans-serif; box-shadow:0 8px 26px rgba(0,0,0,.55); }
#bk-panel h2 { margin:0 0 9px; font-size:14px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:#f4b374; }
#bk-panel label { display:block; margin:8px 0 2px; font-size:11px; letter-spacing:.06em;
  text-transform:uppercase; color:#95aeb8; }
#bk-panel input, #bk-panel select { width:100%; box-sizing:border-box; padding:5px 7px; background:#0a0e10;
  color:#eef5f7; border:1px solid #33454c; border-radius:3px; font:inherit; }
#bk-panel button.bk-do { margin-top:11px; width:100%; padding:6px; background:#7a1f20; color:#eef5f7;
  border:1px solid #e18a8c; border-radius:3px; font:inherit; font-weight:600; cursor:pointer; }
#bk-panel button.bk-do[disabled] { opacity:.55; cursor:default; }
.bk-who { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
.bk-who b { color:#eef5f7; }
.bk-who span { color:#95aeb8; font-size:11px; }
.bk-out { margin-top:11px; border-top:1px solid #33454c; padding-top:9px; }
.bk-row { display:flex; justify-content:space-between; gap:8px; padding:2px 0; }
.bk-row b { color:#a2dcb6; font-variant-numeric:tabular-nums; }
.bk-row.bk-short b { color:#ec8f91; }
.bk-note { margin-top:8px; color:#95aeb8; font-size:11.5px; }
.bk-note.bk-bad { color:#ec8f91; }
`

function injectCss(): void {
  if (document.getElementById('bk-css')) return
  const el = document.createElement('style')
  el.id = 'bk-css'
  el.textContent = TOKENS + CSS
  document.head.appendChild(el)
}

function topBar(): HTMLElement | null {
  return document.getElementById('layoutUserMenu')
}

/**
 * Die vier Leisten der Kopfzeile.
 *
 * Erkannt werden sie an der Füllung: die trägt ein `transform: scaleX(...)`
 * direkt im `style`-Attribut. Das ist im Aufbau der Seite einzigartig und
 * überlebt einen Wechsel der Klassennamen, den jeder neue Build mitbringt.
 * Genommen wird der **tiefste** Vorfahr, unter dem genau vier davon hängen —
 * die Zeile mit Leben, Hunger, Energie und Unternehmertum. Andere Balken auf
 * der Seite (Stufenfortschritt) sitzen nicht in dieser Vierergruppe.
 */
function findFills(): HTMLElement[] | null {
  const menu = topBar()
  if (menu === null) return null
  const fills = [...menu.querySelectorAll<HTMLElement>('[style*="scaleX("]')]
  if (fills.length < BAR_SLOTS.length) return null

  const byAncestor = new Map<HTMLElement, HTMLElement[]>()
  for (const fill of fills) {
    for (let el = fill.parentElement; el !== null && el !== menu.parentElement; el = el.parentElement) {
      const list = byAncestor.get(el)
      if (list === undefined) byAncestor.set(el, [fill])
      else list.push(fill)
    }
  }

  let best: HTMLElement[] | null = null
  let bestDepth = -1
  for (const [el, list] of byAncestor) {
    if (list.length !== BAR_SLOTS.length) continue
    let depth = 0
    for (let p = el.parentElement; p !== null; p = p.parentElement) depth++
    if (depth > bestDepth) {
      bestDepth = depth
      best = list
    }
  }
  return best
}

/**
 * Färbt die vorhandenen Leisten um.
 *
 * Nichts wird übergelegt: die Bahn des Spiels bekommt den Hintergrund für
 * „verbraucht“ und — falls die Zeit nicht mehr reicht — das Band für den
 * Fehlbetrag, die Füllung des Spiels bekommt den Verlauf von „behalten“ nach
 * „ausgebbar“. Die Füllung selbst staucht das Spiel weiter per `scaleX`, ihre
 * Breite bleibt also seine Angelegenheit; sie steht ohnehin genau für den
 * Ist-Wert, und der ist auch bei uns die Grenze zwischen ausgebbar und
 * verbraucht.
 *
 * Das Band für den Fehlbetrag wird in Pixeln gesetzt statt in Prozent: eine
 * Hintergrundebene auf einen Ausschnitt zu legen geht mit Prozentangaben nur
 * über eine unangenehme Umrechnung, mit `background-size`/`-position` in Pixeln
 * ist es direkt hingeschrieben. Neu berechnet wird ohnehin jede Sekunde.
 */
function paintBars(): boolean {
  const fills = findFills()
  if (fills === null) return false
  const { result } = view()

  for (const [index, key] of BAR_SLOTS.entries()) {
    const fill = fills[index]
    if (fill === undefined) continue
    const track = fill.parentElement
    if (track === null) continue

    const br = result.bars.find((b) => b.bar.key === key)

    // Energie und Unternehmertum rechnet der Barkeeper nicht — die Leisten
    // des Spiels bleiben dort, wie sie sind.
    if (br === undefined || br.bar.max <= 0 || !br.hasCurrent) {
      if (fill.dataset.bk !== undefined) {
        delete fill.dataset.bk
        delete track.dataset.bk
      }
      continue
    }

    // Die Einteilung kommt aus `zonesFor` — derselben Funktion, die auch die
    // Webapp zeichnet. Hier werden ihre Anteile nur auf die beiden Elemente
    // des Spiels verteilt.
    const zones = zonesFor(br)
    const shareOf = (kind: string) => zones.find((z) => z.kind === kind)?.share ?? 0
    const keep = shareOf('keep')
    const spendable = shareOf('spendable')
    const missing = shareOf('missing')

    // Innerhalb der Füllung liegt die Grenze zwischen behalten und ausgebbar
    // bei keep/(keep+spendable): die Füllung reicht nur bis zum Ist-Wert.
    const filled = keep + spendable
    const split = filled <= 0 ? 1 : keep / filled

    // Der Fehlbetrag liegt jenseits der Füllung, also auf der Bahn.
    const width = track.clientWidth
    const bandX = keep * width
    const bandW = missing * width

    fill.dataset.bk = 'fill'
    track.dataset.bk = 'track'
    fill.style.setProperty('--bk-split', `${(split * 100).toFixed(3)}%`)
    track.style.setProperty('--bk-band-x', `${bandX.toFixed(2)}px`)
    track.style.setProperty('--bk-band-w', `${bandW.toFixed(2)}px`)
  }
  return true
}

function ensureButton(): void {
  const menu = topBar()
  if (menu === null || document.getElementById('bk-button') !== null) return
  // Die Glocke ist der Link auf /notifications; steht man schon dort, zeigt
  // sie auf /world. Beides ist ein Anker in derselben Gruppe.
  const bell = menu.querySelector('a[href="/notifications"], a[href="/world"]')
  const button = document.createElement('button')
  button.id = 'bk-button'
  button.type = 'button'
  button.title = T('title')
  button.textContent = '⧗'
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    togglePanel()
  })
  if (bell?.parentElement != null) bell.parentElement.insertBefore(button, bell)
  else menu.appendChild(button)
}

/**
 * Das Panel wird **einmal** aufgebaut und danach nur noch aufgefrischt.
 *
 * Vorher warf `render()` den Inhalt jede Sekunde weg und baute ihn neu. Für
 * die Zahlen ging das gut, für die Bedienelemente nicht: ein aufgeklapptes
 * Auswahlfeld gehört dem Element, und wenn das Element verschwindet,
 * verschwindet auch die Liste. Das Dropdown für den Zielzeit-Modus klappte
 * deshalb sofort wieder zu — man konnte es nicht bedienen.
 *
 * Die Bedienelemente stehen jetzt fest, `refresh()` schreibt nur noch Texte
 * fort, die sich wirklich ändern.
 */
interface Panel {
  root: HTMLElement
  who: HTMLElement
  mode: HTMLSelectElement
  target: HTMLInputElement
  load: HTMLButtonElement
  out: HTMLElement
  note: HTMLElement
}

let panel: Panel | null = null

function labelled(parent: HTMLElement, text: string, control: HTMLElement): void {
  const l = document.createElement('label')
  l.textContent = text
  l.appendChild(control)
  parent.appendChild(l)
}

function buildPanel(): Panel {
  const root = document.createElement('div')
  root.id = 'bk-panel'

  const h = document.createElement('h2')
  h.textContent = T('title')
  root.appendChild(h)

  const who = document.createElement('div')
  who.className = 'bk-who'
  root.appendChild(who)

  const target = document.createElement('input')
  target.type = 'time'
  target.value = settings.targetTime
  // Übernommen wird beim Verlassen des Feldes, nicht bei jedem Tastendruck.
  const commitTarget = () => {
    if (target.value === settings.targetTime) return
    settings = normalize({ ...settings, targetTime: target.value })
    save()
    refresh()
    paintBars()
  }
  target.addEventListener('change', commitTarget)
  target.addEventListener('blur', commitTarget)
  labelled(root, T('target'), target)

  const mode = document.createElement('select')
  for (const [value, text] of [
    ['clock', T('modeClock')],
    ['debuff', T('modeDebuff')],
    ['debuff_hour', T('modeDebuffHour')],
  ] as const) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = text
    option.selected = settings.targetMode === value
    mode.appendChild(option)
  }
  mode.addEventListener('change', () => {
    settings = normalize({ ...settings, targetMode: mode.value as TargetMode })
    save()
    refresh()
    paintBars()
  })
  labelled(root, T('mode'), mode)

  const load = document.createElement('button')
  load.className = 'bk-do'
  load.type = 'button'
  load.addEventListener('click', () => void fetchNow())
  root.appendChild(load)

  const out = document.createElement('div')
  out.className = 'bk-out'
  root.appendChild(out)

  const note = document.createElement('div')
  note.className = 'bk-note'
  root.appendChild(note)

  document.body.appendChild(root)
  return { root, who, mode, target, load, out, note }
}

function togglePanel(): void {
  if (panel !== null) {
    panel.root.remove()
    panel = null
    return
  }
  panel = buildPanel()
  refresh()
  if (snap === null) void fetchNow()
}

/** Nur die Texte, die sich ändern. Kein Element wird ersetzt. */
function refresh(): void {
  if (panel === null) return
  const zone = zoneOr(settings.timezone)

  const name = snap?.user.username ?? settings.username
  panel.who.textContent = ''
  if (name === '') {
    const dash = document.createElement('span')
    dash.textContent = '—'
    panel.who.appendChild(dash)
  } else {
    const b = document.createElement('b')
    b.textContent = name
    const hint = document.createElement('span')
    hint.textContent = T('detected')
    panel.who.append(b, hint)
  }

  panel.load.textContent = busy ? T('loading') : T('load')
  panel.load.disabled = busy

  const { now, state, result } = view()
  panel.out.textContent = ''
  panel.out.appendChild(row(T('hint'), formatClock(state.params.target, zone), false))
  for (const br of result.bars) {
    if (br.bar.max <= 0) continue
    if (br.hasCurrent && br.current < br.safe.floor) {
      const at = br.fullAt === null ? '—' : formatClock(br.fullAt, zone)
      panel.out.appendChild(row(br.bar.label, `${T('fullAt')} ${at}`, true))
    } else {
      const value = br.hasCurrent ? br.leftSafe : br.safe.budget
      panel.out.appendChild(row(br.bar.label, `${T('spend')} ${num(value)}`, false))
    }
  }

  panel.note.classList.toggle('bk-bad', status !== '')
  panel.note.textContent =
    status !== '' ? status : findFills() === null ? T('noBars') : formatClock(now, zone)
}

/** Eine Zeile „Beschriftung — Wert“. Ohne innerHTML: die Werte sind Fremdtext. */
function row(label: string, value: string, short: boolean): HTMLElement {
  const el = document.createElement('div')
  el.className = short ? 'bk-row bk-short' : 'bk-row'
  const l = document.createElement('span')
  l.textContent = label
  const v = document.createElement('b')
  v.textContent = value
  el.append(l, v)
  return el
}

// ---------------------------------------------------------------- Start

function boot(): void {
  lang = (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en'
  injectCss()

  // Die Seite ist eine Single-Page-App: die Kopfzeile entsteht und vergeht.
  // Deshalb wird bei jeder Änderung nachgesehen, statt einmal beim Laden.
  const observer = new MutationObserver(() => {
    ensureButton()
    paintBars()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  window.setInterval(() => {
    ensureButton()
    paintBars()
    const { state, now } = view()
    // Nach jedem Tick sind die Werte im Spiel andere — dann lohnt ein Abruf.
    const period = state.params.tickPeriod
    const tick = Math.floor((now - state.params.tickAnchor) / period)
    if (lastTick === 0) lastTick = tick
    else if (tick !== lastTick) {
      lastTick = tick
      void fetchNow()
    }
    refresh()
  }, 1000)

  ensureButton()
  void fetchNow()
}

boot()
