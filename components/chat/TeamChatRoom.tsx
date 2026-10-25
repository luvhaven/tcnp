'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import ChatSystem from '@/components/chat/ChatSystem'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { getAccessibleTeamChats, isPlatformAdministrator, OFFICER_TEAMS, type OfficerTeam } from '@/lib/utils'

/** Compatibility entry point; every room uses the same secured conversation engine. */
export default function TeamChatRoom({ joinOnly = false }: { joinOnly?: boolean } = {}) {
  const { data: currentUser, isLoading } = useCurrentUser()
  const queryClient = useQueryClient()
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [joiningTeam, setJoiningTeam] = useState<OfficerTeam | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const joiningRef = useRef(false)
  const rooms = getAccessibleTeamChats(currentUser?.role, currentUser?.team)
  const team = rooms.find(room => room.value === selectedTeam)?.value
    ?? rooms.find(room => room.value === currentUser?.team)?.value
    ?? rooms[0]?.value
    ?? null
  const canJoin = Boolean(currentUser && !currentUser.team && !isPlatformAdministrator(currentUser.role))

  const joinTeam = async (nextTeam: OfficerTeam) => {
    if (!currentUser || !canJoin || joiningRef.current) return
    joiningRef.current = true
    setJoiningTeam(nextTeam)
    setJoinError(null)
    try {
      const response = await fetch('/api/teams/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: nextTeam }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Could not join the team. Please retry.')
      queryClient.setQueryData(['currentUser'], (previous: typeof currentUser | undefined) => previous ? { ...previous, team: nextTeam } : previous)
      setSelectedTeam(nextTeam)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
        queryClient.invalidateQueries({ queryKey: ['chat-rooms'] }),
      ])
      toast.success(`You joined ${OFFICER_TEAMS.find(item => item.value === nextTeam)?.label ?? 'your team'}`)
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Could not join the team. Check your connection and retry.')
    } finally {
      joiningRef.current = false
      setJoiningTeam(null)
    }
  }

  if (isLoading) {
    return <div aria-busy="true" aria-label="Loading team chat" className="space-y-3"><div className="skeleton h-10 w-64 rounded-xl" /><div className="skeleton h-72 rounded-2xl" /></div>
  }
  if (!currentUser || (joinOnly && !canJoin)) return null

  if (!team) {
    return (
      <section className="mx-auto max-w-lg rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="team-chat-join-title">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-5 w-5" aria-hidden="true" /></div>
        <h2 id="team-chat-join-title" className="text-base font-semibold tracking-tight">{canJoin ? 'Join your team' : 'Your team is unavailable'}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{canJoin ? 'Choose the team you were assigned to. This will also update your profile.' : 'Ask an administrator to check your team assignment.'}</p>
        {canJoin && (
          <div className="mt-5 grid gap-2 sm:grid-cols-3" role="group" aria-label="Join a team">
            {OFFICER_TEAMS.map(room => (
              <Button key={room.value} variant="outline" disabled={joiningTeam !== null} pending={joiningTeam === room.value} onClick={() => void joinTeam(room.value)}>{room.label}</Button>
            ))}
          </div>
        )}
        {joinError && <p role="alert" className="mt-4 text-sm text-destructive">{joinError}</p>}
      </section>
    )
  }

  return (
    <div className="space-y-3">
      {rooms.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Team chat rooms">
          {rooms.map(room => (
            <Button key={room.value} variant={team === room.value ? 'default' : 'outline'} aria-pressed={team === room.value} onClick={() => setSelectedTeam(room.value)}>{room.label}</Button>
          ))}
        </div>
      )}
      <ChatSystem key={`${currentUser.id}:team:${team}`} team={team} roomLabel={OFFICER_TEAMS.find(room => room.value === team)?.label ?? 'Team chat'} />
    </div>
  )
}
