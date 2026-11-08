/**
 * Server-side mirror of the automatic chat rules in can_access_chat_room
 * (migration 20261031121000):
 *   - Papa room: DOs assigned to a live journey for that Papa.
 *   - Program room: officers who said "available" to the program's mission
 *     request and are DO on one of its journeys (title assignees are handled
 *     by getProgramChatAssignments).
 *   - chat_room_removals overrides both for non-admins.
 *
 * Every helper reports `supported: false` until that migration is applied, so
 * callers keep the previous behaviour instead of listing rooms the database
 * would still refuse.
 */

type Db = any

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST200'])

function isMissingTable(error: any) {
  return Boolean(error && (MISSING_TABLE_CODES.has(error.code) || /chat_room_removals/.test(String(error.message ?? ''))))
}

const LIVE_JOURNEY = (query: any) => query.or('is_deleted.is.null,is_deleted.eq.false').neq('status', 'cancelled')

/** Removed officers for one room, or for one officer across rooms. */
export async function getChatRemovals(db: Db, scope: { programId?: string; papaId?: string | null; userId?: string }) {
  let query = db.from('chat_room_removals').select('program_id, papa_id, user_id')
  if (scope.programId) query = query.eq('program_id', scope.programId)
  if (scope.papaId !== undefined) query = scope.papaId ? query.eq('papa_id', scope.papaId) : query.is('papa_id', null)
  if (scope.userId) query = query.eq('user_id', scope.userId)
  const { data, error } = await query
  if (error) {
    if (isMissingTable(error)) return { supported: false as const, rows: [] as { program_id: string; papa_id: string | null; user_id: string }[] }
    throw error
  }
  return { supported: true as const, rows: (data ?? []) as { program_id: string; papa_id: string | null; user_id: string }[] }
}

function doIdsFromJourneys(journeys: any[], dutyRows: any[]) {
  const ids = new Set<string>()
  for (const journey of journeys) {
    if (journey.assigned_duty_officer_id) ids.add(journey.assigned_duty_officer_id)
    if (journey.assigned_do_id) ids.add(journey.assigned_do_id)
  }
  for (const row of dutyRows) if (row.user_id && row.status !== 'rejected') ids.add(row.user_id)
  return ids
}

async function dutyRowsFor(db: Db, journeyIds: string[]) {
  if (journeyIds.length === 0) return []
  const { data, error } = await db.from('journey_duty_officers').select('journey_id, user_id, status').in('journey_id', journeyIds)
  if (error) throw error
  return data ?? []
}

/** DOs on live journeys for this Papa (primary papa_id or journey_papas). */
export async function getPapaDutyOfficerIds(db: Db, papaId: string) {
  const linked = await db.from('journey_papas').select('journey_id').eq('papa_id', papaId)
  if (linked.error) throw linked.error
  const linkedIds = (linked.data ?? []).map((row: any) => row.journey_id)
  let query = LIVE_JOURNEY(db.from('journeys').select('id, assigned_duty_officer_id, assigned_do_id'))
  query = linkedIds.length ? query.or(`papa_id.eq.${papaId},id.in.(${linkedIds.join(',')})`) : query.eq('papa_id', papaId)
  const { data: journeys, error } = await query
  if (error) throw error
  return doIdsFromJourneys(journeys ?? [], await dutyRowsFor(db, (journeys ?? []).map((j: any) => j.id)))
}

/** Officers who answered "yes" to any availability request for this program. */
export async function getAvailableOfficerIds(db: Db, programId: string) {
  const { data: requests, error } = await db.from('mission_requests').select('id').eq('program_id', programId)
  if (error) throw error
  const requestIds = (requests ?? []).map((row: any) => row.id)
  if (requestIds.length === 0) return new Set<string>()
  const { data: responses, error: responseError } = await db.from('mission_responses')
    .select('user_id').in('request_id', requestIds).eq('response', 'yes')
  if (responseError) throw responseError
  return new Set<string>((responses ?? []).map((row: any) => row.user_id))
}

/** Available officers who are also DO on one of the program's live journeys. */
export async function getAvailableProgramDutyOfficerIds(db: Db, programId: string, available?: Set<string>) {
  const availableIds = available ?? await getAvailableOfficerIds(db, programId)
  if (availableIds.size === 0) return new Set<string>()
  const { data: journeys, error } = await LIVE_JOURNEY(db.from('journeys').select('id, assigned_duty_officer_id, assigned_do_id').eq('program_id', programId))
  if (error) throw error
  const dos = doIdsFromJourneys(journeys ?? [], await dutyRowsFor(db, (journeys ?? []).map((j: any) => j.id)))
  return new Set([...dos].filter(id => availableIds.has(id)))
}

/** Rooms this officer joins automatically through DO duty and availability. */
export async function getAutomaticRoomsForUser(db: Db, userId: string) {
  const [{ data: lead, error: leadError }, { data: duty, error: dutyError }] = await Promise.all([
    LIVE_JOURNEY(db.from('journeys').select('id, papa_id, program_id').or(`assigned_duty_officer_id.eq.${userId},assigned_do_id.eq.${userId}`)),
    db.from('journey_duty_officers').select('journey_id, status').eq('user_id', userId),
  ])
  if (leadError) throw leadError
  if (dutyError) throw dutyError
  const extraIds = (duty ?? []).filter((row: any) => row.status !== 'rejected').map((row: any) => row.journey_id)
    .filter((id: string) => !(lead ?? []).some((journey: any) => journey.id === id))
  let journeys: any[] = [...(lead ?? [])]
  if (extraIds.length) {
    const { data, error } = await LIVE_JOURNEY(db.from('journeys').select('id, papa_id, program_id').in('id', extraIds))
    if (error) throw error
    journeys = journeys.concat(data ?? [])
  }
  const journeyIds = journeys.map(journey => journey.id)
  const papaIds = new Set<string>(journeys.flatMap(journey => journey.papa_id ? [journey.papa_id] : []))
  if (journeyIds.length) {
    const { data, error } = await db.from('journey_papas').select('papa_id').in('journey_id', journeyIds)
    if (error) throw error
    for (const row of data ?? []) if (row.papa_id) papaIds.add(row.papa_id)
  }

  const programIds = new Set<string>()
  const dutyProgramIds = [...new Set(journeys.flatMap(journey => journey.program_id ? [journey.program_id] : []))]
  if (dutyProgramIds.length) {
    const { data: requests, error } = await db.from('mission_requests').select('id, program_id').in('program_id', dutyProgramIds)
    if (error) throw error
    const requestIds = (requests ?? []).map((row: any) => row.id)
    if (requestIds.length) {
      const { data: responses, error: responseError } = await db.from('mission_responses')
        .select('request_id').eq('user_id', userId).eq('response', 'yes').in('request_id', requestIds)
      if (responseError) throw responseError
      for (const response of responses ?? []) {
        const request = (requests ?? []).find((row: any) => row.id === response.request_id)
        if (request?.program_id) programIds.add(request.program_id)
      }
    }
  }
  return { papaIds, programIds }
}
