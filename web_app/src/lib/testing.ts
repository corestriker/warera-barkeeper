/** Gemeinsame Helfer der Logik-Tests. */
import { nextWholeHourUTC } from './schedule'
import { DEFAULT_TICK_PERIOD, type Params } from './regen'
import { instantFromWall } from './zone'
import { defaults } from './settings'

export const BERLIN = 'Europe/Berlin'

/** Eine Uhrzeit am 1. September 2026 in Berlin — die Basis der Go-Tests. */
export function clock(hour: number, minute: number, zone = BERLIN): number {
  return instantFromWall(zone, { year: 2026, month: 9, day: 1, hour, minute })
}

/** Params mit einem Tick-Raster zur vollen Stunde UTC. */
export function paramsAt(base: number, target: number): Params {
  return { base, target, tickAnchor: nextWholeHourUTC(base), tickPeriod: DEFAULT_TICK_PERIOD }
}

/** Ein Snapshot mit den Werten aus den Go-Tests. */
export function testSnapshot(): import('./warera').Snapshot {
  return {
    user: {
      id: 'u1',
      username: 'Beispiel',
      level: 12,
      buffs: { debuffCodes: [], debuffEndAt: null },
      skills: {
        health: { level: 3, total: 140, currentBarValue: 117.5, hourlyBarRegen: 14 },
        hunger: { level: 3, total: 7, currentBarValue: 6.1, hourlyBarRegen: 0.7 },
      },
    },
    nextRegenAt: null,
    fetchedAt: Date.now(),
  }
}

/** Einstellungen für Tests: feste Zone und Sprache, damit nichts am Rechner hängt. */
export function testSettings(): import('./settings').Settings {
  const s = defaults()
  s.timezone = BERLIN
  s.language = 'de'
  s.targetMode = 'clock'
  return s
}
