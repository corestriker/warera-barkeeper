/**
 * Der Kontrast der Palette ist keine Geschmacksfrage, sondern nachrechenbar —
 * also wird er nachgerechnet. Die Textfarben müssen auf beiden Grundflächen
 * WCAG AA für kleinen Text erreichen (4,5:1).
 *
 * Anlass: die Palette kam aus dem Terminal-Thema, wo sie auf einem
 * Terminal-Hintergrund lag. Auf dem dunklen Grund der Webseite waren `faint`
 * (3,99:1) und `danger` (4,47:1) schlecht zu lesen.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Vitest läuft mit dem Projektordner als Arbeitsverzeichnis; `import.meta.url`
// ist unter jsdom eine http-Adresse und taugt hier nicht.
const css = readFileSync('src/theme.css', 'utf8')

/** Liest die Farb-Token aus dem @theme-Block. */
function tokens(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[match[1]!] = match[2]!.toLowerCase()
  }
  return out
}

function channel(value: number): number {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Das Kontrastverhältnis nach WCAG 2.1. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT_COLORS = ['ink', 'muted', 'faint', 'accent', 'safe', 'hint', 'danger']
const BACKGROUNDS = ['ground', 'surface', 'surface-2', 'raised']

describe('Palette', () => {
  const palette = tokens()

  it('kennt alle Token, die die Oberfläche benutzt', () => {
    for (const name of [...TEXT_COLORS, ...BACKGROUNDS, 'line', 'line-soft', 'keep', 'accent-deep']) {
      expect(palette[name], `--color-${name} fehlt`).toBeDefined()
    }
  })

  for (const text of TEXT_COLORS) {
    for (const background of BACKGROUNDS) {
      it(`${text} auf ${background} erreicht AA`, () => {
        const ratio = contrast(palette[text]!, palette[background]!)
        expect(ratio, `${palette[text]} auf ${palette[background]} = ${ratio.toFixed(2)}:1`)
          .toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('hält die Grundflächen dunkel — die Seite steht neben einem dunklen Spiel', () => {
    for (const background of BACKGROUNDS) {
      expect(luminance(palette[background]!)).toBeLessThan(0.05)
    }
  })
})
