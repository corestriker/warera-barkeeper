/** Zahlen- und Dauer-Formatierung, übersetzt aus `internal/ui/format.go`. */

/**
 * Formatiert Leisten-Werte kompakt: ganze Zahlen ohne Nachkommastelle,
 * gebrochene mit einer. Hunger regeneriert auf niedrigem Skill-Level 0,4 pro
 * Tick — da wäre Runden auf ganze Zahlen irreführend.
 */
export function num(v: number): string {
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v))
  return v.toFixed(1)
}

/** Formatiert einen Prozentwert ohne unnötige Nachkommastellen. */
export function pct(v: number): string {
  if (Math.abs(v - Math.round(v)) < 1e-9) return `${Math.round(v)}%`
  return `${v.toFixed(1)}%`
}

/** Dauer als „2h 48m 00s“ / „48m 00s“ / „12s“, wie `fmtDuration` in der TUI. */
export function fmtDuration(ms: number): string {
  const d = Math.max(0, ms)
  const h = Math.floor(d / 3_600_000)
  const m = Math.floor(d / 60_000) % 60
  const s = Math.floor(d / 1000) % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/** Dauer ohne Sekunden als „6h 00m“ / „12m“, wie `fmtDurationShort` in der TUI. */
export function fmtDurationShort(ms: number): string {
  const d = Math.max(0, ms)
  const h = Math.floor(d / 3_600_000)
  if (h > 0) return `${h}h ${String(Math.floor(d / 60_000) % 60).padStart(2, '0')}m`
  return `${Math.floor(d / 60_000)}m`
}
