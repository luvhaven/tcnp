'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Radio,
  Navigation,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Plane,
  Hotel,
  Church,
  MapPin,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

export type JourneyType =
  | 'airport_to_nest_to_theatre'   // Eagle Square → Nest → Theatre → return
  | 'airport_to_theatre'           // Eagle Square → Theatre directly → return
  | 'self_arrival'                  // Papa arrives own way, DO manages at Theatre

type Journey = {
  id: string
  papa_id: string
  status: string
  origin: string
  destination: string
  journey_type?: string | null
  scheduled_departure: string
  scheduled_arrival: string | null
  actual_departure: string | null
  actual_arrival: string | null
  papas?: { full_name: string; title?: string }
  nests?: { name: string } | null
  eagle_squares?: { name: string; code: string } | null
}

type CallSignUpdaterProps = {
  journey: Journey
  onUpdate?: () => void
}

// ─── Status definitions ───────────────────────────────────────────────────────
type StatusConfig = {
  label: string
  description: string
  icon: React.ElementType
  color: string
  bgColor: string
}

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  planned: {
    label: 'Planned',
    description: 'Journey scheduled — awaiting dispatch',
    icon: Clock,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  // ---- Airport pickup leg ----
  en_route_to_eagle: {
    label: 'En Route to Eagle Square',
    description: 'DO departing to Eagle Square to receive Papa',
    icon: Navigation,
    color: 'text-sky-600',
    bgColor: 'bg-sky-100',
  },
  at_eagle: {
    label: 'At Eagle Square',
    description: "DO on ground at Eagle Square — awaiting Papa's arrival",
    icon: Plane,
    color: 'text-sky-700',
    bgColor: 'bg-sky-200',
  },
  // ---- Transit legs ----
  first_course: {
    label: 'First Course',
    description: 'Papa aboard — in transit',
    icon: Radio,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  in_progress: {
    label: 'In Progress',
    description: 'En route — cocktail in progress',
    icon: Navigation,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
  // ---- At Nest ----
  at_nest: {
    label: 'At Nest',
    description: 'Papa checked in at Nest (hotel)',
    icon: Hotel,
    color: 'text-stone-600',
    bgColor: 'bg-stone-100',
  },
  // ---- Theatre arrival ----
  chapman: {
    label: 'Chapman',
    description: 'Arrived at Theatre gate',
    icon: Church,
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
  },
  // ---- Return leg ----
  dessert: {
    label: 'Dessert',
    description: 'Departing Theatre — returning Papa',
    icon: ArrowRight,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
  completed: {
    label: 'Completed',
    description: 'Journey complete',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  cancelled: {
    label: 'Cancelled',
    description: 'Journey cancelled',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  broken_arrow: {
    label: '⚠ BROKEN ARROW',
    description: 'Emergency — major incident. All units alerted.',
    icon: AlertTriangle,
    color: 'text-red-700',
    bgColor: 'bg-red-200',
  },
}

// ─── Status flows per journey type ───────────────────────────────────────────

/**
 * Returns the ordered sequence of statuses the DO will step through,
 * and the possible next steps from each status.
 */
function getFlowForType(journeyType: JourneyType | null | undefined): {
  steps: string[]                          // ordered progression for the timeline
  transitions: Record<string, string[]>    // current → possible next
} {
  switch (journeyType) {
    // ── Eagle Square → Nest → Theatre → return ─────────────────────────────
    case 'airport_to_nest_to_theatre':
    default:
      return {
        steps: [
          'planned',
          'en_route_to_eagle',
          'at_eagle',
          'first_course',     // picked up, heading to Nest
          'at_nest',          // checked in at hotel
          'in_progress',      // departing Nest → Theatre  (First Course call sign)
          'chapman',          // arrived Theatre gate
          'dessert',          // departing Theatre → Nest/Eagle Square
          'completed',
        ],
        transitions: {
          planned:            ['en_route_to_eagle', 'cancelled'],
          en_route_to_eagle:  ['at_eagle', 'broken_arrow', 'cancelled'],
          at_eagle:           ['first_course', 'broken_arrow', 'cancelled'],
          first_course:       ['at_nest', 'broken_arrow', 'cancelled'],
          at_nest:            ['in_progress', 'cancelled'],
          in_progress:        ['chapman', 'broken_arrow', 'cancelled'],
          chapman:            ['dessert', 'broken_arrow', 'cancelled'],
          dessert:            ['completed', 'broken_arrow', 'cancelled'],
          completed:          [],
          cancelled:          [],
          broken_arrow:       [],
        },
      }

    // ── Eagle Square → Theatre directly → return ───────────────────────────
    case 'airport_to_theatre':
      return {
        steps: [
          'planned',
          'en_route_to_eagle',
          'at_eagle',
          'first_course',   // picked up, heading direct to Theatre
          'chapman',        // arrived Theatre gate
          'dessert',        // returning
          'completed',
        ],
        transitions: {
          planned:            ['en_route_to_eagle', 'cancelled'],
          en_route_to_eagle:  ['at_eagle', 'broken_arrow', 'cancelled'],
          at_eagle:           ['first_course', 'broken_arrow', 'cancelled'],
          first_course:       ['chapman', 'broken_arrow', 'cancelled'],
          chapman:            ['dessert', 'broken_arrow', 'cancelled'],
          dessert:            ['completed', 'broken_arrow', 'cancelled'],
          completed:          [],
          cancelled:          [],
          broken_arrow:       [],
        },
      }

    // ── Papa arrives own way — DO manages at Theatre ───────────────────────
    case 'self_arrival':
      return {
        steps: [
          'planned',
          'chapman',     // Papa arrived at Theatre (own way) — DO on ground
          'dessert',     // escorting Papa out / returning
          'completed',
        ],
        transitions: {
          planned:   ['chapman', 'cancelled'],
          chapman:   ['dessert', 'broken_arrow', 'cancelled'],
          dessert:   ['completed', 'broken_arrow', 'cancelled'],
          completed: [],
          cancelled: [],
          broken_arrow: [],
        },
      }
  }
}

// ─── Journey type label ───────────────────────────────────────────────────────
const JOURNEY_TYPE_LABELS: Record<JourneyType, { label: string; route: string }> = {
  airport_to_nest_to_theatre: {
    label: 'Via Nest',
    route: 'Eagle Square → Nest → Theatre → Return',
  },
  airport_to_theatre: {
    label: 'Direct to Theatre',
    route: 'Eagle Square → Theatre → Return',
  },
  self_arrival: {
    label: 'Self-Arrival',
    route: 'Papa arrives own way → Theatre',
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CallSignUpdater({ journey, onUpdate }: CallSignUpdaterProps) {
  const supabase = createClient()
  const [updating, setUpdating] = useState(false)

  const journeyType: JourneyType = (journey.journey_type as JourneyType) || 'airport_to_nest_to_theatre'
  const { steps, transitions } = getFlowForType(journeyType)
  const currentStatus = journey.status || 'planned'
  const currentConfig = STATUS_CONFIGS[currentStatus] || STATUS_CONFIGS.planned
  const CurrentIcon = currentConfig.icon
  const nextStatuses = transitions[currentStatus] ?? []

  // Contextual label overrides based on journey type
  const getContextualLabel = (status: string): string => {
    if (status === 'first_course') {
      if (journeyType === 'airport_to_nest_to_theatre') return 'First Course — To Nest'
      if (journeyType === 'airport_to_theatre') return 'First Course — To Theatre'
    }
    if (status === 'dessert') {
      if (journeyType === 'airport_to_theatre') return 'Dessert — Return to Eagle Square'
    }
    if (status === 'chapman' && journeyType === 'self_arrival') {
      return 'Chapman — Papa Arrived (Own)'
    }
    return STATUS_CONFIGS[status]?.label ?? status
  }

  const handleUpdateStatus = async (newStatus: string) => {
    const label = getContextualLabel(newStatus)
    if (!confirm(`Update journey status to "${label}"?`)) return

    setUpdating(true)
    try {
      // Direct DB update (bypasses RPC status restrictions to support new statuses)
      const updates: Record<string, any> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }

      if (newStatus !== 'planned' && !journey.actual_departure) {
        // Set actual_departure on first status advance
        if (newStatus === 'en_route_to_eagle' || newStatus === 'first_course' || newStatus === 'chapman') {
          if (!journey.actual_departure) {
            updates.actual_departure = new Date().toISOString()
          }
        }
      }

      if (newStatus === 'completed') {
        updates.actual_arrival = new Date().toISOString()
      }

      const { error } = await (supabase as any)
        .from('journeys')
        .update(updates)
        .eq('id', journey.id)

      if (error) throw error

      // Log the journey event
      await (supabase as any).from('journey_events').insert({
        journey_id: journey.id,
        event_type: newStatus,
        description: `Call sign: ${label}`,
        triggered_at: new Date().toISOString(),
      })

      toast.success(`${label} — call sign executed`)
      onUpdate?.()
    } catch (error: any) {
      console.error('Error updating call sign:', error)
      toast.error(error.message || 'Failed to update journey status')
    } finally {
      setUpdating(false)
    }
  }

  const typeInfo = JOURNEY_TYPE_LABELS[journeyType]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${currentConfig.bgColor}`}>
              <CurrentIcon className={`h-5 w-5 ${currentConfig.color}`} />
            </div>
            <div>
              <CardTitle className="text-lg">Journey Call Sign</CardTitle>
              <CardDescription>
                {journey.papas?.title} {journey.papas?.full_name}
                {' · '}
                {journey.origin} → {journey.destination}
              </CardDescription>
            </div>
          </div>
          <Badge className={`${currentConfig.bgColor} ${currentConfig.color} border-0`}>
            {currentConfig.label}
          </Badge>
        </div>

        {/* Journey type route badge */}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span className="font-medium">{typeInfo.label}:</span>
          <span>{typeInfo.route}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Progress timeline ─────────────────────────────────────────── */}
        <div className="space-y-1">
          {steps.filter(s => !['cancelled', 'broken_arrow'].includes(s)).map((step, i) => {
            const stepConfig = STATUS_CONFIGS[step] || STATUS_CONFIGS.planned
            const StepIcon = stepConfig.icon
            const isDone = steps.indexOf(currentStatus) > i
            const isCurrent = step === currentStatus
            const isFuture = steps.indexOf(currentStatus) < i

            return (
              <div key={step} className="flex items-center gap-3">
                <div className={`
                  h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0
                  ${isDone ? 'bg-green-500 text-white' : isCurrent ? `${stepConfig.bgColor} ${stepConfig.color}` : 'bg-muted text-muted-foreground'}
                `}>
                  {isDone
                    ? <CheckCircle className="h-4 w-4" />
                    : <StepIcon className="h-3.5 w-3.5" />
                  }
                </div>
                <span className={`text-sm ${isCurrent ? 'font-semibold' : isFuture ? 'text-muted-foreground' : 'line-through text-muted-foreground/60'}`}>
                  {getContextualLabel(step)}
                </span>
                {isCurrent && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-2 py-0.5">
                    Current
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Call sign action buttons ──────────────────────────────────── */}
        {nextStatuses.filter(s => s !== 'cancelled' && s !== 'broken_arrow').length > 0 && (
          <div className="space-y-2 pt-3 border-t">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Radio className="h-4 w-4" />
              <span>Execute Call Sign</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {nextStatuses
                .filter(s => s !== 'cancelled' && s !== 'broken_arrow')
                .map((status) => {
                  const config = STATUS_CONFIGS[status] || STATUS_CONFIGS.planned
                  const Icon = config.icon
                  return (
                    <Button
                      key={status}
                      variant="outline"
                      onClick={() => handleUpdateStatus(status)}
                      disabled={updating}
                      className={`justify-start gap-2 border-2 hover:${config.bgColor} hover:${config.color}`}
                    >
                      <Icon className="h-4 w-4" />
                      {getContextualLabel(status)}
                    </Button>
                  )
                })}
            </div>
          </div>
        )}

        {/* ── Danger actions ────────────────────────────────────────────── */}
        {nextStatuses.some(s => s === 'broken_arrow' || s === 'cancelled') && (
          <div className="flex gap-2 pt-2 border-t border-destructive/20">
            {nextStatuses.includes('broken_arrow') && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleUpdateStatus('broken_arrow')}
                disabled={updating}
                className="gap-2 flex-1"
              >
                <AlertTriangle className="h-4 w-4" />
                Broken Arrow
              </Button>
            )}
            {nextStatuses.includes('cancelled') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUpdateStatus('cancelled')}
                disabled={updating}
                className="gap-2 flex-1 text-destructive border-destructive/40 hover:bg-destructive/10"
              >
                <XCircle className="h-4 w-4" />
                Cancel Journey
              </Button>
            )}
          </div>
        )}

        {/* ── Timestamps ────────────────────────────────────────────────── */}
        <div className="space-y-1 text-xs text-muted-foreground border-t pt-3">
          <div className="flex justify-between">
            <span>Scheduled departure</span>
            <span>{new Date(journey.scheduled_departure).toLocaleString()}</span>
          </div>
          {journey.actual_departure && (
            <div className="flex justify-between">
              <span>Actual departure</span>
              <span>
                {new Date(journey.actual_departure).toLocaleString()}
                {' · '}
                {formatDistanceToNow(new Date(journey.actual_departure), { addSuffix: true })}
              </span>
            </div>
          )}
          {journey.actual_arrival && (
            <div className="flex justify-between">
              <span>Completed</span>
              <span>{formatDistanceToNow(new Date(journey.actual_arrival), { addSuffix: true })}</span>
            </div>
          )}
        </div>

        {/* ── Terminal state info ───────────────────────────────────────── */}
        {(currentStatus === 'completed' || currentStatus === 'cancelled' || currentStatus === 'broken_arrow') && (
          <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
            <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              This journey is <strong>{currentConfig.label}</strong>. No further updates available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
