'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, Clock, MapPin, Pencil, Plane, PlayCircle, StickyNote, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useCanWorkUnitProgramme } from '@/hooks/useUnitAccess'
import { useProgrammeStanding } from '@/hooks/useProgrammeStanding'
import { programmeWorkNotice } from '@/lib/site-unit-permissions'
import { notifyError } from '@/lib/notify'
import { fromLocalInputValue, toLocalInputValue } from '@/lib/den-work'
import { cn } from '@/lib/utils'

// ───────────────────────── Pure logic (tested in tests/alpha-timeline.test.cjs) ─────────────────────────

export type MilestoneKey = 't_minus_2w' | 't_minus_1w' | 't_minus_24h' | 't_minus_12h' | 't_minus_6h' | 't_minus_2h' | 't_minus_1h' | 'on_landing'

/**
 * SOP arrival milestones, in order (TCNP.01.04 arrival routine, plus the
 * HOD-AO visa check 2 weeks out from TCNP.01.07). Offsets are minutes from the ETA.
 */
export const ALPHA_MILESTONES: readonly { key: MilestoneKey; label: string; offsetMinutes: number }[] = [
    { key: 't_minus_2w', label: '2 weeks out', offsetMinutes: -14 * 24 * 60 },
    { key: 't_minus_1w', label: '1 week out', offsetMinutes: -7 * 24 * 60 },
    { key: 't_minus_24h', label: '24 hours out', offsetMinutes: -24 * 60 },
    { key: 't_minus_12h', label: '12 hours out', offsetMinutes: -12 * 60 },
    { key: 't_minus_6h', label: '6 hours out', offsetMinutes: -6 * 60 },
    { key: 't_minus_2h', label: '2 hours out', offsetMinutes: -2 * 60 },
    { key: 't_minus_1h', label: '1 hour out', offsetMinutes: -60 },
    { key: 'on_landing', label: 'On landing', offsetMinutes: 0 },
]

/** How many SOP tasks alpha_start_arrival_timeline() seeds (kept in step with the migration by the tests). */
export const SEEDED_TASK_COUNT = 17

/** "2 weeks, 1 week, … and 1 hour out, and on landing", built from ALPHA_MILESTONES so the copy follows the seed. */
export function milestoneSummary(milestones: readonly { label: string; offsetMinutes: number }[] = ALPHA_MILESTONES): string {
    const before = milestones.filter(m => m.offsetMinutes < 0).map(m => m.label.replace(/ out$/, ''))
    const landing = milestones.some(m => m.offsetMinutes === 0)
    const list = before.length > 1 ? `${before.slice(0, -1).join(', ')} and ${before[before.length - 1]}` : before.join('')
    return [list && `${list} out`, landing && 'on landing'].filter(Boolean).join(', and ')
}

export type TimelineItem = {
    id: string
    timeline_id: string
    milestone_key: MilestoneKey
    offset_minutes: number
    label: string
    owner: string | null
    sop_ref: string | null
    position: number
    done_at: string | null
    done_by: string | null
    note: string | null
    note_by: string | null
    note_at: string | null
    done_by_user?: { full_name: string | null } | null
    note_by_user?: { full_name: string | null } | null
}

export type BoardRow = {
    papa_id: string
    full_name: string | null
    title: string | null
    flight_number: string | null
    arrival_city: string | null
    eta: string | null
    eta_source: 'override' | 'itinerary' | 'papa' | 'none'
    timeline_id: string | null
    items_total: number
    items_done: number
    items_overdue: number
    next_due_at: string | null
}

export type ItemState = 'done' | 'overdue' | 'due_soon' | 'upcoming' | 'no_eta'

const DUE_SOON_MS = 60 * 60 * 1000

/** When a task is due: ETA + its offset, or null while there is no ETA. */
export function itemDueAt(eta: string | null | undefined, offsetMinutes: number): Date | null {
    if (!eta) return null
    const base = new Date(eta).getTime()
    if (Number.isNaN(base)) return null
    return new Date(base + offsetMinutes * 60_000)
}

export function itemState(item: Pick<TimelineItem, 'done_at' | 'offset_minutes'>, eta: string | null | undefined, now: Date): ItemState {
    if (item.done_at) return 'done'
    const due = itemDueAt(eta, item.offset_minutes)
    if (!due) return 'no_eta'
    const left = due.getTime() - now.getTime()
    if (left < 0) return 'overdue'
    return left <= DUE_SOON_MS ? 'due_soon' : 'upcoming'
}

export type MilestoneGroup = {
    key: MilestoneKey
    label: string
    dueAt: Date | null
    items: TimelineItem[]
    done: number
    overdue: number
    complete: boolean
}

/** Tasks grouped under their milestone, in SOP order. Empty milestones are left out. */
export function groupByMilestone(items: readonly TimelineItem[], eta: string | null | undefined, now: Date): MilestoneGroup[] {
    return ALPHA_MILESTONES.map(milestone => {
        const own = items
            .filter(item => item.milestone_key === milestone.key)
            .sort((a, b) => a.position - b.position)
        const done = own.filter(item => item.done_at).length
        return {
            key: milestone.key,
            label: milestone.label,
            dueAt: itemDueAt(eta, own[0]?.offset_minutes ?? milestone.offsetMinutes),
            items: own,
            done,
            overdue: own.filter(item => itemState(item, eta, now) === 'overdue').length,
            complete: own.length > 0 && done === own.length,
        }
    }).filter(group => group.items.length > 0)
}

/** The milestones to show open by default: anything overdue, plus the next unfinished one. */
export function defaultOpenMilestones(groups: readonly MilestoneGroup[]): MilestoneKey[] {
    const open = new Set<MilestoneKey>(groups.filter(group => group.overdue > 0).map(group => group.key))
    const next = groups.find(group => !group.complete)
    if (next) open.add(next.key)
    return ALPHA_MILESTONES.map(m => m.key).filter(key => open.has(key))
}

/** "in 3 h", "2 d ago", "now". */
export function relativeDue(due: Date | null, now: Date): string {
    if (!due) return 'needs an ETA'
    const diff = due.getTime() - now.getTime()
    const abs = Math.abs(diff)
    const minutes = Math.round(abs / 60_000)
    if (minutes < 1) return 'now'
    const text = minutes < 60 ? `${minutes} min` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / (24 * 60))} d`
    return diff >= 0 ? `in ${text}` : `${text} ago`
}

export type TimelineAccess = {
    loadFailed: boolean
    isMember: boolean
    isCommand: boolean
    isCommandMember: boolean
    canCoordinate: boolean
}

/**
 * Whether the officer may start a timeline or tick its tasks, mirroring
 * can_tick_alpha_timeline(): admin/Command, the Alpha head or a Sub-Team
 * Lead, or an Alpha officer doing programme work (can_work_unit_programme).
 */
export function canTickTimeline(access: TimelineAccess, canWork: boolean): boolean {
    return access.isCommand || access.canCoordinate || canWork
}

/**
 * Why the officer cannot tick, in words they can act on; null when they can.
 * `activeOnProgramme` (is_program_active_officer, null while unknown) tells
 * "not active yet" (availability request / Command) apart from "active, but
 * the Alpha head has not given you this work", worded as the other units do.
 */
export function tickBlockReason(
    access: TimelineAccess,
    canWork: boolean,
    programmeChosen: boolean,
    activeOnProgramme: boolean | null = null,
): string | null {
    if (canTickTimeline(access, canWork)) return null
    if (access.loadFailed) return "We couldn't confirm your Alpha membership, so ticking is off. Reload to try again."
    if (!access.isMember) {
        return access.isCommandMember
            ? 'Command can follow these timelines. Ticking is for the Alpha officers on the programme.'
            : 'Only Alpha officers on this programme can tick these tasks.'
    }
    if (!programmeChosen) return 'Choose a programme first.'
    return programmeWorkNotice({
        access: { isPlatformAdmin: false, isCommand: access.isCommand, isMember: true, canCoordinate: access.canCoordinate, canManage: false },
        programmeSelected: true,
        activeOnProgramme,
        canWork,
        work: 'tick these tasks',
        granter: 'your Alpha head',
    }) ?? 'Ticking is for Alpha officers who are active on this programme and have been given this work by your Alpha head.'
}

/** The optimistic copy of a tick: the first tick keeps its officer and time, as the database does. */
export function applyTick(
    items: readonly TimelineItem[],
    itemId: string,
    done: boolean,
    me: { id: string; full_name: string | null },
    nowIso: string,
): TimelineItem[] {
    return items.map(item => {
        if (item.id !== itemId) return item
        if (!done) return { ...item, done_at: null, done_by: null, done_by_user: null }
        if (item.done_at) return item
        return { ...item, done_at: nowIso, done_by: me.id, done_by_user: { full_name: me.full_name } }
    })
}

export function etaSourceLabel(source: BoardRow['eta_source'] | null | undefined): string {
    switch (source) {
        case 'override': return 'set by the Alpha head'
        case 'itinerary': return 'from the flight itinerary'
        case 'papa': return "from the Papa's flight details"
        default: return 'no ETA yet'
    }
}

/** The ETA line for the picker and the detail header. */
export function etaSummary(row: Pick<BoardRow, 'eta' | 'eta_source'>, now: Date): string {
    if (!row.eta) return 'No ETA yet'
    return `ETA ${formatTime(row.eta)} (${relativeDue(new Date(row.eta), now)})`
}

/** "Nnamdi Azikiwe International (ABV)", or null when no Eagle Square is set. */
export function eagleSquareLabel(square: { name: string | null; code: string | null } | null | undefined): string | null {
    if (!square?.name) return null
    return square.code ? `${square.name} (${square.code})` : square.name
}

/** Whether a realtime DELETE on alpha_arrival_timelines is the timeline on screen. */
export function isTimelineDeleteFor(payload: { old?: { id?: string } | null } | null | undefined, timelineId: string | null): boolean {
    return Boolean(timelineId) && payload?.old?.id === timelineId
}

/** The board after a timeline is deleted: that Papa goes back to "Not started". */
export function withoutTimeline(board: readonly BoardRow[], timelineId: string | null): BoardRow[] {
    return board.map(row => row.timeline_id && row.timeline_id === timelineId
        ? { ...row, timeline_id: null, items_total: 0, items_done: 0, items_overdue: 0, next_due_at: null }
        : row)
}

// ───────────────────────── Data ─────────────────────────

const supabase = createClient()

export const alphaBoardKey = (programId: string | null) => ['alpha-arrival-board', programId] as const
export const alphaTimelineKey = (timelineId: string | null) => ['alpha-arrival-timeline', timelineId] as const

const ITEM_FIELDS = 'id, timeline_id, milestone_key, offset_minutes, label, owner, sop_ref, position, done_at, done_by, note, note_by, note_at, done_by_user:users!done_by(full_name), note_by_user:users!note_by(full_name)'

type TimelineRow = {
    id: string
    program_id: string
    papa_id: string
    eagle_square_id: string | null
    eta_override: string | null
    notes: string | null
    eagle_square?: { name: string | null; code: string | null } | null
}

type TimelineDetail = { timeline: TimelineRow | null; items: TimelineItem[] }

function useNow(intervalMs = 60_000) {
    const [now, setNow] = useState(() => new Date())
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), intervalMs)
        return () => clearInterval(timer)
    }, [intervalMs])
    return now
}

const formatTime = (value: Date | string | null | undefined) => {
    if (!value) return ''
    const date = typeof value === 'string' ? new Date(value) : value
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ───────────────────────── Component ─────────────────────────

export interface AOArrivalTimelineProps {
    access: TimelineAccess
    initialProgrammeId?: string | null
    initialPapaId?: string | null
    /** Called when the officer picks a programme or Papa, so the page can keep them in the address bar. */
    onSelectionChange?: (selection: { programme: string | null; papa: string | null }) => void
}

export default function AOArrivalTimeline({ access, initialProgrammeId = null, initialPapaId = null, onSelectionChange }: AOArrivalTimelineProps) {
    const now = useNow()
    const [chosenProgramme, setChosenProgramme] = useState<string | null>(initialProgrammeId)
    const [chosenPapa, setChosenPapa] = useState<string | null>(initialPapaId)
    // A new address (a notification tap, back/forward) moves the card with it.
    const [seenInitial, setSeenInitial] = useState({ programme: initialProgrammeId, papa: initialPapaId })
    if (seenInitial.programme !== initialProgrammeId || seenInitial.papa !== initialPapaId) {
        setSeenInitial({ programme: initialProgrammeId, papa: initialPapaId })
        setChosenProgramme(initialProgrammeId)
        setChosenPapa(initialPapaId)
    }

    const programmesQuery = useQuery({
        queryKey: ['alpha-timeline-programmes'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('programs')
                .select('id, name, status, start_date')
                .order('start_date', { ascending: false })
            if (error) throw error
            return (data || []) as { id: string; name: string; status: string | null; start_date: string | null }[]
        },
        staleTime: 5 * 60_000,
    })
    const programmes = useMemo(() => programmesQuery.data ?? [], [programmesQuery.data])
    const programmeId = useMemo(() => {
        if (chosenProgramme && programmes.some(p => p.id === chosenProgramme)) return chosenProgramme
        const live = programmes.find(p => p.status === 'active') ?? programmes.find(p => p.status === 'planning')
        return (live ?? programmes[0])?.id ?? null
    }, [chosenProgramme, programmes])

    const boardQuery = useQuery({
        queryKey: alphaBoardKey(programmeId),
        enabled: Boolean(programmeId),
        queryFn: async () => {
            const { data, error } = await (supabase as any).rpc('alpha_arrival_board', { target_program: programmeId })
            if (error) throw error
            return (data || []) as BoardRow[]
        },
        staleTime: 30_000,
    })
    const board = useMemo(() => boardQuery.data ?? [], [boardQuery.data])
    const papa = board.find(row => row.papa_id === chosenPapa) ?? null

    const work = useCanWorkUnitProgramme('alpha', programmeId)
    const canTick = canTickTimeline(access, work.canWork)
    const standing = useProgrammeStanding(programmeId, access.isMember && !canTick && !work.isLoading)
    const blockReason = work.isLoading && !canTick ? null : tickBlockReason(access, work.canWork, Boolean(programmeId), standing.activeOnProgramme)
    const canEdit = access.canCoordinate || access.isCommand

    const selectProgramme = (next: string) => {
        setChosenProgramme(next)
        setChosenPapa(null)
        onSelectionChange?.({ programme: next, papa: null })
    }
    const selectPapa = (next: string | null) => {
        setChosenPapa(next)
        onSelectionChange?.({ programme: programmeId, papa: next })
    }

    return (
        <Card className="border-border/50 overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-r from-sky-500/5 to-transparent">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    <Plane className="h-4 w-4 text-sky-500" aria-hidden="true" />
                    Pre-arrival timelines
                    <Badge variant="secondary" className="text-[11px] font-mono">TCNP.01.04</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                    One timeline per Papa, counted back from the ETA: {milestoneSummary()}.
                </p>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
                {programmesQuery.isError && programmes.length === 0 ? (
                    <ErrorState
                        title="We couldn't load the programmes"
                        onRetry={() => { void programmesQuery.refetch() }}
                        retrying={programmesQuery.isFetching}
                    />
                ) : programmesQuery.isLoading ? (
                    <Skeleton className="h-11 w-full" />
                ) : programmes.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No programmes yet. Timelines start once Command creates a programme.</p>
                ) : (
                    <div className="space-y-1.5">
                        <Label htmlFor="alpha-timeline-programme">Programme</Label>
                        <Select value={programmeId ?? undefined} onValueChange={selectProgramme}>
                            <SelectTrigger id="alpha-timeline-programme" className="min-h-11" aria-label="Programme">
                                <SelectValue placeholder="Choose a programme" />
                            </SelectTrigger>
                            <SelectContent>
                                {programmes.map(programme => (
                                    <SelectItem key={programme.id} value={programme.id}>{programme.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {programmeId && (
                    boardQuery.isError && board.length === 0 ? (
                        <ErrorState
                            title="We couldn't load the Papas"
                            onRetry={() => { void boardQuery.refetch() }}
                            retrying={boardQuery.isFetching}
                        />
                    ) : boardQuery.isLoading ? (
                        <div className="space-y-2" role="status" aria-label="Loading Papas">
                            {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                        </div>
                    ) : board.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">No Papas on this programme yet. They appear here once added.</p>
                    ) : papa ? (
                        <TimelineDetailView
                            papa={papa}
                            programmeId={programmeId}
                            now={now}
                            canTick={canTick}
                            canEdit={canEdit}
                            blockReason={blockReason}
                            onBack={() => selectPapa(null)}
                        />
                    ) : (
                        <PapaPicker board={board} now={now} onPick={selectPapa} />
                    )
                )}

                {blockReason && !papa && programmeId && board.length > 0 && (
                    <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground" role="note">{blockReason}</p>
                )}
            </CardContent>
        </Card>
    )
}

function PapaPicker({ board, now, onPick }: { board: BoardRow[]; now: Date; onPick: (papaId: string) => void }) {
    return (
        <ul className="space-y-2" aria-label="Papas on this programme">
            {board.map(row => {
                const name = [row.title, row.full_name].filter(Boolean).join(' ') || 'Papa'
                const pct = row.items_total > 0 ? Math.round((row.items_done / row.items_total) * 100) : 0
                return (
                    <li key={row.papa_id}>
                        <button
                            type="button"
                            onClick={() => onPick(row.papa_id)}
                            className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-border/50 p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Open the arrival timeline for ${name}`}
                        >
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{name}</p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" aria-hidden="true" />
                                    {etaSummary(row, now)}
                                    {row.flight_number && <span className="font-mono">{row.flight_number}</span>}
                                </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                                {row.timeline_id ? (
                                    <Badge variant="secondary" className="font-mono text-[11px]">{row.items_done}/{row.items_total} · {pct}%</Badge>
                                ) : (
                                    <Badge variant="outline" className="text-[11px]">Not started</Badge>
                                )}
                                {row.items_overdue > 0 && (
                                    <Badge className="border-red-500/30 bg-red-500/15 text-[11px] text-red-600 dark:text-red-400">{row.items_overdue} overdue</Badge>
                                )}
                            </div>
                        </button>
                    </li>
                )
            })}
        </ul>
    )
}

interface DetailProps {
    papa: BoardRow
    programmeId: string
    now: Date
    canTick: boolean
    canEdit: boolean
    blockReason: string | null
    onBack: () => void
}

function TimelineDetailView({ papa, programmeId, now, canTick, canEdit, blockReason, onBack }: DetailProps) {
    const queryClient = useQueryClient()
    const confirm = useConfirm()
    const { data: currentUser } = useCurrentUser()
    const timelineId = papa.timeline_id
    const name = [papa.title, papa.full_name].filter(Boolean).join(' ') || 'Papa'
    const [openOverride, setOpenOverride] = useState<Set<MilestoneKey> | null>(null)
    const [noteFor, setNoteFor] = useState<string | null>(null)
    const [noteDraft, setNoteDraft] = useState('')
    const [editOpen, setEditOpen] = useState(false)

    const detailQuery = useQuery({
        queryKey: alphaTimelineKey(timelineId),
        enabled: Boolean(timelineId),
        queryFn: async (): Promise<TimelineDetail> => {
            const [timeline, items] = await Promise.all([
                (supabase as any).from('alpha_arrival_timelines')
                    .select('id, program_id, papa_id, eagle_square_id, eta_override, notes, eagle_square:eagle_squares(name, code)')
                    .eq('id', timelineId).maybeSingle(),
                (supabase as any).from('alpha_arrival_timeline_items')
                    .select(ITEM_FIELDS)
                    .eq('timeline_id', timelineId)
                    .order('position'),
            ])
            if (timeline.error) throw timeline.error
            if (items.error) throw items.error
            return { timeline: timeline.data ?? null, items: (items.data || []) as TimelineItem[] }
        },
        staleTime: 15_000,
    })

    // Two AOs at the Eagle Square see each other's ticks as they happen.
    useEffect(() => {
        if (!timelineId) return
        const refresh = () => {
            void queryClient.invalidateQueries({ queryKey: alphaTimelineKey(timelineId) })
            void queryClient.invalidateQueries({ queryKey: alphaBoardKey(programmeId) })
        }
        // Realtime never delivers DELETE events to a filtered listener, so the
        // timeline's own delete is caught by an unfiltered DELETE listener that
        // checks the id (its tasks go with it by cascade).
        const channel = supabase
            .channel(`alpha-timeline-${timelineId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'alpha_arrival_timeline_items', filter: `timeline_id=eq.${timelineId}` }, refresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'alpha_arrival_timelines', filter: `id=eq.${timelineId}` }, refresh)
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'alpha_arrival_timelines' }, payload => {
                if (isTimelineDeleteFor(payload as { old?: { id?: string } }, timelineId)) refresh()
            })
            .subscribe()
        return () => { void supabase.removeChannel(channel) }
    }, [queryClient, timelineId, programmeId])

    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: alphaBoardKey(programmeId) })
        void queryClient.invalidateQueries({ queryKey: alphaTimelineKey(timelineId) })
    }

    const start = useMutation({
        mutationFn: async () => {
            const { data, error } = await (supabase as any).rpc('alpha_start_arrival_timeline', { target_program: programmeId, target_papa: papa.papa_id })
            if (error) throw error
            return data as string
        },
        onSuccess: () => {
            toast.success(`Timeline started for ${name}`)
            void queryClient.invalidateQueries({ queryKey: alphaBoardKey(programmeId) })
        },
        onError: error => { notifyError(error, 'Could not start the timeline') },
    })

    const tick = useMutation({
        mutationFn: async ({ itemId, done, note }: { itemId: string; done: boolean | null; note?: string }) => {
            const { error } = await (supabase as any).rpc('alpha_tick_timeline_item', {
                target_item: itemId,
                is_done: done,
                item_note: note ?? null,
            })
            if (error) throw error
        },
        onMutate: async ({ itemId, done }) => {
            const key = alphaTimelineKey(timelineId)
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<TimelineDetail>(key)
            if (previous && done !== null && currentUser) {
                queryClient.setQueryData<TimelineDetail>(key, {
                    ...previous,
                    items: applyTick(previous.items, itemId, done, { id: currentUser.id, full_name: currentUser.full_name }, new Date().toISOString()),
                })
            }
            return { previous }
        },
        onError: (error, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(alphaTimelineKey(timelineId), context.previous)
            notifyError(error, 'Could not update the task')
        },
        onSettled: invalidate,
    })

    const remove = useMutation({
        mutationFn: async () => {
            const { error } = await (supabase as any).from('alpha_arrival_timelines').delete().eq('id', timelineId)
            if (error) throw error
        },
        onSuccess: () => {
            toast.success('Timeline deleted')
            invalidate()
        },
        onError: error => { notifyError(error, 'Could not delete the timeline') },
    })

    const items = useMemo(() => detailQuery.data?.items ?? [], [detailQuery.data])
    const groups = useMemo(() => groupByMilestone(items, papa.eta, now), [items, papa.eta, now])
    const openKeys = openOverride ?? new Set(defaultOpenMilestones(groups))
    const toggleOpen = (key: MilestoneKey) => {
        const next = new Set(openKeys)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        setOpenOverride(next)
    }
    const done = items.filter(item => item.done_at).length
    const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0
    const squareName = eagleSquareLabel(detailQuery.data?.timeline?.eagle_square)
    // Only the note being saved shows a spinner, not every tick in flight.
    const savingNoteFor = tick.isPending && tick.variables?.done === null ? tick.variables.itemId : null

    // Unticking clears who ticked the task and when, so a stray tap asks first.
    const toggleTick = async (entry: TimelineItem, isDone: boolean) => {
        if (isDone) {
            const who = entry.done_by_user?.full_name
            const ok = await confirm({
                title: 'Untick this task?',
                message: `"${entry.label}" goes back to open, and ${who ? `${who}'s tick` : 'the tick'} and its time are cleared.`,
                confirmText: 'Untick',
            })
            if (!ok) return
        }
        // Keep the open sections as they are: finishing a milestone must not
        // fold it away under the thumb.
        if (!openOverride) setOpenOverride(new Set(openKeys))
        tick.mutate({ itemId: entry.id, done: !isDone })
    }

    const saveNote = (itemId: string) => {
        tick.mutate({ itemId, done: null, note: noteDraft }, { onSuccess: () => { setNoteFor(null); toast.success('Note saved') } })
    }

    const confirmDelete = async () => {
        if (!await confirm({ message: `Delete the arrival timeline for ${name}? Every tick and note on it is removed.`, variant: 'destructive' })) return
        remove.mutate()
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-start gap-2">
                <Button variant="ghost" size="sm" className="min-h-11 -ml-2" onClick={onBack} aria-label="Back to all Papas">
                    ← All Papas
                </Button>
                {canEdit && timelineId && (
                    <div className="ml-auto flex gap-2">
                        <Button variant="outline" size="sm" className="min-h-11" onClick={() => setEditOpen(true)} aria-label={`Edit the timeline for ${name}`}>
                            <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" className="min-h-11 min-w-11" onClick={() => { void confirmDelete() }} pending={remove.isPending} aria-label={`Delete the timeline for ${name}`}>
                            <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                        </Button>
                    </div>
                )}
            </div>

            <div>
                <h3 className="text-base font-semibold">{name}</h3>
                <p className="text-xs text-muted-foreground">
                    {papa.eta ? <><span className="font-medium text-foreground">{etaSummary(papa, now)}</span> · {etaSourceLabel(papa.eta_source)}</> : 'No ETA yet. Due times appear once the flight is entered or the Alpha head sets the ETA.'}
                    {papa.flight_number && <> · <span className="font-mono">{papa.flight_number}</span></>}
                    {papa.arrival_city && <> · {papa.arrival_city}</>}
                </p>
                {squareName && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" aria-hidden="true" /> Eagle Square: <span className="font-medium text-foreground">{squareName}</span>
                    </p>
                )}
                {detailQuery.data?.timeline?.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{detailQuery.data.timeline.notes}</p>
                )}
            </div>

            {!timelineId ? (
                <div className="rounded-xl border border-dashed p-5 text-center">
                    <PlayCircle className="mx-auto h-8 w-8 text-sky-500/70" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium">No timeline for {name} yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">Starting it adds the {SEEDED_TASK_COUNT} SOP arrival tasks, each due relative to the ETA.</p>
                    {canTick ? (
                        <Button className="mt-3 min-h-11" onClick={() => start.mutate()} pending={start.isPending}>
                            Start timeline
                        </Button>
                    ) : (
                        blockReason && <p className="mt-3 text-xs text-muted-foreground" role="note">{blockReason}</p>
                    )}
                </div>
            ) : detailQuery.isError && !detailQuery.data ? (
                <ErrorState
                    title="We couldn't load this timeline"
                    onRetry={() => { void detailQuery.refetch() }}
                    retrying={detailQuery.isFetching}
                />
            ) : detailQuery.isLoading ? (
                <div className="space-y-2" role="status" aria-label="Loading the timeline">
                    {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Timeline progress">
                            <div className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-sky-500')} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">{done}/{items.length}</span>
                    </div>

                    {blockReason && (
                        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground" role="note">{blockReason}</p>
                    )}

                    {groups.length === 0 && (
                        <p className="py-4 text-center text-sm text-muted-foreground">This timeline has no tasks. The Alpha head can delete it and start it again.</p>
                    )}

                    {groups.map(group => {
                        const isOpen = openKeys.has(group.key)
                        const panelId = `alpha-milestone-${group.key}`
                        return (
                            <section key={group.key} className={cn('overflow-hidden rounded-xl border', group.complete ? 'border-green-500/30' : group.overdue > 0 ? 'border-red-500/30' : 'border-border/40')}>
                                <button
                                    type="button"
                                    onClick={() => toggleOpen(group.key)}
                                    aria-expanded={isOpen}
                                    aria-controls={panelId}
                                    className="flex min-h-11 w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/30"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold">{group.label}</span>
                                            {group.complete && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" aria-label="Complete" />}
                                            {group.overdue > 0 && (
                                                <Badge className="border-red-500/30 bg-red-500/15 text-[11px] text-red-600 dark:text-red-400">{group.overdue} overdue</Badge>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {group.dueAt ? `Due ${formatTime(group.dueAt)} (${relativeDue(group.dueAt, now)})` : 'Due time needs an ETA'}
                                        </p>
                                    </div>
                                    <span className="font-mono text-xs text-muted-foreground">{group.done}/{group.items.length}</span>
                                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                                </button>
                                {isOpen && (
                                    <ul id={panelId} className="space-y-2 border-t border-border/30 p-3">
                                        {group.items.map(item => {
                                            const state = itemState(item, papa.eta, now)
                                            const isDone = state === 'done'
                                            const editingNote = noteFor === item.id
                                            return (
                                                <li key={item.id} className={cn('rounded-lg border p-2', isDone ? 'border-green-500/20 bg-green-500/5' : state === 'overdue' ? 'border-red-500/30 bg-red-500/5' : 'border-border/30 bg-muted/20')}>
                                                    <div className="flex items-start gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={!canTick}
                                                            onClick={() => { void toggleTick(item, isDone) }}
                                                            aria-pressed={isDone}
                                                            aria-label={`${isDone ? 'Untick' : 'Tick'}: ${item.label}`}
                                                            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-60"
                                                        >
                                                            {isDone
                                                                ? <CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden="true" />
                                                                : <Circle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
                                                        </button>
                                                        <div className="min-w-0 flex-1 py-1.5">
                                                            <p className={cn('text-sm leading-snug', isDone && 'text-muted-foreground line-through')}>{item.label}</p>
                                                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                                                {item.owner && <span>{item.owner}</span>}
                                                                {item.sop_ref && <span className="font-mono">{item.sop_ref}</span>}
                                                                {state === 'overdue' && <Badge className="border-red-500/30 bg-red-500/15 px-1.5 py-0 text-[10px] text-red-600 dark:text-red-400">Overdue</Badge>}
                                                                {state === 'due_soon' && <Badge className="border-amber-500/30 bg-amber-500/15 px-1.5 py-0 text-[10px] text-amber-700 dark:text-amber-400">Due soon</Badge>}
                                                            </p>
                                                            {isDone && (
                                                                <p className="mt-1 text-[11px] text-green-700 dark:text-green-400">
                                                                    Ticked by {item.done_by_user?.full_name || 'an officer'} · {formatTime(item.done_at)}
                                                                </p>
                                                            )}
                                                            {item.note && !editingNote && (
                                                                <p className="mt-1 whitespace-pre-wrap rounded bg-background/60 px-2 py-1 text-xs">
                                                                    {item.note}
                                                                    <span className="block text-[10px] text-muted-foreground">{item.note_by_user?.full_name || 'An officer'} · {formatTime(item.note_at)}</span>
                                                                </p>
                                                            )}
                                                        </div>
                                                        {canTick && !editingNote && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="min-h-11 min-w-11 shrink-0"
                                                                onClick={() => { setNoteFor(item.id); setNoteDraft(item.note ?? '') }}
                                                                aria-label={`${item.note ? 'Edit the note' : 'Add a note'} on: ${item.label}`}
                                                            >
                                                                <StickyNote className="h-4 w-4" aria-hidden="true" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                    {editingNote && (
                                                        <div className="mt-2 space-y-2">
                                                            <Textarea
                                                                value={noteDraft}
                                                                onChange={event => setNoteDraft(event.target.value)}
                                                                maxLength={500}
                                                                rows={2}
                                                                placeholder="e.g. FAAN desk contact, gate, who confirmed"
                                                                aria-label={`Note on: ${item.label}`}
                                                            />
                                                            <div className="flex justify-end gap-2">
                                                                <Button variant="outline" size="sm" className="min-h-11" onClick={() => setNoteFor(null)}>Cancel</Button>
                                                                <Button size="sm" className="min-h-11" onClick={() => saveNote(item.id)} pending={savingNoteFor === item.id}>Save note</Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </section>
                        )
                    })}

                    {groups.some(group => group.overdue > 0) && (
                        <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400" role="status">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Some tasks are past their due time.
                        </p>
                    )}
                </>
            )}

            {/* Mounted only while open, so it always starts from the saved values. */}
            {editOpen && canEdit && timelineId && detailQuery.data?.timeline && (
                <EditTimelineDialog
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    timeline={detailQuery.data.timeline}
                    papaName={name}
                    onSaved={invalidate}
                />
            )}
        </div>
    )
}

function EditTimelineDialog({ open, onOpenChange, timeline, papaName, onSaved }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    timeline: TimelineRow
    papaName: string
    onSaved: () => void
}) {
    const [eta, setEta] = useState(() => toLocalInputValue(timeline.eta_override))
    const [square, setSquare] = useState<string>(timeline.eagle_square_id ?? 'none')
    const [notes, setNotes] = useState(timeline.notes ?? '')

    const squaresQuery = useQuery({
        queryKey: ['eagle-squares-lite'],
        enabled: open,
        queryFn: async () => {
            const { data, error } = await supabase.from('eagle_squares').select('id, name, code').order('name')
            if (error) throw error
            return (data || []) as { id: string; name: string; code: string | null }[]
        },
        // Fetched each time the dialog opens, so an airport just added on the
        // Eagle Squares tab is already in the list.
        staleTime: 0,
    })

    const save = useMutation({
        mutationFn: async () => {
            const { error } = await (supabase as any).from('alpha_arrival_timelines').update({
                eta_override: fromLocalInputValue(eta),
                eagle_square_id: square === 'none' ? null : square,
                notes: notes.trim() || null,
            }).eq('id', timeline.id)
            if (error) throw error
        },
        onSuccess: () => {
            toast.success('Timeline updated')
            onSaved()
            onOpenChange(false)
        },
        onError: error => { notifyError(error, 'Could not update the timeline') },
    })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit timeline</DialogTitle>
                    <DialogDescription>{papaName}. Leave the ETA empty to use the flight itinerary.</DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-4"
                    onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate() }}
                >
                    <div className="space-y-1.5">
                        <Label htmlFor="alpha-eta-override">ETA override</Label>
                        <Input id="alpha-eta-override" type="datetime-local" className="min-h-11" value={eta} onChange={event => setEta(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="alpha-eagle-square">Eagle Square</Label>
                        <Select value={square} onValueChange={setSquare}>
                            <SelectTrigger id="alpha-eagle-square" className="min-h-11" aria-label="Eagle Square">
                                <SelectValue placeholder="Not set" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Not set</SelectItem>
                                {(squaresQuery.data ?? []).map(sq => (
                                    <SelectItem key={sq.id} value={sq.id}>{sq.name}{sq.code ? ` (${sq.code})` : ''}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="alpha-timeline-notes">Notes</Label>
                        <Textarea id="alpha-timeline-notes" value={notes} maxLength={2000} onChange={event => setNotes(event.target.value)} placeholder="Briefing points for the AOs" />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" className="min-h-11" pending={save.isPending}>Save</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
