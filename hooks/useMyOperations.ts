"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { notificationService } from '@/lib/services/notificationService'
import { isAdmin, effectiveOscarRole, oscarToRole } from '@/lib/utils'
import { useOnlineStatus } from '@/hooks/useBrowserSnapshot'
import type { DOCompletionReason, DOReturnDestination } from '@/lib/duty-workflow'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveProgram {
  id: string
  name: string
  description: string | null
  status: string
  start_date: string
  end_date: string | null
  theatre_name: string | null
  theatre_address: string | null
  assigned_title: string | null
  assigned_unit: string | null
  assigned_at: string | null
}

export interface DutyOfficer {
  user_id: string
  is_lead: boolean
  status?: string
  acknowledged_at?: string | null
  users: { full_name: string; role: string; oscar: string | null; photo_url: string | null; phone?: string | null } | null
}

export interface JourneyDriver {
  driver_name: string | null
  driver_phone: string | null
}

export interface OpsJourney {
  id: string
  status: string
  origin: string
  destination: string
  scheduled_departure: string | null
  scheduled_arrival: string | null
  etd: string | null
  eta: string | null
  notes: string | null
  status_updated_at: string | null
  program_id: string | null
  papa_id: string | null
  assigned_duty_officer_id: string | null
  assigned_nest_id: string | null
  assigned_eagle_square_id: string | null
  assigned_theatre_id: string | null
  do_return_destination?: DOReturnDestination | null
  do_completion_reason?: DOCompletionReason | null
  papas: { full_name: string; title: string } | null
  cheetahs: { id: string; call_sign: string | null; registration_number: string } | null
  nests: { name: string } | null
  eagle_squares: { name: string; code: string } | null
  duty_officers?: DutyOfficer[]
  driver?: JourneyDriver | null
}

export type LiveState = 'live' | 'reconnecting' | 'offline'

const JOURNEY_COLUMNS = `
  id, status, origin, destination,
  scheduled_departure, scheduled_arrival, etd, eta, notes, status_updated_at,
  program_id, papa_id, assigned_duty_officer_id,
  assigned_nest_id, assigned_eagle_square_id, assigned_theatre_id,
  do_return_destination, do_completion_reason,
  papas:papas!papa_id(full_name, title),
  cheetahs:cheetahs!assigned_cheetah_id(id, call_sign, registration_number),
  nests:nests!assigned_nest_id(name),
  eagle_squares:eagle_squares!assigned_eagle_square_id(name, code)
`
const DO_COLUMNS = 'journey_id, user_id, is_lead, status, acknowledged_at, users:user_id(full_name, role, oscar, photo_url, phone)'
const PROGRAM_COLUMNS = 'id, name, description, status, start_date, end_date, theatres:theatre_id(name, address)'
const ACTIVE_DO_STATUSES = ['pending', 'acknowledged']
const RELOAD_DEBOUNCE_MS = 1500

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The officer holds a live (pending/acknowledged) DO assignment on this journey. */
export function isOwnAssignment(journey: Pick<OpsJourney, 'duty_officers' | 'assigned_duty_officer_id'>, userId: string | null): boolean {
  if (!userId) return false
  const own = journey.duty_officers?.find(d => d.user_id === userId)
  return own
    ? ACTIVE_DO_STATUSES.includes(own.status ?? 'acknowledged')
    : journey.assigned_duty_officer_id === userId
}

function journeyMatchesRole(journey: OpsJourney, role: string, userId: string, oscar?: string | null): boolean {
  if (isAdmin(role) || isAdmin(effectiveOscarRole(role, oscar))) return true

  // Resolve the effective permanent Oscar even when the user is assigned as DO
  const effectiveRole = (role !== 'delta_oscar' ? role : null) ?? oscarToRole(oscar) ?? role

  // Anyone assigned as DO to this specific journey always sees it
  if (isOwnAssignment(journey, userId)) return true

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

  // Anyone assigned to a program can see journeys for that program in the Program Feed
  if (journey.program_id) return true

  // Default: only journeys directly assigned
  return false
}

function toActiveProgram(p: any, extra: Pick<ActiveProgram, 'assigned_title' | 'assigned_unit' | 'assigned_at'>): ActiveProgram {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    start_date: p.start_date,
    end_date: p.end_date,
    theatre_name: p.theatres?.name || null,
    theatre_address: p.theatres?.address || null,
    ...extra,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Everything the My Operations page reads: the officer's programs, active
 * journeys (own assignments + program feed), completed assignments awaiting a
 * post-op report, and a live-connection indicator.
 *
 * Reloads are sequence-guarded (a slow, older load can never overwrite a newer
 * one) and realtime-triggered reloads are debounced, because a single call sign
 * touches journeys + journey_events + journey_duty_officers in quick succession.
 */
export function useMyOperations() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [journeys, setJourneys] = useState<OpsJourney[]>([])
  const [activePrograms, setActivePrograms] = useState<ActiveProgram[]>([])
  const [completedAssignments, setCompletedAssignments] = useState<OpsJourney[]>([])
  const [submittedReportIds, setSubmittedReportIds] = useState<Set<string>>(() => new Set())
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userOscar, setUserOscar] = useState<string | null>(null)
  const [channelStatus, setChannelStatus] = useState<'live' | 'reconnecting'>('reconnecting')
  const online = useOnlineStatus()

  const loadSeq = useRef(0)
  const knownOwnIds = useRef<Set<string> | null>(null)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (isInitial = false) => {
    const seq = ++loadSeq.current
    const isCurrent = () => seq === loadSeq.current
    try {
      if (isInitial) setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isCurrent()) return

      const { data: userData } = await supabase
        .from('users')
        .select('id, role, oscar')
        .eq('id', user.id)
        .single()

      const role = (userData as any)?.role ?? null
      const oscar = (userData as any)?.oscar ?? null
      const isAdminUser = isAdmin(role) || isAdmin(effectiveOscarRole(role, oscar))

      // ── Program assignments (direct title assignments + view fallback) ─────
      // Both reads are independent, so run them together.
      const [titleRes, currentRes, myDORes] = await Promise.all([
        (supabase as any)
          .from('title_assignments')
          .select(`
            id, program_id, assigned_at, is_active,
            official_titles:title_id ( name, code, unit ),
            programs:program_id ( ${PROGRAM_COLUMNS} )
          `)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .not('program_id', 'is', null),
        (supabase as any)
          .from('current_title_assignments')
          .select('program_id, program_name, title_name, unit, assigned_at')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .not('program_id', 'is', null),
        // Every journey this user is a DO for (lead or not)
        (supabase as any)
          .from('journey_duty_officers')
          .select('journey_id, status')
          .eq('user_id', user.id),
      ])
      if (titleRes.error) console.error('title_assignments read failed:', titleRes.error)
      if (currentRes.error) console.error('current_title_assignments read failed:', currentRes.error)
      if (myDORes.error) console.error('journey_duty_officers read failed:', myDORes.error)

      const programs: ActiveProgram[] = []
      const programIds = new Set<string>()
      for (const row of titleRes.data || []) {
        const p = row.programs
        if (p && !programIds.has(p.id)) {
          programIds.add(p.id)
          programs.push(toActiveProgram(p, {
            assigned_title: row.official_titles?.name || null,
            assigned_unit: row.official_titles?.unit || null,
            assigned_at: row.assigned_at || null,
          }))
        }
      }

      // Fallback rows from the view: fetch their programs in ONE batched read
      const fallbackRows = (currentRes.data || []).filter((r: any) => r.program_id && !programIds.has(r.program_id))
      const fallbackIds = Array.from(new Set<string>(fallbackRows.map((r: any) => r.program_id)))
      if (fallbackIds.length > 0) {
        const { data: progRows, error: progError } = await (supabase as any)
          .from('programs')
          .select(PROGRAM_COLUMNS)
          .in('id', fallbackIds)
        if (progError) console.error('programs read failed:', progError)
        const byId = new Map<string, any>((progRows || []).map((p: any) => [p.id, p]))
        for (const row of fallbackRows) {
          const p = byId.get(row.program_id)
          if (p && !programIds.has(p.id)) {
            programIds.add(p.id)
            programs.push(toActiveProgram(p, {
              assigned_title: row.title_name || null,
              assigned_unit: row.unit || null,
              assigned_at: row.assigned_at || null,
            }))
          }
        }
      }

      // Leadership/admins without direct title assignments see active/planning programs
      if (isAdminUser && programs.length === 0) {
        const { data: allProgs, error: allError } = await (supabase as any)
          .from('programs')
          .select(PROGRAM_COLUMNS)
          .in('status', ['active', 'planning'])
          .order('start_date', { ascending: false })
        if (allError) console.error('programs read failed:', allError)
        for (const p of allProgs || []) {
          if (!programIds.has(p.id)) {
            programIds.add(p.id)
            programs.push(toActiveProgram(p, { assigned_title: 'Leadership / Command', assigned_unit: 'Command', assigned_at: null }))
          }
        }
      }

      const myDOJourneyIds: string[] = (myDORes.data || [])
        .filter((r: any) => ACTIVE_DO_STATUSES.includes(r.status ?? 'acknowledged'))
        .map((r: any) => r.journey_id)
        .filter(Boolean)

      // ── Active journeys ────────────────────────────────────────────────────
      let activeQuery = (supabase as any)
        .from('journeys')
        .select(JOURNEY_COLUMNS)
        .not('status', 'in', '(completed,cancelled)')
        // Soft-deleted journeys must never reach a DO's queue (null = legacy rows)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('etd', { ascending: true, nullsFirst: false })

      if (!isAdminUser) {
        // Journeys in my programs OR journeys I'm a DO for OR I'm the lead on
        const orParts: string[] = []
        if (programIds.size > 0) orParts.push(`program_id.in.(${Array.from(programIds).join(',')})`)
        if (myDOJourneyIds.length > 0) orParts.push(`id.in.(${myDOJourneyIds.join(',')})`)
        orParts.push(`assigned_duty_officer_id.eq.${user.id}`)
        activeQuery = activeQuery.or(orParts.join(','))
      }

      // ── Completed assignments (post-op reports) ────────────────────────────
      // Either a DO row or the legacy lead column makes it the officer's report.
      const completedOr = [`assigned_duty_officer_id.eq.${user.id}`]
      if (myDOJourneyIds.length > 0) completedOr.push(`id.in.(${myDOJourneyIds.join(',')})`)
      const completedQuery = (supabase as any)
        .from('journeys')
        .select(JOURNEY_COLUMNS)
        .eq('status', 'completed')
        .or(completedOr.join(','))
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('scheduled_departure', { ascending: false, nullsFirst: false })
        .limit(50)

      const [activeRes, completedRes] = await Promise.all([activeQuery, completedQuery])
      if (activeRes.error) throw activeRes.error
      if (completedRes.error) console.error('Completed assignments read failed:', completedRes.error)

      const rawActive: any[] = activeRes.data || []
      const rawCompleted: any[] = completedRes.data || []
      const allIds = [...rawActive, ...rawCompleted].map(j => j.id)
      const completedIds = rawCompleted.map(j => j.id)

      // DO teams, primary drivers and already-submitted reports, in parallel
      const [doRes, driverRes, feedbackRes] = await Promise.all([
        allIds.length
          ? (supabase as any).from('journey_duty_officers').select(DO_COLUMNS).in('journey_id', allIds)
          : Promise.resolve({ data: [], error: null }),
        allIds.length
          ? (supabase as any).from('journey_cheetahs').select('journey_id, assignment_role, driver_name, driver_phone').in('journey_id', allIds)
          : Promise.resolve({ data: [], error: null }),
        completedIds.length
          ? (supabase as any).from('do_feedback_forms').select('journey_id').eq('submitted_by', user.id).in('journey_id', completedIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (doRes.error) console.error('Duty officer team read failed:', doRes.error)
      if (driverRes.error) console.warn('Driver contact read failed (non-critical):', driverRes.error)
      if (feedbackRes.error) console.error('Submitted report read failed:', feedbackRes.error)

      const doMap: Record<string, DutyOfficer[]> = {}
      for (const row of doRes.data || []) (doMap[row.journey_id] ??= []).push(row)
      const driverMap: Record<string, JourneyDriver> = {}
      for (const row of driverRes.data || []) {
        if (!row.driver_name && !row.driver_phone) continue
        // Prefer the primary vehicle's driver when a journey has several
        if (!driverMap[row.journey_id] || row.assignment_role === 'primary') {
          driverMap[row.journey_id] = { driver_name: row.driver_name ?? null, driver_phone: row.driver_phone ?? null }
        }
      }
      const enrich = (j: any): OpsJourney => ({ ...j, duty_officers: doMap[j.id] || [], driver: driverMap[j.id] ?? null })

      const active = rawActive.map(enrich).filter(j => journeyMatchesRole(j, role, user.id, oscar))
      const completed = rawCompleted.map(enrich).filter(j => isOwnAssignment(j, user.id))

      if (!isCurrent()) return // a newer load started while this one was in flight

      // ── New-assignment alert: only for the officer's OWN assignments ───────
      const ownIds = new Set(active.filter(j => isOwnAssignment(j, user.id)).map(j => j.id))
      if (!isInitial && knownOwnIds.current) {
        for (const j of active) {
          if (!ownIds.has(j.id) || knownOwnIds.current.has(j.id)) continue
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
        }
      }
      knownOwnIds.current = ownIds

      setUserId(user.id)
      setUserRole(role)
      setUserOscar(oscar)
      setActivePrograms(programs)
      setJourneys(active)
      setCompletedAssignments(completed)
      setSubmittedReportIds(new Set((feedbackRes.data || []).map((r: any) => r.journey_id)))
    } catch (err) {
      console.error('Error loading operations:', err)
      if (isInitial && isCurrent()) toast.error('Failed to load operations')
    } finally {
      if (isInitial && isCurrent()) setLoading(false)
    }
  }, [supabase])

  /** Coalesce bursts of realtime events into one reload. */
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null
      void load(false)
    }, RELOAD_DEBOUNCE_MS)
  }, [load])

  const reload = useCallback(() => load(false), [load])

  // Initial load, then realtime once we know who the user is (filters need the uid)
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | undefined
    let active = true
    const init = async () => {
      await load(true)
      if (!active) return
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user.id
      if (!active || !uid) return
      // Unique per mount: a fast remount must not join the topic the previous
      // mount is still tearing down.
      const suffix = Math.random().toString(36).slice(2, 10)
      channel = supabase
        .channel(`my-ops-${uid}-${suffix}`)
        // journeys can't be filtered to "mine": program-feed rows appear by
        // program_id, so take every change and rely on the debounce.
        .on('postgres_changes', { event: '*', schema: 'public', table: 'journeys' }, scheduleReload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'journey_duty_officers', filter: `user_id=eq.${uid}` }, scheduleReload)
        .subscribe((status) => {
          if (!active) return
          if (status === 'SUBSCRIBED') setChannelStatus('live')
          else setChannelStatus('reconnecting') // CHANNEL_ERROR | TIMED_OUT | CLOSED
        })
    }
    void init()
    return () => {
      active = false
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [load, scheduleReload, supabase])

  // Catch up after the phone sleeps or the network returns — realtime events
  // sent while the socket was down are not replayed.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void load(false) }
    const onOnline = () => { void load(false) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [load])

  /** Optimistic local patch — realtime/reload confirms it afterwards. */
  const patchJourney = useCallback((journeyId: string, patch: Partial<OpsJourney>) => {
    setJourneys(prev => prev.map(j => (j.id === journeyId ? { ...j, ...patch } : j)))
  }, [])

  const patchOwnDutyOfficer = useCallback((journeyId: string, patch: Partial<DutyOfficer>) => {
    setJourneys(prev => prev.map(j => (j.id !== journeyId ? j : {
      ...j,
      duty_officers: j.duty_officers?.map(d => (d.user_id === userId ? { ...d, ...patch } : d)),
    })))
  }, [userId])

  const markReportSubmitted = useCallback((journeyId: string) => {
    setSubmittedReportIds(prev => new Set(prev).add(journeyId))
  }, [])

  const isAdminUser = Boolean(userRole && (isAdmin(userRole) || isAdmin(effectiveOscarRole(userRole, userOscar))))
  const liveState: LiveState = !online ? 'offline' : channelStatus

  return {
    loading,
    journeys,
    activePrograms,
    completedAssignments,
    submittedReportIds,
    userId,
    userRole,
    isAdminUser,
    liveState,
    reload,
    patchJourney,
    patchOwnDutyOfficer,
    markReportSubmitted,
  }
}
