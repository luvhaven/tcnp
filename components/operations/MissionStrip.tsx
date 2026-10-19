"use client"

import { getCallSignLabel, getCallSignVisual, SEVERITY_SOFT, SEVERITY_SOLID } from '@/lib/constants/call-signs'
import type { OpsJourney } from '@/hooks/useMyOperations'
import { cn } from '@/lib/utils'

/**
 * Horizontal, snap-scrolling switcher for officers holding several missions at
 * once. Each chip carries the status colour (severity) and the Papa's name, so
 * a glance answers "which of mine needs me?" without opening each one.
 */
export default function MissionStrip({
  journeys, selectedId, onSelect,
}: {
  journeys: OpsJourney[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Your missions"
      className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      {journeys.map(j => {
        const selected = j.id === selectedId
        const { severity } = getCallSignVisual(j.status)
        return (
          <button
            key={j.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(j.id)}
            className={cn(
              'flex min-h-12 shrink-0 snap-start items-center gap-2 rounded-full border px-4 text-sm font-semibold',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
            )}
          >
            <span className={cn('h-2.5 w-2.5 rounded-full', SEVERITY_SOLID[severity])} aria-hidden />
            <span className="max-w-[12rem] truncate">{j.papas?.full_name ?? 'Journey'}</span>
            <span className={cn('rounded-full border px-2 py-0.5 text-xs', SEVERITY_SOFT[severity])}>
              {getCallSignLabel(j.status).replace(/_/g, ' ')}
            </span>
          </button>
        )
      })}
    </div>
  )
}
