"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Hand-rolled dialog (not Radix). The visual shell was already here; what it was
 * missing was every keyboard and screen-reader behaviour a modal owes you:
 *
 *  - Escape closed nothing. The overlay was click-only, so a keyboard user who
 *    opened a dialog had no way out of it.
 *  - Focus stayed on the trigger behind the overlay, and Tab walked straight out
 *    of the dialog into the page underneath it.
 *  - Closing dropped focus to the top of the document instead of returning it.
 *  - No role, no aria-modal, no accessible name, so it announced as a plain group.
 *  - The page behind it scrolled.
 *
 * The component API is unchanged — all 34 call sites keep working as written.
 */

type DialogContextValue = {
  titleId: string
  descriptionId: string
  hasDescription: boolean
  registerDescription: () => void
  onClose: () => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  const reactId = React.useId()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [hasDescription, setHasDescription] = React.useState(false)

  const close = React.useCallback(() => onOpenChange?.(false), [onOpenChange])

  // A DialogDescription tells us it exists on mount, so aria-describedby only
  // points at an element that is actually on the page.
  const registerDescription = React.useCallback(() => setHasDescription(true), [])

  React.useEffect(() => {
    if (!open) return

    // Remember who opened this so focus can go back there on close. Without it,
    // dismissing a dialog drops the keyboard user at the top of the document.
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Move focus into the dialog: the first control if there is one, otherwise
    // the panel itself, which carries tabIndex={-1} for exactly this.
    const container = containerRef.current
    const first = container?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? container)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        close()
        return
      }

      if (event.key !== "Tab" || !container) return

      // Keep Tab inside the dialog. Re-query every time, because the contents of
      // these dialogs change as their forms validate and reveal fields.
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null || el === container)

      if (focusable.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const firstEl = focusable[0]
      const lastEl = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === firstEl || active === container)) {
        event.preventDefault()
        lastEl.focus()
      } else if (!event.shiftKey && active === lastEl) {
        event.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)

    // Hold the page still behind the overlay.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [open, close])

  if (!open) return null

  return (
    <DialogContext.Provider
      value={{
        titleId: `${reactId}-title`,
        descriptionId: `${reactId}-description`,
        hasDescription,
        registerDescription,
        onClose: close,
      }}
    >
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="dialog-overlay-in fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={close}
          aria-hidden="true"
        />
        <div
          ref={containerRef}
          className="dialog-content-in relative z-50 max-h-full overscroll-contain"
        >
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  )
}

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(DialogContext)

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ctx?.titleId}
      aria-describedby={ctx?.hasDescription ? ctx.descriptionId : undefined}
      tabIndex={-1}
      className={cn(
        "relative w-full max-w-lg overflow-y-auto overscroll-contain rounded-xl border bg-background p-6 shadow-elevation-xl outline-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
DialogContent.displayName = "DialogContent"

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, id, ...props }, ref) => {
  const ctx = React.useContext(DialogContext)
  return (
    <h2
      ref={ref}
      id={id ?? ctx?.titleId}
      className={cn("text-title-sm leading-tight tracking-tight", className)}
      {...props}
    />
  )
})
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, id, ...props }, ref) => {
  const ctx = React.useContext(DialogContext)
  const register = ctx?.registerDescription

  React.useEffect(() => {
    register?.()
  }, [register])

  return (
    <p
      ref={ref}
      id={id ?? ctx?.descriptionId}
      className={cn("text-body text-muted-foreground", className)}
      {...props}
    />
  )
})
DialogDescription.displayName = "DialogDescription"

const DialogTrigger = ({
  asChild,
  children,
  ...props
}: {
  asChild?: boolean
  children: React.ReactNode
} & React.HTMLAttributes<HTMLElement>) => {
  if (asChild) {
    return <>{children}</>
  }
  return <div {...props}>{children}</div>
}
DialogTrigger.displayName = "DialogTrigger"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter }
