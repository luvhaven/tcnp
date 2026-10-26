type Assignment = { user_id: string; program_id: string }

/** Read the canonical active roster without the PostgREST default row limit. */
export async function getProgramChatAssignments(db: any, scope: { programId?: string; userId?: string; userIds?: string[] }) {
  if (!scope.programId && !scope.userId) throw new Error('A program or officer scope is required.')
  const rows: Assignment[] = []
  for (let offset = 0; ; offset += 500) {
    let query = db.from('current_title_assignments').select('user_id, program_id').eq('is_active', true)
    if (scope.programId) query = query.eq('program_id', scope.programId)
    if (scope.userId) query = query.eq('user_id', scope.userId)
    if (scope.userIds) query = query.in('user_id', scope.userIds)
    const { data, error } = await query.order('id').range(offset, offset + 499)
    if (error) return { data: null, error }
    rows.push(...(data ?? []))
    if (!data || data.length < 500) return { data: rows, error: null }
  }
}
