'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, ClipboardCheck, Theater } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { notifyError, UserFacingError } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// ─── Victor Routine Check (SOP TCNP.01.09) ──────────────────────────────────
// "Routine Check for Victor Oscar": run before and during each day's
// operation and rechecked at least four times. Items 1-11 follow the manual;
// the protocol lounge comes from the Event Routines (TCNP.01.04) and the exits
// item from the manual's contingency duty ("den and theatre safe for use").

export type RoutineItem = { key: string; label: string; source: string }

export const VICTOR_ROUTINE_ITEMS: readonly RoutineItem[] = [
    { key: 'oscar_seats', label: 'Seats are available for all Oscars', source: 'TCNP.01.09 #1' },
    { key: 'entourage_seats', label: "Seats are available for the Papa's PA and entourage", source: 'TCNP.01.09 #2' },
    { key: 'entourage_hop', label: "Seat requirement for each principal's entourage checked with HOP", source: 'TCNP.01.09 #3' },
    { key: 'entry_exit_tu', label: 'Entry and exit strategy for the Theatre checked with Tango Uniform', source: 'TCNP.01.09 #4' },
    { key: 'den_toilets', label: 'Den toilets checked and toiletries available (check on the hour)', source: 'TCNP.01.09 #5' },
    { key: 'den_mics_echo', label: 'Mics available at the Den, checked with Echo Oscars', source: 'TCNP.01.09 #6' },
    { key: 'mic_type_do', label: 'Type of mic the principal prefers or can use, checked with the DO', source: 'TCNP.01.09 #7' },
    { key: 'media_do', label: 'Media assistance needed (audio, presentation, etc.) checked with the DO', source: 'TCNP.01.09 #8' },
    { key: 'oscars_planted', label: 'Oscars planted at strategic locations in the crowd and Theatre', source: 'TCNP.01.09 #9' },
    { key: 'papa_path_clear', label: "Papa's entrance and exit from the main hall are not hindered", source: 'TCNP.01.09 #10' },
    { key: 'security_contact', label: 'Security arrangement for the guest and contact number confirmed', source: 'TCNP.01.09 #11' },
    { key: 'protocol_lounge', label: 'Protocol lounge and conveniences ready', source: 'Event Routines' },
    { key: 'exits_safe', label: 'Emergency exits clear; Den and Theatre safe for use', source: 'Contingency' },
]

/** Labels of the list the app used before 2026-11-16 (rows stored bare booleans in this order). */
const LEGACY_ITEM_LABELS = [
    'All seats and rows are well-arranged and accessible',
    'Entry points and aisles are clear and unobstructed',
    'Protocol lounge is set up and ready for TCNP principals',
    'VIP seating area is arranged and reserved correctly',
    'Lighting is functional and set to appropriate levels',
    'Sound / PA system has been tested and confirmed working',
    'Air-conditioning / ventilation is set to optimal temperature',
    'Toilets / conveniences are clean and stocked',
    'Cheetah parking coordination with Traffic Uniform (TU) confirmed',
    'Emergency exits are marked and accessible',
    'Security confirmed at entry and backstage points',
]

export const MIN_ROUNDS = 4
export const FIRST_ROUND = 'Pre-operation'
export const NOTES_MAX = 2000

/** Round 1 is the pre-operation check; later rounds are "Round N". */
export function roundLabel(n: number): string {
    return n <= 1 ? FIRST_ROUND : `Round ${n}`
}

/** The round number a label stands for, or null for labels from the old fixed slots. */
export function roundNumber(label: string | null | undefined): number | null {
    const value = (label ?? '').trim()
    if (value.toLowerCase() === FIRST_ROUND.toLowerCase()) return 1
    const match = /^round\s+(\d{1,3})$/i.exec(value)
    if (!match) return null
    const n = Number(match[1])
    return n >= 2 ? n : null
}

export type CheckSnapshot = { key?: string; label: string; done: boolean }

/** The list as ticked, stored with its labels so renaming an item never changes old rounds. */
export function buildChecksSnapshot(done: Readonly<Record<string, boolean>>, items: readonly RoutineItem[] = VICTOR_ROUTINE_ITEMS): CheckSnapshot[] {
    return items.map(item => ({ key: item.key, label: item.label, done: done[item.key] === true }))
}

/** Reads a stored checks value: labelled snapshots as they are, old boolean arrays with their old labels. */
export function normaliseChecks(raw: unknown): CheckSnapshot[] {
    if (!Array.isArray(raw)) return []
    return raw.map((entry, index) => {
        if (typeof entry === 'boolean') return { label: LEGACY_ITEM_LABELS[index] ?? `Item ${index + 1}`, done: entry }
        if (entry && typeof entry === 'object') {
            const row = entry as Record<string, unknown>
            return {
                key: typeof row.key === 'string' ? row.key : undefined,
                label: typeof row.label === 'string' && row.label.trim() ? row.label : `Item ${index + 1}`,
                done: row.done === true,
            }
        }
        return { label: `Item ${index + 1}`, done: false }
    })
}

/** True when a and b fall on the same calendar day in the viewer's own time zone. */
export function isSameLocalDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export type RoundLog = { session: string; performed_at: string; program_id: string | null }

export type RoundSummary = {
    /** Distinct rounds logged today for this programme, in round order. */
    rounds: string[]
    count: number
    complete: boolean
    /** The first round not yet logged today. */
    nextRound: string
}

/**
 * Today's progress for one programme at one theatre. A round logged twice
 * (a recheck) counts once, and "today" is the viewer's local calendar day.
 */
export function summariseRounds(logs: readonly RoundLog[], programId: string | null, now: Date = new Date()): RoundSummary {
    const seen = new Set<string>()
    for (const log of logs) {
        if (!programId || log.program_id !== programId) continue
        const at = new Date(log.performed_at)
        if (Number.isNaN(at.getTime()) || !isSameLocalDay(at, now)) continue
        const label = (log.session ?? '').trim()
        if (label) seen.add(label)
    }
    const rounds = [...seen].sort((a, b) => (roundNumber(a) ?? 999) - (roundNumber(b) ?? 999) || a.localeCompare(b))
    let next = 1
    while (seen.has(roundLabel(next))) next += 1
    return { rounds, count: rounds.length, complete: rounds.length >= MIN_ROUNDS, nextRound: roundLabel(next) }
}

/** Round choices: Pre-operation to Round 4, plus one more after the highest round already logged. */
export function roundOptions(rounds: readonly string[]): string[] {
    const highest = rounds.reduce((max, label) => Math.max(max, roundNumber(label) ?? 0), 0)
    const last = Math.max(MIN_ROUNDS, highest + 1)
    return Array.from({ length: last }, (_, index) => roundLabel(index + 1))
}

/** Local date and time for a log row. */
export function formatLocalTime(iso: string, now: Date = new Date()): string {
    const at = new Date(iso)
    if (Number.isNaN(at.getTime())) return 'Time unknown'
    const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return isSameLocalDay(at, now) ? `Today ${time}` : `${at.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${time}`
}

// ─── Programme choice ───────────────────────────────────────────────────────

export type ProgrammeLike = {
    id: string
    status: string | null
    theatre_id: string | null
    start_date?: string | null
    end_date?: string | null
}

/** programs.status is planning | active | completed | archived; finished ones are not offered. */
export const CLOSED_PROGRAMME_STATUSES: ReadonlySet<string> = new Set(['completed', 'archived'])

/** The viewer's local calendar date as YYYY-MM-DD (the format of programs.start_date). */
export function localDateKey(now: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export type ProgrammeTiming = 'today' | 'upcoming' | 'undated' | 'past'

/** Whether a programme runs today (start_date..end_date, or start_date alone when there is no end). */
export function programmeTiming(p: ProgrammeLike, today: string): ProgrammeTiming {
    const start = (p.start_date ?? '').slice(0, 10)
    if (!start) return 'undated'
    const end = (p.end_date ?? '').slice(0, 10) || start
    if (start <= today && today <= end) return 'today'
    return start > today ? 'upcoming' : 'past'
}

/**
 * Open programmes in the order the picker offers them; the first is the
 * default. Programmes at this theatre come before those elsewhere. Within
 * each group: running today (active first), then any other 'active' one,
 * then the nearest upcoming, then undated, then the most recent past one.
 */
export function rankProgrammes<T extends ProgrammeLike>(
    programmes: readonly T[],
    theatreId: string,
    venueProgramIds: ReadonlySet<string> = new Set(),
    now: Date = new Date(),
): T[] {
    const today = localDateKey(now)
    const tierOf = (p: T) => {
        const timing = programmeTiming(p, today)
        if (timing === 'today') return 0
        if (p.status === 'active') return 1
        return timing === 'upcoming' ? 2 : timing === 'undated' ? 3 : 4
    }
    return programmes
        .filter(p => !CLOSED_PROGRAMME_STATUSES.has((p.status ?? '').toLowerCase()))
        .map(p => ({
            p,
            here: p.theatre_id === theatreId || venueProgramIds.has(p.id),
            tier: tierOf(p),
            active: p.status === 'active' ? 0 : 1,
            start: (p.start_date ?? '').slice(0, 10),
        }))
        .sort((a, b) =>
            Number(b.here) - Number(a.here)
            || a.tier - b.tier
            || a.active - b.active
            // Upcoming: soonest first. Otherwise: latest start first.
            || (a.tier === 2 ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start)))
        .map(entry => entry.p)
}

/** True when the programme is held at this theatre (programs.theatre_id or a program_venues link). */
export function isProgrammeHere(p: ProgrammeLike, theatreId: string, venueProgramIds: ReadonlySet<string> = new Set()): boolean {
    return p.theatre_id === theatreId || venueProgramIds.has(p.id)
}

/**
 * The programme the picker starts on: the officer's own choice when it is
 * still offered, otherwise the first ranked programme held at this theatre.
 * A programme held elsewhere is never preselected, so rounds for venue X
 * cannot slip onto venue Y's operation; the officer must pick it.
 */
export function defaultProgrammeId(
    ranked: readonly ProgrammeLike[],
    theatreId: string,
    venueProgramIds: ReadonlySet<string> = new Set(),
    choice: string | null | undefined = null,
): string | null {
    if (choice && ranked.some(p => p.id === choice)) return choice
    return ranked.find(p => isProgrammeHere(p, theatreId, venueProgramIds))?.id ?? null
}

// ─── Draft (kept while the officer checks other tabs) ───────────────────────
// Radix unmounts inactive tabs and the card is keyed by theatre, so the ticks
// and notes of a round in progress live outside the component: in memory for
// this page load, mirrored to sessionStorage for a reload. Cleared on log.
// The store belongs to one officer (owner = users.id). On a shared venue phone
// a different officer signing in on the same tab never sees, or logs as their
// own, the ticks another officer left: a store owned by someone else is read
// as empty and replaced on the first change.

export type RoutineDraft = { done: Record<string, boolean>; notes: string }
export type DraftStore = { owner: string | null; programmes: Record<string, string>; rounds: Record<string, RoutineDraft> }

const DRAFT_STORAGE_KEY = 'tcnp:victor-routine-draft:v2'
/** The v1 store had no owner; it is dropped, never read. */
const LEGACY_DRAFT_STORAGE_KEYS = ['tcnp:victor-routine-draft:v1']
const EMPTY_DRAFT: RoutineDraft = { done: {}, notes: '' }
const emptyStore = (owner: string | null): DraftStore => ({ owner, programmes: {}, rounds: {} })
let memoryDrafts: DraftStore | null = null

export const draftKey = (theatreId: string, programId: string | null) => `${theatreId}:${programId ?? ''}`

/** The part of the store this officer may see: their own, or nothing. */
export function draftsFor(store: DraftStore, userId: string | null | undefined): DraftStore {
    return userId && store.owner === userId ? store : emptyStore(userId ?? null)
}

function readDrafts(): DraftStore {
    if (memoryDrafts) return memoryDrafts
    let stored: DraftStore = emptyStore(null)
    try {
        if (typeof window !== 'undefined') {
            for (const key of LEGACY_DRAFT_STORAGE_KEYS) window.sessionStorage.removeItem(key)
            const parsed = JSON.parse(window.sessionStorage.getItem(DRAFT_STORAGE_KEY) ?? 'null')
            if (parsed && typeof parsed === 'object' && typeof parsed.owner === 'string' && parsed.rounds && parsed.programmes) {
                stored = parsed as DraftStore
            }
        }
    } catch {
        // Storage blocked or corrupt: start with no draft.
    }
    memoryDrafts = stored
    return stored
}

function writeDrafts(next: DraftStore) {
    memoryDrafts = next
    try {
        if (typeof window !== 'undefined') window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(next))
    } catch {
        // The in-memory copy still covers tab switches.
    }
}

/** Drops every saved draft (tests, sign-out). */
export function clearRoutineDrafts() {
    memoryDrafts = null
    try {
        if (typeof window !== 'undefined') {
            for (const key of [DRAFT_STORAGE_KEY, ...LEGACY_DRAFT_STORAGE_KEYS]) window.sessionStorage.removeItem(key)
        }
    } catch {
        // Nothing to clear.
    }
}

type Programme = ProgrammeLike & { name: string }
type LogRow = RoundLog & {
    id: string
    checks: unknown
    all_passed: boolean
    notes: string | null
    performed_by_name: string | null
}

const TIMING_SUFFIX: Record<ProgrammeTiming, string> = { today: ' · today', upcoming: ' · upcoming', undated: '', past: ' · past' }

export const victorRoutineKeys = {
    programmes: ['victor-routine', 'programmes'] as const,
    logs: (theatreId: string, programId: string | null) => ['victor-routine', 'logs', theatreId, programId] as const,
}

export default function DenChecklist({
    theatreId,
    theatreName,
    canSubmit,
}: {
    theatreId: string
    theatreName: string
    /** Victor member or Command/admin (RLS: own row AND (is_admin() OR is_unit_member('victor'))). */
    canSubmit: boolean
}) {
    const supabase = createClient()
    const db = supabase as any
    const queryClient = useQueryClient()
    const confirm = useConfirm()
    const { data: currentUser } = useCurrentUser()
    const [roundChoice, setRoundChoice] = useState('')
    // The draft survives tab switches and theatre changes (see readDrafts),
    // and only its owner sees it (see draftsFor).
    const userId = currentUser?.id ?? null
    const [store, setStore] = useState<DraftStore>(readDrafts)
    useEffect(() => { writeDrafts(store) }, [store])
    const drafts = draftsFor(store, userId)
    /** Changes this officer's drafts; another officer's store is replaced, never merged. */
    const setDrafts = (change: (current: DraftStore) => DraftStore) => {
        if (!userId) return
        setStore(prev => ({ ...change(draftsFor(prev, userId)), owner: userId }))
    }
    const programChoice = drafts.programmes[theatreId] ?? ''

    const programmesQuery = useQuery({
        queryKey: victorRoutineKeys.programmes,
        queryFn: async () => {
            const [programmes, venues] = await Promise.all([
                db.from('programs').select('id, name, status, theatre_id, start_date, end_date').order('start_date', { ascending: false }),
                db.from('program_venues').select('program_id, theatre_id'),
            ])
            if (programmes.error) throw programmes.error
            return {
                programmes: (programmes.data ?? []) as Programme[],
                // Venue links are optional: without them the programme's own theatre is used.
                venues: (venues.error ? [] : venues.data ?? []) as { program_id: string; theatre_id: string }[],
            }
        },
        staleTime: 60_000,
    })

    // Today's programme at this theatre is the default (see rankProgrammes);
    // a programme held elsewhere is offered but never preselected.
    const { programmes, venueProgramIds } = useMemo(() => {
        const data = programmesQuery.data
        if (!data) return { programmes: [] as Programme[], venueProgramIds: new Set<string>() }
        const here = new Set(data.venues.filter(v => v.theatre_id === theatreId).map(v => v.program_id))
        return { programmes: rankProgrammes(data.programmes, theatreId, here), venueProgramIds: here }
    }, [programmesQuery.data, theatreId])
    const programId = defaultProgrammeId(programmes, theatreId, venueProgramIds, programChoice)
    const programme = programmes.find(p => p.id === programId) ?? null
    const programmeWhen = programme ? programmeTiming(programme, localDateKey()) : null
    const programmeElsewhere = programme ? !isProgrammeHere(programme, theatreId, venueProgramIds) : false

    const currentDraftKey = draftKey(theatreId, programId)
    const draft = drafts.rounds[currentDraftKey] ?? EMPTY_DRAFT
    const done = draft.done
    const notes = draft.notes
    const updateDraft = (change: (current: RoutineDraft) => RoutineDraft) =>
        setDrafts(prev => ({ ...prev, rounds: { ...prev.rounds, [currentDraftKey]: change(prev.rounds[currentDraftKey] ?? EMPTY_DRAFT) } }))
    const setDone = (next: Record<string, boolean>) => updateDraft(current => ({ ...current, done: next }))
    const setNotes = (next: string) => updateDraft(current => ({ ...current, notes: next }))
    const setProgramChoice = (value: string) =>
        setDrafts(prev => ({ ...prev, programmes: { ...prev.programmes, [theatreId]: value } }))
    const hasDraft = Object.values(done).some(Boolean) || notes.trim().length > 0

    const logsQuery = useQuery({
        queryKey: victorRoutineKeys.logs(theatreId, programId),
        enabled: Boolean(theatreId && programId),
        queryFn: async (): Promise<LogRow[]> => {
            const { data, error } = await db
                .from('den_checklist_logs')
                .select('id, session, checks, all_passed, notes, performed_by_name, performed_at, program_id')
                .eq('theatre_id', theatreId)
                // Older rounds were logged before programmes were recorded; show them in history too.
                .or(`program_id.eq.${programId},program_id.is.null`)
                .order('performed_at', { ascending: false })
                .limit(60)
            if (error) throw error
            return (data ?? []) as LogRow[]
        },
        staleTime: 30_000,
    })

    const logs = logsQuery.data ?? []
    // Until today's rounds have loaded, the count and the next round are unknown.
    const logsReady = logsQuery.isSuccess
    const summary = summariseRounds(logs, programId)
    const options = roundOptions(summary.rounds)
    const round = options.includes(roundChoice) ? roundChoice : summary.nextRound
    const checkedCount = VICTOR_ROUTINE_ITEMS.filter(item => done[item.key]).length
    const total = VICTOR_ROUTINE_ITEMS.length
    const allChecked = checkedCount === total

    const logMutation = useMutation({
        mutationFn: async () => {
            if (!currentUser?.id) throw new UserFacingError('Your profile is still loading. Try again in a moment.')
            if (!programId) throw new UserFacingError('Choose the programme this check belongs to.')
            if (!logsReady) throw new UserFacingError("Today's rounds are still loading. Try again in a moment.")
            const loggedKey = currentDraftKey
            const snapshot = buildChecksSnapshot(done)
            const { error } = await db.from('den_checklist_logs').insert({
                theatre_id: theatreId,
                program_id: programId,
                session: round,
                checks: snapshot,
                // The database recomputes all_passed, the time and the name.
                all_passed: snapshot.every(item => item.done),
                performed_by: currentUser.id,
                performed_by_name: currentUser.full_name || currentUser.email,
                notes: notes.trim() || null,
            })
            if (error) throw error
            return { round, loggedKey, allChecked: snapshot.every(item => item.done), count: snapshot.filter(item => item.done).length }
        },
        onSuccess: result => {
            setDrafts(prev => {
                const rounds = { ...prev.rounds }
                delete rounds[result.loggedKey]
                return { ...prev, rounds }
            })
            setRoundChoice('')
            toast.success(`${result.round} check logged`, {
                description: result.allChecked ? 'All clear' : `${result.count} of ${total} items done`,
            })
            void queryClient.invalidateQueries({ queryKey: victorRoutineKeys.logs(theatreId, programId) })
        },
        onError: error => {
            notifyError(error, 'The routine check could not be logged.')
        },
    })

    const submit = async () => {
        if (!allChecked) {
            const ok = await confirm({
                title: 'Log an incomplete round?',
                message: `${total - checkedCount} of ${total} items are not ticked. Log ${round} anyway? Add what is outstanding in the notes.`,
                confirmText: 'Log round',
            })
            if (!ok) return
        }
        logMutation.mutate()
    }

    const toggle = (key: string) => updateDraft(current => ({ ...current, done: { ...current.done, [key]: !current.done[key] } }))

    return (
        <Card className="overflow-hidden border-border/50" aria-label="Victor Routine Check">
            <CardHeader className="space-y-2 bg-gradient-to-r from-orange-500/5 to-transparent pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
                        <Theater className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                        Victor Routine Check
                        <Badge variant="secondary" className="font-mono text-[11px]">TCNP.01.09</Badge>
                    </CardTitle>
                    {programId && (
                        <div className="flex items-center gap-1.5" aria-live="polite">
                            {logsReady ? (
                                <>
                                    <span className="text-xs text-muted-foreground">{summary.count} of {MIN_ROUNDS} minimum rounds today</span>
                                    <Badge className={cn('text-[11px]', summary.complete ? 'border-green-500/30 bg-green-500/20 text-green-700 dark:text-green-400' : 'border-amber-500/30 bg-amber-500/20 text-amber-700 dark:text-amber-400')}>
                                        {summary.complete ? 'Minimum met' : 'In progress'}
                                    </Badge>
                                </>
                            ) : logsQuery.isError ? (
                                <Badge variant="outline" className="border-destructive/40 text-[11px] text-destructive">Rounds unavailable</Badge>
                            ) : (
                                <span role="status" aria-label="Loading today's rounds"><Skeleton className="h-5 w-40" /></span>
                            )}
                        </div>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    {theatreName}{programme ? ` · ${programme.name}` : ''}. Run before the operation and recheck at least {MIN_ROUNDS} times during it.
                </p>
                {summary.rounds.length > 0 && (
                    <ul className="flex flex-wrap gap-1" aria-label="Rounds logged today">
                        {summary.rounds.map(label => (
                            <li key={label} className="rounded border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 text-[11px] text-green-700 dark:text-green-400">
                                {label}
                            </li>
                        ))}
                    </ul>
                )}
            </CardHeader>

            <CardContent className="space-y-4 p-4">
                {programmesQuery.isError ? (
                    <ErrorState
                        title="We couldn't load the programmes"
                        onRetry={() => void programmesQuery.refetch()}
                        retrying={programmesQuery.isFetching}
                        className="py-6"
                    />
                ) : programmesQuery.isLoading ? (
                    <div className="space-y-2" role="status" aria-label="Loading routine check">
                        <Skeleton className="h-11 w-full" />
                        <Skeleton className="h-11 w-full" />
                        <Skeleton className="h-11 w-full" />
                    </div>
                ) : programmes.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                        There is no open programme yet. A routine check is logged against a programme (the operation), so Command needs to create one first.
                    </p>
                ) : (
                    <>
                        <div className="space-y-1.5">
                            <Label htmlFor="victor-routine-programme" className="text-xs">Programme</Label>
                            <Select value={programId ?? ''} onValueChange={value => { setProgramChoice(value); setRoundChoice('') }}>
                                <SelectTrigger id="victor-routine-programme" aria-label="Programme for the routine check" className="h-11 sm:h-10">
                                    <SelectValue placeholder="Choose a programme" />
                                </SelectTrigger>
                                <SelectContent>
                                    {programmes.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{TIMING_SUFFIX[programmeTiming(p, localDateKey())]}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {!programId && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400" role="note">
                                    No open programme is linked to {theatreName}. Choose the operation you are covering.
                                </p>
                            )}
                            {programmeElsewhere && programme && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400" role="note">
                                    {programme.name} is not held at {theatreName}. Check it is the operation you are covering.
                                </p>
                            )}
                            {programmeWhen && programmeWhen !== 'today' && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400" role="note">
                                    This programme is not scheduled for today. Check it is the operation you are covering.
                                </p>
                            )}
                        </div>

                        {canSubmit ? (
                            <form
                                className="space-y-3"
                                onSubmit={event => { event.preventDefault(); void submit() }}
                                aria-label={`Log ${round} for ${theatreName}`}
                            >
                                <fieldset className="space-y-1.5">
                                    <legend className="mb-1.5 text-xs font-medium">Round</legend>
                                    {!programId ? (
                                        <p className="text-xs text-muted-foreground">Choose the programme above to see today&apos;s rounds.</p>
                                    ) : !logsReady ? (
                                        logsQuery.isError ? (
                                            <p className="text-xs text-destructive">We couldn&apos;t load today&apos;s rounds. Retry the history below before logging, so you log the right round.</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5" role="status" aria-label="Loading today's rounds">
                                                {Array.from({ length: MIN_ROUNDS }, (_, index) => <Skeleton key={index} className="h-11 w-24 sm:h-9" />)}
                                            </div>
                                        )
                                    ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {options.map(label => {
                                            const logged = summary.rounds.includes(label)
                                            return (
                                                <button
                                                    key={label}
                                                    type="button"
                                                    aria-pressed={round === label}
                                                    aria-label={logged ? `${label} (already logged today; log again as a recheck)` : label}
                                                    onClick={() => setRoundChoice(label)}
                                                    className={cn(
                                                        'min-h-11 rounded-md border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9',
                                                        round === label ? 'border-primary bg-primary text-primary-foreground' : 'border-border/40 bg-muted/30 hover:bg-muted/60',
                                                    )}
                                                >
                                                    {logged ? '✓ ' : ''}{label}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    )}
                                </fieldset>

                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground" aria-live="polite">{checkedCount} of {total} done</span>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setDone(allChecked ? {} : Object.fromEntries(VICTOR_ROUTINE_ITEMS.map(item => [item.key, true])))}>
                                        {allChecked ? 'Clear all' : 'Tick all'}
                                    </Button>
                                </div>

                                <ul className="space-y-1.5" aria-label="Routine check items">
                                    {VICTOR_ROUTINE_ITEMS.map((item, index) => {
                                        const checked = done[item.key] === true
                                        return (
                                            <li key={item.key}>
                                                <button
                                                    type="button"
                                                    role="checkbox"
                                                    aria-checked={checked}
                                                    onClick={() => toggle(item.key)}
                                                    className={cn(
                                                        'flex min-h-11 w-full items-start gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                        checked ? 'border-green-500/20 bg-green-500/5' : 'border-border/30 bg-muted/20 hover:bg-muted/50',
                                                    )}
                                                >
                                                    {checked
                                                        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                                                        : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                                                    <span className="min-w-0 flex-1">
                                                        <span className={cn('block leading-snug', checked ? 'text-muted-foreground' : 'text-foreground')}>
                                                            {index + 1}. {item.label}
                                                        </span>
                                                        <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.source}</span>
                                                    </span>
                                                </button>
                                            </li>
                                        )
                                    })}
                                </ul>

                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                    <div className={cn('h-full rounded-full transition-all', allChecked ? 'bg-green-500' : 'bg-orange-500')} style={{ width: `${(checkedCount / total) * 100}%` }} />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="victor-routine-notes" className="text-xs">Notes (optional)</Label>
                                    <Textarea
                                        id="victor-routine-notes"
                                        value={notes}
                                        maxLength={NOTES_MAX}
                                        onChange={event => setNotes(event.target.value)}
                                        placeholder="What is outstanding, who was contacted, security contact number…"
                                        className="min-h-20 text-base sm:text-sm"
                                    />
                                </div>

                                <p className="rounded-md border border-primary/20 bg-primary/5 p-2 text-xs" aria-live="polite">
                                    Logging{logsReady ? <> <span className="font-semibold">{round}</span></> : ''} for <span className="font-semibold">{programme?.name ?? 'no programme'}</span> at {theatreName}.
                                    {hasDraft && <span className="block text-[11px] text-muted-foreground">Draft kept while you check other tabs, until you log it.</span>}
                                </p>

                                <Button
                                    type="submit"
                                    pending={logMutation.isPending}
                                    disabled={checkedCount === 0 || !currentUser?.id || !programId || !logsReady}
                                    aria-label={logsReady && programme ? `Log ${round} for ${programme.name}, ${checkedCount} of ${total} items done` : undefined}
                                    className={cn('w-full', allChecked && 'bg-green-600 hover:bg-green-700')}
                                >
                                    {!logMutation.isPending && <ClipboardCheck aria-hidden="true" />}
                                    {logMutation.isPending ? 'Logging…' : !programId ? 'Choose a programme to log' : !logsReady ? (logsQuery.isError ? 'Load the rounds to log' : 'Loading rounds…') : `Log ${round} (${checkedCount}/${total})`}
                                </Button>
                            </form>
                        ) : (
                            <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                                Read only. Victor members and Command log routine checks.
                            </p>
                        )}

                        <section aria-label="Routine check history" className="space-y-2 border-t pt-3">
                            <h3 className="text-xs font-semibold">Recent rounds</h3>
                            {logsQuery.isError ? (
                                <ErrorState
                                    title="We couldn't load the rounds"
                                    onRetry={() => void logsQuery.refetch()}
                                    retrying={logsQuery.isFetching}
                                    className="py-6"
                                />
                            ) : logsQuery.isLoading ? (
                                <Skeleton className="h-16 w-full" />
                            ) : logs.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No rounds logged for this programme at {theatreName} yet.</p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {logs.map(log => {
                                        const checks = normaliseChecks(log.checks)
                                        const missing = checks.filter(item => !item.done)
                                        return (
                                            <li key={log.id} className="rounded-lg border p-2.5 text-xs">
                                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                                    <span className="font-medium">
                                                        {log.session}
                                                        {!log.program_id && <span className="ml-1 font-normal text-muted-foreground">(no programme)</span>}
                                                    </span>
                                                    <Badge variant="outline" className={cn('text-[11px]', log.all_passed ? 'border-green-500/30 text-green-700 dark:text-green-400' : 'border-amber-500/30 text-amber-700 dark:text-amber-400')}>
                                                        {log.all_passed ? 'All clear' : `${checks.length - missing.length}/${checks.length} done`}
                                                    </Badge>
                                                </div>
                                                <p className="mt-0.5 text-muted-foreground">
                                                    {formatLocalTime(log.performed_at)} · {log.performed_by_name || 'Unknown officer'}
                                                </p>
                                                {missing.length > 0 && (
                                                    <p className="mt-1 text-amber-700 dark:text-amber-400">Not done: {missing.map(item => item.label).join('; ')}</p>
                                                )}
                                                {log.notes && <p className="mt-1 whitespace-pre-wrap break-words">{log.notes}</p>}
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </section>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
