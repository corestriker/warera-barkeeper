/**
 * Die ganze Seite.
 *
 * Der Datenfluss ist derselbe wie in der Terminal-App und einseitig:
 * Einstellungen (+ optionaler Snapshot aus der API) → `buildState` →
 * `compute`/`computeHint` → Anzeige. Gerechnet wird bei jedem Sekundentakt neu;
 * das kostet nichts und hält Countdown und Tick-Grenze aktuell.
 *
 * Fehlertoleranz als Prinzip: die Seite wartet nie auf das Netz. Sie ist
 * sofort da, der Abruf läuft daneben, und fällt er aus, wird mit den eigenen
 * Werten weitergerechnet und der Zustand im Kopf als „offline“ markiert.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarCard, Legend } from './components/BarCard'
import { DebuffNote } from './components/DebuffNote'
import { DisclaimerNotice } from './components/Disclaimer'
import { Explainer } from './components/Explainer'
import { TargetLine, TopBar, type ApiState } from './components/Header'
import { HintCard } from './components/HintCard'
import { SettingsPanel } from './components/SettingsPanel'
import { STATUS_TTL, StatusLine } from './components/StatusLine'
import { printer } from './lib/i18n'
import { APP_NAME, GAME_URL, REPO_URL } from './lib/meta'
import { tickAfter } from './lib/regen'
import {
  clearSettings,
  defaults,
  loadSettings,
  normalize,
  saveSettings,
  timeoutMs,
  type Settings,
} from './lib/settings'
import { apiMode, buildState, computeState } from './lib/state'
import { WareraError, fetchSnapshot, type Snapshot } from './lib/warera'
import { formatClock } from './lib/zone'

/** Eine Statusmeldung als Message-ID, damit sie einen Sprachwechsel übersteht. */
interface StatusMsg {
  id: string
  args: (string | number)[]
  kind: 'ok' | 'error' | 'note'
  at: number
}

/**
 * Übersetzt die Fehler, die den Spieler betreffen. Alles andere ist technisch
 * und wird unübersetzt durchgereicht — wie in `Model.apiErrText` der TUI.
 */
function errorText(t: (id: string, ...args: (string | number)[]) => string, err: unknown): string {
  if (err instanceof WareraError) {
    switch (err.code) {
      case 'noUsername':
        return t('err.no_username')
      case 'notFound':
        return t('err.no_player', err.username)
      case 'ambiguous':
        return t('err.ambiguous', err.username)
      default:
        return err.message
    }
  }
  return err instanceof Error ? err.message : String(err)
}

export function App() {
  const stored = useMemo(() => loadSettings(), [])
  const [settings, setSettings] = useState<Settings>(stored.settings)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  // Der Spielername, für den der Snapshot geholt wurde — klein geschrieben.
  const [snapFor, setSnapFor] = useState('')
  const [api, setApi] = useState<ApiState>(apiMode(stored.settings) ? 'loading' : 'off')
  const [now, setNow] = useState(() => Date.now())
  const [status, setStatus] = useState<StatusMsg | null>(null)
  // Beim ersten Besuch stehen die Einstellungen offen: ohne Spielername oder
  // Zielzeit wäre die Rechnung geraten.
  const [showSettings, setShowSettings] = useState(!stored.exists)

  const t = useMemo(() => printer(settings.language), [settings.language])

  // Die jeweils aktuellen Einstellungen für Rückrufe, die nicht am Render
  // hängen sollen (Lade-Knopf, Abruf nach einem Tick).
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  /**
   * Ein Snapshot gehört zu **einem** Spieler. Steht im Feld inzwischen ein
   * anderer Name, gelten seine Zahlen nicht mehr — sonst stünden fremde Werte
   * unter einem neuen Namen. Dann wird gerechnet wie ohne Abruf, und das
   * Abzeichen sagt „nicht geladen“.
   *
   * Verglichen wird mit dem Namen, für den **geladen wurde**, nicht mit dem,
   * den die API zurückgibt: die Suche findet zu „c0r“ auch den Spieler „c0re“,
   * und ein guter Abruf darf daran nicht scheitern.
   */
  const snapMatchesName = snap !== null && snapFor === settings.username.trim().toLowerCase()
  const liveSnap = apiMode(settings) && snapMatchesName ? snap : null

  const state = buildState(settings, liveSnap, now)
  const { result, hint } = computeState(state, settings)

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = normalize({ ...prev, ...patch })
      saveSettings(next)
      return next
    })
  }, [])

  // Ein laufender Abruf, dessen Antwort nicht mehr zählt (Name geändert,
  // zweiter Klick), darf den neueren nicht überschreiben.
  const fetchSeq = useRef(0)

  const doFetch = useCallback(
    async (current: Settings) => {
      if (!apiMode(current)) {
        setStatus({ id: 'status.no_fetch', args: [], kind: 'error', at: Date.now() })
        return
      }
      const seq = ++fetchSeq.current
      setApi('loading')
      // Abruf starten löscht die alte Meldung — das Abzeichen im Kopf zeigt,
      // dass etwas läuft.
      setStatus(null)

      try {
        const got = await fetchSnapshot(current.username, current.userId, {
          baseUrl: current.api.baseUrl,
          timeoutMs: timeoutMs(current),
        })
        if (seq !== fetchSeq.current) return
        setSnap(got.snapshot)
        setSnapFor(current.username.trim().toLowerCase())
        setApi('ok')
        setStatus({
          id: 'status.fetched',
          args: [formatClock(got.snapshot.fetchedAt, state.zone)],
          kind: 'ok',
          at: Date.now(),
        })
        // Nur die aufgelöste userId wird gemerkt — die Leisten-Werte aus dem
        // Abruf werden nie in die eigenen Werte geschrieben.
        if (got.userId !== current.userId) update({ userId: got.userId })
      } catch (err) {
        if (seq !== fetchSeq.current) return
        setApi('failed')
        setStatus({
          id: 'status.fetch_failed',
          args: [errorText(t, err)],
          kind: 'error',
          at: Date.now(),
        })
      }
    },
    [state.zone, t, update],
  )

  // Die Uhr. Ein Takt pro Sekunde, wie in der TUI.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Abruf beim Laden der Seite und wenn der Abruf-Schalter umgelegt wird.
  //
  // **Nicht** am Spielernamen: der wird beim Tippen Zeichen für Zeichen
  // übernommen, und jede Zwischenstufe wäre eine eigene Anfrage an WarEra.
  // Einen neuen Namen lädt der Knopf neben dem Feld.
  useEffect(() => {
    if (!apiMode(settingsRef.current)) {
      setApi('off')
      setSnap(null)
      setSnapFor('')
      return
    }
    void doFetch(settingsRef.current)
  }, [settings.api.enabled, settings.api.baseUrl, doFetch])

  // Nach jedem Tick-Wechsel sind die Werte im Spiel andere — dann lohnt ein
  // neuer Abruf. Zwischen zwei Ticks ändert sich nichts, und der Snapshot
  // gilt, solange er frisch ist.
  const nextTick = tickAfter(state.params, now)
  const lastTick = useRef(nextTick)
  useEffect(() => {
    if (nextTick === lastTick.current) return
    lastTick.current = nextTick
    const current = settingsRef.current
    if (!apiMode(current)) return
    const age = snap === null ? Infinity : Date.now() - snap.fetchedAt
    if (age < current.api.cacheMinutes * 60_000) return
    // Ebenfalls absichtlich nur am Tick hängen.
    void doFetch(current)
  }, [nextTick])

  // Erfolgsmeldungen laufen aus, Fehler und Rückfragen bleiben stehen.
  useEffect(() => {
    if (status === null || status.kind !== 'ok') return
    if (now - status.at > STATUS_TTL) setStatus(null)
  }, [now, status])

  // Passt der Snapshot nicht mehr zum Namen, muss dastehen, was zu tun ist.
  useEffect(() => {
    if (apiMode(settingsRef.current) && snap !== null && !snapMatchesName) {
      setStatus({ id: 'status.stale', args: [], kind: 'note', at: Date.now() })
    }
  }, [snapMatchesName, snap])

  // Beim ersten Besuch der Hinweis, dass ein Spielername die Werte bringt.
  useEffect(() => {
    if (!stored.exists) {
      setStatus({ id: 'status.first_run', args: [], kind: 'note', at: Date.now() })
    }
  }, [stored.exists])

  /**
   * Name übernehmen **und** laden. In einem Schritt, weil der Knopf neben dem
   * Feld sonst auf die Übernahme des Feldes warten müsste — und damit beim
   * ersten Klick den alten Namen abfragen würde.
   */
  const load = useCallback(
    (username: string) => {
      const trimmed = username.trim()
      const prev = settingsRef.current
      const next = normalize({
        ...prev,
        username: trimmed,
        // Ein anderer Name macht die gemerkte userId ungültig.
        userId: trimmed.toLowerCase() === prev.username.toLowerCase() ? prev.userId : '',
      })
      settingsRef.current = next
      saveSettings(next)
      setSettings(next)
      void doFetch(next)
    },
    [doFetch],
  )

  const reset = useCallback(() => {
    clearSettings()
    fetchSeq.current++
    setSettings(defaults())
    setSnap(null)
    setSnapFor('')
    setApi('off')
    setShowSettings(true)
    setStatus({ id: 'status.reset', args: [], kind: 'note', at: Date.now() })
  }, [])

  const applyHint = useCallback(
    (clock: string) => {
      // Hängt die Zielzeit am Debuff, ist der Vorschlag genau der Modus
      // „Debuff, nächste Stunde“ — eine Uhrzeit einzutragen würde dort nichts
      // ändern.
      if (state.target === 'debuff') update({ targetMode: 'debuff_hour' })
      else update({ targetTime: clock })
      setStatus({ id: 'status.hint_applied', args: [clock], kind: 'ok', at: Date.now() })
    },
    [state.target, update],
  )

  // Die gesperrten Zeilen im Panel zeigen, was der Abruf geliefert hat.
  const apiValues = useMemo(() => {
    if (snap === null) return null
    const out: Record<string, { max: number; hourlyRegen: number }> = {}
    for (const [key, skill] of Object.entries(snap.user.skills)) {
      out[key] = { max: skill.total, hourlyRegen: skill.hourlyBarRegen }
    }
    return out
  }, [snap])

  return (
    <main className="mx-auto grid max-w-5xl gap-5 px-4 py-5 sm:py-8">
      <TopBar
        t={t}
        settings={settings}
        api={apiMode(settings) && snap !== null && !snapMatchesName ? 'stale' : api}
        settingsOpen={showSettings}
        onFetch={() => void doFetch(settings)}
        onToggleSettings={() => setShowSettings((open) => !open)}
      />

      {showSettings && (
        <SettingsPanel
          t={t}
          settings={settings}
          apiValues={apiValues}
          debuffDrivesTarget={state.target !== 'clock'}
          onChange={update}
          onLoad={load}
          onReset={reset}
        />
      )}

      <TargetLine t={t} settings={settings} state={state} now={now} />

      <DebuffNote t={t} state={state} now={now} />

      {/* Die Antwort. Alles darüber ist der Rahmen, alles darunter Beiwerk. */}
      <div className="grid gap-4 md:grid-cols-2">
        {result.bars.map((br) => (
          <BarCard key={br.bar.key} t={t} br={br} zone={state.zone} />
        ))}
      </div>

      <Legend t={t} result={result} />

      {hint !== null && (
        <HintCard t={t} hint={hint} result={result} zone={state.zone} onApply={applyHint} />
      )}

      <StatusLine
        status={
          status === null ? null : { text: t(status.id, ...status.args), kind: status.kind, at: status.at }
        }
      />

      <Explainer
        t={t}
        settings={settings}
        snap={snap}
        zone={state.zone}
        onToggle={(explainerOpen) => update({ explainerOpen })}
      />

      {/* Der Hinweis, dass das hier nicht von WarEra kommt, steht immer da —
          ohne Aufklappen, ohne Überfliegen-Können. */}
      <footer className="grid gap-3 pb-6">
        <DisclaimerNotice t={t} />
        <p className="px-1 text-[0.78rem] text-faint">
          {APP_NAME} ·{' '}
          <a className="underline decoration-dotted hover:text-muted" href={REPO_URL}>
            Quellcode
          </a>
          {' · '}
          <a className="underline decoration-dotted hover:text-muted" href={GAME_URL}>
            warera.io
          </a>
        </p>
      </footer>
    </main>
  )
}
