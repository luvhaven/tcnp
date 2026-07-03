'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, ClipboardList, Star, AlertTriangle, Download, User, Calendar, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface FeedbackReport {
    id: string
    submitted_at: string
    submitted_by_name: string
    overall_rating: number | null
    principal_wellbeing: string
    logistics_notes: string | null
    what_went_well: string | null
    what_didnt_go_as_plan: string | null
    team_feedback: string | null
    finance_expenses: string | null
    accommodation_notes: string | null
    incidents: string | null
    monetary_gifts: string | null
    improvements: string | null
    journey: {
        id: string
        origin: string
        destination: string
        papas: { full_name: string; title: string } | null
    } | null
}

function RatingStars({ rating }: { rating: number | null }) {
    if (!rating) return <span className="text-xs text-muted-foreground">No rating</span>
    return (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} className={cn('h-3 w-3', s <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground')} />
            ))}
            <span className="text-xs ml-1 text-muted-foreground">{rating}/5</span>
        </div>
    )
}

export default function AfterOpReportPage() {
    const supabase = createClient()
    const [reports, setReports] = useState<FeedbackReport[]>([])
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return
                const { data: ud } = await supabase.from('users').select('role').eq('id', user.id).single()
                setUserRole((ud as any)?.role || null)

                const { data } = await (supabase as any)
                    .from('do_feedback_forms')
                    .select(`
            id, submitted_at, submitted_by_name, overall_rating,
            principal_wellbeing, logistics_notes, accommodation_notes,
            what_went_well, what_didnt_go_as_plan, team_feedback, finance_expenses,
            incidents, monetary_gifts, improvements,
            journey:journey_id(id, origin, destination, papas:papas!papa_id(full_name, title))
          `)
                    .order('submitted_at', { ascending: false })
                    .limit(50)

                setReports(data || [])
            } catch (_) { }
            finally { setLoading(false) }
        }
        void load()
    }, [supabase])

    const handleExportCSV = () => {
        const headers = ['Date', 'DO Name', 'Papa', 'Origin', 'Destination', 'Rating', 'Wellbeing', 'What Went Well', 'What Didn\'t Go As Plan', 'Team Feedback', 'Finance & Expenses', 'Logistics', 'Accommodation', 'Incidents', 'Monetary Gifts', 'Improvements']
        const rows = reports.map(r => [
            format(new Date(r.submitted_at), 'yyyy-MM-dd HH:mm'),
            r.submitted_by_name,
            r.journey?.papas ? `${r.journey.papas.title || ''} ${r.journey.papas.full_name}`.trim() : '',
            r.journey?.origin || '',
            r.journey?.destination || '',
            r.overall_rating?.toString() || '',
            r.principal_wellbeing,
            r.what_went_well || '',
            r.what_didnt_go_as_plan || '',
            r.team_feedback || '',
            r.finance_expenses || '',
            r.logistics_notes || '',
            r.accommodation_notes || '',
            r.incidents || '',
            r.monetary_gifts || '',
            r.improvements || '',
        ])
        const csv = [headers, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `tcnp-post-op-reports-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click()
        URL.revokeObjectURL(url)
    }

    const ADMIN_ROLES = ['super_admin', 'dev_admin', 'admin', 'captain', 'head_of_command', 'head_of_operations', 'command', 'hod', 'hop']
    const isAdmin = userRole && ADMIN_ROLES.includes(userRole)

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <ClipboardList className="h-7 w-7 text-primary" />
                        After-Op Reports
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Consolidated DO post-operation feedback. {isAdmin ? 'All reports visible.' : 'Your submitted reports.'}
                    </p>
                </div>
                {reports.length > 0 && isAdmin && (
                    <Button size="sm" variant="outline" onClick={handleExportCSV} className="gap-2 text-xs">
                        <Download className="h-3.5 w-3.5" />Export CSV
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : reports.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-4" />
                        <h3 className="font-semibold mb-1">No Reports Yet</h3>
                        <p className="text-sm text-muted-foreground">DOs submit post-op reports from My Operations → Post-Op Report tab.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {reports.map(report => {
                        const papa = report.journey?.papas ? `${report.journey.papas.title || ''} ${report.journey.papas.full_name}`.trim() : 'Unknown Papa'
                        const hasIncident = !!report.incidents?.trim()
                        const hasGifts = !!report.monetary_gifts?.trim()

                        return (
                            <Card key={report.id} className={cn('border-border/50', hasIncident && 'border-red-500/30')}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="space-y-0.5">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                {papa}
                                                {hasIncident && (
                                                    <Badge variant="destructive" className="text-[9px] gap-1">
                                                        <AlertTriangle className="h-2.5 w-2.5" />Incident Reported
                                                    </Badge>
                                                )}
                                                {hasGifts && (
                                                    <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[9px]">
                                                        💰 Gift Received
                                                    </Badge>
                                                )}
                                            </CardTitle>
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                    <User className="h-3 w-3" />{report.submitted_by_name}
                                                </span>
                                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                    <Calendar className="h-3 w-3" />{format(new Date(report.submitted_at), 'dd MMM yyyy, HH:mm')}
                                                </span>
                                                {report.journey && (
                                                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                        <MapPin className="h-3 w-3" />{report.journey.origin} → {report.journey.destination}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <RatingStars rating={report.overall_rating} />
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0 space-y-2">
                                    <div className="grid gap-2 text-xs">
                                        {[
                                            { label: 'Principal Wellbeing', value: report.principal_wellbeing },
                                            { label: 'What Went Well', value: report.what_went_well },
                                            { label: 'What Didn\'t Go As Plan', value: report.what_didnt_go_as_plan },
                                            { label: 'Team Feedback', value: report.team_feedback },
                                            { label: 'Finance & Expenses', value: report.finance_expenses },
                                            { label: 'Logistics (Legacy)', value: report.logistics_notes },
                                            { label: 'Accommodation (Legacy)', value: report.accommodation_notes },
                                            { label: '⚠ Incidents', value: report.incidents, highlight: true },
                                            { label: '💰 Monetary Gifts', value: report.monetary_gifts, highlight: true },
                                            { label: 'Required Improvements', value: report.improvements },
                                        ].filter(f => !!f.value?.trim()).map(field => (
                                            <div key={field.label} className={cn('rounded-md px-3 py-2', field.highlight ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-muted/30 border border-border/30')}>
                                                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{field.label}</p>
                                                <p className="text-foreground leading-snug">{field.value}</p>
                                            </div>
                                        ))}
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
