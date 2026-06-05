"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import CallSignPanel from '@/components/operations/CallSignPanel'
import DOHelpPanel from '@/components/operations/DOHelpPanel'
import DOFeedbackForm from '@/components/operations/DOFeedbackForm'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Radio, MapPin, Car, User, Calendar, Clock, Crown, Shield } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { notificationService } from '@/lib/services/notificationService'
import { toast } from 'sonner'
import { getCallSignLabel, resolveCallSignKey, TNCP_CALL_SIGN_COLORS } from '@/lib/constants/tncpCallSigns'
import { cn } from '@/lib/utils'
import { oscarToRole } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DutyOfficer {
  user_id: string
  is_lead: boolean
  users: { full_name: string; role: string; oscar: string | null; photo_url: string | null } | null
}

interface Journey {
  id: string
  status: string
  origin: string
  destination: string
  scheduled_departure: string | null
  scheduled_arrival: string | null
  etd: string | null
  eta: string | null
  notes: string | null
  program_id: string | null
  assigned_duty_officer_id: string | null
  assigned_nest_id: string | null
  assigned_eagle_square_id: string | null
  assigned_theatre_id: string | null
  papas: { full_name: string; title: string } | null
  cheetahs: { call_sign: string | null; registration_number: string } | null
  nests: { name: string } | null
  eagle_squares: { name: string; code: string } | null
  duty_officers?: DutyOfficer[]
}

const ADMIN_ROLES = ['super_admin', 'dev_admin', 'admin', 'captain', 'head_of_command', 'head_of_operations', 'command', 'hod', 'hop']

// ─── Role-based journey filter ─────────────────────────────────────────────
/**
 * Returns true if the given journey is relevant to the user.
 *
 * Permissions are Oscar-based: the permanent `oscar` column governs which
 * journey types the officer sees. `role=delta_oscar` just means they have an
 * additional DO assignment for a specific journey — it does NOT strip their
 * base Oscar access.
 */
function journeyMatchesRole(journey: Journey, role: string, userId: string, oscar?: string | null): boolean {
  if (ADMIN_ROLES.includes(role)) return true

  // Resolve the effective permanent Oscar even when the user is assigned as DO
  const effectiveRole = (role !== 'delta_oscar' ? role : null) ?? oscarToRole(oscar) ?? role

  // Anyone assigned as DO to this specific journey always sees it
  const isAssignedToDO = !!(
    journey.duty_officers?.some(d => d.user_id === userId) ||
    journey.assigned_duty_officer_id === userId
  )
  if (isAssignedToDO) return true

  // Base Oscar access — governs which journey types are in scope
  if (effectiveRole === 'alpha_oscar' || effectiveRole === 'head_alpha_oscar') {
    return !!(journey.assigned_eagle_square_id ||
      journey.origin?.toLowerCase().includes('eagle') ||
      journey.destination?.toLowerCase().includes('eagle'))
  }
  if (effectiveRole === 'tango_oscar' || effectiveRole === 'head_tango_oscar') {
    return true // Transport overseer sees all active journeys
  }
  if (effectiveRole === 'victor_oscar' || effectiveRole === 'head_victor_oscar') {
    return !!(journey.assigned_theatre_id ||
      journey.destination?.toLowerCase().includes('theatre') ||
      journey.origin?.toLowerCase().includes('theatre'))
  }
  if (['november_oscar', 'head_noscar_den', 'head_noscar_nest', 'noscar_den', 'noscar_nest'].includes(effectiveRole)) {
    return !!(
      journey.assigned_nest_id ||
      journey.assigned_theatre_id ||
      journey.destination?.toLowerCase().includes('nest') ||
      journey.origin?.toLowerCase().includes('nest') ||
      journey.destination?.toLowerCase().includes('theatre') ||
      journey.origin?.toLowerCase().includes('theatre')
    )
  }

  // Default: only journeys directly assigned
  return false
}

const getStatusColor = (status: string) => {
  const key = resolveCallSignKey(status)
  if (key && TNCP_CALL_SIGN_COLORS[key]) return TNCP_CALL_SIGN_COLORS[key]
  const fallback: Record<string, string> = {
    planned: 'bg-blue-500 text-white',
    completed: 'bg-green-500 text-white',
    cancelled: 'bg-red-500 text-white',
  }
  return fallback[status] || 'bg-gray-500 text-white'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MyOperationsPage() {
  const supabase = createClient()
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userOscar, setUserOscar] = useState<string | null>(null)
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('assigned')

  // Reminder tracking: keys that have already fired
  const firedReminders = useRef<Set<string>>(new Set())
  const knownIds = useRef<Set<string>>(new Set())

  const loadJourneys = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase
        .from('users')
        .select('id, role, oscar')
        .eq('id', user.id)
        .single()

      const role = (userData as any)?.role ?? null
      const oscar = (userData as any)?.oscar ?? null
      setUserId(user.id)
      setUserRole(role)
      setUserOscar(oscar)

      const isAdmin = ADMIN_ROLES.includes(role)

      // Get program IDs where this user is assigned
      const { data: assignments } = await (supabase as any)
        .from('current_title_assignments')
        .select('program_id')
        .eq('user_id', user.id)
        .eq('is_active', true)

      const programIds: string[] = (assignments || [])
        .map((a: any) => a.program_id)
        .filter(Boolean)

      // Step 1: Get all journey_ids where this user is a DO (lead or not)
      const { data: myDORows } = await (supabase as any)
        .from('journey_duty_officers')
        .select('journey_id')
        .eq('user_id', user.id)

      const myDOJourneyIds: string[] = (myDORows || []).map((r: any) => r.journey_id).filter(Boolean)

      // Build journey query: admin sees all; others see program journeys OR own DO assignments
      let query = (supabase as any)
        .from('journeys')
        .select(`
          id, status, origin, destination,
          scheduled_departure, scheduled_arrival, etd, eta, notes,
          program_id, assigned_duty_officer_id,
          assigned_nest_id, assigned_eagle_square_id, assigned_theatre_id,
          papas:papas!papa_id(full_name, title),
          cheetahs:cheetahs!assigned_cheetah_id(call_sign, registration_number),
          nests:nests!assigned_nest_id(name),
          eagle_squares:eagle_squares!assigned_eagle_square_id(name, code)
        `)
        .not('status', 'in', '(completed,cancelled)')
        .order('etd', { ascending: true, nullsFirst: false })

      if (!isAdmin) {
        // Build OR: journeys in my programs OR journeys I'm a DO for
        const orParts: string[] = []
        if (programIds.length > 0) orParts.push(`program_id.in.(${programIds.join(',')})`)
        if (myDOJourneyIds.length > 0) orParts.push(`id.in.(${myDOJourneyIds.join(',')})`)
        // Always include journeys where I'm the lead
        orParts.push(`assigned_duty_officer_id.eq.${user.id}`)
        query = query.or(orParts.join(','))
      }

      const { data: rawJourneys, error } = await query
      if (error) throw error

      // Fetch duty officers for each journey
      const journeyIds = (rawJourneys || []).map((j: any) => j.id)
      let dutyOfficersMap: Record<string, DutyOfficer[]> = {}

      if (journeyIds.length > 0) {
        const { data: doData } = await (supabase as any)
          .from('journey_duty_officers')
          .select('journey_id, user_id, is_lead, users:user_id(full_name, role, oscar, photo_url)')
          .in('journey_id', journeyIds)

        for (const row of doData || []) {
          if (!dutyOfficersMap[row.journey_id]) dutyOfficersMap[row.journey_id] = []
          dutyOfficersMap[row.journey_id].push(row)
        }
      }

      const incoming: Journey[] = (rawJourneys || []).map((j: any) => ({
        ...j,
        duty_officers: dutyOfficersMap[j.id] || [],
      }))

      // Filter by role (oscar-aware)
      const filtered = incoming.filter(j => journeyMatchesRole(j, role, user.id, oscar))

      // Detect new assignments
      if (!isInitial && knownIds.current.size > 0) {
        for (const j of filtered) {
          if (!knownIds.current.has(j.id)) {
            const papa = j.papas?.full_name || 'Unknown Papa'
            toast.info(`📋 New assignment: ${papa}`, {
              description: `${j.origin} → ${j.destination}`,
              duration: 10000,
            })
            void notificationService.showNotification({
              title: `📋 New Assignment: ${papa}`,
              body: `${j.origin} → ${j.destination}`,
              tag: `assign-${j.id}`,
              requireInteraction: true,
            })
            // Mark as read by fetching
          }
        }
      }

      knownIds.current = new Set(filtered.map(j => j.id))
      setJourneys(filtered)
      if (isInitial && filtered.length > 0) setSelectedJourneyId(filtered[0].id)
    } catch (err) {
      console.error('Error loading operations:', err)
      if (isInitial) toast.error('Failed to load operations')
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [supabase])

  // ── Reminder engine ─────────────────────────────────────────────────────
  const checkReminders = useCallback(() => {
    if (!userId || !userRole) return
    const now = Date.now()
    const myJourneys = journeys.filter(j =>
      j.duty_officers?.some(d => d.user_id === userId) ||
      j.assigned_duty_officer_id === userId
    )

    for (const j of myJourneys) {
      const fireReminder = async (key: string, title: string, body: string) => {
        if (firedReminders.current.has(key)) return
        firedReminders.current.add(key)
        toast.warning(title, { description: body, duration: 15000 })
        void notificationService.showNotification({ title, body, tag: key, requireInteraction: true })
        // Write to DB
        try {
          await fetch('/api/notifications/journey-reminder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ journey_id: j.id, type: key }),
          })
        } catch { /* non-critical */ }
      }

      const papa = j.papas ? `${j.papas.title} ${j.papas.full_name}` : 'Papa'
      const route = `${j.origin} → ${j.destination}`

      if (j.scheduled_departure) {
        const mins = (new Date(j.scheduled_departure).getTime() - now) / 60000
        if (mins <= 15 && mins > 14) void fireReminder(`${j.id}:dep:15`, '⏰ Departing in 15 minutes', `${papa}: ${route}`)
        if (mins <= 5 && mins > 4) void fireReminder(`${j.id}:dep:5`, '🚨 Departing in 5 minutes!', `${papa}: ${route}`)
      }
      if (j.scheduled_arrival) {
        const mins = (new Date(j.scheduled_arrival).getTime() - now) / 60000
        if (mins <= 15 && mins > 14) void fireReminder(`${j.id}:arr:15`, '⏰ Arriving in 15 minutes', `${papa}: ${route}`)
        if (mins <= 5 && mins > 4) void fireReminder(`${j.id}:arr:5`, '🚨 Arriving in 5 minutes!', `${papa}: ${route}`)
      }
    }
  }, [journeys, userId, userRole])

  useEffect(() => {
    const init = async () => {
      await loadJourneys(true)
      const channel = supabase
        .channel('my-ops-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'journeys' }, () => void loadJourneys(false))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'journey_duty_officers' }, () => void loadJourneys(false))
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }
    void init()
  }, [loadJourneys, supabase])

  useEffect(() => {
    checkReminders()
    const interval = setInterval(checkReminders, 60_000)
    return () => clearInterval(interval)
  }, [checkReminders])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const isAdmin = userRole ? ADMIN_ROLES.includes(userRole) : false
  const myAssigned = journeys.filter(j =>
    j.duty_officers?.some(d => d.user_id === userId) ||
    j.assigned_duty_officer_id === userId
  )
  const programFeed = journeys.filter(j => !myAssigned.some(a => a.id === j.id))
  const upcoming = journeys.filter(j => j.status === 'planned').sort((a, b) =>
    new Date(a.scheduled_departure ?? 0).getTime() - new Date(b.scheduled_departure ?? 0).getTime()
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Operations</h1>
          <p className="text-muted-foreground">
            {isAdmin ? 'Full operational view — admin override enabled' : 'Your assignments, updates and journey reminders'}
          </p>
        </div>
        <div className="flex gap-2 mt-1">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Radio className="h-3 w-3 animate-pulse text-green-500" />
            {journeys.length} Active
          </Badge>
          {isAdmin && (
            <Badge className="bg-primary/20 text-primary border-primary/30 border">
              <Shield className="h-3 w-3 mr-1" />Admin
            </Badge>
          )}
        </div>
      </div>

      {/* DO Quick Reference Panel — shown for DOs and when user has DO assignments */}
      {(userRole === 'delta_oscar' || myAssigned.length > 0) && (
        <DOHelpPanel />
      )}

      {journeys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Radio className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Active Assignments</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              You have no active journey assignments. Contact your Tango Oscar or Captain to receive an assignment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="assigned" className="flex items-center gap-2">
              My Assignments
              {myAssigned.length > 0 && (
                <Badge className="ml-1 bg-primary text-primary-foreground h-5 px-1.5 text-xs">
                  {myAssigned.length}
                </Badge>
              )}
            </TabsTrigger>
            {(programFeed.length > 0 || isAdmin) && (
              <TabsTrigger value="program">
                Program Feed
                {programFeed.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{programFeed.length}</Badge>
                )}
              </TabsTrigger>
            )}
            {upcoming.length > 0 && (
              <TabsTrigger value="upcoming">
                Upcoming
                <Badge variant="outline" className="ml-1 h-5 px-1.5 text-xs">{upcoming.length}</Badge>
              </TabsTrigger>
            )}
            {myAssigned.length > 0 && (
              <TabsTrigger value="postop" className="flex items-center gap-1.5">
                Post-Op Report
                <Badge variant="outline" className="ml-1 h-5 px-1.5 text-xs text-amber-600 border-amber-500/40">{myAssigned.length}</Badge>
              </TabsTrigger>
            )}
          </TabsList>

          {/* ── My Assignments ─────────────────────────────────────────── */}
          <TabsContent value="assigned" className="space-y-4">
            {myAssigned.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground text-sm">
                  <Radio className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  No journeys directly assigned to you.
                </CardContent>
              </Card>
            ) : myAssigned.length > 1 ? (
              <Tabs value={selectedJourneyId ?? myAssigned[0].id} onValueChange={setSelectedJourneyId}>
                <TabsList className="h-auto flex-wrap gap-1 mb-4">
                  {myAssigned.map(j => (
                    <TabsTrigger key={j.id} value={j.id} className="text-xs">
                      {j.papas?.title} {j.papas?.full_name ?? 'Journey'}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {myAssigned.map(j => (
                  <TabsContent key={j.id} value={j.id}>
                    <JourneyOperationsPanel journey={j} currentUserId={userId} isAdmin={isAdmin} />
                  </TabsContent>
                ))}
              </Tabs>
            ) : (
              <JourneyOperationsPanel journey={myAssigned[0]} currentUserId={userId} isAdmin={isAdmin} />
            )}
          </TabsContent>

          {/* ── Program Feed ────────────────────────────────────────────── */}
          <TabsContent value="program" className="space-y-3">
            <p className="text-xs text-muted-foreground">View-only feed of all journeys in your programs.</p>
            {(isAdmin ? journeys : programFeed).map(j => (
              <JourneyFeedCard key={j.id} journey={j} />
            ))}
          </TabsContent>

          {/* ── Upcoming ────────────────────────────────────────────────── */}
          <TabsContent value="upcoming" className="space-y-3">
            {upcoming.map(j => (
              <JourneyFeedCard key={j.id} journey={j} showCountdown />
            ))}
          </TabsContent>

          {/* ── Post-Op Reports (DO only) ────────────────────────── */}
          <TabsContent value="postop" className="space-y-4">
            <p className="text-xs text-muted-foreground">Submit your post-operation report after each journey is complete. Required per SOP TCNP.01.08.</p>
            {myAssigned.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No assigned journeys to report on.
                </CardContent>
              </Card>
            ) : (
              myAssigned.map(j => (
                <DOFeedbackForm
                  key={j.id}
                  journeyId={j.id}
                  papaNme={j.papas?.full_name ? `${j.papas.title || ''} ${j.papas.full_name}`.trim() : 'Unknown Papa'}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

// ─── Journey operations panel (for assigned DOs + admins) ─────────────────────

function JourneyOperationsPanel({
  journey,
  currentUserId,
  isAdmin,
}: {
  journey: Journey
  currentUserId: string | null
  isAdmin: boolean
}) {
  const supabase = createClient()
  const isAssignedDO = !!(
    journey.duty_officers?.some(d => d.user_id === currentUserId) ||
    journey.assigned_duty_officer_id === currentUserId
  )
  const isLead = !!(journey.duty_officers?.find(d => d.user_id === currentUserId)?.is_lead ||
    journey.assigned_duty_officer_id === currentUserId)
  const canUpdate = isAssignedDO || isAdmin
  const isPlanned = journey.status === 'planned'
  const [starting, setStarting] = useState(false)

  const statusKey = resolveCallSignKey(journey.status)
  const statusColor = statusKey ? TNCP_CALL_SIGN_COLORS[statusKey] : 'bg-gray-500 text-white'

  // Determine first active call sign based on journey type / destination
  const getFirstCallSign = (): string => {
    const dest = (journey.destination ?? '').toLowerCase()
    const origin = (journey.origin ?? '').toLowerCase()
    if (dest.includes('eagle') || dest.includes('airport')) return 'first_course'
    if (dest.includes('theatre') || dest.includes('venue')) return 'cocktail'
    if (dest.includes('nest')) return 'blue_cocktail'
    // Fallback: if origin is nest/airport, try to infer
    if (origin.includes('eagle') || origin.includes('airport')) return 'first_course'
    return 'first_course' // safest default — admin can override
  }

  const handleStartJourney = async () => {
    if (!canUpdate) return
    setStarting(true)
    try {
      const firstCallSign = getFirstCallSign()

      // ── Direct update: journey_status enum uses underscores — safe ────────
      const { error: updateError } = await (supabase as any)
        .from('journeys')
        .update({
          status: firstCallSign,                          // journey_status enum ✓
          status_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', journey.id)

      if (updateError) throw updateError

      // ── Log the event ────────────────────────────────────────────────────
      await (supabase as any).from('journey_events').insert({
        journey_id: journey.id,
        event_type: firstCallSign,
        description: 'Journey started',
        triggered_at: new Date().toISOString(),
      })

      toast.success('Journey started! Call sign updated.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to start journey')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Journey summary */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <Badge className={cn(statusColor, 'text-xs font-semibold')}>
              {getCallSignLabel(journey.status) || journey.status.replace(/_/g, ' ')}
            </Badge>
            <div className="flex gap-2 items-center">
              {isLead && (
                <Badge className="bg-yellow-400 text-yellow-900 text-xs">
                  <Crown className="h-3 w-3 mr-1" />Team Lead
                </Badge>
              )}
              {isAdmin && !isAssignedDO && (
                <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                  <Shield className="h-3 w-3 mr-1" />Admin View
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Papa</p>
                <p className="font-semibold">{journey.papas?.title} {journey.papas?.full_name ?? '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Car className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Cheetah</p>
                <p className="font-semibold">{journey.cheetahs?.call_sign ?? journey.cheetahs?.registration_number ?? '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Route</p>
                <p className="font-semibold text-xs">{journey.origin} → {journey.destination}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">ETD / ETA</p>
                <p className="font-semibold text-xs">
                  {journey.etd ? format(new Date(journey.etd), 'HH:mm') : '—'} / {journey.eta ? format(new Date(journey.eta), 'HH:mm') : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* DO Team */}
          {(journey.duty_officers?.length ?? 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-primary/10">
              <p className="text-xs text-muted-foreground mb-1.5">DO Team</p>
              <div className="flex flex-wrap gap-2">
                {journey.duty_officers?.map(d => (
                  <div key={d.user_id} className={cn(
                    'flex items-center gap-1.5 text-xs px-2 py-1 rounded-full',
                    d.user_id === currentUserId
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {d.is_lead && <Crown className="h-3 w-3 text-yellow-500" />}
                    {d.users?.full_name ?? 'Officer'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Start Journey ── prominent CTA when status is planned */}
      {canUpdate && isPlanned && (
        <button
          onClick={handleStartJourney}
          disabled={starting}
          className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl
            bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700
            text-white font-bold text-base shadow-lg shadow-emerald-500/30
            transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
            disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
        >
          {starting ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Starting Journey…</>
          ) : (
            <><Radio className="h-5 w-5 animate-pulse" /> Start Journey — Go!</>
          )}
        </button>
      )}

      {/* Call sign panel — shown once journey is active */}
      {canUpdate && !isPlanned ? (
        <CallSignPanel
          journeyId={journey.id}
          papaName={journey.papas ? `${journey.papas.title} ${journey.papas.full_name}` : undefined}
          cheetahName={journey.cheetahs?.call_sign ?? journey.cheetahs?.registration_number ?? undefined}
          origin={journey.origin}
          destination={journey.destination}
        />
      ) : !canUpdate ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            <Radio className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium">View Only</p>
            <p className="text-xs mt-1">Only assigned Duty Officers can update this journey&apos;s call sign status.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

// ─── Read-only feed card ───────────────────────────────────────────────────────

function JourneyFeedCard({ journey, showCountdown = false }: { journey: Journey; showCountdown?: boolean }) {
  const statusKey = resolveCallSignKey(journey.status)
  const statusColor = statusKey ? TNCP_CALL_SIGN_COLORS[statusKey] : 'bg-gray-500 text-white'
  const lead = journey.duty_officers?.find(d => d.is_lead)
  const depTime = journey.scheduled_departure ? new Date(journey.scheduled_departure) : null

  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold text-sm">{journey.papas?.title} {journey.papas?.full_name ?? 'Unknown Papa'}</p>
            <p className="text-xs text-muted-foreground">{journey.origin} → {journey.destination}</p>
          </div>
          <Badge className={cn(statusColor, 'text-xs')}>
            {getCallSignLabel(journey.status) || journey.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {lead && (
            <span className="flex items-center gap-1">
              <Crown className="h-3 w-3 text-yellow-500" />{lead.users?.full_name ?? 'DO'}
            </span>
          )}
          {journey.cheetahs?.call_sign && (
            <span className="flex items-center gap-1"><Car className="h-3 w-3" />{journey.cheetahs.call_sign}</span>
          )}
          {depTime && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
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
