/**
 * Diese Tests spiegeln `internal/ui/state_test.go` und `lang_test.go`: sie
 * rendern die Ansichten und prüfen, was dort stehen muss — und was nicht.
 *
 * Sprache und Zeitzone werden immer explizit gesetzt, damit die Tests nicht am
 * Rechner hängen, auf dem sie laufen.
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { codes, printer } from '../lib/i18n'
import { BAR_HEALTH, defaults, type Settings, type TargetMode } from '../lib/settings'
import { buildState, computeState } from '../lib/state'
import type { Snapshot, UserHit } from '../lib/warera'
import { instantFromWall } from '../lib/zone'
import { BarCard, Legend } from './BarCard'
import { DebuffNote } from './DebuffNote'
import { DisclaimerNotice } from './Disclaimer'
import { Explainer } from './Explainer'
import { TargetLine, TopBar } from './Header'
import { HintCard } from './HintCard'
import { SettingsPanel } from './SettingsPanel'

afterEach(cleanup)

const BERLIN = 'Europe/Berlin'
const NOW = instantFromWall(BERLIN, { year: 2026, month: 9, day: 2, hour: 8, minute: 34 })
const DEBUFF_END = instantFromWall(BERLIN, { year: 2026, month: 9, day: 2, hour: 14, minute: 34 })

function testSettings(patch: Partial<Settings> = {}): Settings {
  return { ...defaults(), timezone: BERLIN, language: 'de', targetMode: 'clock', ...patch }
}

function snapshot(debuffEndAt: number | null = null): Snapshot {
  return {
    user: {
      id: 'u1',
      username: 'c0re',
      level: 12,
      buffs: { debuffCodes: ['cocain'], debuffEndAt },
      skills: {
        health: { level: 3, total: 140, currentBarValue: 117.5, hourlyBarRegen: 14 },
        hunger: { level: 3, total: 7, currentBarValue: 6.1, hourlyBarRegen: 0.7 },
      },
    },
    nextRegenAt: null,
    fetchedAt: NOW,
  }
}

/**
 * Rendert das Hauptfenster und liefert den sichtbaren Text.
 *
 * Bewusst ohne Einstellungen und Erklärabschnitt: dort stehen Wörter wie
 * „Pillen-Debuff“ und „verbraucht“ als Auswahl bzw. Legende, und dann könnte
 * kein Test mehr prüfen, ob das Hauptfenster selbst schweigt.
 */
function dashboard(settings: Settings, snap: Snapshot | null, now = NOW): string {
  const t = printer(settings.language)
  const state = buildState(settings, snap, now)
  const { result, hint } = computeState(state, settings)

  const { container } = render(
    <>
      <TopBar
        t={t}
        settings={settings}
        api={snap === null ? 'off' : 'ok'}
        settingsOpen={false}
        now={now}
        fetchedAt={snap === null ? null : snap.fetchedAt}
        attemptedAt={null}
        onFetch={() => {}}
        onToggleSettings={() => {}}
      />
      <TargetLine t={t} settings={settings} state={state} now={now} />
      <DebuffNote t={t} state={state} now={now} />
      {result.bars.map((br) => (
        <BarCard key={br.bar.key} t={t} br={br} zone={state.zone} />
      ))}
      <Legend t={t} result={result} />
      {hint !== null && (
        <HintCard t={t} hint={hint} result={result} zone={state.zone} onApply={() => {}} />
      )}
      <DisclaimerNotice t={t} />
    </>,
  )
  return container.textContent ?? ''
}

/** Rendert jede Ansicht der Seite — für die Prüfungen, die alles abdecken sollen. */
function everything(settings: Settings, snap: Snapshot | null, now = NOW): string {
  const t = printer(settings.language)
  const state = buildState(settings, snap, now)

  const { container } = render(
    <>
      <SettingsPanel
        t={t}
        settings={settings}
        apiValues={
          snap === null
            ? null
            : { health: { max: 140, hourlyRegen: 14 }, hunger: { max: 7, hourlyRegen: 0.7 } }
        }
        debuffDrivesTarget={state.target !== 'clock'}
        onChange={() => {}}
        onLoad={() => {}}
        onSearch={async () => []}
        onPick={() => {}}
        onReset={() => {}}
      />
      <Explainer t={t} settings={{ ...settings, explainerOpen: true }} snap={snap} zone={state.zone} onToggle={() => {}} />
    </>,
  )
  return dashboard(settings, snap, now) + (container.textContent ?? '')
}

const MODES: TargetMode[] = ['clock', 'debuff', 'debuff_hour']

describe('Debuff-Meldung', () => {
  it('meldet den laufenden Debuff im Uhrzeit-Modus, ohne Anspruch auf die Zielzeit', () => {
    const text = dashboard(testSettings({ username: 'c0re' }), snapshot(DEBUFF_END))
    for (const want of ['Pillen-Debuff', '14:34', '6h 00m']) {
      expect(text).toContain(want)
    }
    expect(text).not.toContain('Grundlage der Zielzeit')
    expect(text).not.toContain('Tick danach')
  })

  it('nennt sich im Debuff-Modus selbst als Grundlage', () => {
    const text = dashboard(testSettings({ username: 'c0re', targetMode: 'debuff' }), snapshot(DEBUFF_END))
    expect(text).toContain('Grundlage der Zielzeit')
  })

  it('nennt im Stunden-Modus den Tick danach', () => {
    const text = dashboard(testSettings({ username: 'c0re', targetMode: 'debuff_hour' }), snapshot(DEBUFF_END))
    expect(text).toContain('Ziel: Tick danach')
  })

  it('zeigt den Pillen-Code in keinem Modus', () => {
    // Welche Pille es war, steht in der API, gehört aber nicht in die
    // Anzeige — „Pillen-Debuff“ sagt alles, was für die Rechnung zählt.
    for (const mode of MODES) {
      cleanup()
      const text = everything(testSettings({ username: 'c0re', targetMode: mode }), snapshot(DEBUFF_END))
      expect(text, mode).not.toContain('cocain')
    }
  })

  it('schweigt ohne, mit abgelaufenem und ohne abgerufenen Debuff', () => {
    expect(
      dashboard(testSettings({ username: 'c0re', targetMode: 'debuff' }), snapshot(null)),
    ).not.toContain('Pillen-Debuff')
    cleanup()
    expect(
      dashboard(testSettings({ username: 'c0re', targetMode: 'debuff' }), snapshot(NOW - 1000)),
    ).not.toContain('Pillen-Debuff')
    cleanup()
    expect(dashboard(testSettings({ username: 'c0re' }), null)).not.toContain('Pillen-Debuff')
  })
})

describe('Fan-Projekt-Hinweis', () => {
  it('steht in jeder Sprache im Hauptfenster, ohne Aufklappen', () => {
    for (const language of codes()) {
      cleanup()
      const text = dashboard(testSettings({ language }), null)
      // Der kurze Vermerk in der Kopfleiste …
      expect(text, language).toMatch(/Fan-Projekt|fan project/)
      // … und die ausführliche Fassung, die sagt, was das heißt.
      expect(text, language).toMatch(/nicht mit den Entwicklern|not affiliated with the developers/)
    }
  })
})

describe('Kopf', () => {
  it('beschriftet die Zielzeit aus dem Debuff', () => {
    const text = dashboard(testSettings({ username: 'c0re', targetMode: 'debuff' }), snapshot(DEBUFF_END))
    expect(text).toContain('Debuff-Ende')
  })

  it('vermerkt den Rückfall, wenn kein Debuff läuft', () => {
    const text = dashboard(testSettings({ username: 'c0re', targetMode: 'debuff' }), snapshot(null))
    expect(text).toContain('kein Debuff aktiv')
  })

  it('vermerkt den Rückfall nicht ohne Abruf — dort kann niemand vom Debuff wissen', () => {
    // Ohne Spielername ist der Vermerk nur Lärm.
    const text = dashboard(testSettings({ targetMode: 'debuff' }), null)
    expect(text).not.toContain('kein Debuff aktiv')
  })
})

describe('Feste Basiszeit', () => {
  it('warnt, wenn eine Basis in der Vergangenheit auf abgerufene Ist-Werte trifft', () => {
    // Dann zählt die Rechnung Ticks mit, die im Ist-Wert schon stecken.
    const text = dashboard(
      testSettings({ username: 'c0re', baseMode: 'fixed', baseTime: '07:00' }),
      snapshot(null),
    )
    expect(text).toMatch(/Ticks mit, die im abgerufenen Ist-Wert/)
  })

  it('warnt im manuellen Betrieb nicht — dort ist die feste Basis richtig', () => {
    // Ohne Ist-Wert gilt „bei Basis war alles voll“, und genau das ist gemeint.
    const text = dashboard(testSettings({ baseMode: 'fixed', baseTime: '07:00' }), null)
    expect(text).not.toMatch(/Ticks mit, die im abgerufenen Ist-Wert/)
  })
})

describe('Leisten', () => {
  it('zeigt im API-Modus Ist-Wert und Maximum', () => {
    const text = dashboard(testSettings({ username: 'c0re' }), snapshot(null))
    expect(text).toContain('117.5')
    expect(text).toContain('140')
  })

  it('zeigt im manuellen Betrieb nur das Maximum und keinen Ist-Wert', () => {
    const text = dashboard(testSettings(), null)
    expect(text).toContain('max 100')
    // Ohne Ist-Wert hat die Legende keine Zone „verbraucht“ und keine „fehlt“.
    expect(text).not.toContain('verbraucht')
    expect(text).not.toContain('fehlt')
  })

  it('meldet einen Fehlbetrag statt „ausgeben 0“', () => {
    // Ist-Wert weit unter dem Zielwert: dann ist die Uhrzeit die Information,
    // zu der die Leiste wieder voll ist.
    const snap = snapshot(null)
    snap.user.skills['health'] = { level: 3, total: 140, currentBarValue: 20, hourlyBarRegen: 14 }
    const text = dashboard(testSettings({ username: 'c0re' }), snap)
    expect(text).toContain('zur Zielzeit nicht voll')
    expect(text).toContain('100 % erst')
    expect(text).toContain('fehlt')
  })
})

describe('Einstellungen', () => {
  function panel(
    settings: Settings,
    api: boolean,
    handlers: {
      onLoad?: (name: string) => void
      onSearch?: (text: string) => Promise<UserHit[]>
      onPick?: (hit: UserHit) => void
    } = {},
  ) {
    return render(
      <SettingsPanel
        t={printer('de')}
        settings={settings}
        apiValues={
          api ? { health: { max: 140, hourlyRegen: 14 }, hunger: { max: 7, hourlyRegen: 0.7 } } : null
        }
        debuffDrivesTarget={false}
        onChange={() => {}}
        onLoad={handlers.onLoad ?? (() => {})}
        onSearch={handlers.onSearch ?? (async () => [])}
        onPick={handlers.onPick ?? (() => {})}
        onReset={() => {}}
      />,
    )
  }

  it('lädt mit dem Namen, der im Feld steht — ohne ihn vorher zu übernehmen', () => {
    // Der Knopf sitzt neben dem Feld, und ein Klick soll nicht den vorigen
    // Namen abfragen. Deshalb bekommt er den Entwurf mitgegeben.
    const loaded: string[] = []
    const { container } = panel(testSettings(), false, { onLoad: (name) => loaded.push(name) })

    const input = container.querySelector('input')!
    fireEvent.change(input, { target: { value: 'c0re' } })
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Werte laden')!)

    expect(loaded).toEqual(['c0re'])
  })

  it('schlägt Spieler vor und übernimmt einen mit seiner ID', async () => {
    // Die Suche der API liefert nur IDs; die Vorschlagsliste löst sie auf und
    // gibt die ID beim Klick mit, damit der Name nicht neu aufgelöst wird.
    const hits: UserHit[] = [
      { id: 'a1', username: 'c0re', level: 37 },
      { id: 'b2', username: 'C0reX', level: 33 },
    ]
    const picked: UserHit[] = []
    const asked: string[] = []
    const { container } = panel(testSettings(), false, {
      onSearch: async (text) => {
        asked.push(text)
        return hits
      },
      onPick: (hit) => picked.push(hit),
    })

    fireEvent.change(container.querySelector('input')!, { target: { value: 'c0re' } })
    await waitFor(() => expect(container.textContent).toContain('Level 37'))
    expect(asked).toEqual(['c0re'])
    expect(container.textContent).toContain('C0reX')

    const suggestion = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('C0reX'),
    )!
    fireEvent.click(suggestion)
    expect(picked).toEqual([hits[1]])
  })

  it('sucht erst ab drei Zeichen', async () => {
    const asked: string[] = []
    const { container } = panel(testSettings(), false, {
      onSearch: async (text) => {
        asked.push(text)
        return []
      },
    })

    fireEvent.change(container.querySelector('input')!, { target: { value: 'c0' } })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(asked).toEqual([])
  })

  it('sperrt den Lade-Knopf ohne Namen', () => {
    const { container } = panel(testSettings(), false)
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Werte laden')
    expect(button?.disabled).toBe(true)
  })

  it('zeigt im API-Modus die Werte aus dem Abruf und keine eigenen Zahlen', () => {
    const settings = testSettings({ username: 'c0re' })
    settings.bars[BAR_HEALTH] = { max: 999 }

    const { container } = panel(settings, true)
    fireEvent.click(container.querySelector('summary')!)
    const text = container.textContent ?? ''

    expect(text).toContain('140')
    // Die abgeleitete Rate steht als Information dabei.
    expect(text).toContain('14/Tick')
    // Eine Zeile darf nie den Wert zeigen, der gerade nicht gilt.
    expect(text).not.toContain('999')
    // Und die Werte aus dem Abruf gehören in kein Eingabefeld — von hier aus
    // ist daran nichts zu ändern.
    const inputs = [...container.querySelectorAll('input')].map((input) => input.value)
    expect(inputs).not.toContain('140')
    expect(inputs).not.toContain('999')
  })

  it('macht die eigenen Werte im manuellen Betrieb editierbar', () => {
    const settings = testSettings()
    settings.bars[BAR_HEALTH] = { max: 999 }

    const { container } = panel(settings, false)
    fireEvent.click(container.querySelector('summary')!)

    const field = [...container.querySelectorAll('input')].find((input) => input.value === '999')
    expect(field, 'die eigene Zahl soll im Feld stehen').toBeDefined()
    expect(field?.disabled).toBe(false)
  })

  it('macht die Gutschrift pro Tick nirgends einstellbar', () => {
    // Sie ist max / 10 — eine Rechnung des Spiels, keine Frage an den Nutzer.
    const { container } = panel(testSettings(), false)
    fireEvent.click(container.querySelector('summary')!)

    const labels = [...container.querySelectorAll('label')].map((label) => label.textContent ?? '')
    expect(labels.some((label) => label.startsWith('Health je Tick'))).toBe(false)
    expect(labels.some((label) => label.startsWith('Hunger je Tick'))).toBe(false)
    // Stattdessen steht sie als Information am Maximum.
    expect(container.textContent).toContain('Max / 10')
  })

  it('legt kein <label> um einen Knopf', () => {
    // Das ist die Regel hinter dem Fehler: ein <label> leitet jeden Klick an
    // das erste bedienbare Element darin weiter, und <button> gehört dazu. Lag
    // das <label> um die ganze Zeile, drückte ein Klick auf die Beschriftung
    // die erste Option — bei der Zurücksetzen-Zeile beim zweiten Mal „Ja“.
    const { container } = panel(testSettings(), false)
    fireEvent.click(container.querySelector('summary')!)

    for (const caption of [...container.querySelectorAll('label')]) {
      expect(caption.querySelector('button'), `„${caption.textContent}“ umfasst einen Knopf`).toBeNull()
    }
  })

  it('stellt bei einem Klick auf Beschriftung oder Hilfstext nichts um', () => {
    const { container } = panel(testSettings({ targetMode: 'debuff' }), false)
    const row = container.querySelector('[data-row="Zielzeit aus"]')!
    const active = () => row.querySelector('[aria-pressed="true"]')?.textContent

    expect(active()).toBe('Pillen-Debuff')
    // Genau die zwei Stellen, an denen der Nutzer landet: die Beschriftung und
    // der Hilfstext darunter.
    for (const target of [...row.querySelectorAll('span, label')]) {
      if (target.textContent?.startsWith('Zielzeit aus') || target.textContent?.startsWith('die Debuff')) {
        fireEvent.click(target)
      }
    }
    expect(active()).toBe('Pillen-Debuff')
  })

  it('bindet jede Beschriftung an genau ihr Feld', () => {
    // Ein Klick auf „Zielzeit“ soll in das Zielzeit-Feld springen — dafür ist
    // htmlFor da, nicht ein <label> um die ganze Zeile.
    const { container } = panel(testSettings(), false)
    for (const caption of [...container.querySelectorAll('label')]) {
      const bound = caption.getAttribute('for')
      expect(bound, `„${caption.textContent}“ ohne Feld`).toBeTruthy()
      expect(container.querySelector(`#${bound}`)?.tagName).toMatch(/INPUT|SELECT/)
    }
  })

  it('hält die seltenen Einstellungen hinter „Mehr einstellen“', () => {
    // Die erste Ebene ist Spielername, Zielzeit und der Zielzeit-Modus — sonst
    // sieht das Panel nach mehr aus, als es ist.
    const { container } = panel(testSettings(), false)
    const summary = container.querySelector('summary')!
    expect(summary.textContent).toContain('Mehr einstellen')

    const firstLevel = [...container.querySelectorAll('[data-row]')]
      .filter((row) => row.closest('details') === null)
      .map((row) => row.getAttribute('data-row'))
    expect(firstLevel).toEqual(['Spielername', 'Zielzeit', 'Zielzeit aus'])
  })
})

describe('Übersetzungen', () => {
  it('rendert jede Ansicht in jeder Sprache ohne fehlende IDs', () => {
    for (const language of codes()) {
      for (const mode of MODES) {
        cleanup()
        const text = everything(
          testSettings({ language, username: 'c0re', targetMode: mode, targetTime: '14:00' }),
          snapshot(DEBUFF_END),
        )
        // printer setzt „!id“ ein, wenn ein Text fehlt.
        expect(text, `${language}/${mode}`).not.toMatch(/![a-z]+\.[a-z_.]+/)
      }
    }
  })

  it('zeigt den Tick-Hinweis samt Knopf, wenn die Zielzeit auf einem Tick liegt', () => {
    // 14:00 liegt exakt auf einem Tick und zählt deshalb nicht mit.
    const text = dashboard(testSettings({ targetTime: '14:00' }), null)
    expect(text).toContain('Hinweis')
    expect(text).toContain('Zielzeit auf 14:05 setzen')
  })
})
