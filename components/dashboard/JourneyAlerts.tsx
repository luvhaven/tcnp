'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Plane, MapPin, Clock, AlertCircle, ArrowRight } from 'lucide-react'
import { differenceInSeconds, format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'

type AlertJourney = {
    id: string
    status: string
    etd: string | null
    eta: string | null
    papas: {
        full_name: string
        title: string
    } | null
    cheetahs: {
        call_sign: string
    } | null
}

export function JourneyAlerts() {
    const [alerts, setAlerts] = useState<{ journey: AlertJourney, type: 'departure' | 'arrival', timeLeft: number }[]>([])
    const supabase = createClient()

    useEffect(() => {
        const fetchJourneys = async () => {
            // Fetch relevant journeys
            const { data, error } = await supabase
                .from('journeys')
                .select(`
                    id, status, 
                    etd, eta,
                    papas!journeys_papa_id_fkey(full_name, title),
                    cheetahs(call_sign)
                `)
                .or('status.eq.planned,status.eq.active')
                // A deleted journey must never raise a departure/arrival alert.
                .or('is_deleted.is.null,is_deleted.eq.false')

            if (error || !data) return

            const now = new Date().getTime()
            const ALERT_THRESHOLD_MS = 60 * 60 * 1000 // 1 Hour warning

            const activeAlerts = data.map(journey => {
                let alertType: 'departure' | 'arrival' | null = null
                let targetTime: number | null = null

                // Check Departure (for Planned journeys)
                if (journey.status === 'planned') {
                    const departure = journey.etd
                    if (departure) {
                        const time = new Date(departure).getTime()
                        if (time > now && time - now < ALERT_THRESHOLD_MS) {
                            alertType = 'departure'
                            targetTime = time
                        }
                    }
                }

                // Check Arrival (for Active journeys)
                if (journey.status === 'active') {
                    const arrival = journey.eta
                    if (arrival) {
                        const time = new Date(arrival).getTime()
                        if (time > now && time - now < ALERT_THRESHOLD_MS) {
                            alertType = 'arrival'
                            targetTime = time
                        }
                    }
                }

                if (alertType && targetTime) {
                    return {
                        journey: journey as unknown as AlertJourney,
                        type: alertType,
                        timeLeft: Math.floor((targetTime - now) / 1000)
                    }
                }
                return null
            }).filter(item => item !== null) as { journey: AlertJourney, type: 'departure' | 'arrival', timeLeft: number }[]

            setAlerts(activeAlerts)
        }

        fetchJourneys()
        const interval = setInterval(fetchJourneys, 60000) // Re-check every minute

        return () => clearInterval(interval)
    }, [supabase])

    // Local countdown timer
    useEffect(() => {
        if (alerts.length === 0) return

        const timer = setInterval(() => {
            setAlerts(prev => prev.map(alert => ({
                ...alert,
                timeLeft: alert.timeLeft > 0 ? alert.timeLeft - 1 : 0
            })))
        }, 1000)

        return () => clearInterval(timer)
    }, [alerts.length])

    if (alerts.length === 0) return null

    const formatTimeLeft = (seconds: number) => {
        if (seconds <= 0) return 'NOW'
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}m ${secs.toString().padStart(2, '0')}s`
    }

    return (
        <div className="mb-8 space-y-4">
            <AnimatePresence>
                {alerts.map((alert) => (
                    <motion.div
                        key={`${alert.journey.id}-${alert.type}`}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.4, type: 'spring' }}
                    >
                        {/* There is no per-journey page: the Journeys list scrolls
                            to and highlights the journey named in ?highlight=. */}
                        <Link
                            href={`/journeys?highlight=${alert.journey.id}`}
                            aria-label={`${alert.type === 'departure' ? 'Departure' : 'Arrival'} imminent: ${[alert.journey.papas?.title, alert.journey.papas?.full_name].filter(Boolean).join(' ') || 'journey'}. Open in Journeys`}
                            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                        <Card className={`
                            border-l-4 overflow-hidden relative shadow-md hover:shadow-lg transition-shadow
                            ${alert.type === 'departure' ? 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-500/10' : 'border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/10'}
                        `}
                        >
                            <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className={`
                                        p-3 rounded-full flex items-center justify-center
                                        ${alert.type === 'departure' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'}
                                    `}>
                                        {alert.type === 'departure' ? <Plane className="h-6 w-6 transform -rotate-45" aria-hidden="true" /> : <MapPin className="h-6 w-6" aria-hidden="true" />}
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="outline" className="font-bold bg-background/80 backdrop-blur-sm">
                                                {alert.type === 'departure' ? 'DEPARTURE IMMINENT' : 'ARRIVAL IMMINENT'}
                                            </Badge>
                                            <span className="text-xs font-medium text-muted-foreground">
                                                {alert.journey.cheetahs?.call_sign || 'No Vehicle'}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground">
                                            {alert.journey.papas?.title} {alert.journey.papas?.full_name}
                                        </h3>
                                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                            Expected at {format(new Date(
                                                alert.type === 'departure'
                                                    ? (alert.journey.etd || '')
                                                    : (alert.journey.eta || '')
                                            ), 'HH:mm')}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Time Remaining</p>
                                        <div className={`text-4xl font-black tabular-nums tracking-tight
                                            ${alert.timeLeft < 300 ? 'text-destructive animate-pulse' : 'text-primary'}
                                        `}>
                                            {formatTimeLeft(alert.timeLeft)}
                                        </div>
                                    </div>
                                    {/* Decorative: the whole card is the link. */}
                                    <span className="hidden h-9 w-9 items-center justify-center md:flex" aria-hidden="true">
                                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                                    </span>
                                </div>
                            </CardContent>

                            {/* Animated Background Progress/Pulse */}
                            <motion.div
                                className={`absolute bottom-0 left-0 h-1 ${alert.type === 'departure' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                initial={{ width: "100%" }}
                                animate={{ width: "0%" }}
                                transition={{ duration: alert.timeLeft, ease: "linear" }}
                            />
                        </Card>
                        </Link>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    )
}
