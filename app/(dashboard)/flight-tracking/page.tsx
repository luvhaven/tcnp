
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plane, Clock, Calendar, MapPin, User, AlertCircle } from "lucide-react"
import { format, differenceInMinutes, isBefore, isAfter, parseISO } from "date-fns"
import { cn } from "@/lib/utils"

// Define types based on the schema we saw
interface Papa {
    id: string
    full_name: string
    title: string | null
    profile_photo_url: string | null
    flight_number: string | null
    airline: string | null
    departure_date: string | null
    flight_departure_time: string | null
    arrival_date: string | null
    flight_arrival_time: string | null
    arrival_city: string | null
    arrival_country: string | null
    vip_level: string | null
}

type FlightStatus = 'scheduled' | 'in_air' | 'landed' | 'delayed' | 'unknown'

export default function FlightTrackingPage() {
    const [papas, setPapas] = useState<Papa[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        fetchPapasWithFlights()

        // Refresh status every minute
        const interval = setInterval(fetchPapasWithFlights, 60000)
        return () => clearInterval(interval)
    }, [])

    const fetchPapasWithFlights = async () => {
        try {
            const { data, error } = await supabase
                .from('papas')
                .select('*')
                .not('flight_number', 'is', null)
                .neq('flight_number', '') // Ensure not empty string

            if (error) throw error
            setPapas(data || [])
        } catch (error) {
            console.error('Error fetching flights:', error)
        } finally {
            setLoading(false)
        }
    }

    const getFlightStatus = (papa: Papa): { status: FlightStatus; label: string; color: string; progress: number } => {
        // Combine date and time to create Date objects
        // Assuming format is YYYY-MM-DD for date and HH:mm or HH:mm:ss for time
        // If times are missing, we can't calculate status accurately

        if (!papa.departure_date || !papa.flight_departure_time || !papa.arrival_date || !papa.flight_arrival_time) {
            return { status: 'unknown', label: 'Missing Info', color: 'bg-gray-500', progress: 0 }
        }

        try {
            // Construct ISO strings roughly. Note: This assumes local time or stored UTC. 
            // For accurate tracking, we assume the inputs are properly coordinated.
            // If the stored time is just '14:30', we append it to the date '2023-10-27'.
            const depDateTimeStr = `${papa.departure_date}T${papa.flight_departure_time}`
            const arrDateTimeStr = `${papa.arrival_date}T${papa.flight_arrival_time}`

            const departure = new Date(depDateTimeStr)
            const arrival = new Date(arrDateTimeStr)
            const now = new Date()

            if (isBefore(now, departure)) {
                return { status: 'scheduled', label: 'Not Yet Taken Off', color: 'bg-blue-500', progress: 0 }
            } else if (isAfter(now, arrival)) {
                return { status: 'landed', label: 'Landed', color: 'bg-green-500', progress: 100 }
            } else {
                // In Air
                const totalDuration = differenceInMinutes(arrival, departure)
                const elapsed = differenceInMinutes(now, departure)
                const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100))
                return { status: 'in_air', label: 'In Air', color: 'bg-amber-500', progress }
            }
        } catch (e) {
            return { status: 'unknown', label: 'Invalid Date', color: 'bg-gray-500', progress: 0 }
        }
    }

    if (loading) {
        return (
            <div className="p-6 space-y-6">
                <div className="h-8 w-48 bg-muted rounded skeleton mb-6" />
                <div className="grid md:grid-cols-2 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-48 bg-muted rounded-lg skeleton" />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 p-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Flight Tracking</h1>
                    <p className="text-muted-foreground">Real-time status of VIP arrivals and departures</p>
                </div>
            </div>

            {papas.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                        <Plane className="h-12 w-12 mb-4 opacity-50" />
                        <p className="text-lg font-medium">No flights scheduled</p>
                        <p className="text-sm">Papas with flight numbers will appear here automatically.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {papas.map((papa) => {
                        const { status, label, color, progress } = getFlightStatus(papa)

                        return (
                            <Card key={papa.id} className="overflow-hidden border-2 transition-all hover:shadow-lg relative group">
                                {/* Status Bar Top */}
                                <div className={cn("h-2 w-full absolute top-0 left-0", color)} />

                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-6">
                                    <div className="flex items-center space-x-3">
                                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                                            {papa.profile_photo_url ? (
                                                <img src={papa.profile_photo_url} alt={papa.full_name} className="h-full w-full object-cover" />
                                            ) : (
                                                <User className="h-5 w-5 text-primary" />
                                            )}
                                        </div>
                                        <div>
                                            <CardTitle className="text-base font-bold">{papa.title} {papa.full_name}</CardTitle>
                                            <CardDescription className="text-xs font-mono">{papa.airline} {papa.flight_number}</CardDescription>
                                        </div>
                                    </div>
                                    <Badge className={cn("text-white", color)}>
                                        {label}
                                    </Badge>
                                </CardHeader>

                                <CardContent className="space-y-6 pt-4">
                                    {/* Route Visual */}
                                    <div className="relative flex items-center justify-between px-2">
                                        <div className="flex flex-col items-center z-10">
                                            <div className="text-xs font-bold text-muted-foreground mb-1">DEPARTURE</div>
                                            <Calendar className="h-4 w-4 text-primary mb-1" />
                                            <span className="text-sm font-semibold">{papa.flight_departure_time?.slice(0, 5) || '--:--'}</span>
                                            <span className="text-[10px] text-muted-foreground">{papa.departure_date}</span>
                                        </div>

                                        {/* Progress Line */}
                                        <div className="flex-1 mx-4 relative h-0.5 bg-muted">
                                            <div
                                                className={cn("absolute left-0 top-0 h-full transition-all duration-1000", color)}
                                                style={{ width: `${progress}%` }}
                                            />
                                            {/* Plane Icon */}
                                            <div
                                                className="absolute top-1/2 -translate-y-1/2 transition-all duration-1000 z-10"
                                                style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }}
                                            >
                                                <Plane className={cn("h-5 w-5 rotate-90", status === 'landed' ? "text-green-500" : "text-amber-500")} />
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center z-10">
                                            <div className="text-xs font-bold text-muted-foreground mb-1">ARRIVAL</div>
                                            <MapPin className="h-4 w-4 text-primary mb-1" />
                                            <span className="text-sm font-semibold">{papa.flight_arrival_time?.slice(0, 5) || '--:--'}</span>
                                            {/* Check if arrival date is different? We display it anyway */}
                                            <span className="text-[10px] text-muted-foreground">{papa.arrival_date}</span>
                                        </div>
                                    </div>

                                    {/* Destination Info */}
                                    <div className="rounded-md bg-muted/40 p-3 flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-muted-foreground">Destination:</span>
                                        </div>
                                        <span className="font-medium text-foreground">
                                            {papa.arrival_city || 'Unknown City'}, {papa.arrival_country || 'Unknown Country'}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
