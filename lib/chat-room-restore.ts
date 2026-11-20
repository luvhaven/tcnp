/**
 * One rule (migration 20261120120000): an explicit admin or lead action that
 * puts an officer on a programme restores their programme chat access, even
 * after an admin removed them from that room.
 *
 * The database clears the removal itself whenever a title assignment becomes
 * active. These helpers cover the paths that change nothing in
 * title_assignments because the officer is already on the programme, and
 * build the plain sentences the admin sees afterwards.
 */

type Db = any

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST200'])

function isMissingTable(error: any) {
  return Boolean(error && (MISSING_TABLE_CODES.has(error.code) || /chat_room_removals/.test(String(error.message ?? ''))))
}

function uniqueIds(userIds: readonly string[]) {
  return [...new Set(userIds.filter(id => typeof id === 'string' && id.length > 0))]
}

/** Officers (of `userIds`) currently removed from the programme's main chat room. */
export async function programChatRemovedIds(db: Db, programId: string, userIds: readonly string[]): Promise<Set<string>> {
  const ids = uniqueIds(userIds)
  if (!programId || ids.length === 0) return new Set()
  const { data, error } = await db.from('chat_room_removals').select('user_id')
    .eq('program_id', programId).is('papa_id', null).in('user_id', ids)
  if (error) {
    if (isMissingTable(error)) return new Set()
    throw error
  }
  return new Set((data ?? []).map((row: { user_id: string }) => row.user_id))
}

/**
 * Lifts programme chat removals for officers who are already on the
 * programme. Returns the officers whose access was restored.
 */
export async function restoreProgramChatAccess(db: Db, programId: string, userIds: readonly string[]): Promise<string[]> {
  const ids = uniqueIds(userIds)
  if (!programId || ids.length === 0) return []
  const { data, error } = await db.from('chat_room_removals').delete()
    .eq('program_id', programId).is('papa_id', null).in('user_id', ids)
    .select('user_id')
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return uniqueIds((data ?? []).map((row: { user_id: string }) => row.user_id))
}

export type AssignmentToast = { kind: 'success' | 'info'; message: string }

type Named = { id: string; name?: string | null }

function displayName(officer: Named | undefined) {
  return officer?.name?.trim() || 'This officer'
}

function officers(count: number) {
  return `${count} officer${count === 1 ? '' : 's'}`
}

/**
 * Sentences for the result of putting officers on a programme.
 *
 * - newly assigned officers: "Assigned 2 officers to Men's Conference."
 * - already on it:           "Emmanuel Osho is already on Men's Conference."
 * - and their chat restored: "... They are back in the programme chat."
 */
export function assignmentOutcomeToasts(input: {
  programName?: string | null
  assigned: readonly Named[]
  alreadyAssigned: readonly Named[]
  chatRestoredIds: readonly string[]
}): AssignmentToast[] {
  const program = input.programName?.trim() || 'the programme'
  const restored = new Set(input.chatRestoredIds)
  const toasts: AssignmentToast[] = []

  if (input.assigned.length > 0) {
    const back = input.assigned.filter(officer => restored.has(officer.id))
    let message: string
    if (input.assigned.length === 1) {
      message = back.length === 1
        ? `${displayName(input.assigned[0])} is now on ${program} and back in the programme chat.`
        : `${displayName(input.assigned[0])} is now on ${program}.`
    } else {
      message = `Assigned ${officers(input.assigned.length)} to ${program}.`
      if (back.length === 1) message += ` ${displayName(back[0])} is back in the programme chat.`
      else if (back.length > 1) message += ` ${back.length} of them are back in the programme chat.`
    }
    toasts.push({ kind: 'success', message })
  }

  if (input.alreadyAssigned.length > 0) {
    const back = input.alreadyAssigned.filter(officer => restored.has(officer.id))
    let message: string
    if (input.alreadyAssigned.length === 1) {
      message = `${displayName(input.alreadyAssigned[0])} is already on ${program}.`
      if (back.length === 1) message += ' They are back in the programme chat.'
    } else {
      message = `${officers(input.alreadyAssigned.length)} are already on ${program}.`
      if (back.length === input.alreadyAssigned.length) message += ' They are back in the programme chat.'
      else if (back.length === 1) message += ` ${displayName(back[0])} is back in the programme chat.`
      else if (back.length > 1) message += ` ${back.length} of them are back in the programme chat.`
    }
    toasts.push({ kind: back.length > 0 ? 'success' : 'info', message })
  }

  return toasts
}

/** Toasts for a /api/admin/bulk-assign-program response. */
export function bulkAssignToasts(result: {
  program_name?: string | null
  assigned_ids?: string[] | null
  assigned_count?: number | null
  already_assigned_ids?: string[] | null
  chat_restored_ids?: string[] | null
  officer_names?: Record<string, string | null> | null
}, fallbackProgramName?: string | null): AssignmentToast[] {
  const names = result.officer_names ?? {}
  const named = (id: string): Named => ({ id, name: names[id] })
  const assignedIds = result.assigned_ids ?? []
  // Older responses carried only a count.
  const assigned = assignedIds.length > 0 || !result.assigned_count
    ? assignedIds.map(named)
    : Array.from({ length: Number(result.assigned_count) }, (_, index) => ({ id: `assigned-${index}`, name: null }))
  return assignmentOutcomeToasts({
    programName: result.program_name || fallbackProgramName,
    assigned,
    alreadyAssigned: (result.already_assigned_ids ?? []).map(named),
    chatRestoredIds: result.chat_restored_ids ?? [],
  })
}
