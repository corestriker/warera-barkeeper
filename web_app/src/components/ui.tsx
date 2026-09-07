/**
 * Die wenigen Bausteine, aus denen die Seite besteht. Gehalten wie die
 * Oberfläche von WarEra: dunkle Fläche, harter 1px-Ring, kleine Radien.
 */
import type { ReactNode } from 'react'

export function Card({
  children,
  tone = 'plain',
  pad = 'normal',
  className = '',
}: {
  children: ReactNode
  tone?: 'plain' | 'hint' | 'danger'
  /** „large“ ist für die Leisten-Karten: sie sind der Hauptteil der Seite. */
  pad?: 'normal' | 'large'
  className?: string
}) {
  const border =
    tone === 'hint' ? 'border-hint/50' : tone === 'danger' ? 'border-danger/50' : 'border-line'
  const padding = pad === 'large' ? 'p-5 sm:p-6' : 'p-4 sm:p-5'
  return (
    <section
      className={`ring-game rounded-[6px] border ${border} bg-surface/90 ${padding} ${className}`}
    >
      {children}
    </section>
  )
}

/** Die kleine Überschrift über einem Abschnitt. */
export function SectionTitle({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <h2 className="mb-3 flex flex-wrap items-baseline gap-x-2 text-[0.78rem] font-semibold tracking-[0.14em] text-muted uppercase">
      {children}
      {note !== undefined && note !== '' && (
        <span className="text-[0.75rem] font-normal tracking-normal text-faint normal-case">
          {note}
        </span>
      )}
    </h2>
  )
}

/** Ein Zustands-Abzeichen: API, lädt, offline, manuell. */
export function Badge({ tone, children }: { tone: 'ok' | 'muted' | 'danger'; children: ReactNode }) {
  const look =
    tone === 'ok'
      ? 'border-safe/40 text-safe'
      : tone === 'danger'
        ? 'border-danger/50 text-danger'
        : 'border-line text-muted'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[99px] border ${look} bg-ground/60 px-2.5 py-1 text-[0.78rem] font-medium`}
    >
      <span aria-hidden="true" className="text-[0.7rem] leading-none">
        ●
      </span>
      {children}
    </span>
  )
}

export function Button({
  children,
  onClick,
  variant = 'plain',
  disabled = false,
  title,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'plain' | 'accent' | 'hint' | 'danger'
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit'
}) {
  const look = {
    plain: 'border-line bg-raised text-ink hover:border-line-soft hover:bg-surface-2',
    accent: 'border-accent/60 bg-accent-deep/40 text-ink hover:border-accent hover:bg-accent-deep/60',
    hint: 'border-hint/60 bg-hint/10 text-hint hover:bg-hint/20',
    danger: 'border-danger/60 bg-danger/10 text-danger hover:bg-danger/20',
  }[variant]
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`ring-game min-h-11 cursor-pointer rounded-[6px] border ${look} px-3 py-2 text-[0.88rem] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-0 sm:py-1.5`}
    >
      {children}
    </button>
  )
}

/** Eine Kennzahl mit Beschriftung, wie im Kopf der Terminal-App. */
export function Stat({
  label,
  value,
  note,
  tone = 'plain',
}: {
  label: string
  value: ReactNode
  note?: ReactNode
  tone?: 'plain' | 'accent'
}) {
  return (
    <div className="min-w-0">
      <div className="text-[0.75rem] font-medium tracking-[0.12em] text-muted uppercase">{label}</div>
      <div
        className={`tabular truncate text-[1.35rem] leading-tight font-semibold ${
          tone === 'accent' ? 'text-accent' : 'text-ink'
        }`}
      >
        {value}
      </div>
      {note !== undefined && note !== '' && (
        <div className="truncate text-[0.8rem] text-faint">{note}</div>
      )}
    </div>
  )
}
