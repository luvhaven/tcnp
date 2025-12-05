"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import CallSignPanel from '@/components/operations/CallSignPanel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, MapPin, Car, User } from 'lucide-react'
import { format } from 'date-fns'

interface AssignedJourney {
    id: string
    program_id: string
    program: { name: string }
    papa: { full_name: string, title: string }
    cheetah: { call_sign: string, vehicle_type: string }
    current_status: string
}

export default function MyOperationsPage() {
    const supabase = createClient()
    const [journey, setJourney] = useState<AssignedJourney | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadMyActiveJourney()
    }, [])

    const loadMyActiveJourney = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Find active journey assigned to current user (DO)
            const { data, error } = await supabase
                .from('journeys')
                .select(`
          id,
          program_id,
          current_status,
          program:programs(name),
          papa:papas(full_name, title),
          cheetah:cheetahs(call_sign, vehicle_type)
        `)
                .eq('assigned_do_id', user.id) // DO assignment
                .is('completed_at', null)
                .is('archived_at', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
                console.error('Error loading journey:', error)
            }

            if (data) {
                setJourney(data as any)
            }
        } catch (error) {
            console.error('Unexpected error:', error)
        } finally {
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">My Operations</h1>
                    <p className="text-muted-foreground">Manage your assigned journey status</p>
                </div>
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="bg-muted/50 p-4 rounded-full mb-4">
                            <MapPin className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold">No Active Assignment</h3>
                        <p className="text-muted-foreground max-w-sm mt-2">
                            You don't have any active journey assignments at the moment.
                            Check with your HOP or Admin if you should be assigned to a Papa.
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
}

return (
    <div className="space-y-6">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">My Operations</h1>
            <p className="text-muted-foreground">
                {journey.program?.name} • {format(new Date(), 'EEEE, MMMM do')}
            </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
            {/* Journey Info Card */}
            <Card className="md:col-span-1 h-fit">
                <CardHeader>
                    <CardTitle className="text-lg">Assignment Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-start gap-3">
                        <div className="bg-primary/10 p-2 rounded-md">
                            <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Principal (Papa)</p>
                            <p className="font-semibold text-lg">{journey.papa?.full_name}</p>
                            <p className="text-sm text-muted-foreground">{journey.papa?.title}</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="bg-primary/10 p-2 rounded-md">
                            <Car className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Vehicle (Cheetah)</p>
                            <p className="font-semibold">{journey.cheetah?.call_sign}</p>
                            <p className="text-sm text-muted-foreground">{journey.cheetah?.vehicle_type}</p>
                        </div>
                    </div>

                    <div className="pt-4 border-t">
                        <Badge variant="outline" className="w-full justify-center py-1">
                            Journey ID: {journey.id.slice(0, 8)}
                        </Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Status Control Panel */}
            <div className="md:col-span-2">
                <CallSignPanel
                    journeyId={journey.id}
                    papaName={journey.papa?.full_name}
                    cheetahName={journey.cheetah?.call_sign}
                />
            </div>
        </div>
    </div>
)
}
