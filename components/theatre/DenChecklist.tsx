'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, ClipboardCheck, AlertTriangle, Theater } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Per SOP: The Den facility checklist must be run 4× per day
const DEN_ITEMS = [
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

const TIMES_OF_DAY = ['Pre-Program (Morning)', 'Mid-Morning', 'Afternoon', 'Pre-Event (Evening)']

export default function DenChecklist({ theatreId, theatreName }: { theatreId: string; theatreName: string }) {
    const supabase = createClient()
    const [checks, setChecks] = useState<boolean[]>(Array(DEN_ITEMS.length).fill(false))
    const [session, setSession] = useState<string>(TIMES_OF_DAY[0])
    const [saving, setSaving] = useState(false)
    const [todayLogs, setTodayLogs] = useState<{ session: string; all_passed: boolean; officer_name: string; performed_at: string }[]>([])

    useEffect(() => {
        const load = async () => {
            const today = new Date().toISOString().split('T')[0]
            const { data } = await (supabase as any)
                .from('den_checklist_logs')
                .select('session, all_passed, performed_by_name, performed_at')
                .eq('theatre_id', theatreId)
                .gte('performed_at', `${today}T00:00:00Z`)
                .order('performed_at', { ascending: false })

            if (data) setTodayLogs(data.map((d: any) => ({
                session: d.session,
                all_passed: d.all_passed,
                officer_name: d.performed_by_name,
                performed_at: d.performed_at,
            })))
        }
        void load()
    }, [theatreId, supabase])

    const checkedCount = checks.filter(Boolean).length
    const allChecked = checkedCount === DEN_ITEMS.length

    const handleSubmit = async () => {
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')
            const { data: ud } = await supabase.from('users').select('full_name').eq('id', user.id).single()

            await (supabase as any).from('den_checklist_logs').insert([{
                theatre_id: theatreId,
                session,
                checks,
                all_passed: allChecked,
                performed_by: user.id,
                performed_by_name: ud?.full_name || user.email,
                performed_at: new Date().toISOString(),
            }])

            setTodayLogs(prev => [{
                session,
                all_passed: allChecked,
                officer_name: ud?.full_name || 'You',
                performed_at: new Date().toISOString(),
            }, ...prev])
            setChecks(Array(DEN_ITEMS.length).fill(false))
            toast.success(`Den checklist logged: ${session}`, { description: allChecked ? 'All clear ✓' : `${checkedCount}/${DEN_ITEMS.length} items checked` })
        } catch (err: any) {
            toast.error(err.message || 'Failed to save')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card className="border-border/50 overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-r from-orange-500/5 to-transparent">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <Theater className="h-4 w-4 text-orange-500" />
                        Den Facility Checklist
                        <Badge variant="secondary" className="text-[9px] font-mono">TCNP.01.09</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{todayLogs.length}/4 today</span>
                        <Badge className={cn('text-[9px]', todayLogs.length >= 4 ? 'bg-green-500/20 text-green-600 border-green-500/30' : 'bg-amber-500/20 text-amber-600 border-amber-500/30')}>
                            {todayLogs.length >= 4 ? '✓ Complete' : 'In Progress'}
                        </Badge>
                    </div>
                </div>
                {/* Today's log badges */}
                {todayLogs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                        {TIMES_OF_DAY.map(t => {
                            const done = todayLogs.find(l => l.session === t)
                            return (
                                <span key={t} className={cn('text-[9px] rounded px-1.5 py-0.5 border', done ? 'bg-green-500/10 border-green-500/20 text-green-600' : 'bg-muted/30 border-border/30 text-muted-foreground')}>
                                    {done ? '✓' : '○'} {t.split(' ')[0]}
                                </span>
                            )
                        })}
                    </div>
                )}
            </CardHeader>
            <CardContent className="p-4 space-y-3">
                {/* Session selector */}
                <div className="flex flex-wrap gap-1.5">
                    {TIMES_OF_DAY.map(t => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setSession(t)}
                            className={cn('text-[10px] rounded-md px-2 py-1 border transition-all', session === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/30 border-border/40 hover:bg-muted/60')}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-border/40 [&::-webkit-scrollbar-thumb]:rounded">
                    {DEN_ITEMS.map((item, idx) => {
                        const checked = checks[idx]
                        return (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => setChecks(prev => prev.map((v, i) => i === idx ? !v : v))}
                                className={cn('w-full flex items-start gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-all', checked ? 'bg-green-500/5 border-green-500/20' : 'bg-muted/20 border-border/30 hover:bg-muted/50')}
                            >
                                {checked ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />}
                                <span className={cn('leading-snug', checked ? 'text-muted-foreground line-through' : 'text-foreground')}>{item}</span>
                            </button>
                        )
                    })}
                </div>

                {/* Progress */}
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', allChecked ? 'bg-green-500' : 'bg-orange-500')} style={{ width: `${(checkedCount / DEN_ITEMS.length) * 100}%` }} />
                </div>

                <Button size="sm" onClick={handleSubmit} disabled={saving || checkedCount === 0} className={cn('w-full gap-1 text-xs', allChecked ? 'bg-green-600 hover:bg-green-700' : '')}>
                    <ClipboardCheck className="h-3 w-3" />
                    {saving ? 'Logging...' : `Log ${session} Check (${checkedCount}/${DEN_ITEMS.length})`}
                </Button>
            </CardContent>
        </Card>
    )
}
