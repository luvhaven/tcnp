import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  /** Usually a <Button> that creates the first item or clears the filters. */
  action?: React.ReactNode
}

/**
 * "There is genuinely nothing here." Only render this once data has loaded
 * successfully — while loading show a skeleton, on failure an ErrorState.
 */
export function EmptyState({ icon: Icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center px-4 py-12 text-center", className)}
      {...props}
    >
      {Icon && <Icon className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />}
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
