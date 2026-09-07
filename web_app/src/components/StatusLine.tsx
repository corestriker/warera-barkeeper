/**
 * Die Zeile unter den Leisten berichtet vom Ausgang der **letzten Aktion**,
 * nicht von einem Zustand. Deshalb setzt in `App` jeder Zweig sie: Abruf
 * starten löscht die alte Meldung, Erfolg meldet die Uhrzeit, Fehlschlag den
 * Grund. Erfolgsmeldungen laufen nach `STATUS_TTL` aus, Fehler und Rückfragen
 * bleiben stehen.
 */
import type { ReactNode } from 'react'

/** Die Lebensdauer einer Erfolgsmeldung, wie `statusTTL` in der TUI. */
export const STATUS_TTL = 8000

export interface Status {
  text: string
  kind: 'ok' | 'error' | 'note'
  at: number
}

export function StatusLine({ status }: { status: Status | null }): ReactNode {
  if (status === null) return null
  const tone =
    status.kind === 'error' ? 'text-danger' : status.kind === 'ok' ? 'text-safe' : 'text-muted'
  return (
    <p role="status" className={`px-1 text-[0.85rem] ${tone}`}>
      {status.text}
    </p>
  )
}
