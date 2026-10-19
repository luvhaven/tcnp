"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  Loader2, Radio, Car, Clock, Crown, Shield, MessageSquare, Navigation, Sparkles,
  ChevronDown, ClipboardCheck, Images, CheckCircle2,
} from 'lucide-react'
import DOHelpPanel from '@/components/operations/DOHelpPanel'
import DOFeedbackForm from '@/components/operations/DOFeedbackForm'
import DOPresentationAssets from '@/components/operations/DOPresentationAssets'
import CurrentMissionCard from '@/components/operations/CurrentMissionCard'
import MissionStrip from '@/components/operations/MissionStrip'
import ConnectionStatusPill from '@/components/operations/ConnectionStatusPill'
import CheetahPrerequisites from '@/components/cheetahs/CheetahPrerequisites'
import FlowerChecklist from '@/components/cheetahs/FlowerChecklist'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CallSignChip } from '@/components/ui/call-sign-chip'
import { notificationService } from '@/lib/services/notificationService'
import { useMyOperations, isOwnAssignment, type ActiveProgram, type OpsJourney } from '@/hooks/useMyOperations'
import { cn } from '@/lib/utils'

const TERMINAL = ['completed', 'cancelled']

// ─── Component ────────────────────────────────────────────────────────────────

export default function MyOperationsPage() {
  const {
    loading, journeys, activePrograms, completedAssignments, submittedReportIds,
    userId, userRole, isAdminUser, liveState,
    reload, patchJourney, patchOwnDutyOfficer, markReportSubmitted,
  } = useMyOperations()
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string | null>(null)

  const myAssigned = useMemo(() => journeys.filter(j => isOwnAssignment(j, userId)), [journeys, userId])
  const programFeed = useMemo(() => journeys.filter(j => !myAssigned.some(a => a.id === j.id)), [journeys, myAssigned])
  const upcoming = useMemo(() => journeys.filter(j => j.status === 'planned').sort((a, b) =>
    new Date(a.etd ?? a.scheduled_departure ?? 0).getTime() - new Date(b.etd ?? b.scheduled_departure ?? 0).getTime()
  ), [journeys])
  const pendingReports = completedAssignments.filter(j => !submittedReportIds.has(j.id))
  const submittedReports = completedAssignments.filter(j => submittedReportIds.has(j.id))

  // Selection always resolves to one of the officer's OWN active journeys —
  // a stale id (completed, reassigned, or a Program Feed row) falls back to the
  // first assignment instead of rendering an empty panel.
  const selected = myAssigned.find(j => j.id === selectedJourneyId) ?? myAssigned[0] ?? null

  // ── Reminder engine ─────────────────────────────────────────────────────
  // Fires once per journey per threshold, on the first check at or below it.
  // An exact one-minute window (the old approach) was skipped whenever the
  // phone slept or the tab was throttled through that minute.
  const firedReminders = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!userId || myAssigned.length === 0) return
    const check = () => {
      const now = Date.now()
      for (const j of myAssigned) {
        if (TERMINAL.includes(j.status)) continue
        const papa = j.papas ? `${j.papas.title} ${j.papas.full_name}` : 'Papa'
        const route = `${j.origin} → ${j.destination}`
        const fire = (key: string, title: string) => {
          if (firedReminders.current.has(key)) return
          firedReminders.current.add(key)
          toast.warning(title, { description: `${papa}: ${route}`, duration: 15000 })
          void notificationService.showNotification({ title, body: `${papa}: ${route}`, tag: key, requireInteraction: true })
          void fetch('/api/notifications/journey-reminder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ journey_id: j.id, type: key }),
          }).catch(() => { /* non-critical */ })
        }
        const check = (iso: string | null, kind: 'dep' | 'arr', verb: string) => {
          if (!iso) return
          const mins = (new Date(iso).getTime() - now) / 60000
          // Don't announce a departure that is long past (page opened late)
          if (Number.isNaN(mins) || mins < -10) return
          if (mins <= 5) {
            firedReminders.current.add(`${j.id}:${kind}:15`) // superseded
            fire(`${j.id}:${kind}:5`, `🚨 ${verb} in ${Math.max(0, Math.round(mins))} min!`)
          } else if (mins <= 15) {
            fire(`${j.id}:${kind}:15`, `⏰ ${verb} in ${Math.round(mins)} minutes`)
          }
        }
        if (j.status === 'planned') check(j.etd ?? j.scheduled_departure, 'dep', 'Departing')
        else check(j.eta ?? j.scheduled_arrival, 'arr', 'Arriving')
      }
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [myAssigned, userId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-label="Loading operations">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const tabs = [
    ...(programFeed.length > 0 || isAdminUser ? ['program'] : []),
    ...(upcoming.length > 0 ? ['upcoming'] : []),
    ...(completedAssignments.length > 0 ? ['postop'] : []),
  ]
  // Pending post-op reports are the officer's outstanding duty — open there first
  const defaultTab = pendingReports.length > 0 && myAssigned.length === 0 ? 'postop' : tabs[0]
  const currentTab = activeTab && tabs.includes(activeTab) ? activeTab : defaultTab
  const selectedIsLive = !!selected && !TERMINAL.includes(selected.status)
  const canUpdateSelected = !!selected // only own assignments are ever selected

  return (
    <div className={cn('space-y-5', selectedIsLive && 'pb-32 md:pb-0')}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My Operations</h1>
          <p className="text-sm text-muted-foreground">
            {isAdminUser ? 'Full operational view — leadership override enabled' : 'Your assignments, updates and journey reminders'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionStatusPill state={liveState} />
          {isAdminUser && (
            <Badge className="border border-primary/30 bg-primary/20 text-primary">
              <Shield className="mr-1 h-3 w-3" aria-hidden />Leadership
            </Badge>
          )}
        </div>
      </div>

      {/* ── Current mission — always first ─────────────────────────────── */}
      {myAssigned.length > 1 && (
        <MissionStrip journeys={myAssigned} selectedId={selected?.id ?? null} onSelect={setSelectedJourneyId} />
      )}

      {selected ? (
        <CurrentMissionCard
          key={selected.id}
          journey={selected}
          currentUserId={userId}
          onChanged={() => { void reload() }}
          onStatusPatched={(status) => patchJourney(selected.id, { status, status_updated_at: new Date().toISOString() })}
          onAcknowledged={(patch) => patchOwnDutyOfficer(selected.id, patch)}
        />
      ) : (
        <Card className="bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <Radio className="mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
            <h2 className="mb-1 text-lg font-semibold">No active mission</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {activePrograms.length > 0
                ? <>You are deployed to <strong>{activePrograms[0].name}</strong> as <strong>{activePrograms[0].assigned_title || 'Protocol Officer'}</strong>. Journey assignments will appear here once scheduled.</>
                : 'You have no active journey assignments. Contact your Tango Oscar or Captain to receive an assignment.'}
            </p>
            {pendingReports.length > 0 && (
              <Button variant="outline" className="mt-4 min-h-11" onClick={() => setActiveTab('postop')}>
                {pendingReports.length} post-op report{pendingReports.length === 1 ? '' : 's'} due
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Supporting material, collapsed until needed ────────────────── */}
      {selected && canUpdateSelected && selected.status === 'planned' && selected.cheetahs?.id && (
        <Section title="Pre-op checklists" icon={ClipboardCheck}>
          <div className="grid gap-4 md:grid-cols-2">
            <CheetahPrerequisites
              cheetahId={selected.cheetahs.id}
              cheetahCallSign={selected.cheetahs.call_sign ?? selected.cheetahs.registration_number}
            />
            <FlowerChecklist
              cheetahId={selected.cheetahs.id}
              cheetahCallSign={selected.cheetahs.call_sign ?? selected.cheetahs.registration_number}
            />
          </div>
        </Section>
      )}

      {selected?.papa_id && (
        <Section title="Presentation assets" icon={Images}>
          <DOPresentationAssets
            papaId={selected.papa_id}
            programId={selected.program_id}
            papaName={selected.papas?.full_name || 'the Papa'}
            canUpload={canUpdateSelected}
          />
        </Section>
      )}

      {(userRole === 'delta_oscar' || myAssigned.length > 0) && <DOHelpPanel />}

      {activePrograms.length > 0 && (
        <div className="space-y-2">
          {activePrograms.map(prog => <ProgramSummary key={prog.id} program={prog} />)}
        </div>
      )}

      {/* ── Feeds and reports ───────────────────────────────────────────── */}
      {tabs.length > 0 && currentTab && (
        <Tabs value={currentTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="h-auto flex-wrap">
            {tabs.includes('program') && (
              <TabsTrigger value="program" className="min-h-10 text-sm">
                Program Feed
                {programFeed.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{programFeed.length}</Badge>}
              </TabsTrigger>
            )}
            {tabs.includes('upcoming') && (
              <TabsTrigger value="upcoming" className="min-h-10 text-sm">
                Upcoming
                <Badge variant="outline" className="ml-1 h-5 px-1.5 text-xs">{upcoming.length}</Badge>
              </TabsTrigger>
            )}
            {tabs.includes('postop') && (
              <TabsTrigger value="postop" className="min-h-10 text-sm">
                Post-Op Report
                {pendingReports.length > 0 && (
                  <Badge variant="outline" className="ml-1 h-5 border-amber-500/40 px-1.5 text-xs text-amber-600">{pendingReports.length}</Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="program" className="space-y-3">
            <p className="text-sm text-muted-foreground">View-only feed of all journeys in your programs.</p>
            {(isAdminUser ? journeys : programFeed).map(j => <JourneyFeedCard key={j.id} journey={j} />)}
            {(isAdminUser ? journeys : programFeed).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No active journeys.</p>
            )}
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-3">
            {upcoming.map(j => <JourneyFeedCard key={j.id} journey={j} showCountdown />)}
          </TabsContent>

          <TabsContent value="postop" className="space-y-4">
            <p className="text-sm text-muted-foreground">Submit your post-operation report after each journey is complete. Required per SOP TCNP.01.08.</p>
            {pendingReports.map(j => (
              <DOFeedbackForm
                key={j.id}
                journeyId={j.id}
                papaNme={j.papas?.full_name ? `${j.papas.title || ''} ${j.papas.full_name}`.trim() : 'Unknown Papa'}
                onSubmit={() => markReportSubmitted(j.id)}
              />
            ))}
            {pendingReports.length === 0 && (
              <p className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success" role="status">
                All post-op reports are submitted.
              </p>
            )}
            {submittedReports.length > 0 && (
              <ul className="space-y-1 text-sm text-muted-foreground" aria-label="Submitted reports">
                {submittedReports.map(j => (
                  <li key={j.id} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span className="truncate">
                      {j.papas?.full_name ?? 'Journey'} · {j.origin} → {j.destination} — report submitted
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

// ─── Collapsed section ────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        <span className="flex-1">{title}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t p-3 sm:p-4">{children}</div>
    </details>
  )
}

// ─── Program summary (one line, expands for details) ──────────────────────────

function ProgramSummary({ program }: { program: ActiveProgram }) {
  return (
    <details className="group rounded-xl border border-primary/20 bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{program.name}</span>
          <span className="text-muted-foreground"> · {program.status}{program.assigned_title ? ` · ${program.assigned_title}` : ''}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 border-t p-4 text-sm">
        {program.theatre_name && (
          <p><span className="text-muted-foreground">Theatre:</span> <strong>{program.theatre_name}</strong>{program.theatre_address ? ` (${program.theatre_address})` : ''}</p>
        )}
        {program.start_date && (
          <p>
            <span className="text-muted-foreground">Dates:</span> {format(new Date(program.start_date), 'PPP')}
            {program.end_date && program.end_date !== program.start_date && ` – ${format(new Date(program.end_date), 'PPP')}`}
          </p>
        )}
        {program.assigned_unit && <p><span className="text-muted-foreground">Unit:</span> {program.assigned_unit}</p>}
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11 gap-1.5">
            <Link href={`/chat?programId=${program.id}`}>
              <MessageSquare className="h-4 w-4" aria-hidden />Program Chat
            </Link>
          </Button>
          <Button variant="outline" asChild className="min-h-11 gap-1.5">
            <Link href="/tracking/live">
              <Navigation className="h-4 w-4" aria-hidden />Live Map
            </Link>
          </Button>
        </div>
      </div>
    </details>
  )
}

// ─── Read-only feed card ───────────────────────────────────────────────────────

function JourneyFeedCard({ journey, showCountdown = false }: { journey: OpsJourney; showCountdown?: boolean }) {
  const lead = journey.duty_officers?.find(d => d.is_lead)
  const depIso = journey.etd ?? journey.scheduled_departure
  const depTime = depIso ? new Date(depIso) : null

  return (
    <Card>
      <CardContent>
        {/* Status sits beside the name it describes. justify-between pushed it to
            the far card edge, which on a wide screen left a screen's width of
            empty space between a journey and its own status — two related facts
            reading as two unrelated ones. Wraps to its own line when narrow. */}
        <div className="mb-3 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold">{journey.papas?.title} {journey.papas?.full_name ?? 'Unknown Papa'}</p>
            <CallSignChip callSign={journey.status} size="sm" />
          </div>
          <p className="text-sm text-muted-foreground">{journey.origin} → {journey.destination}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {lead && (
            <span className="flex items-center gap-1">
              <Crown className="h-3.5 w-3.5 text-yellow-500" aria-hidden />{lead.users?.full_name ?? 'DO'}
            </span>
          )}
          {journey.cheetahs?.call_sign && (
            <span className="flex items-center gap-1"><Car className="h-3.5 w-3.5" aria-hidden />{journey.cheetahs.call_sign}</span>
          )}
          {depTime && !Number.isNaN(depTime.getTime()) && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {showCountdown
                ? `Departs ${formatDistanceToNow(depTime, { addSuffix: true })}`
                : format(depTime, 'HH:mm')}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
