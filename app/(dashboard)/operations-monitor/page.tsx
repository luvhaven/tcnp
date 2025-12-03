import { Metadata } from "next"
import JourneyStatusTable from "@/components/operations/JourneyStatusTable"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity } from "lucide-react"

export const metadata: Metadata = {
    title: "Operations Monitor",
    description: "Real-time monitoring of active journeys and operations",
}

export default function OperationsMonitorPage() {
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
