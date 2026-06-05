'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, ClipboardCheck, AlertTriangle, Hotel } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const COMFORT_ITEMS = [
    'What floor is the booked room located on? (Verify suitability)',
    'Are there any safety concerns with the room?',
    'Are there any health-related concerns with the room?',
    'Does the room and floor have a pleasant smell?',
    'Is the room well ventilated?',
    'Is the air-conditioning functioning?',
    'Are the conveniences (bathrooms) clean and functional?',
    'Is the water pressure from shower and faucet correct?',
    'Is the water pressure in the lavatory appropriate?',
    'Does the hotel provide working internet services?',
    'Is the mini-bar stocked?',
    'Have you checked the closets for left-overs / previous guest items?',
    'Is there a welcome note from the church available?',
    'Have accessories (flowers, welcome packs) been placed in the room?',
    'Is room service available for the guest?',
    'Can food be brought into the hotel?',
    'Does the room/hotel speak excellence (stains, smells, ambiance, reputation)?',
]

export default function ComfortChecklist({ nestId, nestName }: { nestId: string; nestName: string }) {
    const supabase = createClient()
    const [checks, setChecks] = useState<boolean[]>(Array(COMFORT_ITEMS.length).fill(false))
    const [saving, setSaving] = useState(false)
    const [lastLog, setLastLog] = useState<{ performed_at: string; officer_name: string; all_passed: boolean } | null>(null)

    useEffect(() => {
        const load = async () => {
            const { data } = await (supabase as any)
                .from('nest_comfort_logs')
                .select('performed_at, performed_by_name, checks, all_passed')
                .eq('nest_id', nestId)
                .order('performed_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (data) {
                setLastLog({ performed_at: data.performed_at, officer_name: data.performed_by_name, all_passed: data.all_passed })
                if (Array.isArray(data.checks)) setChecks(data.checks)
            }
        }
        void load()
    }, [nestId, supabase])

    const checkedCount = checks.filter(Boolean).length
    const allChecked = checkedCount === COMFORT_ITEMS.length

    const handleToggle = (idx: number) => {
        setChecks(prev => prev.map((v, i) => i === idx ? !v : v))
    }

    const handleSubmit = async () => {
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')
            const { data: ud } = await supabase.from('users').select('full_name').eq('id', user.id).single()

            await (supabase as any).from('nest_comfort_logs').insert([{
                nest_id: nestId,
                checks,
                all_passed: allChecked,
                performed_by: user.id,
                performed_by_name: ud?.full_name || user.email,
                performed_at: new Date().toISOString(),
            }])

            setLastLog({ performed_at: new Date().toISOString(), officer_name: ud?.full_name || 'You', all_passed: allChecked })
            toast.success(`Comfort checklist logged for ${nestName}`, { description: allChecked ? 'All 17 checks passed ✓' : `${checkedCount}/17 items checked` })
        } catch (err: any) {
            toast.error(err.message || 'Failed to save checklist')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card className="border-border/50 overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-r from-pink-500/5 to-transparent">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <Hotel className="h-4 w-4 text-pink-500" />
                        Cave Comfort Checklist
                        <Badge variant="secondary" className="text-[9px] font-mono">TCNP.01.07</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">{checkedCount}/{COMFORT_ITEMS.length}</span>
                        {allChecked ? (
                            <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px]">
                                <CheckCircle2 className="h-3 w-3 mr-1" />Cave Ready
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40">
                                <AlertTriangle className="h-3 w-3 mr-1" />Pending
                            </Badge>
                        )}
                    </div>
                </div>
                {lastLog && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                        Last checked by <span className="font-medium text-foreground">{lastLog.officer_name}</span> · {new Date(lastLog.performed_at).toLocaleString()}
                        {lastLog.all_passed && <span className="ml-1 text-green-600">✓ All clear</span>}
                    </p>
                )}
            </CardHeader>
            <CardContent className="p-4 space-y-2">
                <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-border/40 [&::-webkit-scrollbar-thumb]:rounded">
                    {COMFORT_ITEMS.map((item, idx) => {
                        const checked = checks[idx]
                        return (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => handleToggle(idx)}
                                className={cn(
                                    'w-full flex items-start gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-all',
                                    checked
                                        ? 'bg-green-500/5 border-green-500/20 text-foreground'
                                        : 'bg-muted/20 border-border/30 hover:bg-muted/50'
                                )}
                            >
                                {checked
                                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                                    : <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                }
                                <span className={cn('leading-snug', checked ? 'text-muted-foreground line-through' : 'text-foreground')}>{item}</span>
                            </button>
                        )
                    })}
                </div>

                {/* Progress bar */}
                <div className="pt-2">
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                            className={cn('h-full rounded-full transition-all duration-500', allChecked ? 'bg-green-500' : 'bg-primary')}
                            style={{ width: `${(checkedCount / COMFORT_ITEMS.length) * 100}%` }}
                        />
                    </div>
                </div>

                <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={saving || checkedCount === 0}
                    className={cn('w-full gap-1 text-xs mt-1', allChecked ? 'bg-green-600 hover:bg-green-700' : '')}
                >
                    <ClipboardCheck className="h-3 w-3" />
                    {saving ? 'Saving...' : `Log Comfort Check (${checkedCount}/${COMFORT_ITEMS.length})`}
                </Button>
            </CardContent>
        </Card>
    )
}
