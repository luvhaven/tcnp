import * as React from "react"
import { cn } from "@/lib/utils"

/* Each tone pairs a figure colour that stays legible on both themes with the
   matching icon-tile tint. The status tokens (--success etc.) are fill colours
   meant to sit under white text, so they are too dark to use as text on the
   dark theme; the figure colours are lifted there instead. */
const TONES = {
  neutral: { value: "text-foreground", tile: "bg-muted text-muted-foreground" },
  primary: { value: "text-primary", tile: "bg-primary/10 text-primary" },
  success: { value: "text-emerald-600 dark:text-emerald-400", tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  info: { value: "text-sky-600 dark:text-sky-400", tile: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  warning: { value: "text-amber-600 dark:text-amber-400", tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  destructive: { value: "text-destructive dark:text-red-400", tile: "bg-destructive/10 text-destructive dark:bg-red-400/15 dark:text-red-400" },
} as const

export type StatTone = keyof typeof TONES

export interface StatCardProps {
  label: React.ReactNode
  /** The figure. Pass a <CountUp> for animated numbers. */
  value: React.ReactNode
  /** One short line under the figure. */
  hint?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  tone?: StatTone
  /** Makes the card a filter toggle: it becomes a button and reports `selected`. */
  onClick?: () => void
  selected?: boolean
  /** For cards whose "figure" is a name rather than a number. */
  valueClassName?: string
  className?: string
}

/**
 * The one summary tile used above lists and on the dashboard. A plain card
 * does not lift on hover — that motion is reserved for the clickable variant,
 * so a card that moves is always a card that does something.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  onClick,
  selected = false,
  valueClassName,
  className,
}: StatCardProps) {
  const tones = TONES[tone]

  const body = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("stat-figure mt-1.5 text-2xl font-bold sm:text-3xl", tones.value, valueClassName)}>
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {Icon && (
        <div className={cn("shrink-0 rounded-xl p-2", tones.tile)} aria-hidden="true">
          <Icon className="h-4 w-4" />
        </div>
      )}
    </div>
  )

  const base = "min-w-0 rounded-2xl border bg-card p-4 text-left shadow-xs sm:p-5"

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={cn(
          base,
          "w-full transition-[border-color,box-shadow,transform] duration-base ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevation-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          selected && "border-primary ring-1 ring-primary",
          className
        )}
      >
        {body}
      </button>
    )
  }

  return <div className={cn(base, className)}>{body}</div>
}

/** Two columns on phones, four from the `nav` breakpoint; `columns={3}` for three-figure rows. */
export function StatGrid({
  columns = 4,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { columns?: 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:gap-4",
        columns === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 nav:grid-cols-4",
        className
      )}
      {...props}
    />
  )
}
