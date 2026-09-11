/**
 * Die Einstellungen, in **zwei Ebenen**.
 *
 * Vorne stehen die zwei Dinge, die man wirklich einstellt: Spielername und
 * Zielzeit. Alles Seltene — Zeitbasis, Zeitzone, eigene Werte, Hinweis-Fenster,
 * Sprache, Zurücksetzen — liegt hinter „Mehr einstellen“. Vorher standen alle
 * dreizehn Felder gleichwertig untereinander, und das sah nach viel mehr aus,
 * als es ist.
 *
 * Die Gliederung dahinter ist dieselbe Frage wie im Menü der Terminal-App:
 * **wann gilt eine Einstellung**.
 *
 * Zwei Regeln, die leicht wieder kaputtgehen:
 *
 *   - Im API-Modus sind die eigenen Werte **nicht editierbar** und zeigen den
 *     Wert aus dem Abruf. Eine Zeile darf nie eine Zahl anzeigen, die gerade
 *     nicht gilt — deshalb stehen dort im API-Modus schlichte Zeilen statt
 *     Eingabefelder.
 *   - Ein Abruf schreibt nie in die eigenen Werte. Die API-Werte leben
 *     ausschließlich im Snapshot; hier werden sie nur angezeigt.
 *
 * Eingaben werden validiert wie im Menü der TUI: ein unlesbarer Wert wird nicht
 * übernommen, sondern als Fehler unter dem Feld gemeldet.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { num } from '../lib/format'
import { codes, langName, resolve, type Translate } from '../lib/i18n'
import { parseClock } from '../lib/schedule'
import { BAR_HEALTH, BAR_HUNGER, regenFor, type Settings } from '../lib/settings'
import { apiMode } from '../lib/state'
import { SEARCH_MIN_LENGTH, type UserHit } from '../lib/warera'
import { browserZone, isValidZone } from '../lib/zone'
import { Button, Card, SectionTitle } from './ui'

/**
 * Eingabefelder. Die Schriftgröße ist auf dem Handy bewusst 1rem: iOS Safari
 * zoomt beim Antippen eines Feldes in die Seite hinein, sobald sie darunter
 * liegt. Die Mindesthöhe ist eine Daumenfläche, keine Mauszeigerfläche.
 */
const inputClass =
  'ring-game w-full min-h-11 rounded-[6px] border border-line bg-ground px-3 py-2 text-[1rem] text-ink outline-none placeholder:text-faint focus:border-accent/70 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint sm:min-h-0 sm:py-1.5 sm:text-[0.9rem]'

/**
 * Eine Zeile: Beschriftung, Bedienelement, Hilfstext.
 *
 * **Kein `<label>` um die ganze Zeile.** Ein `<label>` leitet jeden Klick an
 * das erste bedienbare Element darin weiter, und `<button>` gehört dazu — ein
 * Klick auf die Beschriftung oder den Hilfstext hat deshalb den ersten Knopf
 * der Zeile gedrückt: bei den Auswahl-Zeilen die erste Option, bei der
 * Zurücksetzen-Zeile beim zweiten Mal „Ja, zurücksetzen“. Beschriftungen
 * werden jetzt über `htmlFor` an ein einzelnes Feld gebunden; Knopfgruppen
 * bekommen gar kein `<label>`, sondern eine Gruppe mit Namen.
 */
function Row({
  label,
  help,
  note,
  error,
  htmlFor,
  children,
}: {
  label: string
  help?: string
  note?: string
  error?: string | null
  /** Die id des einen Feldes, zu dem die Beschriftung gehört. */
  htmlFor?: string
  children: ReactNode
}) {
  const caption =
    htmlFor === undefined ? (
      <span className="text-[0.85rem] font-medium text-ink">{label}</span>
    ) : (
      <label htmlFor={htmlFor} className="text-[0.85rem] font-medium text-ink">
        {label}
      </label>
    )

  return (
    <div data-row={label}>
      <span className="mb-1 flex flex-wrap items-baseline gap-x-2">
        {caption}
        {note !== undefined && note !== '' && (
          <span className="rounded-[3px] border border-line px-1 text-[0.75rem] text-faint">{note}</span>
        )}
      </span>
      {children}
      {error !== undefined && error !== null ? (
        <span className="mt-1 block text-[0.78rem] text-danger">{error}</span>
      ) : (
        help !== undefined && <span className="mt-1 block text-[0.78rem] text-faint">{help}</span>
      )}
    </div>
  )
}

/**
 * Ein Textfeld, das seinen Entwurf behält, solange er nicht lesbar ist: erst
 * ein gültiger Wert wird übernommen. `validate` liefert die Fehlermeldung oder
 * null.
 *
 * `commitOn` entscheidet, wann übernommen wird. `'change'` ist der Normalfall —
 * eine Zielzeit soll sofort wirken. `'blur'` ist für Felder, an denen etwas
 * Teures hängt: der Spielername löste sonst pro Tastendruck eine Anfrage an
 * WarEra aus.
 *
 * `trailing` setzt etwas neben das Feld, etwa den Lade-Knopf. Es bekommt den
 * aktuellen Entwurf, damit ein Klick nicht auf die Übernahme warten muss.
 */
function TextRow({
  label,
  help,
  note,
  value,
  disabled = false,
  placeholder,
  mono = false,
  commitOn = 'change',
  trailing,
  validate,
  onCommit,
}: {
  label: string
  help?: string
  note?: string
  value: string
  disabled?: boolean
  placeholder?: string
  mono?: boolean
  commitOn?: 'change' | 'blur'
  trailing?: (draft: string) => ReactNode
  validate: (raw: string) => string | null
  onCommit: (raw: string) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)

  // Ändert sich der Wert von außen — etwa durch den Knopf am Tick-Hinweis —,
  // zieht das Feld mit.
  useEffect(() => {
    setDraft(value)
    setError(null)
  }, [value])

  const commit = (raw: string) => {
    const problem = validate(raw)
    setError(problem)
    if (problem === null && raw !== value) onCommit(raw)
  }

  const field = (
    <input
      id={id}
      type="text"
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => {
        const next = event.target.value
        setDraft(next)
        if (commitOn === 'change') commit(next)
        else setError(validate(next))
      }}
      onBlur={() => commitOn === 'blur' && commit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit(draft)
      }}
      className={`${inputClass} ${mono ? 'font-mono tabular' : ''}`}
    />
  )

  return (
    <Row label={label} help={help} note={note} error={error} htmlFor={id}>
      {trailing === undefined ? (
        field
      ) : (
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1">{field}</span>
          <span className="shrink-0">{trailing(draft)}</span>
        </span>
      )}
    </Row>
  )
}

/**
 * Das Namensfeld mit Vorschlagsliste.
 *
 * Eine eigene Zeile, weil hier drei Dinge zusammenhängen, die `TextRow` nicht
 * kennt: der Entwurf, die entprellte Suche und der Lade-Knopf. Gesucht wird
 * erst ab `SEARCH_MIN_LENGTH` Zeichen und erst `SEARCH_DEBOUNCE` nach dem
 * letzten Tastendruck — jeder Treffer kostet einen eigenen Abruf, weil die
 * Suche der API nur IDs liefert.
 *
 * Ein Klick auf einen Vorschlag übergibt **die ID mit**: dann muss der Name
 * nicht noch einmal aufgelöst werden, und die Verwechslung „c0r findet c0re"
 * kann gar nicht mehr passieren.
 *
 * Damit dieser Klick überhaupt ankommt, verhindern die Vorschläge das
 * voreingestellte `mousedown`: sonst verliert das Feld den Fokus, `onBlur`
 * übernimmt den **Suchtext** als Namen, der Sucheffekt hängt die Liste aus —
 * und der Klick landet auf einem Knopf, den es nicht mehr gibt. Ergebnis war
 * der Suchtext ohne ID und beim nächsten Abruf „mne ist mehrdeutig".
 */
const SEARCH_DEBOUNCE = 300

function UsernameRow({
  t,
  value,
  apiOn,
  onSearch,
  onCommit,
  onLoad,
  onPick,
}: {
  t: Translate
  value: string
  apiOn: boolean
  onSearch: (text: string) => Promise<UserHit[]>
  onCommit: (name: string) => void
  onLoad: (name: string) => void
  onPick: (hit: UserHit) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [hits, setHits] = useState<UserHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const search = useRef(0)

  useEffect(() => {
    setDraft(value)
  }, [value])

  // Entprellte Suche. Der Zähler verwirft Antworten, die von einer älteren
  // Eingabe stammen — sonst überschreibt eine langsame Antwort die neuere.
  useEffect(() => {
    const query = draft.trim()
    if (!apiOn || query.length < SEARCH_MIN_LENGTH) {
      setHits(null)
      setSearching(false)
      return
    }
    // Steht der Entwurf schon als Name fest, ist nichts mehr zu suchen — aber
    // eine offene Liste bleibt offen. Sie hier zu schließen war der Bug: die
    // Übernahme beim Fokusverlust holte den Vorschlag unter dem Zeiger weg.
    if (query === value.trim()) {
      setSearching(false)
      return
    }
    const seq = ++search.current
    setSearching(true)
    const timer = window.setTimeout(() => {
      void onSearch(query)
        .then((found) => {
          if (seq === search.current) setHits(found)
        })
        .catch(() => {
          if (seq === search.current) setHits([])
        })
        .finally(() => {
          if (seq === search.current) setSearching(false)
        })
    }, SEARCH_DEBOUNCE)
    return () => window.clearTimeout(timer)
  }, [draft, value, apiOn, onSearch])

  return (
    <Row
      label={t('menu.f.username')}
      help={hits !== null && hits.length > 0 ? t('menu.f.username.pick') : t('menu.f.load.help')}
      htmlFor={id}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <input
            id={id}
            type="text"
            value={draft}
            autoComplete="off"
            placeholder={t('menu.f.username')}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => draft !== value && onCommit(draft)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setHits(null)
                onLoad(draft)
              }
              // Escape schließt die Liste, ohne etwas zu übernehmen.
              if (event.key === 'Escape') setHits(null)
            }}
            className={inputClass}
          />
        </span>
        <span className="shrink-0">
          <Button
            variant="accent"
            onClick={() => {
              setHits(null)
              onLoad(draft)
            }}
            disabled={draft.trim() === '' || !apiOn}
            title={t('menu.f.fetch.help')}
          >
            {t('menu.f.load')}
          </Button>
        </span>
      </span>

      {(searching || hits !== null) && (
        <ul className="ring-game mt-2 max-h-56 overflow-y-auto rounded-[6px] border border-line bg-ground">
          {searching && (
            <li className="px-3 py-2 text-[0.82rem] text-faint">{t('menu.f.username.searching')}</li>
          )}
          {!searching && hits !== null && hits.length === 0 && (
            <li className="px-3 py-2 text-[0.82rem] text-faint">{t('menu.f.username.no_hits')}</li>
          )}
          {!searching &&
            hits?.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  // Der Fokus bleibt im Feld: sonst übernimmt onBlur den
                  // Suchtext, und dieser Knopf ist weg, ehe der Klick kommt.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setHits(null)
                    setDraft(hit.username)
                    onPick(hit)
                  }}
                  className="flex min-h-11 w-full cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-left text-[0.88rem] text-ink hover:bg-raised"
                >
                  <span className="truncate font-medium">{hit.username}</span>
                  <span className="shrink-0 text-[0.78rem] text-faint">
                    {t('menu.f.username.level', hit.level)}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </Row>
  )
}

/** Eine Reihe Knöpfe, von denen einer aktiv ist — der Ersatz für ↵ im Menü. */
function ChoiceRow<T extends string>({
  label,
  help,
  note,
  value,
  options,
  onSelect,
}: {
  label: string
  help?: string
  note?: string
  value: T
  options: { value: T; label: string }[]
  onSelect: (value: T) => void
}) {
  return (
    <Row label={label} help={help} note={note}>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(option.value)}
              className={`ring-game min-h-11 cursor-pointer rounded-[6px] border px-3 py-2 text-[0.85rem] transition-colors sm:min-h-0 sm:py-1.5 ${
                active
                  ? 'border-accent/70 bg-accent-deep/40 text-ink'
                  : 'border-line bg-raised text-muted hover:border-line-soft hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </Row>
  )
}

function Section({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <div>
      {title !== undefined && <SectionTitle note={note}>{title}</SectionTitle>}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  )
}

/** Eine Zeile, die nur anzeigt — für Werte, die gerade nicht von hier kommen. */
function ValueRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5">
      <span className="text-[0.85rem] text-muted">{label}</span>
      <span className="tabular text-[0.9rem] text-ink">
        {value}
        {note !== undefined && <span className="ml-2 text-[0.75rem] text-faint">{note}</span>}
      </span>
    </div>
  )
}

export interface SettingsPanelProps {
  t: Translate
  settings: Settings
  /** Die Werte aus dem letzten Abruf, für die gesperrten Zeilen. */
  apiValues: Record<string, { max: number; hourlyRegen: number }> | null
  /** Hängt die Zielzeit gerade an einem Debuff? Dann ist die Uhrzeit nur Rückfall. */
  debuffDrivesTarget: boolean
  onChange: (patch: Partial<Settings>) => void
  /**
   * Name übernehmen **und** laden, in einem Schritt: der Knopf neben dem Feld
   * soll nicht davon abhängen, ob das Feld schon übernommen wurde.
   */
  onLoad: (username: string) => void
  /** Sucht Spieler für die Vorschlagsliste. */
  onSearch: (text: string) => Promise<UserHit[]>
  /** Einen Vorschlag übernehmen — mit ID, damit der Name nicht neu aufgelöst wird. */
  onPick: (hit: UserHit) => void
  onReset: () => void
}

export function SettingsPanel({
  t,
  settings,
  apiValues,
  debuffDrivesTarget,
  onChange,
  onLoad,
  onSearch,
  onPick,
  onReset,
}: SettingsPanelProps) {
  const languageId = useId()
  // Hat der Browser die Erlaubnis verweigert, hilft ein Schalter hier nicht
  // weiter — dann muss es der Nutzer in den Seiteneinstellungen zurücknehmen.
  const notifyBlocked = typeof Notification !== 'undefined' && Notification.permission === 'denied'
  const [confirmReset, setConfirmReset] = useState(false)
  const [more, setMore] = useState(false)
  const live = apiMode(settings)

  const clockError = (raw: string) => (parseClock(raw) === null ? t('err.clock') : null)

  /** Zahl mit Komma oder Punkt, größer als 0 — wie die Prüfungen im TUI-Menü. */
  const numberError = (raw: string) => {
    const cleaned = raw.trim().replace(',', '.')
    if (cleaned === '' || Number.isNaN(Number(cleaned))) return t('err.not_a_number', raw.trim())
    if (Number(cleaned) <= 0) return t('err.gt_zero')
    return null
  }
  const toNumber = (raw: string) => Number(raw.trim().replace(',', '.'))

  /**
   * Eine Leisten-Zeile. Nur das Maximum ist einstellbar — die Gutschrift pro
   * Tick ist `max / 10` und damit eine Rechnung des Spiels, keine Frage an den
   * Nutzer. Angezeigt wird sie trotzdem, weil sie erklärt, wie die Zahl
   * zustande kommt.
   */
  const barRow = (key: string, labelID: string) => {
    const own = settings.bars[key] ?? { max: 0 }

    // Im API-Modus zeigt die Zeile die Werte, die gelten — nie den eigenen, der
    // gerade nicht zählt —, und zwar als Text: ein gesperrtes Eingabefeld ist
    // nur Lärm.
    if (live) {
      const fromApi = apiValues?.[key]
      return (
        <ValueRow
          key={key}
          label={t(labelID)}
          value={
            fromApi === undefined
              ? '—'
              : `${num(fromApi.max)} · ${t('bar.per_tick', num(fromApi.hourlyRegen))}`
          }
          note={t('menu.v.from_api')}
        />
      )
    }

    return (
      <TextRow
        key={key}
        label={t(labelID)}
        help={t('menu.f.max.help', t('bar.per_tick', num(regenFor(own.max))))}
        value={num(own.max)}
        mono
        validate={numberError}
        onCommit={(raw) => onChange({ bars: { ...settings.bars, [key]: { max: toNumber(raw) } } })}
      />
    )
  }

  return (
    <Card>
      {/* Erste Ebene: die zwei Einstellungen, um die es wirklich geht. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <UsernameRow
          t={t}
          value={settings.username}
          apiOn={settings.api.enabled}
          onSearch={onSearch}
          onCommit={(username) =>
            // Ein neuer Name macht die gemerkte userId ungültig.
            onChange({
              username,
              userId: username.trim() === settings.username ? settings.userId : '',
            })
          }
          onLoad={onLoad}
          onPick={onPick}
        />
        <TextRow
          label={t('menu.f.target_time')}
          help={t('menu.f.target_time.help')}
          note={debuffDrivesTarget ? t('menu.v.fallback') : undefined}
          value={settings.targetTime}
          mono
          validate={clockError}
          onCommit={(targetTime) => onChange({ targetTime })}
        />
        <div className="sm:col-span-2">
          <ChoiceRow
            label={t('menu.f.target_mode')}
            help={t('menu.f.target_mode.help')}
            value={settings.targetMode}
            options={[
              { value: 'clock', label: t('menu.v.target_clock') },
              { value: 'debuff', label: t('menu.v.target_debuff') },
              { value: 'debuff_hour', label: t('menu.v.target_debuff_hour') },
            ]}
            onSelect={(targetMode) => onChange({ targetMode })}
          />
        </div>
      </div>

      {/* Zweite Ebene: alles, was man einmal einstellt und dann vergisst. */}
      <details
        open={more}
        onToggle={(event) => setMore(event.currentTarget.open)}
        className="mt-5 border-t border-line pt-3"
      >
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 py-2 text-[0.85rem] font-medium text-muted hover:text-ink sm:min-h-0">
          <span aria-hidden="true" className="text-faint">
            {more ? '▾' : '▸'}
          </span>
          {more ? t('menu.less') : t('menu.more')}
          {!more && <span className="text-[0.78rem] font-normal text-faint">{t('menu.more.note')}</span>}
        </summary>

        <div className="grid gap-6 pt-4">
          <Section title={t('menu.s.timing')}>
            <ChoiceRow
              label={t('menu.f.base_mode')}
              help={t('menu.f.base_mode.help')}
              value={settings.baseMode}
              options={[
                { value: 'now', label: t('menu.v.now') },
                { value: 'fixed', label: t('menu.v.fixed') },
              ]}
              onSelect={(baseMode) => onChange({ baseMode })}
            />
            <TextRow
              label={t('menu.f.base_time')}
              help={
                // Mit Spielername und einer Basis in der Vergangenheit werden
                // Ticks doppelt gezählt, die im Ist-Wert schon stecken.
                live && settings.baseMode === 'fixed'
                  ? t('menu.f.base_time.warn')
                  : t('menu.f.base_time.help')
              }
              note={settings.baseMode === 'fixed' ? undefined : t('menu.v.unused')}
              value={settings.baseTime}
              disabled={settings.baseMode !== 'fixed'}
              mono
              validate={clockError}
              onCommit={(baseTime) => onChange({ baseTime })}
            />
            <TextRow
              label={t('menu.f.timezone')}
              help={t('menu.f.timezone.help')}
              note={settings.timezone === '' ? t('menu.v.system', browserZone()) : undefined}
              value={settings.timezone}
              placeholder={browserZone()}
              validate={(raw) => (isValidZone(raw) ? null : t('err.timezone', raw.trim()))}
              onCommit={(timezone) => onChange({ timezone })}
            />
          </Section>

          <Section
            title={t('menu.s.manual')}
            note={live ? t('menu.s.manual.unused') : t('menu.s.api.off')}
          >
            <div className="sm:col-span-2">
              <ChoiceRow
                label={t('menu.f.api')}
                help={t('menu.f.api.help')}
                value={settings.api.enabled ? 'on' : 'off'}
                options={[
                  { value: 'on', label: t('menu.v.on') },
                  { value: 'off', label: t('menu.v.off') },
                ]}
                onSelect={(value) => onChange({ api: { ...settings.api, enabled: value === 'on' } })}
              />
            </div>
            {barRow(BAR_HEALTH, 'menu.f.health_max')}
            {barRow(BAR_HUNGER, 'menu.f.hunger_max')}
          </Section>

          <Section title={t('menu.s.display')}>
            <TextRow
              label={t('menu.f.hint_window')}
              help={t('menu.f.hint_window.help')}
              value={String(settings.hintWindowMinutes)}
              mono
              validate={(raw) => {
                const value = Number(raw.trim())
                if (raw.trim() === '' || !Number.isInteger(value)) return t('err.not_a_number', raw.trim())
                if (value < 0 || value > 59) return t('err.minutes')
                return null
              }}
              onCommit={(raw) => onChange({ hintWindowMinutes: Number(raw.trim()) })}
            />
            <ChoiceRow
              label={t('menu.f.notify')}
              help={
                notifyBlocked ? t('menu.f.notify.denied') : t('menu.f.notify.help')
              }
              value={settings.notify ? 'on' : 'off'}
              options={[
                { value: 'on', label: t('menu.v.on') },
                { value: 'off', label: t('menu.v.off') },
              ]}
              onSelect={(value) => {
                const on = value === 'on'
                // Die Erlaubnis muss **aus dem Klick heraus** erfragt werden.
                // Safari verlangt dafür eine Nutzeraktion, und ein Effekt, der
                // erst nach dem Rendern läuft, ist keine mehr — dort kam die
                // Abfrage sonst nie an.
                if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') {
                  void Notification.requestPermission()
                }
                onChange({ notify: on })
              }}
            />
            <Row label={t('menu.f.language')} help={t('menu.f.language.help')} htmlFor={languageId}>
              <select
                id={languageId}
                value={settings.language}
                onChange={(event) => onChange({ language: event.target.value })}
                className={inputClass}
              >
                <option value="">{t('menu.v.auto', langName(resolve('')))}</option>
                {codes().map((code) => (
                  <option key={code} value={code}>
                    {langName(code)}
                  </option>
                ))}
              </select>
            </Row>
          </Section>

          {/* Ohne Zeilenbeschriftung: die stand wörtlich auf dem Knopf
              darunter, und dann liest man „Zurücksetzen" zweimal. */}
          <div>
            <SectionTitle note={t('menu.s.storage.note')}>{t('menu.s.storage')}</SectionTitle>
            {confirmReset ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.85rem] text-danger">{t('menu.v.confirm')}</span>
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirmReset(false)
                    onReset()
                  }}
                >
                  {t('menu.v.confirm_yes')}
                </Button>
                <Button onClick={() => setConfirmReset(false)}>{t('menu.v.confirm_no')}</Button>
              </div>
            ) : (
              <Button onClick={() => setConfirmReset(true)}>{t('menu.f.reset')}</Button>
            )}
            <p className="mt-1 text-[0.78rem] text-faint">{t('menu.f.reset.help')}</p>
          </div>
        </div>
      </details>
    </Card>
  )
}
