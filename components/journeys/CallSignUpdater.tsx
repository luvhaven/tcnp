'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle, AlertTriangle, Navigation, Clock, Car, Church, Hotel, Plane, Waves } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getCallSignLabel } from '@/lib/constants/call-signs'

// ─── Official TCNP call sign status keys (stored in journeys.status) ─────────

type TcnpStatus =
  | 'planned'
  | 'cocktail'
  | 'first_course'
  | 'chapman'
  | 'dessert'
  | 'completed'
  | 'broken_arrow'
  | 'cancelled'

// ─── Status config per sign ───────────────────────────────────────────────────

type StatusConfig = {
  label: string
  description: string
  icon: React.ElementType
  color: string
  bgColor: string
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  planned:      { label: 'Planned',      description: 'Journey assigned — awaiting dispatch',            icon: Clock,       color: 'text-slate-600',  bgColor: 'bg-slate-100' },
  // ---- Airport / transit ----
  cocktail:     { label: 'Cocktail',     description: 'Principal in-transit',                            icon: Car,         color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  first_course: { label: 'First Course', description: 'Departing Nest to Theatre',                       icon: Navigation,  color: 'text-blue-600',   bgColor: 'bg-blue-50' },
  // ---- Theatre ----
  chapman:      { label: 'Chapman',      description: 'Arrived at Theatre gate',                         icon: Church,      color: 'text-teal-600',   bgColor: 'bg-teal-50' },
  dessert:      { label: 'Dessert',      description: 'Departing Theatre',                               icon: Hotel,       color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
  // ---- Terminal ----
  completed:    { label: 'Completed',    description: 'Journey successfully completed',                  icon: CheckCircle, color: 'text-green-600',  bgColor: 'bg-green-50' },
  broken_arrow: { label: 'Broken Arrow', description: 'Major incident — all Cheetahs immobilised',       icon: AlertTriangle, color: 'text-red-600', bgColor: 'bg-red-50' },
  cancelled:    { label: 'Cancelled',    description: 'Journey cancelled',                               icon: AlertTriangle, color: 'text-gray-600', bgColor: 'bg-gray-50' },
}

// ─── Flow per journey type ────────────────────────────────────────────────────

type FlowStep = { status: TcnpStatus; nextActions: TcnpStatus[] }

const FLOWS: Record<string, FlowStep[]> = {
  airport_to_nest_to_theatre: [
    { status: 'planned',      nextActions: ['cocktail', 'broken_arrow', 'cancelled'] },
    { status: 'cocktail',     nextActions: ['first_course', 'broken_arrow', 'cancelled'] },
    { status: 'first_course', nextActions: ['chapman', 'broken_arrow', 'cancelled'] },
    { status: 'chapman',      nextActions: ['dessert', 'broken_arrow', 'cancelled'] },
    { status: 'dessert',      nextActions: ['completed', 'broken_arrow', 'cancelled'] },
  ],
  airport_to_theatre: [
    { status: 'planned',  nextActions: ['cocktail', 'broken_arrow', 'cancelled'] },
    { status: 'cocktail', nextActions: ['chapman', 'broken_arrow', 'cancelled'] },
    { status: 'chapman',  nextActions: ['dessert', 'broken_arrow', 'cancelled'] },
    { status: 'dessert',  nextActions: ['completed', 'broken_arrow', 'cancelled'] },
  ],
  self_arrival: [
    { status: 'planned',  nextActions: ['chapman', 'broken_arrow', 'cancelled'] },
    { status: 'chapman',  nextActions: ['dessert', 'broken_arrow', 'cancelled'] },
    { status: 'dessert',  nextActions: ['completed', 'broken_arrow', 'cancelled'] },
  ],
}

function getFlow(journeyType: string | null | undefined): FlowStep[] {
  return FLOWS[journeyType ?? 'airport_to_nest_to_theatre'] ?? FLOWS.airport_to_nest_to_theatre
}

function getNextActions(currentStatus: string, journeyType: string | null | undefined): TcnpStatus[] {
  const flow = getFlow(journeyType)
  const step = flow.find(s => s.status === currentStatus)
  return step?.nextActions ?? []
}

// ─── Action button styling ────────────────────────────────────────────────────

const ACTION_STYLE: Record<string, string> = {
  planned:      'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300',
  cocktail:     'bg-emerald-600 hover:bg-emerald-700 text-white',
  first_course: 'bg-blue-600 hover:bg-blue-700 text-white',
  chapman:      'bg-teal-600 hover:bg-teal-700 text-white',
  dessert:      'bg-indigo-600 hover:bg-indigo-700 text-white',
  completed:    'bg-green-600 hover:bg-green-700 text-white',
  broken_arrow: 'bg-red-600 hover:bg-red-700 text-white',
  cancelled:    'bg-gray-200 hover:bg-gray-300 text-gray-800 border-gray-300',
}

// ─── Component props ──────────────────────────────────────────────────────────

interface Journey {
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
  eta: string | null
  etd: string | null
  papas: { full_name: string; title: string } | null
  cheetahs: { call_sign: string | null; registration_number: string } | null
}

interface CallSignUpdaterProps {
  journey: Journey
  onUpdate?: () => void
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CallSignUpdater({ journey, onUpdate }: CallSignUpdaterProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const flow = getFlow(journey.journey_type)
  const currentStep = flow.findIndex(s => s.status === journey.status)
  const nextActions = getNextActions(journey.status, journey.journey_type)
  const isTerminal = ['completed', 'broken_arrow', 'cancelled'].includes(journey.status)

  const currentConfig = STATUS_CONFIG[journey.status] ?? STATUS_CONFIG.planned
  const CurrentIcon = currentConfig.icon

  const updateStatus = async (newStatus: TcnpStatus) => {
    setLoading(true)
    try {
      const updates: Record<string, any> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }
      if (newStatus === 'cocktail' || newStatus === 'first_course') {
        updates.actual_departure = new Date().toISOString()
      }
      if (newStatus === 'chapman') {
        updates.actual_arrival = new Date().toISOString()
      }

      const { error } = await (supabase as any)
        .from('journeys')
        .update(updates)
        .eq('id', journey.id)

      if (error) throw error

      // Log event
      await (supabase as any).from('journey_events').insert({
        journey_id: journey.id,
        event_type: newStatus,
        triggered_at: new Date().toISOString(),
      })

      toast.success(`${getCallSignLabel(newStatus)} — status updated`)
      onUpdate?.()
    } catch (err: any) {
      console.error('Error updating status:', err)
      toast.error(err.message || 'Failed to update status')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Journey type label */}
      {journey.journey_type && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          {journey.journey_type === 'airport_to_nest_to_theatre' && <><Plane className="h-3 w-3" /> Eagle Square → Nest → Theatre</>}
          {journey.journey_type === 'airport_to_theatre' && <><Plane className="h-3 w-3" /> Eagle Square → Theatre (Direct)</>}
          {journey.journey_type === 'self_arrival' && <><Church className="h-3 w-3" /> Self-Arrival</>}
        </div>
      )}

      {/* Phase timeline */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {flow.map((step, i) => {
          const cfg = STATUS_CONFIG[step.status]
          const StepIcon = cfg?.icon ?? Clock
          const isDone = i < currentStep
          const isCurrent = i === currentStep
          return (
            <div key={step.status} className="flex items-center">
              <div className="flex flex-col items-center min-w-[64px]">
                <div className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center',
                  isDone && 'bg-green-500 text-white',
                  isCurrent && `${currentConfig.bgColor} ${currentConfig.color} ring-2 ring-offset-1 ring-current`,
                  !isDone && !isCurrent && 'bg-muted text-muted-foreground opacity-40',
                )}>
                  {isDone ? <CheckCircle className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                </div>
                <span className={cn(
                  'text-[9px] text-center font-medium mt-0.5 leading-tight',
                  isCurrent && currentConfig.color,
                  isDone && 'text-green-600 line-through',
                  !isDone && !isCurrent && 'text-muted-foreground opacity-40',
                )}>
                  {cfg?.label ?? step.status}
                </span>
              </div>
              {i < flow.length - 1 && (
                <div className={cn('h-0.5 w-3 flex-shrink-0', i < currentStep ? 'bg-green-400' : 'bg-muted')} />
              )}
            </div>
          )
        })}
      </div>

      {/* Current status */}
      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg', currentConfig.bgColor)}>
        <CurrentIcon className={cn('h-4 w-4', currentConfig.color)} />
        <div>
          <p className={cn('text-sm font-semibold', currentConfig.color)}>{currentConfig.label}</p>
          <p className="text-xs text-muted-foreground">{currentConfig.description}</p>
        </div>
      </div>

      {/* Next actions */}
      {!isTerminal && nextActions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Available Call Signs</p>
          <div className="grid grid-cols-1 gap-2">
            {nextActions.map(action => {
              const cfg = STATUS_CONFIG[action]
              const ActionIcon = cfg?.icon ?? CheckCircle
              const isDanger = action === 'broken_arrow' || action === 'cancelled'
              return (
                <button
                  key={action}
                  onClick={() => updateStatus(action)}
                  disabled={loading}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold border transition-all',
                    ACTION_STYLE[action] ?? 'bg-muted hover:bg-muted/80',
                    isDanger && 'border-dashed',
                    loading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {loading
                    ? <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                    : <ActionIcon className="h-4 w-4 flex-shrink-0" />
                  }
                  <div className="text-left">
                    <span className="block">{cfg?.label ?? action}</span>
                    <span className="text-[10px] opacity-75 font-normal">{cfg?.description}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {isTerminal && (
        <p className="text-sm text-muted-foreground italic px-1">
          Journey is {currentConfig.label} — no further actions available.
        </p>
      )}
    </div>
  )
}
