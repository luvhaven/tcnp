"use client"

import { useState, useEffect } from "react"
import JourneyStatusTable from "@/components/operations/JourneyStatusTable"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity } from "lucide-react"

export default function OperationsMonitorPage() {
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        // Simulate initial load
        const timer = setTimeout(() => setIsLoading(false), 100)
        return () => clearTimeout(timer)
    }, [])

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div>
                    <div className="h-9 w-64 rounded-md bg-muted animate-pulse" />
                    <div className="mt-2 h-5 w-96 rounded-md bg-muted animate-pulse" />
                </div>

                <Card>
                    <CardHeader>
                        <div className="h-6 w-48 rounded-md bg-muted animate-pulse" />
                        <div className="h-4 w-80 rounded-md bg-muted animate-pulse mt-2" />
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="h-10 flex-1 rounded-md bg-muted animate-pulse" />
                                <div className="h-10 w-[180px] rounded-md bg-muted animate-pulse" />
                                <div className="h-10 w-[200px] rounded-md bg-muted animate-pulse" />
                            </div>
                            <div className="rounded-md border">
                                <div className="h-12 border-b bg-muted/50" />
                                {[...Array(5)].map((_, index) => (
                                    <div key={index} className="h-16 border-b last:border-b-0 bg-muted/20 animate-pulse" />
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Operations Monitor</h1>
                    <p className="text-muted-foreground">
                        Real-time tracking of all active journeys and Papa movements
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-primary" />
                        Live Journey Status
                    </CardTitle>
                    <CardDescription>
                        Updates automatically in real-time as DOs report status changes
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <JourneyStatusTable />
                </CardContent>
            </Card>
        </div>
    )
}
