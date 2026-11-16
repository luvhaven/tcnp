'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ClipboardList, Star, AlertTriangle, Download, User, Calendar, MapPin, Gift, ChevronDown, Search } from 'lucide-react'
import { format } from 'date-fns'
import { cn, isAdmin } from '@/lib/utils'
import { notifyError } from '@/lib/notify'
import { ErrorState } from '@/components/ui/error-state'

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

const PAGE_SIZE = 50
const REPORT_COLUMNS = `
            id, submitted_at, submitted_by_name, overall_rating,
            principal_wellbeing, logistics_notes, accommodation_notes,
            what_went_well, what_didnt_go_as_plan, team_feedback, finance_expenses,
            incidents, monetary_gifts, improvements,
            journey:journey_id(id, origin, destination, papas:papas!papa_id(full_name, title))
          `

// Spreadsheet apps run a cell that starts with = + - @ (or a tab/return) as
// a formula, so free text typed into a report is defused with an apostrophe.
function csvCell(value: string) {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    return `"${safe.replace(/"/g, '""')}"`
}

function papaName(report: FeedbackReport) {
    return report.journey?.papas ? `${report.journey.papas.title || ''} ${report.journey.papas.full_name}`.trim() : ''
}

function RatingStars({ rating }: { rating: number | null }) {
    if (!rating) return <span className="text-xs text-muted-foreground">No rating</span>
    return (
        <span className="flex items-center gap-0.5" role="img" aria-label={`Rated ${rating} out of 5`}>
            {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} aria-hidden="true" className={cn('h-3 w-3', s <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground')} />
            ))}
            <span className="text-xs ml-1 text-muted-foreground" aria-hidden="true">{rating}/5</span>
        </span>
    )
}

export default function AfterOpReportPage() {
    const supabase = createClient()
    const [reports, setReports] = useState<FeedbackReport[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(false)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [loadFailed, setLoadFailed] = useState(false)
    const [attempt, setAttempt] = useState(0)
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
    const [search, setSearch] = useState('')
    const [incidentsOnly, setIncidentsOnly] = useState(false)

    useEffect(() => {
        const load = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return
                const { data: ud } = await supabase.from('users').select('role, has_admin_access').eq('id', user.id).single()
                setUserRole(ud?.has_admin_access ? 'admin' : ud?.role || null)

                const { data, error } = await (supabase as any)
                    .from('do_feedback_forms')
                    .select(REPORT_COLUMNS)
                    .order('submitted_at', { ascending: false })
                    .range(0, PAGE_SIZE - 1)

                if (error) throw error
                setReports(data || [])
                setHasMore((data?.length ?? 0) === PAGE_SIZE)
                setLoadFailed(false)
            } catch (err) {
                console.error('After-op reports failed to load:', err)
                setLoadFailed(true)
            }
            finally { setLoading(false) }
        }
        void load()
    }, [supabase, attempt])

    const loadMore = async () => {
        setLoadingMore(true)
        try {
            const from = reports.length
            const { data, error } = await (supabase as any)
                .from('do_feedback_forms')
                .select(REPORT_COLUMNS)
                .order('submitted_at', { ascending: false })
                .range(from, from + PAGE_SIZE - 1)
            if (error) throw error
            const next = (data || []) as FeedbackReport[]
            // A report submitted meanwhile shifts the pages by one; skip anything already shown.
            setReports(current => {
                const seen = new Set(current.map(r => r.id))
                return [...current, ...next.filter(r => !seen.has(r.id))]
            })
            setHasMore(next.length === PAGE_SIZE)
        } catch (err) {
            notifyError(err, 'Could not load more reports')
        } finally {
            setLoadingMore(false)
        }
    }

    const needle = search.trim().toLowerCase()
    const filtersActive = incidentsOnly || needle !== ''
    const visible = useMemo(() => reports.filter(r => {
        if (incidentsOnly && !r.incidents?.trim()) return false
        if (!needle) return true
        return (r.submitted_by_name || '').toLowerCase().includes(needle) || papaName(r).toLowerCase().includes(needle)
    }), [reports, incidentsOnly, needle])
    const clearFilters = () => { setSearch(''); setIncidentsOnly(false) }

    const toggle = (id: string) => setExpanded(current => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })

    const handleExportCSV = () => {
        const headers = ['Date', 'DO Name', 'Papa', 'Origin', 'Destination', 'Rating', 'Wellbeing', 'What Went Well', 'What Didn\'t Go As Plan', 'Team Feedback', 'Finance & Expenses', 'Logistics', 'Accommodation', 'Incidents', 'Monetary Gifts', 'Improvements']
        const rows = reports.map(r => [
            format(new Date(r.submitted_at), 'yyyy-MM-dd HH:mm'),
            r.submitted_by_name || '',
            papaName(r),
            r.journey?.origin || '',
            r.journey?.destination || '',
            r.overall_rating?.toString() || '',
            r.principal_wellbeing || '',
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
        const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `tcnp-post-op-reports-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click()
        URL.revokeObjectURL(url)
    }

    const isUserAdmin = Boolean(userRole && isAdmin(userRole))

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                icon={ClipboardList}
                title="After-Op Reports"
                description={<>Consolidated DO post-operation feedback. {isUserAdmin ? 'All reports visible.' : 'Your submitted reports.'}</>}
                actions={reports.length > 0 && isUserAdmin && (
                    <Button variant="outline" onClick={handleExportCSV}>
                        <Download aria-hidden="true" />Export CSV
                    </Button>
                )}
            />

            {loading ? (
                <div className="space-y-3" role="status" aria-label="Loading reports">
                    {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
            ) : loadFailed ? (
                <ErrorState title="Reports couldn't load" onRetry={() => { setLoading(true); setAttempt(n => n + 1) }} />
            ) : reports.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-4" aria-hidden="true" />
                        <h3 className="font-semibold mb-1">No Reports Yet</h3>
                        <p className="text-sm text-muted-foreground">DOs submit post-op reports from My Operations → Post-Op Report tab.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                        <div className="relative min-w-0 sm:w-[300px]">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                            <Input
                                type="search"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search Duty Officer or Papa"
                                aria-label="Search by Duty Officer or Papa name"
                                className="pl-9"
                            />
                        </div>
                        <div className="flex min-h-9 items-center gap-2">
                            <Switch id="aor-incidents-only" checked={incidentsOnly} onCheckedChange={setIncidentsOnly} />
                            <Label htmlFor="aor-incidents-only" className="cursor-pointer text-sm">Has an incident</Label>
                        </div>
                        <p className="text-sm text-muted-foreground sm:ml-auto" role="status">
                            {filtersActive ? `${visible.length} of ${reports.length} loaded` : `${reports.length} loaded`}
                        </p>
                    </div>

                    {visible.length === 0 ? (
                        <EmptyState
                            icon={Search}
                            title="No reports match these filters"
                            description={hasMore ? 'Only the loaded reports are searched. Load more to search older ones.' : undefined}
                            action={<Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}
                            className="rounded-xl border py-10"
                        />
                    ) : visible.map(report => {
                        const papa = papaName(report) || 'Unknown Papa'
                        const hasIncident = !!report.incidents?.trim()
                        const hasGifts = !!report.monetary_gifts?.trim()
                        const isOpen = expanded.has(report.id)
                        const panelId = `aor-${report.id}`

                        return (
                            <Card key={report.id} className={cn('border-border/50', hasIncident && 'border-red-500/30')}>
                                <button
                                    type="button"
                                    onClick={() => toggle(report.id)}
                                    aria-expanded={isOpen}
                                    aria-controls={panelId}
                                    className="flex w-full items-start justify-between gap-3 rounded-xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span className="block min-w-0 flex-1 space-y-1">
                                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                                            <span className="min-w-0 break-words">{papa}</span>
                                            {hasIncident && (
                                                <Badge variant="destructive" className="text-[11px] gap-1">
                                                    <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />Incident Reported
                                                </Badge>
                                            )}
                                            {hasGifts && (
                                                <Badge className="gap-1 bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[11px]">
                                                    <Gift className="h-2.5 w-2.5" aria-hidden="true" />Gift Received
                                                </Badge>
                                            )}
                                        </span>
                                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <User className="h-3 w-3" aria-hidden="true" /><span className="sr-only">Duty Officer: </span>{report.submitted_by_name}
                                            </span>
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Calendar className="h-3 w-3" aria-hidden="true" />{format(new Date(report.submitted_at), 'dd MMM yyyy, HH:mm')}
                                            </span>
                                            {report.journey && (
                                                <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                                                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{report.journey.origin} → {report.journey.destination}</span>
                                                </span>
                                            )}
                                            <RatingStars rating={report.overall_rating} />
                                        </span>
                                    </span>
                                    <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                                </button>
                                {isOpen && (
                                    <CardContent id={panelId} className="pt-0 space-y-2">
                                        <div className="grid gap-2 text-xs">
                                            {[
                                                { label: 'Principal Wellbeing', value: report.principal_wellbeing },
                                                { label: 'What Went Well', value: report.what_went_well },
                                                { label: 'What Didn\'t Go As Plan', value: report.what_didnt_go_as_plan },
                                                { label: 'Team Feedback', value: report.team_feedback },
                                                { label: 'Finance & Expenses', value: report.finance_expenses },
                                                { label: 'Logistics', value: report.logistics_notes },
                                                { label: 'Accommodation', value: report.accommodation_notes },
                                                { label: 'Incidents', value: report.incidents, highlight: true, icon: AlertTriangle },
                                                { label: 'Monetary Gifts', value: report.monetary_gifts, highlight: true, icon: Gift },
                                                { label: 'Required Improvements', value: report.improvements },
                                            ].filter(f => !!f.value?.trim()).map(field => (
                                                <div key={field.label} className={cn('rounded-md px-3 py-2', field.highlight ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-muted/30 border border-border/30')}>
                                                    <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                        {field.icon && <field.icon className="h-3 w-3" aria-hidden="true" />}
                                                        {field.label}
                                                    </p>
                                                    <p className="whitespace-pre-wrap break-words text-foreground leading-snug">{field.value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        )
                    })}

                    {hasMore && (
                        <div className="flex justify-center pt-2">
                            <Button variant="outline" onClick={() => void loadMore()} pending={loadingMore}>
                                Load more
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
