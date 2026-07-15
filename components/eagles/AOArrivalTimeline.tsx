'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Circle, Plane, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

// SOP: AO prepares across 5 countdown milestones before each Papa arrival
interface Milestone {
    label: string
    deadline: string
    tasks: string[]
}

const ARRIVAL_MILESTONES: Milestone[] = [
    {
        label: '2 Weeks Out',
        deadline: '14 days before ETA',
        tasks: [
            'Confirm Papa\'s flight details and itinerary',
            'Coordinate with Command Centre on arrival program',
            'Confirm airport parking / Cheetah parking bay',
            'Liaise with immigration/customs contacts if needed',
        ],
    },
    {
        label: '24 Hours Out',
        deadline: '24 hrs before ETA',
        tasks: [
            'Reconfirm flight status (no delays / reroutes)',
            'Confirm Cheetahs are fuelled and FLOWER-checked',
            'Brief all AOs on assigned positions at Eagle Square',
            'Confirm NO is briefed on room readiness (Nest)',
        ],
    },
    {
        label: '12 Hours Out',
        deadline: '12 hrs before ETA',
        tasks: [
            'Confirm baggage tagging arrangements',
            'Verify at least 2 AOs are scheduled for Eagle Square',
            'Confirm DO assignment and SITREP cadence with Command',
            'Test communication devices — radios and phones',
        ],
    },
    {
        label: '6 Hours Out',
        deadline: '6 hrs before ETA',
        tasks: [
            'Final parking confirmation at Eagle Square',
            'Brief Cheetah driver on pick-up routing',
            'Confirm Echo Oscar has mics and equipment ready',
        ],
    },
    {
        label: '2 Hours Out',
        deadline: '2 hrs before ETA',
        tasks: [
            'AOs in position at Eagle Square',
            'Cheetah(s) at designated bay with driver on standby',
            'Begin live SITREP with Command Centre — First Course',
            'DO on ground and in contact with all Oscars',
        ],
    },
]

export default function AOArrivalTimeline({ papaNme }: { papaNme?: string }) {
    const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set())
    const [expandedMilestone, setExpandedMilestone] = useState<number | null>(null)

    const totalTasks = ARRIVAL_MILESTONES.reduce((sum, m) => sum + m.tasks.length, 0)
    const completedCount = completedTasks.size
    const pct = Math.round((completedCount / totalTasks) * 100)

    const toggleTask = (milestoneIdx: number, taskIdx: number) => {
        const key = `${milestoneIdx}-${taskIdx}`
        setCompletedTasks(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
    }

    const milestoneComplete = (idx: number) =>
        ARRIVAL_MILESTONES[idx].tasks.every((_, ti) => completedTasks.has(`${idx}-${ti}`))

    return (
        <Card className="border-border/50 overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-r from-sky-500/5 to-transparent">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <Plane className="h-4 w-4 text-sky-500" />
                        Pre-Arrival Timeline
                        <Badge variant="secondary" className="text-[9px] font-mono">TCNP.01.06</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-muted-foreground">{completedCount}/{totalTasks}</span>
                        <Badge className={cn('text-[9px]', pct === 100 ? 'bg-green-500/20 text-green-600 border-green-500/30' : 'bg-sky-500/20 text-sky-600 border-sky-500/30')}>
                            {pct}%
                        </Badge>
                    </div>
                </div>
                {papaNme && <p className="text-[10px] text-muted-foreground mt-0.5">For: <span className="font-medium text-foreground">{papaNme}</span></p>}
            </CardHeader>
            <CardContent className="p-4 space-y-2">
                {/* Overall progress bar */}
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-3">
                    <div className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-sky-500')} style={{ width: `${pct}%` }} />
                </div>

                {ARRIVAL_MILESTONES.map((milestone, mi) => {
                    const isExpanded = expandedMilestone === mi
                    const isDone = milestoneComplete(mi)
                    const tasksDone = milestone.tasks.filter((_, ti) => completedTasks.has(`${mi}-${ti}`)).length

                    return (
                        <div key={mi} className={cn('rounded-xl border overflow-hidden transition-all', isDone ? 'border-green-500/30' : 'border-border/40')}>
                            <button
                                type="button"
                                onClick={() => setExpandedMilestone(isExpanded ? null : mi)}
                                className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
                            >
                                <div className={cn('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold border', isDone ? 'bg-green-500 border-green-500 text-white' : 'bg-muted border-border text-muted-foreground')}>
                                    {isDone ? '✓' : mi + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold">{milestone.label}</span>
                                        {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-[10px] text-muted-foreground">{milestone.deadline}</span>
                                        <span className="text-[10px] text-muted-foreground ml-auto">{tasksDone}/{milestone.tasks.length}</span>
                                    </div>
                                </div>
                            </button>
                            {isExpanded && (
                                <div className="border-t border-border/30 p-3 space-y-1.5">
                                    {milestone.tasks.map((task, ti) => {
                                        const key = `${mi}-${ti}`
                                        const done = completedTasks.has(key)
                                        return (
                                            <button
                                                key={ti}
                                                type="button"
                                                onClick={() => toggleTask(mi, ti)}
                                                className={cn('w-full flex items-start gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-all', done ? 'bg-green-500/5 border-green-500/20' : 'bg-muted/20 border-border/30 hover:bg-muted/50')}
                                            >
                                                {done ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />}
                                                <span className={cn('leading-snug', done ? 'text-muted-foreground line-through' : 'text-foreground')}>{task}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
                <p className="text-[10px] text-muted-foreground text-center pt-1">Progress is local — reload resets. Log important confirmations in Team Chat.</p>
            </CardContent>
        </Card>
    )
}
