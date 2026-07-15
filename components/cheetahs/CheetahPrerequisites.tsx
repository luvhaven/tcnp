'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, ClipboardCheck, Car } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// SOP: Every Cheetah must carry these prerequisites before any operation
const PREREQUISITES = [
    { item: 'Vanity Pack (tissues, wipes, extras)', category: 'Comfort' },
    { item: 'Chilled water bottles (min. 2)', category: 'Comfort' },
    { item: 'Umbrella(s) in boot', category: 'Weather' },
    { item: 'Mints / breath fresheners', category: 'Comfort' },
    { item: 'Music CD / media (principal preference)', category: 'Comfort' },
    { item: 'Radio / communication device charged', category: 'Comms' },
    { item: 'Torch (for night operations)', category: 'Safety' },
    { item: 'First aid kit is present', category: 'Safety' },
    { item: 'Cheetah interior clean (vacuumed, no odours)', category: 'Cleanliness' },
    { item: 'Air freshener / pleasant scent in cabin', category: 'Cleanliness' },
    { item: 'Temperature pre-set to principal\'s preference', category: 'Comfort' },
]

const CATEGORY_COLORS: Record<string, string> = {
    Comfort: 'text-blue-500',
    Weather: 'text-sky-500',
    Comms: 'text-purple-500',
    Safety: 'text-red-500',
    Cleanliness: 'text-green-500',
}

export default function CheetahPrerequisites({ cheetahId, cheetahCallSign }: { cheetahId: string; cheetahCallSign: string }) {
    const [checks, setChecks] = useState<boolean[]>(Array(PREREQUISITES.length).fill(false))

    const checkedCount = checks.filter(Boolean).length
    const allChecked = checkedCount === PREREQUISITES.length

    const handleConfirm = () => {
        if (!allChecked) {
            toast.warning(`${PREREQUISITES.length - checkedCount} items still unchecked`, { description: 'Ensure all prerequisites are loaded before departure.' })
        } else {
            toast.success(`${cheetahCallSign} prerequisites confirmed ✓`, { description: 'All pre-op items are loaded.' })
        }
    }

    return (
        <Card className="border-border/50 overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-r from-blue-500/5 to-transparent">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <Car className="h-4 w-4 text-blue-500" />
                        Cheetah Prerequisites
                        <Badge variant="secondary" className="text-[9px] font-mono">Pre-Op</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground font-mono">{checkedCount}/{PREREQUISITES.length}</span>
                        {allChecked && <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[9px]">✓ Ready</Badge>}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
                {PREREQUISITES.map((p, idx) => {
                    const checked = checks[idx]
                    return (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => setChecks(prev => prev.map((v, i) => i === idx ? !v : v))}
                            className={cn('w-full flex items-start gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-all', checked ? 'bg-green-500/5 border-green-500/20' : 'bg-muted/20 border-border/30 hover:bg-muted/50')}
                        >
                            {checked ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />}
                            <div className="flex-1 flex items-start justify-between gap-2">
                                <span className={cn('leading-snug', checked ? 'text-muted-foreground line-through' : 'text-foreground')}>{p.item}</span>
                                <span className={cn('text-[9px] font-mono flex-shrink-0', CATEGORY_COLORS[p.category] || 'text-muted-foreground')}>{p.category}</span>
                            </div>
                        </button>
                    )
                })}

                {/* Progress */}
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mt-1">
                    <div className={cn('h-full rounded-full transition-all', allChecked ? 'bg-green-500' : 'bg-blue-500')} style={{ width: `${(checkedCount / PREREQUISITES.length) * 100}%` }} />
                </div>

                <Button size="sm" onClick={handleConfirm} className={cn('w-full gap-1 text-xs mt-1', allChecked ? 'bg-green-600 hover:bg-green-700' : '')} variant={allChecked ? 'default' : 'outline'}>
                    <ClipboardCheck className="h-3 w-3" />
                    {allChecked ? 'All Items Loaded — Confirm' : `Confirm Load (${checkedCount}/${PREREQUISITES.length})`}
                </Button>
            </CardContent>
        </Card>
    )
}
