"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { format } from "date-fns"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog"
import {
    Navigation,
    Flag,
    Clock,
    CheckCircle,
    AlertTriangle,
    Radio,
    Loader2,
    CalendarDays,
    XCircle
} from "lucide-react"

type JourneyEvent = {
    id: string
    event_type: string
    description: string | null
    triggered_at: string
    users?: {
        full_name: string | null
        role: string | null
    } | null
}

const getEventConfig = (eventType: string) => {
    switch (eventType) {
        case 'First Course':
            return { icon: Navigation, bg: 'bg-blue-100 dark:bg-blue-900/30', color: 'text-blue-600 dark:text-blue-400', label: 'First Course (Departed)' }
        case 'Chapman':
            return { icon: Flag, bg: 'bg-indigo-100 dark:bg-indigo-900/30', color: 'text-indigo-600 dark:text-indigo-400', label: 'Chapman (Checkpoint 1)' }
        case 'Dessert':
            return { icon: Clock, bg: 'bg-purple-100 dark:bg-purple-900/30', color: 'text-purple-600 dark:text-purple-400', label: 'Dessert (Checkpoint 2)' }
        case 'Completed':
            return { icon: CheckCircle, bg: 'bg-green-100 dark:bg-green-900/30', color: 'text-green-600 dark:text-green-400', label: 'Completed' }
        case 'Broken Arrow':
            return { icon: AlertTriangle, bg: 'bg-red-100 dark:bg-red-900/30', color: 'text-red-600 dark:text-red-500', label: 'BROKEN ARROW' }
        case 'Cancelled':
            return { icon: XCircle, bg: 'bg-gray-100 dark:bg-gray-800', color: 'text-gray-500', label: 'Cancelled' }
        case 'In Progress':
            return { icon: Radio, bg: 'bg-yellow-100 dark:bg-yellow-900/30', color: 'text-yellow-600 dark:text-yellow-500', label: 'In Progress' }
        default:
            return { icon: CalendarDays, bg: 'bg-slate-100 dark:bg-slate-800', color: 'text-slate-500', label: eventType || 'Planned / Created' }
    }
}

export function JourneyTimelineDialog({
    journeyId,
    papaName,
    open,
    onOpenChange
}: {
    journeyId: string | null
    papaName?: string
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const [events, setEvents] = useState<JourneyEvent[]>([])
    const [loading, setLoading] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        if (!open || !journeyId) return

        let isMounted = true
        const fetchTimeline = async () => {
            setLoading(true)
            const { data, error } = await supabase
                .from('journey_events')
                .select(`
          id,
          event_type,
          description,
          triggered_at,
          users:triggered_by (
            full_name,
            role
          )
        `)
                .eq('journey_id', journeyId)
                .order('triggered_at', { ascending: false }) // Newest first

            if (isMounted) {
                if (!error && data) {
                    setEvents(data as JourneyEvent[])
                }
                setLoading(false)
            }
        }

        fetchTimeline()
        return () => { isMounted = false }
    }, [journeyId, open, supabase])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Journey Audit Trail</DialogTitle>
                    <DialogDescription>
                        Immutable chronological record of call-signs and operational events for {papaName || 'this journey'}.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden mt-4">
                    {loading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                            <Clock className="h-10 w-10 opacity-20 mb-3" />
                            <p>No operational events recorded yet.</p>
                        </div>
                    ) : (
                        <div className="h-full pr-4 pb-4 overflow-y-auto">
                            <div className="relative border-l-2 border-muted ml-5 space-y-6">
                                <AnimatePresence>
                                    {events.map((event, index) => {
                                        const config = getEventConfig(event.event_type)
                                        const Icon = config.icon

                                        return (
                                            <motion.div
                                                key={event.id}
                                                initial={{ opacity: 0, x: -20, y: -10 }}
                                                animate={{ opacity: 1, x: 0, y: 0 }}
                                                transition={{ duration: 0.3, delay: index * 0.08, type: "spring" }}
                                                className="relative pl-8"
                                            >
                                                {/* Status Icon Marker */}
                                                <div className={`absolute -left-3.5 top-0.5 p-1.5 rounded-full ring-4 ring-background ${config.bg}`}>
                                                    <Icon className={`w-4 h-4 ${config.color}`} />
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="font-semibold text-sm">{config.label}</span>
                                                        <span className="text-xs text-muted-foreground font-mono">
                                                            {format(new Date(event.triggered_at), "HH:mm:ss · MMM d")}
                                                        </span>
                                                    </div>

                                                    <div className="text-sm text-foreground/80">
                                                        Triggered by {event.users?.full_name || 'System'}
                                                        <span className="opacity-50 text-xs ml-1">
                                                            ({(event.users?.role || '').replace(/_/g, ' ')})
                                                        </span>
                                                    </div>

                                                    {event.description && (
                                                        <div className="mt-2 text-sm bg-muted/50 border-l-2 border-primary/20 pl-3 py-2 rounded-r-md text-muted-foreground">
                                                            {event.description}
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )
                                    })}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
