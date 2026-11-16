'use client'

import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, Circle, ClipboardCheck, AlertTriangle, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { notifyError, UserFacingError } from '@/lib/notify'
import { cn } from '@/lib/utils'

// ─── Singleton client ───
const supabase = createClient()

const EO_ITEMS = [
    'Mics are available with FULL battery power at Den',
    'Confirmed which mic is designated for the principal (from Command Centre)',
    'Signal confirmed with Mike Uniform — mic is seen and ready',
    'Backup handheld mic is available',
    'Umbrellas are placed at the Den (strategic locations)',
    'Umbrellas are in ALL Cheetahs',
    'Torches are available at Den, in each Cheetah, and with DOs (for night ops)',
    'Temporary communication devices for principal are working — tested at Den and in Cheetah',
    'Internet/Data/WiFi device is loaded, working, and fully charged at Den and in Cheetah',
]

export type EOChecklistProgram = { id: string; name: string; status: string }

const isOpenProgram = (program: EOChecklistProgram) => program.status === 'planning' || program.status === 'active'

/**
 * EO pre-op equipment check. The officer picks which programme the check is
 * for; it defaults to the single open (planning/active) programme when there
 * is exactly one, and otherwise waits for a choice.
 */
export default function EOChecklist({ programs }: { programs: EOChecklistProgram[] }) {
    const [chosenId, setChosenId] = useState<string | null>(null)

    const openPrograms = useMemo(() => programs.filter(isOpenProgram), [programs])
    const defaultId = openPrograms.length === 1 ? openPrograms[0].id : ''
    // A choice that no longer exists (programme deleted) falls back to the default.
    const programId = chosenId && programs.some(p => p.id === chosenId) ? chosenId : defaultId
    const program = programs.find(p => p.id === programId) ?? null

    // Open programmes first, then the rest; each group keeps the incoming (name) order.
    const ordered = useMemo(
        () => [...openPrograms, ...programs.filter(p => !isOpenProgram(p))],
        [openPrograms, programs],
    )

    return (
        <Card className="border-border/50 overflow-hidden min-w-0">
            {/* Not keyed by programme: the body resets itself when switching between
                two programmes, but keeps ticks made before the first choice. */}
            <ChecklistBody
                programId={programId}
                program={program}
                hasPrograms={programs.length > 0}
                picker={programs.length > 0 && (
                    <div className="mt-2 space-y-1">
                        <Label htmlFor="eo-checklist-program" className="text-xs text-muted-foreground">Programme</Label>
                        <Select value={programId} onValueChange={setChosenId}>
                            <SelectTrigger id="eo-checklist-program" className="h-9 w-full text-xs" aria-label="Programme for this equipment check">
                                <SelectValue placeholder="Choose a programme" />
                            </SelectTrigger>
                            <SelectContent>
                                {ordered.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name}{isOpenProgram(p) ? '' : ` (${p.status})`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            />
        </Card>
    )
}

function ChecklistBody({
    programId,
    program,
    hasPrograms,
    picker,
}: {
    programId: string
    program: EOChecklistProgram | null
    hasPrograms: boolean
    picker: ReactNode
}) {
    const [checks, setChecks] = useState<boolean[]>(Array(EO_ITEMS.length).fill(false))
    const [saving, setSaving] = useState(false)
    const [lastLog, setLastLog] = useState<{ performed_at: string; officer_name: string } | null>(null)
    const [prevProgramId, setPrevProgramId] = useState(programId)
    // The programme the current ticks belong to ('' while none has been chosen).
    const [checksFor, setChecksFor] = useState(programId)

    // On a programme change, the last log always belongs to the old programme, so drop it.
    // Ticks made before any programme was chosen are kept and adopted by the first choice;
    // ticks that belong to a different programme are cleared, even if the selection
    // passed through "none" on the way.
    if (programId !== prevProgramId) {
        setPrevProgramId(programId)
        setLastLog(null)
        if (programId && checksFor && checksFor !== programId) {
            setChecks(Array(EO_ITEMS.length).fill(false))
            setChecksFor(programId)
        } else if (programId && !checksFor) {
            setChecksFor(programId)
        }
    }

    useEffect(() => {
        if (!programId) return
        let cancelled = false
        const load = async () => {
            const { data } = await (supabase as any)
                .from('eo_checklist_logs')
                .select('performed_at, performed_by_name, checks')
                .eq('program_id', programId)
                .order('performed_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (cancelled || !data) return
            setLastLog({ performed_at: data.performed_at, officer_name: data.performed_by_name })
            // Pre-fill from the saved log only when nothing is ticked yet, so a check in progress is never overwritten.
            if (Array.isArray(data.checks)) setChecks(prev => prev.some(Boolean) ? prev : data.checks)
        }
        void load()
        return () => { cancelled = true }
    }, [programId])

    const checkedCount = checks.filter(Boolean).length
    const allChecked = checkedCount === EO_ITEMS.length
    // With programmes to choose from, a check must be logged against one of them.
    // With none at all, it can still be logged on its own, as before.
    const needsProgramme = hasPrograms && !programId

    const handleToggle = (idx: number) => {
        setChecks(prev => prev.map((v, i) => i === idx ? !v : v))
    }

    const handleSubmit = async () => {
        if (needsProgramme) {
            toast.error('Choose the programme this check is for')
            return
        }
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new UserFacingError('Not authenticated')
            const { data: ud } = await supabase.from('users').select('full_name').eq('id', user.id).single()

            const performedAt = new Date().toISOString()
            const { error } = await (supabase as any).from('eo_checklist_logs').insert([{
                program_id: programId || null,
                checks,
                all_passed: allChecked,
                performed_by: user.id,
                performed_by_name: ud?.full_name || user.email,
                performed_at: performedAt,
            }])
            if (error) throw error

            setLastLog({ performed_at: performedAt, officer_name: ud?.full_name || 'You' })
            toast.success('EO checklist logged', {
                description: `${program ? `${program.name} · ` : ''}${allChecked ? 'All equipment cleared ✓' : `${checkedCount}/${EO_ITEMS.length} items checked`}`,
            })
        } catch (err: any) {
            notifyError(err, 'Failed to save checklist')
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-transparent">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
                        <Volume2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        EO Pre-Op Equipment Check
                        <Badge variant="secondary" className="text-[11px] font-mono">TCNP.01.10</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">{checkedCount}/{EO_ITEMS.length}</span>
                        {allChecked ? (
                            <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden="true" />Equipment Ready
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/40">
                                <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />Pending
                            </Badge>
                        )}
                    </div>
                </div>
                {picker}
                {lastLog && (
                    <p className="text-xs text-muted-foreground mt-1">
                        Last checked by <span className="font-medium text-foreground">{lastLog.officer_name}</span> · {format(new Date(lastLog.performed_at), 'd MMM yyyy, h:mm a')}
                    </p>
                )}
                {!hasPrograms && (
                    <p className="text-xs text-muted-foreground mt-1">No programmes yet — this check will be logged without one.</p>
                )}
            </CardHeader>
            <CardContent className="p-4 space-y-2">
                {EO_ITEMS.map((item, idx) => {
                    const checked = checks[idx]
                    return (
                        <button
                            key={idx}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => handleToggle(idx)}
                            className={cn(
                                'w-full flex items-start gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-all',
                                checked
                                    ? 'bg-green-500/5 border-green-500/20'
                                    : 'bg-muted/20 border-border/30 hover:bg-muted/50'
                            )}
                        >
                            {checked
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                                : <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden="true" />
                            }
                            <span className={cn('leading-snug', checked ? 'text-muted-foreground line-through' : 'text-foreground')}>{item}</span>
                        </button>
                    )
                })}

                {/* Progress bar */}
                <div className="pt-1">
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                            className={cn('h-full rounded-full transition-all duration-500', allChecked ? 'bg-green-500' : 'bg-primary')}
                            style={{ width: `${(checkedCount / EO_ITEMS.length) * 100}%` }}
                        />
                    </div>
                </div>

                {needsProgramme && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">Choose the programme this check is for before logging it.</p>
                )}
                <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={saving || checkedCount === 0 || needsProgramme}
                    className={cn('w-full gap-1 text-xs', allChecked ? 'bg-green-600 hover:bg-green-700' : '')}
                >
                    <ClipboardCheck className="h-3 w-3" aria-hidden="true" />
                    {saving ? 'Saving...' : `Log Equipment Check (${checkedCount}/${EO_ITEMS.length})`}
                </Button>
            </CardContent>
        </>
    )
}
