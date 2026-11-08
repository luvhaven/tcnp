import { NextResponse } from 'next/server'
import { CHAT_PRIVATE_HEADERS, chatError, getChatCaller } from '@/lib/chat-server'
import { getAccessibleTeamChats } from '@/lib/utils'
import { getChatRoomId, isChatProgramOpen, type ChatRoomSummary } from '@/lib/chat-access'
import { getProgramChatAssignments } from '@/lib/chat-program-membership'
import { getAutomaticRoomsForUser, getChatRemovals } from '@/lib/chat-auto-membership'

export async function GET() {
  try {
    const caller = await getChatCaller()
    if ('error' in caller) return caller.error
    const { db, profile, canManageMembers } = caller
    const rooms: ChatRoomSummary[] = getAccessibleTeamChats(profile.role, profile.team).map(team => ({
      id: `team:${team.value}`, kind: 'team', label: team.label,
      programId: null, papaId: null, team: team.value,
    }))

    let memberships: { program_id: string; papa_id: string | null }[] = []
    const assignedProgramIds = new Set<string>()
    let dutyPapaIds = new Set<string>()
    const dutyProgramIds = new Set<string>()
    let removed: { program_id: string; papa_id: string | null }[] = []
    if (!canManageMembers) {
      const result = await db.from('chat_room_memberships').select('program_id, papa_id').eq('user_id', profile.id)
      if (result.error) return chatError('Chat access is being updated. Please retry shortly.', 503)
      memberships = result.data ?? []
      const assignments = await getProgramChatAssignments(db, { userId: profile.id })
      if (assignments.error) return chatError('Could not load program chat assignments. Please retry.', 503)
      for (const assignment of assignments.data ?? []) if (assignment.program_id) assignedProgramIds.add(assignment.program_id)
      const removals = await getChatRemovals(db, { userId: profile.id })
      if (removals.supported) {
        removed = removals.rows
        // DOs join their Papa's room; available DOs join the program room.
        const automatic = await getAutomaticRoomsForUser(db, profile.id)
        dutyPapaIds = automatic.papaIds
        for (const programId of automatic.programIds) assignedProgramIds.add(programId)
        if (dutyPapaIds.size) {
          const { data: dutyPapas, error: dutyPapaError } = await db.from('papas').select('program_id').in('id', [...dutyPapaIds])
          if (dutyPapaError) return chatError('Could not load Papa chats. Please retry.', 500)
          for (const papa of dutyPapas ?? []) if (papa.program_id) dutyProgramIds.add(papa.program_id)
        }
      }
      if (memberships.length === 0 && assignedProgramIds.size === 0 && dutyProgramIds.size === 0) return NextResponse.json({ rooms, canManageMembers }, { headers: CHAT_PRIVATE_HEADERS })
    }

    // Optional archive/delete columns vary between deployed schemas. Filter the
    // complete row, then expose only room IDs and labels in this response.
    let programQuery = db.from('programs').select('*').order('created_at', { ascending: false })
    if (!canManageMembers) programQuery = programQuery.in('id', [...new Set([...memberships.map(row => row.program_id), ...assignedProgramIds, ...dutyProgramIds])])
    const { data: programRows, error: programError } = await programQuery
    if (programError) return chatError('Could not load program chats. Please retry.', 500)
    const programs = (programRows ?? []).filter(isChatProgramOpen) as { id: string; name: string; status: string }[]
    const programIds = programs.map(program => program.id)
    const allowedPapaIds = [...memberships.flatMap(row => row.papa_id ? [row.papa_id] : []), ...dutyPapaIds]
    const isRemoved = (programId: string, papaId: string | null) => removed.some(row => row.program_id === programId && row.papa_id === papaId)
    let papas: { id: string; full_name: string; title: string | null; program_id: string }[] = []
    if (programIds.length && (canManageMembers || allowedPapaIds.length)) {
      let papaQuery = db.from('papas').select('id, full_name, title, program_id, is_deleted').in('program_id', programIds).order('full_name')
      if (!canManageMembers) papaQuery = papaQuery.in('id', allowedPapaIds)
      const result = await papaQuery
      if (result.error) return chatError('Could not load Papa chats. Please retry.', 500)
      papas = (result.data ?? []).filter((papa: { is_deleted?: boolean | null }) => papa.is_deleted !== true)
    }
    for (const program of programs) {
      const programMember = assignedProgramIds.has(program.id)
        || memberships.some(row => row.program_id === program.id && row.papa_id === null)
      if (canManageMembers || (programMember && !isRemoved(program.id, null))) {
        const scope = { programId: program.id, papaId: null, team: null }
        rooms.push({ ...scope, id: getChatRoomId(scope), kind: 'program', label: program.name, programName: program.name })
      }
      for (const papa of papas.filter(row => row.program_id === program.id)) {
        if (!canManageMembers && (isRemoved(program.id, papa.id)
          || (!dutyPapaIds.has(papa.id) && !memberships.some(row => row.program_id === program.id && row.papa_id === papa.id)))) continue
        const scope = { programId: program.id, papaId: papa.id, team: null }
        rooms.push({ ...scope, id: getChatRoomId(scope), kind: 'papa', label: [papa.title, papa.full_name].filter(Boolean).join(' '), programName: program.name })
      }
    }
    return NextResponse.json({ rooms, canManageMembers }, { headers: CHAT_PRIVATE_HEADERS })
  } catch (error) {
    console.error('[chat/rooms] Could not load rooms:', error)
    return chatError('Could not load chats. Please retry.', 500)
  }
}
