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
  AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { getCallSignLabel } from '@/lib/constants/tncpCallSigns'

type Journey = {
  id: string
  papa_id: string
  status: string
  origin: string
  destination: string
  scheduled_departure: string
  scheduled_arrival: string | null
  actual_departure: string | null
  actual_arrival: string | null
  papas?: {
    full_name: string
    title?: string
  }
}

type CallSignUpdaterProps = {
  journey: Journey
  onUpdate?: () => void
}

const FIRST_COURSE_LABEL = getCallSignLabel('first_course') ?? 'First Course'
const CHAPMAN_LABEL = getCallSignLabel('chapman') ?? 'Chapman'
const DESSERT_LABEL = getCallSignLabel('dessert') ?? 'Dessert'

const STATUS_CONFIG = {
  planned: {
    label: 'Planned',
    icon: Clock,
    color: 'bg-gray-500',
    nextStatuses: ['first_course', 'cancelled']
  },
  first_course: {
    label: FIRST_COURSE_LABEL,
    icon: Radio,
    color: 'bg-blue-500',
    nextStatuses: ['in_progress', 'cancelled']
  },
  in_progress: {
    label: 'In Progress',
    icon: Navigation,
    color: 'bg-yellow-500',
    nextStatuses: ['completed', 'cancelled']
  },
  chapman: {
    label: CHAPMAN_LABEL,
    icon: Navigation,
    color: 'bg-purple-500',
    nextStatuses: ['dessert', 'cancelled']
  },
  dessert: {
    label: DESSERT_LABEL,
    icon: Navigation,
    color: 'bg-indigo-500',
    nextStatuses: ['completed', 'cancelled']
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    color: 'bg-green-500',
    nextStatuses: []
  },
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    color: 'bg-red-500',
    nextStatuses: []
  }
}

export default function CallSignUpdater({ journey, onUpdate }: CallSignUpdaterProps) {
  const supabase = createClient()
  const [updating, setUpdating] = useState(false)

  const currentConfig = STATUS_CONFIG[journey.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.planned
  const CurrentIcon = currentConfig.icon

  const handleUpdateStatus = async (newStatus: string) => {
    if (!confirm(`Update journey status to "${STATUS_CONFIG[newStatus as keyof typeof STATUS_CONFIG].label}"?`)) {
      return
    }

    setUpdating(true)
    try {
      console.log('📡 Updating journey call sign:', { journey_id: journey.id, new_status: newStatus })

      const { data, error } = await (supabase as any).rpc('update_journey_call_sign', {
        journey_uuid: journey.id,
        new_status: newStatus
      })

      if (error) {
        console.error('❌ Error updating call sign:', error)
        throw error
      }

      console.log('✅ Call sign updated:', data)
      toast.success(`Journey status updated to ${STATUS_CONFIG[newStatus as keyof typeof STATUS_CONFIG].label}`)
      
      if (onUpdate) {
        onUpdate()
      }
    } catch (error: any) {
      console.error('Error updating journey status:', error)
      toast.error(error.message || 'Failed to update journey status')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${currentConfig.color} bg-opacity-10`}>
              <CurrentIcon className={`h-5 w-5 text-${currentConfig.color.replace('bg-', '')}`} />
            </div>
            <div>
              <CardTitle className="text-lg">Journey Status</CardTitle>
              <CardDescription>
                {journey.papas?.full_name || 'Unknown Papa'} • {journey.origin} → {journey.destination}
              </CardDescription>
            </div>
          </div>
          <Badge className={`${currentConfig.color} text-white`}>
            {currentConfig.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Timeline */}
        <div className="space-y-3 border-l-2 border-muted pl-4 ml-2">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <div className="h-3 w-3 rounded-full bg-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Scheduled Departure</p>
              <p className="text-xs text-muted-foreground">
                {new Date(journey.scheduled_departure).toLocaleString()}
              </p>
            </div>
          </div>

          {journey.actual_departure && (
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Actual Departure</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(journey.actual_departure).toLocaleString()}
                  {' • '}
                  {formatDistanceToNow(new Date(journey.actual_departure), { addSuffix: true })}
                </p>
              </div>
            </div>
          )}

          {journey.scheduled_arrival && (
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <div className={`h-3 w-3 rounded-full ${journey.actual_arrival ? 'bg-green-500' : 'bg-muted'}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {journey.actual_arrival ? 'Actual Arrival' : 'Scheduled Arrival'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(journey.actual_arrival || journey.scheduled_arrival).toLocaleString()}
                  {journey.actual_arrival && (
                    <>
                      {' • '}
                      {formatDistanceToNow(new Date(journey.actual_arrival), { addSuffix: true })}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Call Sign Actions */}
        {currentConfig.nextStatuses.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm font-medium mb-3">
              <Radio className="h-4 w-4" />
              <span>Update Call Sign</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {currentConfig.nextStatuses.map((status) => {
                const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
                const Icon = config.icon
                return (
                  <Button
                    key={status}
                    variant="outline"
                    onClick={() => handleUpdateStatus(status)}
                    disabled={updating}
                    className="justify-start gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {config.label}
                  </Button>
                )
              })}
            </div>
          </div>
        )}

        {/* Info for completed/cancelled */}
        {(journey.status === 'completed' || journey.status === 'cancelled') && (
          <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
            <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              This journey is {journey.status}. No further status updates are available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
