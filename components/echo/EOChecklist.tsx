'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, ClipboardCheck, AlertTriangle, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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

export default function EOChecklist({ programId, programName }: { programId: string; programName: string }) {
    const supabase = createClient()
    const [checks, setChecks] = useState<boolean[]>(Array(EO_ITEMS.length).fill(false))
    const [saving, setSaving] = useState(false)
    const [lastLog, setLastLog] = useState<{ performed_at: string; officer_name: string } | null>(null)

    useEffect(() => {
        if (!programId) return
        const load = async () => {
            const { data } = await (supabase as any)
                .from('eo_checklist_logs')
                .select('performed_at, performed_by_name, checks')
                .eq('program_id', programId)
                .order('performed_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (data) {
                setLastLog({ performed_at: data.performed_at, officer_name: data.performed_by_name })
                if (Array.isArray(data.checks)) setChecks(data.checks)
            }
        }
        void load()
    }, [programId, supabase])

    const checkedCount = checks.filter(Boolean).length
    const allChecked = checkedCount === EO_ITEMS.length

    const handleToggle = (idx: number) => {
        setChecks(prev => prev.map((v, i) => i === idx ? !v : v))
    }

    const handleSubmit = async () => {
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')
            const { data: ud } = await supabase.from('users').select('full_name').eq('id', user.id).single()

            await (supabase as any).from('eo_checklist_logs').insert([{
                program_id: programId || null,
                checks,
                all_passed: allChecked,
                performed_by: user.id,
                performed_by_name: ud?.full_name || user.email,
                performed_at: new Date().toISOString(),
            }])

            setLastLog({ performed_at: new Date().toISOString(), officer_name: ud?.full_name || 'You' })
            toast.success('EO checklist logged', { description: allChecked ? 'All equipment cleared ✓' : `${checkedCount}/9 items checked` })
        } catch (err: any) {
            toast.error(err.message || 'Failed to save checklist')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card className="border-border/50 overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-r from-violet-500/5 to-transparent">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <Volume2 className="h-4 w-4 text-violet-500" />
                        EO Pre-Op Equipment Check
                        <Badge variant="secondary" className="text-[9px] font-mono">TCNP.01.10</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">{checkedCount}/{EO_ITEMS.length}</span>
                        {allChecked ? (
                            <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px]">
                                <CheckCircle2 className="h-3 w-3 mr-1" />Equipment Ready
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
                    </p>
                )}
                {programName && (
                    <Badge variant="outline" className="text-[10px] w-fit mt-1">{programName}</Badge>
                )}
            </CardHeader>
            <CardContent className="p-4 space-y-2">
                {EO_ITEMS.map((item, idx) => {
                    const checked = checks[idx]
                    return (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => handleToggle(idx)}
                            className={cn(
                                'w-full flex items-start gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-all',
                                checked
                                    ? 'bg-green-500/5 border-green-500/20'
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

                {/* Progress bar */}
                <div className="pt-1">
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                            className={cn('h-full rounded-full transition-all duration-500', allChecked ? 'bg-green-500' : 'bg-violet-500')}
                            style={{ width: `${(checkedCount / EO_ITEMS.length) * 100}%` }}
                        />
                    </div>
                </div>

                <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={saving || checkedCount === 0}
                    className={cn('w-full gap-1 text-xs', allChecked ? 'bg-green-600 hover:bg-green-700' : '')}
                >
                    <ClipboardCheck className="h-3 w-3" />
                    {saving ? 'Saving...' : `Log Equipment Check (${checkedCount}/${EO_ITEMS.length})`}
                </Button>
            </CardContent>
        </Card>
    )
}
