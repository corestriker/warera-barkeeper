/**
 * Uhrzeiten lesen und auf das nächste Auftreten legen.
 *
 * Übersetzung von `internal/regen/schedule.go`, mit den Zonen-Helfern aus
 * `zone.ts` an der Stelle, an der Go eine `*time.Location` benutzt.
 */
import { addWallDays, atClock } from './zone'

/** Eine Uhrzeit ohne Datum. */
export interface Clock {
  hour: number
  minute: number
}

/**
 * Liest eine Uhrzeit im Format „HH:MM“. `null` heißt: nicht lesbar — die
 * Oberfläche meldet das über `err.clock`, deshalb braucht es hier keinen
 * eigenen Fehlertext.
 */
export function parseClock(s: string): Clock | null {
  const parts = s.trim().split(':')
  if (parts.length !== 2) return null
  const [rawHour, rawMinute] = parts as [string, string]
  if (!/^\d{1,2}$/.test(rawHour.trim()) || !/^\d{1,2}$/.test(rawMinute.trim())) return null
  const hour = Number(rawHour.trim())
  const minute = Number(rawMinute.trim())
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

/** Formatiert eine Uhrzeit wieder als „HH:MM“. */
export function formatClockValue(c: Clock): string {
  return `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`
}

/**
 * Das nächste Auftreten von `hour:minute` nach `base`. Liegt die Uhrzeit heute
 * schon hinter `base`, wird auf morgen gerollt.
 *
 * Der Tageswechsel läuft kalendarisch, damit über eine Zeitumstellung hinweg
 * die Wanduhrzeit erhalten bleibt: 14:05 bleibt 14:05, auch wenn der Tag 23
 * oder 25 Stunden hat.
 */
export function nextOccurrence(base: number, zone: string, hour: number, minute: number): number {
  const today = atClock(base, zone, hour, minute)
  if (today > base) return today
  return atClock(addWallDays(base, zone, 1), zone, hour, minute)
}

/**
 * Der Fallback-Tick-Anchor, wenn die API nicht erreichbar ist: WarEra tickt zur
 * vollen Stunde UTC.
 */
export function nextWholeHourUTC(now: number): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()) + 60 * 60 * 1000
}
