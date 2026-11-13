import * as React from "react"
import { cn } from "@/lib/utils"

const TONES = {
  primary: { tile: "bg-primary/10 text-primary", badge: "border-primary/20 bg-primary/10 text-primary" },
  // The dark theme's --destructive is a deep fill colour (it carries white
  // text), so as *text* on a dark ground it all but disappears. Lift it there.
  destructive: {
    tile: "bg-destructive/10 text-destructive dark:bg-red-400/15 dark:text-red-400",
    badge: "border-destructive/20 bg-destructive/10 text-destructive dark:border-red-400/30 dark:bg-red-400/15 dark:text-red-400",
  },
  neutral: { tile: "bg-muted text-muted-foreground", badge: "border-border bg-muted text-muted-foreground" },
} as const

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Usually the same icon the page has in the sidebar (components/layout/nav-config). */
  icon?: React.ComponentType<{ className?: string }>
  /** Brand orange by default; `destructive` is reserved for safety pages. */
  tone?: keyof typeof TONES
  title: React.ReactNode
  /** Short qualifier beside the title. A string gets the standard pill; a node is rendered as given. */
  badge?: React.ReactNode
  description?: React.ReactNode
  /** Buttons and status pills, right-aligned from `sm` up and wrapped under the title on phones. */
  actions?: React.ReactNode
  /** Replaces the icon tile, e.g. a back button on a sub-page. */
  leading?: React.ReactNode
}

/**
 * The one page heading for every screen under (dashboard): icon tile, h1,
 * optional qualifier pill, one-line description and the page's actions.
 * Pages used to hand-roll this and had drifted into a dozen sizes and layouts.
 */
export function PageHeader({
  icon: Icon,
  tone = "primary",
  title,
  badge,
  description,
  actions,
  leading,
  className,
  ...props
}: PageHeaderProps) {
  const tones = TONES[tone]

  return (
    <div
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}
      {...props}
    >
      <div className="flex min-w-0 items-start gap-3">
        {leading ?? (Icon && (
          <div
            className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tones.tile)}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" />
          </div>
        ))}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {typeof badge === "string" ? (
              <span
                className={cn(
                  "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-overline uppercase",
                  tones.badge
                )}
              >
                {badge}
              </span>
            ) : badge}
          </div>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}
