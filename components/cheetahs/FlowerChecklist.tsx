'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, ClipboardCheck, AlertTriangle, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const FLOWER_ITEMS = [
    { key: 'F', letter: 'F', label: 'Fuel', description: 'Ascertain fuel consumption — tank should be full or near full before any operation.' },
    { key: 'L', letter: 'L', label: 'Light', description: 'Ensure all lights are functioning. Replace any blown bulbs before departure.' },
    { key: 'O', letter: 'O', label: 'Oil', description: 'Confirm engine oil levels are optimal. Check the dipstick.' },
    { key: 'W', letter: 'W', label: 'Water', description: 'Ascertain water consumption, check for coolant leaks, confirm windshield washer fluid is topped up.' },
    { key: 'E', letter: 'E', label: 'Electrics', description: 'Ensure no electrical faults. Confirm battery is optimal. Start and run the car in stationary position.' },
    { key: 'R', letter: 'R', label: 'Rubber', description: 'Inspect all 4 tyres + spare. Ensure they are within shelf life and correctly pressurized.' },
]

interface ChecklistState {
    F: boolean; L: boolean; O: boolean; W: boolean; E: boolean; R: boolean
}

export default function FlowerChecklist({ cheetahId, cheetahCallSign }: { cheetahId: string; cheetahCallSign: string }) {
    const supabase = createClient()
    const [checks, setChecks] = useState<ChecklistState>({ F: false, L: false, O: false, W: false, E: false, R: false })
    const [saving, setSaving] = useState(false)
    const [lastLog, setLastLog] = useState<{ performed_at: string; officer_name: string } | null>(null)

    useEffect(() => {
        // Load last FLOWER log for this cheetah
        const load = async () => {
            const { data } = await (supabase as any)
                .from('cheetah_flower_logs')
                .select('performed_at, performed_by_name, checks')
                .eq('cheetah_id', cheetahId)
                .order('performed_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (data) {
                setLastLog({ performed_at: data.performed_at, officer_name: data.performed_by_name })
                if (data.checks) setChecks(data.checks as ChecklistState)
            }
        }
        void load()
    }, [cheetahId, supabase])

    const allChecked = Object.values(checks).every(Boolean)
    const checkedCount = Object.values(checks).filter(Boolean).length

    const handleToggle = (key: keyof ChecklistState) => {
        setChecks(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const handleSubmit = async () => {
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')

            const { data: userData } = await supabase
                .from('users')
                .select('full_name')
                .eq('id', user.id)
                .single()

            await (supabase as any).from('cheetah_flower_logs').insert([{
                cheetah_id: cheetahId,
                checks,
                all_passed: allChecked,
                performed_by: user.id,
                performed_by_name: userData?.full_name || user.email,
                performed_at: new Date().toISOString(),
            }])

            setLastLog({ performed_at: new Date().toISOString(), officer_name: userData?.full_name || 'You' })
            toast.success(`FLOWER checklist logged for ${cheetahCallSign}`, { description: allChecked ? 'All checks passed ✓' : `${checkedCount}/6 items checked` })
        } catch (err: any) {
            toast.error(err.message || 'Failed to save checklist')
        } finally {
            setSaving(false)
        }
    }

    const handleReset = () => {
        setChecks({ F: false, L: false, O: false, W: false, E: false, R: false })
    }

    return (
        <Card className="border-border/50 overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-r from-teal-500/5 to-transparent">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <ClipboardCheck className="h-4 w-4 text-teal-500" />
                        FLOWER Pre-Op Checklist
                        <Badge variant="secondary" className="text-[9px] font-mono">TCNP.01.05</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">{checkedCount}/6</span>
                        {allChecked ? (
                            <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px]">
                                <CheckCircle2 className="h-3 w-3 mr-1" />All Clear
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
                        Last logged by <span className="font-medium text-foreground">{lastLog.officer_name}</span> · {new Date(lastLog.performed_at).toLocaleString()}
                    </p>
                )}
            </CardHeader>
            <CardContent className="p-4 space-y-2">
                {FLOWER_ITEMS.map((item) => {
                    const checked = checks[item.key as keyof ChecklistState]
                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => handleToggle(item.key as keyof ChecklistState)}
                            className={cn(
                                'w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-all',
                                checked
                                    ? 'bg-green-500/5 border-green-500/30 text-foreground'
                                    : 'bg-muted/30 border-border/40 hover:bg-muted/60'
                            )}
                        >
                            <div className={cn(
                                'flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center font-bold text-sm transition-colors',
                                checked ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
                            )}>
                                {item.letter}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={cn('text-sm font-semibold', checked ? 'text-green-700 dark:text-green-400' : 'text-foreground')}>
                                        {item.label}
                                    </span>
                                    {checked
                                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                        : <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    }
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{item.description}</p>
                            </div>
                        </button>
                    )
                })}

                <div className="flex gap-2 pt-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleReset}
                        className="gap-1 text-xs"
                        disabled={saving}
                    >
                        <RotateCcw className="h-3 w-3" />
                        Reset
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSubmit}
                        disabled={saving || checkedCount === 0}
                        className={cn('flex-1 gap-1 text-xs', allChecked ? 'bg-green-600 hover:bg-green-700' : '')}
                    >
                        <ClipboardCheck className="h-3 w-3" />
                        {saving ? 'Logging...' : `Log Check (${checkedCount}/6)`}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
