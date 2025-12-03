"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Loader2, CheckCircle, AlertTriangle, Clock, Navigation } from 'lucide-react'
import { CALL_SIGNS, CallSign, CallSignKey, getCallSignLabel } from '@/lib/constants/call-signs'
import { useJourneyStatus } from '@/hooks/useJourneyStatus'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface CallSignPanelProps {
    journeyId: string
    papaName?: string
    cheetahName?: string
}

export default function CallSignPanel({ journeyId, papaName, cheetahName }: CallSignPanelProps) {
    const { status, lastUpdated, loading, updateStatus, completeJourney } = useJourneyStatus(journeyId)
    const [selectedSign, setSelectedSign] = useState<CallSign | null>(null)
    const [notes, setNotes] = useState('')
    const [dialogOpen, setDialogOpen] = useState(false)

    const handleSignClick = (sign: CallSign) => {
        setSelectedSign(sign)
        setNotes('')
        setDialogOpen(true)
    }

    const handleConfirmUpdate = async () => {
        if (!selectedSign) return

        await updateStatus(selectedSign.key, notes)
        setDialogOpen(false)
    }

    const renderSignButton = (sign: CallSign) => {
        const isActive = status === sign.key

        return (
            <Button
                key={sign.key}
                variant={isActive ? "default" : "outline"}
                className={cn(
                    "h-auto py-4 flex flex-col items-center gap-2 transition-all",
                    isActive ? "ring-2 ring-offset-2 ring-primary" : "hover:bg-accent",
                    sign.category === 'incident' && "border-destructive/50 hover:bg-destructive/10 text-destructive hover:text-destructive"
                )}
                onClick={() => handleSignClick(sign)}
            >
                <div className={cn(
                    "w-3 h-3 rounded-full",
                    sign.color
                )} />
                <span className="font-semibold text-sm text-center whitespace-normal leading-tight">
                    {sign.label}
                </span>
            </Button>
        )
    }

    const movementSigns = CALL_SIGNS.filter(s => s.category === 'movement')
    const timeSigns = CALL_SIGNS.filter(s => s.category === 'time')
    const incidentSigns = CALL_SIGNS.filter(s => s.category === 'incident')

    return (
        <div className="space-y-6">
            {/* Current Status Header */}
            <Card className="bg-muted/30">
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                Current Status:
                                <Badge variant="outline" className="text-base px-3 py-1">
                                    {status ? getCallSignLabel(status) : 'Not Started'}
                                </Badge>
                            </h3>
                            {lastUpdated && (
                                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Updated {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}
                                </p>
                            )}
                        </div>

                        <Button
                            variant="default"
                            className="bg-green-600 hover:bg-green-700 text-white w-full md:w-auto"
                            onClick={completeJourney}
                            disabled={status === 'completed' as any}
                        >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Complete Journey
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Control Panel */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Movement Controls */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Navigation className="w-4 h-4" />
                            Movement Updates
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {movementSigns.map(renderSignButton)}
                        </div>
                    </CardContent>
                </Card>

                {/* Time Updates */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Clock className="w-4 h-4" />
                            Time Updates
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                            {timeSigns.map(renderSignButton)}
                        </div>
                    </CardContent>
                </Card>

                {/* Incident Reporting */}
                <Card className="border-destructive/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base text-destructive">
                            <AlertTriangle className="w-4 h-4" />
                            Emergency / Incident
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 gap-3">
                            {incidentSigns.map(renderSignButton)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Confirmation Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Update Status: {selectedSign?.label}</DialogTitle>
                        <DialogDescription>
                            {selectedSign?.description}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Additional Notes (Optional)</label>
                            <Textarea
                                placeholder="Add any relevant details about this update..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleConfirmUpdate} disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm Update
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
