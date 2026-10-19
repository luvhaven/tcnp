import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,filter,scale] duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none active:scale-[0.96] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "btn-sheen bg-primary text-primary-foreground shadow-elevation hover:shadow-elevation-md hover:brightness-[1.04]",
        destructive:
          "btn-sheen bg-destructive text-destructive-foreground shadow-elevation hover:shadow-elevation-md hover:brightness-[1.04]",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground hover:border-primary/30",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Mobile-first: 44px-class touch targets on phones, the original
        // denser desktop sizes from `sm` up.
        default: "h-11 px-4 py-2 sm:h-9",
        sm: "h-10 rounded-md px-3 text-xs sm:h-8",
        lg: "h-11 rounded-md px-8 sm:h-10",
        icon: "size-11 hit-area sm:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /**
   * The action this button started is in flight: disables the button (so a
   * second tap cannot submit twice), marks it aria-busy and shows a spinner.
   */
  pending?: boolean
}

// A caller that sets its own height/size (dense table cells, `h-auto` list
// rows) keeps that size at every breakpoint. tailwind-merge only removes the
// unprefixed base class it conflicts with, so the `sm:` half of the
// mobile-first size would otherwise still win on desktop.
const EXPLICIT_SIZE = /(?:^|\s)!?(?:h|size)-\S+/
const RESPONSIVE_SIZE = /(?:^|\s)sm:(?:h|w|size)-\S+/g

function buttonClassName(
  variant: ButtonProps["variant"],
  size: ButtonProps["size"],
  className: string | undefined
) {
  let base = buttonVariants({ variant, size })
  if (className && EXPLICIT_SIZE.test(className)) base = base.replace(RESPONSIVE_SIZE, "")
  return cn(base, className)
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, pending = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={buttonClassName(variant, size, className)}
        ref={ref}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        {...props}
      >
        {/* Slot needs exactly one child, so asChild buttons skip the spinner. */}
        {pending && !asChild ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            {children}
          </>
        ) : children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
