"use client"

import JourneyStatusTable from "@/components/operations/JourneyStatusTable"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"

export default function OperationsMonitorPage() {
    // The table renders its own skeleton while journeys load; the page frame
    // has nothing to wait for, so it appears immediately.
    return (
        <div className="space-y-6">
            <PageHeader
                icon={Activity}
                title="Operations Monitor"
                description="Real-time tracking of all active journeys and Papa movements."
            />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
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
