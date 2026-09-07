/**
 * Diese Tests halten die Kataloge zusammen. Fehlt eine ID oder ein Platzhalter,
 * fällt es hier auf und nicht erst in der Oberfläche.
 */
import { describe, expect, it } from 'vitest'
import { FALLBACK, catalog, codes, detect, known, langName, printer, resolve } from './index'

const reference = catalog(FALLBACK)!

describe('Kataloge', () => {
  it('kennt Deutsch und Englisch', () => {
    expect(codes()).toEqual(['de', 'en'])
    expect(langName('de')).toBe('Deutsch')
    expect(known('klingon')).toBe(false)
  })

  for (const code of codes().filter((c) => c !== FALLBACK)) {
    it(`${code}: dieselbe ID-Menge wie Englisch`, () => {
      const other = catalog(code)!
      expect(Object.keys(other).sort()).toEqual(Object.keys(reference).sort())
    })

    it(`${code}: dieselben Platzhalter wie Englisch`, () => {
      const other = catalog(code)!
      for (const [id, text] of Object.entries(reference)) {
        const want = [...text.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort()
        const got = [...(other[id] ?? '').matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort()
        expect(got, `Platzhalter in ${id}`).toEqual(want)
      }
    })
  }

  it('enthält keine Sprintf-Verben aus der Go-Fassung', () => {
    // Hier werden Platzhalter als {0} geschrieben. Ein übernommenes %s oder ein
    // verdoppeltes %% wäre ein Übersetzungsfehler aus dem Go-Katalog.
    for (const code of codes()) {
      for (const [id, text] of Object.entries(catalog(code)!)) {
        expect(text, `${code}/${id}`).not.toMatch(/%[sdvq%]/)
      }
    }
  })

  it('lässt keinen Text leer', () => {
    for (const code of codes()) {
      for (const [id, text] of Object.entries(catalog(code)!)) {
        expect(text.trim(), `${code}/${id}`).not.toBe('')
      }
    }
  })
})

describe('printer', () => {
  const t = printer('de')

  it('übersetzt und füllt Platzhalter', () => {
    expect(t('menu.f.username')).toBe('Spielername')
    expect(t('bar.per_tick', '14')).toBe('14/Tick')
    expect(t('hint.body', 'A', 'B', 'C')).toBe('A Auf B gesetzt, zählt er verlässlich mit: C Budget zusätzlich.')
  })

  it('macht eine fehlende ID sichtbar', () => {
    expect(t('gibt.es.nicht')).toBe('!gibt.es.nicht')
  })

  it('fällt bei unbekannter Sprache auf Englisch zurück', () => {
    expect(printer('klingon')('menu.f.username')).toBe('Player name')
    expect(resolve('klingon')).toBe(FALLBACK)
  })

  it('erkennt die Sprache des Browsers', () => {
    // In der Testumgebung meldet jsdom „en-US“.
    expect(codes()).toContain(detect())
  })
})
