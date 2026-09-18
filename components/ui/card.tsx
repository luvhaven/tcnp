import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "group/card min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs transition-[border-color,box-shadow] duration-base ease-out has-[a]:hover:border-primary/20 has-[a]:hover:shadow-elevation-md has-[button]:hover:border-primary/20 has-[button]:hover:shadow-elevation-md",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex min-w-0 flex-col space-y-1.5 p-4 sm:p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "min-w-0 break-words text-title-sm text-balance",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("min-w-0 break-words text-body text-pretty text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // pt-0 assumes a CardHeader sits above and has already paid for the top
      // padding. Used on its own — which is how most cards in this app are built
      // — it leaves the content flush against the card's top edge with a full
      // 24px below it, so the card reads as bottom-weighted rather than inset.
      // :first-child restores the top padding only when there is no header.
      "min-w-0 p-4 pt-0 sm:p-6 sm:pt-0 [&:first-child]:pt-4 sm:[&:first-child]:pt-6",
      className
    )}
    {...props}
  />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Same first-child rule as CardContent: a footer with no content above it
      // would otherwise sit flush to the top edge.
      "flex min-w-0 flex-wrap items-center gap-2 p-4 pt-0 sm:p-6 sm:pt-0 [&:first-child]:pt-4 sm:[&:first-child]:pt-6",
      className
    )}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
