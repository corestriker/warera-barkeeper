/**
 * Die gemeinsamen Testvektoren aus `spec/regen-cases.json`.
 *
 * Dieselbe Datei liest die Go-Fassung in
 * `terminal_app/internal/regen/spec_test.go`. Erzeugt wird sie **aus der
 * Go-Implementierung** — sie ist die Urfassung der Rechnung:
 *
 *     cd terminal_app && make spec
 *
 * Damit ist das Auseinanderdriften der beiden Implementierungen keine Frage von
 * Disziplin mehr: wer in Go etwas ändert und die Datei neu erzeugt, sieht hier,
 * ob die Webapp mitzieht. Wer hier etwas ändert, ohne dass die Datei es
 * hergibt, wird ebenfalls rot.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeHint } from './hint'
import { compute, countTicks, tickAfter, type Bar, type Params } from './regen'

interface SpecBar {
  key: string
  max: number
  hourlyRegen: number
}

interface SpecBarExpect {
  key: string
  safeBudget: number
  safeFloor: number
  safeFloorPct: number
  safeCapped: boolean
  riskyBudget: number
  leftSafe?: number
  deficitSafe?: number
  fullAt?: string
  ticksToFull: number
}

interface SpecCase {
  name: string
  base: string
  target: string
  tickAnchor: string
  tickPeriodMs: number
  bars: SpecBar[]
  current?: Record<string, number>
  hintWindowMs: number
  expect: {
    safeTicks: number
    riskyTicks: number
    nextTick: string
    bars: SpecBarExpect[]
    hint?: {
      kind: 'onTick' | 'nearTick'
      tick: string
      suggested: string
      gapMs: number
      extra: Record<string, number>
    } | null
  }
}

// Vitest läuft mit web_app/ als Arbeitsverzeichnis.
const doc = JSON.parse(readFileSync('../spec/regen-cases.json', 'utf8')) as { faelle: SpecCase[] }

describe('Gemeinsame Testvektoren', () => {
  it('enthält Fälle', () => {
    expect(doc.faelle.length).toBeGreaterThan(0)
  })

  for (const tc of doc.faelle) {
    it(tc.name, () => {
      const params: Params = {
        base: Date.parse(tc.base),
        target: Date.parse(tc.target),
        tickAnchor: Date.parse(tc.tickAnchor),
        tickPeriod: tc.tickPeriodMs,
      }
      const bars: Bar[] = tc.bars.map((b) => ({
        key: b.key,
        label: b.key.toUpperCase(),
        max: b.max,
        hourlyRegen: b.hourlyRegen,
      }))

      expect(countTicks(params, false), 'sichere Ticks').toBe(tc.expect.safeTicks)
      expect(countTicks(params, true), 'riskante Ticks').toBe(tc.expect.riskyTicks)
      expect(new Date(tickAfter(params, params.base)).toISOString(), 'nächster Tick').toBe(
        new Date(Date.parse(tc.expect.nextTick)).toISOString(),
      )

      const result = compute(params, bars, tc.current)
      expect(result.bars).toHaveLength(tc.expect.bars.length)

      tc.expect.bars.forEach((want, index) => {
        const got = result.bars[index]!
        expect(got.bar.key).toBe(want.key)
        expect(got.safe.budget, `${want.key} Budget`).toBeCloseTo(want.safeBudget, 9)
        expect(got.safe.floor, `${want.key} Zielwert`).toBeCloseTo(want.safeFloor, 9)
        expect(got.safe.floorPct, `${want.key} Zielwert-Prozent`).toBeCloseTo(want.safeFloorPct, 9)
        expect(got.safe.capped, `${want.key} Capped`).toBe(want.safeCapped)
        expect(got.risky.budget, `${want.key} riskantes Budget`).toBeCloseTo(want.riskyBudget, 9)
        expect(got.ticksToFull, `${want.key} TicksToFull`).toBe(want.ticksToFull)
        if (want.leftSafe !== undefined) {
          expect(got.leftSafe, `${want.key} LeftSafe`).toBeCloseTo(want.leftSafe, 9)
        }
        if (want.deficitSafe !== undefined) {
          expect(got.deficitSafe, `${want.key} Fehlbetrag`).toBeCloseTo(want.deficitSafe, 9)
        }
        if (want.fullAt === undefined) {
          expect(got.fullAt, `${want.key} FullAt`).toBeNull()
        } else {
          expect(got.fullAt, `${want.key} FullAt`).toBe(Date.parse(want.fullAt))
        }
      })

      const hint = computeHint(params, bars, tc.hintWindowMs)
      const wantHint = tc.expect.hint ?? null
      if (wantHint === null) {
        expect(hint).toBeNull()
        return
      }
      expect(hint).not.toBeNull()
      expect(hint!.kind).toBe(wantHint.kind)
      expect(hint!.tick).toBe(Date.parse(wantHint.tick))
      expect(hint!.suggested).toBe(Date.parse(wantHint.suggested))
      expect(hint!.gap).toBe(wantHint.gapMs)
      for (const [key, want] of Object.entries(wantHint.extra)) {
        expect(hint!.extra[key], `Zusatzbudget ${key}`).toBeCloseTo(want, 9)
      }
    })
  }
})
