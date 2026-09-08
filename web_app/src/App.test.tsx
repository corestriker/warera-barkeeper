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
