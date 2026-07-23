"use client"

import * as React from "react"
import {
    ArrowUpRight,
    ArrowDownLeft,
    Navigation,
    MapPin,
    AlertTriangle,
    Minus,
} from "lucide-react"
import {
    getCallSignVisual,
    getCallSignLabel,
    SEVERITY_SOLID,
    SEVERITY_SOFT,
    type CallSignDirection,
} from "@/lib/constants/call-signs"
import { cn } from "@/lib/utils"

/**
 * The single way a journey call sign is rendered anywhere in the app.
 *
 * Colour comes from severity, the icon from direction of travel — see the
 * rationale block in lib/constants/call-signs.ts. Every surface importing this
 * stays in agreement automatically, which is the whole point: the same code can
 * no longer mean three different colours on three different screens.
 */

const DIRECTION_ICON: Record<CallSignDirection, React.ComponentType<{ className?: string }>> = {
    outbound: ArrowUpRight,   // leaving the Nest for the Theatre
    inbound: ArrowDownLeft,   // returning to the Nest
    transit: Navigation,      // moving / live broadcast
    arrived: MapPin,          // at the gate
    alert: AlertTriangle,     // distress
    none: Minus,              // idle / not started
}

export interface CallSignChipProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Underscored call sign key, e.g. 'first_course', or a lifecycle status. */
    callSign: string | null | undefined
    /** 'solid' for the primary status badge, 'soft' for secondary context. */
    variant?: "solid" | "soft"
    size?: "sm" | "md"
    /** Hide the direction icon when space is tight. */
    hideIcon?: boolean
    /** Override the visible text (defaults to the SOP label). */
    label?: string
}

export function CallSignChip({
    callSign,
    variant = "solid",
    size = "md",
    hideIcon = false,
    label,
    className,
    ...props
}: CallSignChipProps) {
    const { severity, direction } = getCallSignVisual(callSign)
    const Icon = DIRECTION_ICON[direction]
    const palette = variant === "solid" ? SEVERITY_SOLID : SEVERITY_SOFT
    const text = label ?? (callSign ? getCallSignLabel(callSign) : "—")
    const isCritical = severity === "critical"

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap",
                size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
                palette[severity],
                // Only a real emergency animates — motion is attention, and
                // attention spent on routine states is attention unavailable
                // when it actually matters.
                isCritical && "motion-safe:animate-pulse",
                className
            )}
            // Screen readers get the severity, not just the radio jargon
            aria-label={isCritical ? `${text} — emergency` : text}
            {...props}
        >
            {!hideIcon && <Icon className={cn("shrink-0", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} />}
            <span className="truncate">{text}</span>
        </span>
    )
}

export default CallSignChip
