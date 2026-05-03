/**
 * JourneyStatusBadge — shared, authoritative journey status badge
 *
 * Single source of truth for call-sign colour mapping across the
 * Ops Monitor, My Operations, Journey Detail, and any admin views.
 *
 * Usage:
 *   <JourneyStatusBadge status="blue_cocktail" />
 *   <JourneyStatusBadge status="broken_arrow" size="lg" showIcon />
 */

import { cn } from '@/lib/utils'
import { Radio, ShieldAlert, Clock, CheckCircle2, XCircle } from 'lucide-react'

export type JourneyStatus =
  | 'planned'
  | 'first_course'
  | 'dessert'
  | 'cocktail'
  | 'blue_cocktail'
  | 'red_cocktail'
  | 're_order'
  | 'chapman'
  | 'broken_arrow'
  | 'completed'
  | 'cancelled'
  | string

interface StatusConfig {
  label: string
  className: string
  iconEl: React.ReactNode
}

const STATUS_MAP: Record<string, StatusConfig> = {
  planned: {
    label: 'Planned',
    className: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    iconEl: <Clock className="h-3 w-3 shrink-0" />,
  },
  first_course: {
    label: 'First Course',
    className: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
    iconEl: <Radio className="h-3 w-3 shrink-0" />,
  },
  dessert: {
    label: 'Dessert',
    className: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30',
    iconEl: <Radio className="h-3 w-3 shrink-0" />,
  },
  cocktail: {
    label: 'Cocktail',
    className: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    iconEl: <Radio className="h-3 w-3 shrink-0" />,
  },
  blue_cocktail: {
    label: 'Blue Cocktail',
    className: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
    iconEl: <Radio className="h-3 w-3 shrink-0" />,
  },
  red_cocktail: {
    label: 'Red Cocktail',
    className: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
    iconEl: <Radio className="h-3 w-3 shrink-0" />,
  },
  re_order: {
    label: 'Re-Order',
    className: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
    iconEl: <Radio className="h-3 w-3 shrink-0" />,
  },
  chapman: {
    label: 'Chapman',
    className: 'bg-teal-500/15 text-teal-400 border border-teal-500/30',
    iconEl: <Radio className="h-3 w-3 shrink-0" />,
  },
  broken_arrow: {
    label: 'Broken Arrow',
    className: 'bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse ring-1 ring-red-500/40',
    iconEl: <ShieldAlert className="h-3 w-3 shrink-0" />,
  },
  completed: {
    label: 'Completed',
    className: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    iconEl: <CheckCircle2 className="h-3 w-3 shrink-0" />,
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-gray-500/15 text-gray-400 border border-gray-500/30',
    iconEl: <XCircle className="h-3 w-3 shrink-0" />,
  },
}

const FALLBACK: StatusConfig = {
  label: 'Unknown',
  className: 'bg-gray-500/15 text-gray-400 border border-gray-500/30',
  iconEl: <Radio className="h-3 w-3 shrink-0" />,
}

interface JourneyStatusBadgeProps {
  status: JourneyStatus
  /** Visual size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Whether to render the leading icon */
  showIcon?: boolean
  className?: string
}

export function JourneyStatusBadge({
  status,
  size = 'md',
  showIcon = true,
  className,
}: JourneyStatusBadgeProps) {
  const cfg = STATUS_MAP[status] ?? {
    ...FALLBACK,
    label: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  }

  const sizeClass =
    size === 'sm'
      ? 'text-[10px] px-1.5 py-0.5 gap-1'
      : size === 'lg'
        ? 'text-sm px-3 py-1.5 gap-2'
        : 'text-xs px-2 py-1 gap-1.5'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium whitespace-nowrap leading-none transition-all duration-200',
        sizeClass,
        cfg.className,
        className,
      )}
    >
      {showIcon && cfg.iconEl}
      {cfg.label}
    </span>
  )
}
