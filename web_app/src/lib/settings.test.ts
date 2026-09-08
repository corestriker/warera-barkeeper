import { describe, expect, it } from 'vitest'
import {
  BAR_HEALTH,
  BAR_HUNGER,
  defaults,
  hintWindowMs,
  normalize,
  regenFor,
  timeoutMs,
} from './settings'

describe('normalize', () => {
  it('repariert kaputte Leisten-Werte', () => {
    const s = defaults()
    s.bars[BAR_HEALTH] = { max: 0 }
    s.bars[BAR_HUNGER] = { max: 7 }

    const out = normalize(s)
    // Ohne Maximum gilt wieder der Standard.
    expect(out.bars[BAR_HEALTH]).toEqual({ max: 100 })
    expect(out.bars[BAR_HUNGER]).toEqual({ max: 7 })
  })

  it('wirft eine mitgespeicherte Regen-Rate weg', () => {
    // Ein alter Stand kann noch eine eigene Rate enthalten. Sie ist keine
    // Einstellung mehr, sondern eine Rechnung — also verschwindet sie.
    const stored = { ...defaults(), bars: { [BAR_HEALTH]: { max: 140, hourlyRegen: 99 } } }
    const out = normalize(stored as unknown as ReturnType<typeof defaults>)
    expect(out.bars[BAR_HEALTH]).toEqual({ max: 140 })
  })

  it('rechnet die Gutschrift pro Tick aus dem Maximum', () => {
    expect(regenFor(140)).toBe(14)
    expect(regenFor(4)).toBeCloseTo(0.4, 9)
  })

  it('repariert unsinnige Modi und Zahlen', () => {
    const s = defaults()
    // Absichtlich verdrehte Werte, wie sie aus einem bearbeiteten Speicher kommen.
    const broken = {
      ...s,
      baseMode: 'irgendwas',
      targetMode: 'irgendwas',
      hintWindowMinutes: -5,
      api: { enabled: true, baseUrl: '  ', timeoutSeconds: 0, cacheMinutes: -1 },
    } as unknown as typeof s

    const out = normalize(broken)
    expect(out.baseMode).toBe('now')
    expect(out.targetMode).toBe('clock')
    expect(out.hintWindowMinutes).toBe(0)
    expect(out.api.baseUrl).toBe(defaults().api.baseUrl)
    expect(out.api.timeoutSeconds).toBe(defaults().api.timeoutSeconds)
    expect(out.api.cacheMinutes).toBe(0)
  })

  it('putzt Namen und lässt eine unbekannte Sprache stehen', () => {
    const s = defaults()
    s.username = '  c0re '
    s.timezone = ' Europe/Berlin '
    s.language = ' KLINGON '

    const out = normalize(s)
    expect(out.username).toBe('c0re')
    expect(out.timezone).toBe('Europe/Berlin')
    // Nicht stillschweigend korrigieren: die Anzeige fällt auf Englisch
    // zurück, der Tippfehler bleibt aber sichtbar.
    expect(out.language).toBe('klingon')
  })

  it('rechnet Dauern um', () => {
    const s = defaults()
    expect(timeoutMs(s)).toBe(8000)
    expect(hintWindowMs(s)).toBe(15 * 60 * 1000)
  })

  it('hat „Debuff, nächste Stunde" als Standard-Zielzeit', () => {
    // Läuft ein Debuff, ist der erste Tick nach seinem Ende die bessere Frist:
    // ein Tick mehr Budget, und er zählt verlässlich mit. Läuft keiner, gilt
    // ohnehin die Uhrzeit.
    expect(defaults().targetMode).toBe('debuff_hour')
  })
})
