'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Radio, Timer, BookOpen, ChevronDown, ChevronUp,
    Play, Pause, RotateCcw, ClipboardList, PhoneCall
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SITREP_CODES } from '@/lib/constants/call-signs'
import Link from 'next/link'

// ─── SITREP Timer ────────────────────────────────────────────────────────────
function SitrepTimer() {
    const [seconds, setSeconds] = useState(0)
    const [running, setRunning] = useState(false)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const SITREP_INTERVAL = 15 * 60 // 15 minutes

    useEffect(() => {
        if (running) {
            intervalRef.current = setInterval(() => {
                setSeconds(s => {
                    const nextSec = s + 1
                    if (nextSec >= SITREP_INTERVAL) {
                        // Play a gentle alert by utilizing the browser notification API
                        if (typeof window !== 'undefined' && 'Notification' in window) {
                            try {
                                new Notification('SITREP Due', { body: '15 minutes elapsed — send your SITREP now.', icon: '/icon-192.png' })
                            } catch (_) { /* ignore */ }
                        }
                        return 0 // reset
                    }
                    return nextSec
                })
            }, 1000)
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }, [running])

    const remaining = SITREP_INTERVAL - seconds
    const mins = Math.floor(remaining / 60).toString().padStart(2, '0')
    const secs = (remaining % 60).toString().padStart(2, '0')
    const pctElapsed = (seconds / SITREP_INTERVAL) * 100
    const isCritical = remaining <= 120 // last 2 min

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">15-Min SITREP Timer</span>
                <Badge variant="outline" className="text-[9px] font-mono">SOP § SITREP</Badge>
            </div>

            {/* Countdown display */}
            <div className={cn(
                'rounded-xl p-4 text-center transition-all',
                isCritical && running ? 'bg-red-500/10 border border-red-500/30' : 'bg-muted/30 border border-border/40'
            )}>
                <div className={cn(
                    'text-4xl font-mono font-bold tracking-widest',
                    isCritical && running ? 'text-red-500 animate-pulse' : 'text-foreground'
                )}>
                    {mins}:{secs}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Time until next SITREP</p>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                    className={cn('h-full rounded-full transition-all', isCritical && running ? 'bg-red-500' : 'bg-primary')}
                    style={{ width: `${pctElapsed}%` }}
                />
            </div>

            <div className="flex gap-2">
                <Button size="sm" variant={running ? 'destructive' : 'default'} onClick={() => setRunning(!running)} className="flex-1 gap-1 text-xs">
                    {running ? <><Pause className="h-3 w-3" />Pause</> : <><Play className="h-3 w-3" />Start</>}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setSeconds(0); setRunning(false) }} className="gap-1 text-xs">
                    <RotateCcw className="h-3 w-3" />Reset
                </Button>
            </div>
        </div>
    )
}

// ─── Script viewer ────────────────────────────────────────────────────────────
type ScriptSection = { title: string; lines: string[] }

const RECEPTION_SCRIPT: ScriptSection[] = [
    {
        title: 'Arrival Welcome',
        lines: [
            '"Good [morning/evening/afternoon], [Sir/Ma], welcome to [City/Hotel Name]."',
            '"I\'m [Your Name], your Duty Officer for this visit."',
            '"Your room is ready. May I escort you?"',
        ]
    },
    {
        title: 'Room Briefing',
        lines: [
            '"Your room is on the [X] floor. Here is your key card."',
            '"Wi-Fi: [Network] / Password: [Password] — already loaded on your device."',
            '"Meals will be served at [time]. Room service is available."',
            '"I am stationed [location] and reachable at all times."',
        ]
    },
    {
        title: 'Schedule Update',
        lines: [
            '"Tomorrow\'s schedule: Breakfast at [time], departure at [time]."',
            '"I will be here [X] minutes before pickup. Please let me know your needs."',
        ]
    },
]

const DEPARTURE_SCRIPT: ScriptSection[] = [
    {
        title: 'Farewell at Eagle Square',
        lines: [
            '"[Sir/Ma], your flight [Flight No.] departs at [time]."',
            '"Check-in is open. Your bags have been tagged."',
            '"It has been an honour serving you. Safe travels!"',
        ]
    },
    {
        title: 'Closing',
        lines: [
            '"Please send my regards to [family/leadership]."',
            '"We await your next visit — God bless!"',
        ]
    },
]

function ScriptViewer({ title, sections, color }: { title: string; sections: ScriptSection[]; color: string }) {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <div className={cn('rounded-xl border overflow-hidden', isOpen ? `border-${color}-500/30` : 'border-border/40')}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <BookOpen className={cn('h-4 w-4', `text-${color}-500`)} />
                    <span className="text-sm font-medium">{title}</span>
                </div>
                {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {isOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-border/40">
                    {sections.map((section, si) => (
                        <div key={si} className="mt-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{section.title}</p>
                            <div className="space-y-2">
                                {section.lines.map((line, li) => (
                                    <p key={li} className="text-xs bg-muted/30 rounded-md px-3 py-2 border border-border/30 leading-relaxed italic text-foreground/90">
                                        {line}
                                    </p>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export default function DOHelpPanel() {
    return (
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-base">
                        <Radio className="h-4 w-4 text-amber-500" />
                        DO Quick Reference
                    </div>
                    <Link href="/sop#delta-oscar" className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                        <ClipboardList className="h-3 w-3" />Full SOP
                    </Link>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* SITREP Timer */}
                <SitrepTimer />

                <div className="border-t border-border/30 pt-3 space-y-2">
                    {/* Reception Script */}
                    <ScriptViewer title="Reception Briefing Script" sections={RECEPTION_SCRIPT} color="amber" />
                    {/* Departure Script */}
                    <ScriptViewer title="Farewell / Departure Script" sections={DEPARTURE_SCRIPT} color="blue" />
                </div>

                {/* SITREP Codes quick ref — complete glossary per SOP TCNP.01.05 */}
                <div className="rounded-xl border border-border/40 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <PhoneCall className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-semibold">SITREP Call Signs</span>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-mono">SOP TCNP.01.05</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Report to Command every 15 minutes in transit.</p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {SITREP_CODES.map(({ code, meaning, kind }) => (
                            <div
                                key={code}
                                className={cn(
                                    'flex flex-col rounded-lg px-2 py-1.5 border',
                                    kind === 'emergency'
                                        ? 'bg-destructive/10 border-destructive/40'
                                        : kind === 'broadcast'
                                            ? 'bg-sky-500/10 border-sky-500/30'
                                            : 'bg-muted/30 border-border/30'
                                )}
                            >
                                <span className={cn(
                                    'text-[10px] font-mono font-bold',
                                    kind === 'emergency' ? 'text-destructive' : kind === 'broadcast' ? 'text-sky-600 dark:text-sky-400' : 'text-primary'
                                )}>
                                    {kind === 'emergency' ? '⚠ ' : ''}{code}
                                </span>
                                <span className="text-[9px] text-muted-foreground leading-snug">{meaning}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
