'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { PlaneTakeoff, Plane, PlaneLanding, HelpCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

interface FlightState {
    icao24: string
    callsign: string
    onGround: boolean
    velocity: number
    altitude: number | null
}

export default function FlightStatusBadge({ flightNumber, departureTime, arrivalTime }: { flightNumber: string | undefined | null, departureTime?: string | null, arrivalTime?: string | null }) {
    const [status, setStatus] = useState<'loading' | 'not_taken_off' | 'in_air' | 'landed' | 'unknown'>('unknown')
    const [flightData, setFlightData] = useState<FlightState | null>(null)

    useEffect(() => {
        if (!flightNumber) {
            setStatus('unknown')
            return
        }

        const fetchStatus = async () => {
            setStatus('loading')
            try {
                const res = await fetch(`/api/flights?callsign=${encodeURIComponent(flightNumber)}`)
                if (!res.ok) throw new Error('API Error')

                const data = await res.json()
                const now = new Date()

                if (data.states && data.states.length > 0) {
                    // OpenSky data format: [0: icao24, 1: callsign, 2: origin, 3: time, 4: last_contact, 5: lng, 6: lat, 7: baro_alt, 8: on_ground, 9: velocity]
                    const state = data.states[0]
                    const onGround = state[8]
                    const velocity = state[9]

                    setFlightData({
                        icao24: state[0],
                        callsign: state[1],
                        onGround,
                        velocity,
                        altitude: state[7]
                    })

                    if (onGround) {
                        // Re-check scheduled arrival to see if it landed or hasn't left
                        if (departureTime && new Date(departureTime) > now) {
                            setStatus('not_taken_off')
                        } else {
                            setStatus('landed')
                        }
                    } else {
                        setStatus('in_air')
                    }
                } else {
                    // Fallback to schedule if no live data (out of range or disabled transponder)
                    if (departureTime && new Date(departureTime) > now) {
                        setStatus('not_taken_off')
                    } else if (arrivalTime && new Date(arrivalTime) < now) {
                        setStatus('landed')
                    } else if (departureTime && arrivalTime && new Date(departureTime) <= now && new Date(arrivalTime) >= now) {
                        setStatus('in_air') // Assume in air by schedule tracking
                    } else {
                        setStatus('unknown')
                    }
                }
            } catch (err) {
                console.warn('Silent failure on flight API, falling back to schedule', err)
                // Fallback gracefully
                const now = new Date()
                if (departureTime && new Date(departureTime) > now) setStatus('not_taken_off')
                else if (arrivalTime && new Date(arrivalTime) < now) setStatus('landed')
                else setStatus('unknown')
            }
        }

        fetchStatus()
        // Poll every 3 minutes so we don't blow up OpenSky rate limits
        const interval = setInterval(fetchStatus, 180000)
        return () => clearInterval(interval)
    }, [flightNumber, departureTime, arrivalTime])

    if (!flightNumber) return null

    // Render logic based on status
    const getBadgeContent = () => {
        switch (status) {
            case 'loading':
                return { icon: <Loader2 className="h-3 w-3 animate-spin mr-1" />, label: 'Checking Flight', color: 'bg-muted text-muted-foreground' }
            case 'not_taken_off':
                return { icon: <PlaneTakeoff className="h-3 w-3 mr-1 text-orange-500" />, label: 'Not Taken Off', color: 'bg-orange-500/10 text-orange-600 border border-orange-500/20' }
            case 'in_air':
                return { icon: <Plane className="h-3 w-3 mr-1 text-blue-500 animate-pulse" />, label: 'In Air', color: 'bg-blue-500/10 text-blue-600 border border-blue-500/20' }
            case 'landed':
                return { icon: <PlaneLanding className="h-3 w-3 mr-1 text-emerald-500" />, label: 'Landed', color: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' }
            default:
                return { icon: <HelpCircle className="h-3 w-3 mr-1 text-gray-500" />, label: 'Offline / Unknown', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200' }
        }
    }

    const { icon, label, color } = getBadgeContent()
    const displayLabel = status !== 'loading' ? `${flightNumber} - ${label}` : label

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Badge variant="outline" className={cn("px-2 py-0.5 mt-1 cursor-default text-[10px]", color)}>
                        {icon} {displayLabel}
                    </Badge>
                </TooltipTrigger>
                <TooltipContent>
                    <div className="text-xs space-y-1">
                        <p className="font-semibold border-b pb-1 mb-1">Live Flight Tracking</p>
                        {flightData ? (
                            <>
                                <p>Speed: {Math.round(flightData.velocity * 3.6)} km/h</p>
                                <p>Altitude: {flightData.altitude ? `${Math.round(flightData.altitude)} m` : 'N/A'}</p>
                                <p>Status: {flightData.onGround ? 'On Ground' : 'Airborne'}</p>
                            </>
                        ) : (
                            <p>Tracking via derived schedule logic (Live ADS-B unavailable).</p>
                        )}
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
