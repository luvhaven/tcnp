"use client"

import * as React from "react"
import { AlertTriangle, RefreshCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ErrorStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode
  description?: React.ReactNode
  /** Shows a "Try again" button when provided. */
  onRetry?: () => void
  /** Disables the retry button and shows a spinner while a retry is running. */
  retrying?: boolean
}

/** A load failed. Distinct from EmptyState so "nothing here" is never shown for "couldn't check". */
export function ErrorState({
  title = "We couldn't load this",
  description = "Check your connection and try again.",
  onRetry,
  retrying = false,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center px-4 py-12 text-center", className)}
      {...props}
    >
      <AlertTriangle className="h-10 w-10 text-destructive/70" aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry} pending={retrying}>
          {!retrying && <RefreshCcw aria-hidden="true" />}
          Try again
        </Button>
      )}
    </div>
  )
}
