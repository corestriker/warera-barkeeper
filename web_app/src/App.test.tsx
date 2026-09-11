/**
 * Prüfungen an der ganzen Seite — dort, wo Abruf, Eingabe und Anzeige
 * zusammenkommen.
 *
 * Der Anlass: der Spielername wurde beim Tippen Zeichen für Zeichen
 * übernommen, und weil der Abruf am Namen hing, ging pro Tastendruck eine
 * Anfrage an WarEra. Geladen wird jetzt nur auf Klick.
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { defaults, saveSettings } from './lib/settings'

const USER = {
  _id: 'u1',
  username: 'c0re',
  leveling: { level: 12 },
  skills: {
    health: { level: 4, total: 140, currentBarValue: 117.5, hourlyBarRegen: 14 },
    hunger: { level: 4, total: 7, currentBarValue: 6.1, hourlyBarRegen: 0.7 },
  },
}

let calls: string[] = []

/** Zählt die Abrufe: ein geladenes Profil ist eine Runde. */
function rounds(): number {
  return calls.filter((url) => url.includes('user.getUserLite')).length
}

function json(data: unknown): Response {
  return new Response(JSON.stringify({ result: { data } }))
}

beforeEach(() => {
  calls = []
  window.localStorage.clear()
  // Nur den Sekundentakt anhalten, damit die Uhr nicht in die Zusicherungen
  // hineinläuft; die Zeitüberwachung des Abrufs soll echt bleiben.
  vi.useFakeTimers({ toFake: ['setInterval'] })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('search.searchAnything')) return json({ userIds: ['u1'] })
      if (url.includes('user.getUserLite')) return json(USER)
      return json({ nextRegenAt: new Date().toISOString() })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function settingsButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === label)
  if (button === undefined) throw new Error(`Knopf „${label}“ nicht gefunden`)
  return button as HTMLButtonElement
}

function usernameField(container: HTMLElement): HTMLInputElement {
  const field = container.querySelector('input')
  if (field === null) throw new Error('kein Eingabefeld gefunden')
  return field as HTMLInputElement
}

describe('Abruf', () => {
  it('holt die Werte beim Laden der Seite, wenn ein Name gespeichert ist', async () => {
    saveSettings({ ...defaults(), username: 'c0re', language: 'de', timezone: 'Europe/Berlin' })

    const { container } = render(<App />)
    await waitFor(() => expect(rounds()).toBe(1))
    // Die geholten Werte stehen in der Anzeige.
    await waitFor(() => expect(container.textContent).toContain('117.5'))
  })

  it('fragt beim Tippen des Namens nicht bei WarEra nach', async () => {
    saveSettings({ ...defaults(), username: 'c0re', language: 'de', timezone: 'Europe/Berlin' })

    const { container } = render(<App />)
    await waitFor(() => expect(rounds()).toBe(1))

    fireEvent.click(settingsButton(container, 'Einstellungen'))
    const field = usernameField(container)
    for (const value of ['c0r', 'c0', 'c', 'k', 'ka', 'kai']) {
      fireEvent.change(field, { target: { value } })
    }
    fireEvent.blur(field)

    // Sechs Tastendrücke, kein zusätzlicher Abruf.
    expect(rounds()).toBe(1)
  })

  it('lädt auf Klick und meldet, dass die alten Werte nicht mehr gelten', async () => {
    saveSettings({ ...defaults(), username: 'c0re', language: 'de', timezone: 'Europe/Berlin' })

    const { container } = render(<App />)
    await waitFor(() => expect(rounds()).toBe(1))

    fireEvent.click(settingsButton(container, 'Einstellungen'))
    fireEvent.change(usernameField(container), { target: { value: 'kai' } })
    fireEvent.blur(usernameField(container))

    // Der Snapshot gehört zum alten Namen: er darf nicht mehr gelten.
    await waitFor(() => expect(container.textContent).toContain('nicht geladen'))
    expect(container.textContent).not.toContain('117.5')

    fireEvent.click(settingsButton(container, 'Werte laden'))
    await waitFor(() => expect(rounds()).toBe(2))
    await waitFor(() => expect(container.textContent).toContain('117.5'))
  })

  it('löscht nichts, wenn man auf die Beschriftung der Zurücksetzen-Zeile klickt', async () => {
    // Der schlimmste Fall der alten label-Weiterleitung: der erste Klick auf
    // die Beschriftung drückte „Zurücksetzen“, der zweite „Ja, zurücksetzen“ —
    // und der Speicher war weg.
    saveSettings({ ...defaults(), username: 'c0re', language: 'de', timezone: 'Europe/Berlin' })

    const { container } = render(<App />)
    await waitFor(() => expect(rounds()).toBe(1))
    fireEvent.click(settingsButton(container, 'Einstellungen'))
    fireEvent.click(container.querySelector('summary')!)
    await waitFor(() => expect(container.querySelector('details')?.open).toBe(true))

    // Alles anklicken, was um den Knopf herum steht: Überschrift, Vermerk,
    // Hilfstext. Nichts davon darf etwas auslösen.
    const around = [
      ...container.querySelectorAll('h2'),
      ...container.querySelectorAll('p'),
      ...container.querySelectorAll('span'),
    ].filter((el) => /In diesem Browser|gespeicherte Einstellungen verwerfen/.test(el.textContent ?? ''))
    expect(around.length, 'die Umgebung des Knopfes muss gefunden werden').toBeGreaterThan(1)
    for (let i = 0; i < 3; i++) {
      for (const el of around) fireEvent.click(el)
    }

    expect(window.localStorage.getItem('barkeeper.settings.v1')).not.toBeNull()
    expect(container.textContent).toContain('Einstellungen')
    // Die Sprache steht noch, also ist auch nichts auf Standard zurückgefallen.
    expect(container.textContent).toContain('Werte holen')
  })

  it('setzt auf Klick des Knopfes tatsächlich zurück', async () => {
    saveSettings({ ...defaults(), username: 'c0re', language: 'de', timezone: 'Europe/Berlin' })

    const { container } = render(<App />)
    await waitFor(() => expect(rounds()).toBe(1))
    fireEvent.click(settingsButton(container, 'Einstellungen'))
    fireEvent.click(container.querySelector('summary')!)
    await waitFor(() => expect(container.querySelector('details')?.open).toBe(true))

    // Zwei Schritte, wie im Terminal: fragen, dann löschen.
    fireEvent.click(settingsButton(container, 'Zurücksetzen'))
    fireEvent.click(settingsButton(container, 'Ja, zurücksetzen'))

    expect(window.localStorage.getItem('barkeeper.settings.v1')).toBeNull()
  })

  it('zeigt die Abruf-Zeit am Knopf und sperrt ihn eine Minute', async () => {
    // Die Uhrzeit gehört an den Knopf, der sie erneuert — nicht in eine
    // Statuszeile mitten in der Seite. Und wer hämmert, holt zwischen zwei
    // Stunden-Ticks ohnehin dieselben Zahlen.
    saveSettings({ ...defaults(), username: 'c0re', language: 'de', timezone: 'Europe/Berlin' })

    const { container } = render(<App />)
    await waitFor(() => expect(rounds()).toBe(1))

    const button = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('Werte holen'),
    ) as HTMLButtonElement
    expect(button, 'Abruf-Knopf').toBeDefined()
    expect(button.textContent).toMatch(/in \d+ s/)
    expect(button.disabled).toBe(true)

    fireEvent.click(button)
    expect(rounds()).toBe(1)

    // Die Statuszeile behauptet nichts über den Abruf.
    expect(container.textContent).not.toMatch(/Werte aktualisiert/)
  })

  it('trägt die Restzeit im Tab-Titel', async () => {
    // Auch ohne Benachrichtigungs-Erlaubnis soll man die Frist im Blick haben.
    //
    // Die Uhr wird festgehalten: die Zusicherung erwartet ein Stunden-Feld,
    // und in der letzten Stunde vor der Zielzeit gibt es keins. Ohne das
    // scheiterte der Test jeden Tag zwischen 13:05 und 14:05 Ortszeit.
    vi.useFakeTimers({ toFake: ['setInterval', 'Date'] })
    vi.setSystemTime(Date.parse('2026-09-10T08:00:00Z'))
    saveSettings({ ...defaults(), language: 'de', timezone: 'Europe/Berlin', targetMode: 'clock' })

    render(<App />)
    await waitFor(() => expect(document.title).toMatch(/^\d+h \d+m · War Era - Barkeeper$/))
  })

  it('rechnet ohne Namen mit den eigenen Werten und fragt gar nicht', async () => {
    // Sprache explizit, sonst hängt die Zusicherung an der Sprache des
    // Rechners, auf dem die Tests laufen.
    saveSettings({ ...defaults(), language: 'de', timezone: 'Europe/Berlin' })

    const { container } = render(<App />)
    await waitFor(() => expect(container.textContent).toContain('max 100'))
    expect(calls).toHaveLength(0)
    expect(container.textContent).toContain('manuell')
  })
})

describe('Vorschlagsliste am Namensfeld', () => {
  /**
   * Der Bug: ein Klick auf einen Vorschlag lud den **Suchtext** statt des
   * angeklickten Spielers und scheiterte mit „mne ist mehrdeutig".
   *
   * Der Ablauf im Browser: `mousedown` nimmt dem Feld den Fokus, `onBlur`
   * übernimmt den Entwurf als Namen, der Sucheffekt hängt daraufhin die Liste
   * aus — und der Klick landet auf einem Knopf, den es nicht mehr gibt.
   * Deshalb wird hier nicht bloß `click` gefeuert, sondern die Reihenfolge des
   * Browsers nachgestellt: `mousedown`, der Fokusverlust nur, wenn ihn niemand
   * verhindert hat, dann der Klick.
   */
  const HITS: Record<string, unknown> = {
    u1: {
      _id: 'u1',
      username: 'Mnemosyne',
      leveling: { level: 12 },
      skills: {
        health: { level: 4, total: 140, currentBarValue: 117.5, hourlyBarRegen: 14 },
        hunger: { level: 4, total: 7, currentBarValue: 6.1, hourlyBarRegen: 0.7 },
      },
    },
    u2: {
      _id: 'u2',
      username: 'Mnestra',
      leveling: { level: 3 },
      skills: {
        health: { level: 4, total: 90, currentBarValue: 42, hourlyBarRegen: 9 },
        hunger: { level: 4, total: 7, currentBarValue: 6.1, hourlyBarRegen: 0.7 },
      },
    },
  }

  function stubTwoHits() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        calls.push(url)
        // Zwei Treffer, keiner davon heißt wie der Suchtext: über den Namen
        // allein wäre das nicht auflösbar.
        if (url.includes('search.searchAnything')) return json({ userIds: ['u1', 'u2'] })
        if (url.includes('user.getUserLite')) return json(HITS[url.includes('u2') ? 'u2' : 'u1'])
        return json({ nextRegenAt: new Date().toISOString() })
      }),
    )
  }

  /** Klickt so, wie der Browser klickt. */
  function browserClick(target: HTMLElement, field: HTMLInputElement) {
    const focusStays = !fireEvent.mouseDown(target)
    if (!focusStays) fireEvent.blur(field)
    expect(target.isConnected, 'der Vorschlag muss den Fokuswechsel überleben').toBe(true)
    fireEvent.click(target)
  }

  async function suggestion(container: HTMLElement, name: string): Promise<HTMLButtonElement> {
    return await waitFor(() => {
      const button = [...container.querySelectorAll('button')].find((b) =>
        b.textContent?.includes(name),
      )
      if (button === undefined) throw new Error(`kein Vorschlag „${name}“`)
      return button as HTMLButtonElement
    })
  }

  it('lädt den angeklickten Spieler, nicht den Suchtext', async () => {
    saveSettings({ ...defaults(), language: 'de', timezone: 'Europe/Berlin' })
    stubTwoHits()

    const { container } = render(<App />)
    fireEvent.click(settingsButton(container, 'Einstellungen'))
    const field = usernameField(container)
    fireEvent.change(field, { target: { value: 'Mne' } })

    const hit = await suggestion(container, 'Mnestra')
    calls = []
    browserClick(hit, field)

    // Der Abruf geht über die mitgelieferte ID: keine Auflösung des Suchtexts,
    // damit auch keine Mehrdeutigkeit.
    await waitFor(() => expect(rounds()).toBe(1))
    expect(calls.some((url) => url.includes('search.searchAnything'))).toBe(false)
    expect(calls.some((url) => url.includes('%22u2%22'))).toBe(true)

    // Und die Werte des angeklickten Spielers stehen in der Anzeige.
    await waitFor(() => expect(container.textContent).toContain('Mnestra'))
    expect(container.textContent).toContain('42')
    expect(container.textContent).not.toContain('mehrdeutig')
  })

  it('schließt die Liste erst mit der Auswahl', async () => {
    saveSettings({ ...defaults(), language: 'de', timezone: 'Europe/Berlin' })
    stubTwoHits()

    const { container } = render(<App />)
    fireEvent.click(settingsButton(container, 'Einstellungen'))
    const field = usernameField(container)
    fireEvent.change(field, { target: { value: 'Mne' } })

    const hit = await suggestion(container, 'Mnemosyne')
    browserClick(hit, field)

    await waitFor(() => expect(container.textContent).not.toContain('Mnestra'))
    expect(usernameField(container).value).toBe('Mnemosyne')
  })
})

/**
 * Meldungen — die Stelle, an der die Seite lange nichts zustellte.
 *
 * Die reine Entscheidung in `lib/alerts` war richtig und geprüft; sie bekam
 * nur nie ein fälliges Ereignis zu sehen. `fullAt` zählt ab dem ersten Tick
 * nach `Params.base`, und `base` ist `now` — der Zeitpunkt lag damit immer in
 * der Zukunft. Deshalb prüft das hier durch die ganze Seite hindurch.
 */
describe('Meldungen', () => {
  const TICK = Date.parse('2026-09-10T12:00:00Z')
  let sent: { body: string; tag: string }[] = []
  let asked = 0

  function stubNotification(permission: NotificationPermission): void {
    sent = []
    asked = 0
    class FakeNotification {
      static permission: NotificationPermission = permission
      static requestPermission(): Promise<NotificationPermission> {
        asked += 1
        return Promise.resolve(permission)
      }
      constructor(_title: string, options?: { body?: string; tag?: string }) {
        sent.push({ body: options?.body ?? '', tag: options?.tag ?? '' })
      }
    }
    vi.stubGlobal('Notification', FakeNotification)
  }

  /** Ein Profil, dessen Leben genau einen Tick vor „voll“ steht. */
  function stubApi(health: number): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.includes('search.searchAnything')) return json({ userIds: ['u1'] })
        if (url.includes('user.getUserLite')) {
          return json({
            ...USER,
            skills: {
              health: { level: 4, total: 140, currentBarValue: health, hourlyBarRegen: 14 },
              hunger: { level: 4, total: 7, currentBarValue: 7, hourlyBarRegen: 0.7 },
            },
          })
        }
        return json({ nextRegenAt: new Date(TICK).toISOString() })
      }),
    )
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'Date'] })
    vi.setSystemTime(TICK - 5_000)
  })

  it('meldet, wenn eine Leiste wieder voll ist', async () => {
    stubNotification('granted')
    stubApi(126)
    saveSettings({
      ...defaults(),
      username: 'c0re',
      language: 'de',
      timezone: 'Europe/Berlin',
      notify: true,
    })

    render(<App />)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sent).toHaveLength(0)

    // Über die Tickgrenze hinweg.
    await vi.advanceTimersByTimeAsync(10_000)

    expect(sent).toHaveLength(1)
    expect(sent[0]!.body).toContain('HEALTH')
  })

  it('warnt vor dem Tick, der die Gutschrift verschenkt', async () => {
    stubNotification('granted')
    // Leben bereits voll: der Tick um 12:00 schreibt 14 gut und deckelt bei
    // 140 — die ganze Gutschrift verfällt.
    stubApi(140)
    saveSettings({
      ...defaults(),
      username: 'c0re',
      language: 'de',
      timezone: 'Europe/Berlin',
      notify: true,
      hintWindowMinutes: 15,
    })

    // Kurz vor dem Vorlauf: noch nichts.
    vi.setSystemTime(TICK - 16 * 60_000)
    render(<App />)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sent).toEqual([])

    // In den Vorlauf hinein.
    await vi.advanceTimersByTimeAsync(90_000)

    const warn = sent.filter((n) => n.tag.startsWith('overflow:health'))
    expect(warn).toHaveLength(1)
    expect(warn[0]!.body).toContain('HEALTH')
    // Die verschenkte Menge steht in der Meldung.
    expect(warn[0]!.body).toContain('14')
  })

  it('meldet nichts, solange die Erlaubnis fehlt', async () => {
    stubNotification('denied')
    stubApi(126)
    saveSettings({
      ...defaults(),
      username: 'c0re',
      language: 'de',
      timezone: 'Europe/Berlin',
      notify: true,
    })

    render(<App />)
    await vi.advanceTimersByTimeAsync(11_000)
    expect(sent).toEqual([])
  })

  it('fragt die Erlaubnis aus dem Klick heraus — nicht erst aus einem Effekt', async () => {
    stubNotification('default')
    stubApi(140)
    saveSettings({ ...defaults(), username: 'c0re', language: 'de', timezone: 'Europe/Berlin' })

    const { container } = render(<App />)
    await vi.advanceTimersByTimeAsync(1_000)
    fireEvent.click(settingsButton(container, 'Einstellungen'))
    const more = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Mehr einstellen'),
    )
    if (more !== undefined) fireEvent.click(more)

    const on = [...container.querySelectorAll('button')].filter((b) => b.textContent === 'an')
    // Der Schalter „Benachrichtigen“ ist der letzte „an“-Knopf der Seite.
    fireEvent.click(on[on.length - 1]!)

    expect(asked).toBeGreaterThan(0)
  })
})
