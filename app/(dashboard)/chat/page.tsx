'use client'

import { Suspense, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, MessagesSquare } from 'lucide-react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { ChatRoomSummary, ChatRoomsResponse } from '@/lib/chat-access'
import { isPlatformAdministrator } from '@/lib/utils'
import ChatSystem from '@/components/chat/ChatSystem'
import TeamChatRoom from '@/components/chat/TeamChatRoom'
import { ChatWorkspace } from '@/components/chat/ChatWorkspace'
import { ChatMembersPanel } from '@/components/chat/ChatMembersPanel'
import { AdminChatControls } from '@/components/chat/AdminChatControls'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Button } from '@/components/ui/button'

function ChatContent() {
  const { data: me, isLoading: userLoading } = useCurrentUser()
  const params = useSearchParams()
  const requestKey = params.toString()
  const [selection, setSelection] = useState<{ id: string; requestKey: string } | null>(null)
  const selected = selection?.requestKey === requestKey ? selection.id : null
  const [membersOpen, setMembersOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const [consumedSeeds, setConsumedSeeds] = useState<string[]>([])
  const query = useQuery<ChatRoomsResponse>({
    queryKey: ['chat-rooms', me?.id, me?.role, me?.team],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/chat/rooms', { signal, cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Conversations could not load.')
      return body
    },
    enabled: Boolean(me), staleTime: 0, refetchInterval: 15000, retry: 1,
  })
  const rooms = query.isError ? [] : query.data?.rooms ?? []
  const requestedProgram = params.get('programId') || params.get('program')
  const requestedPapa = params.get('papaId') || params.get('papa')
  const requestedTeam = params.get('team')
  const requestedId = params.get('roomId')
  const hasRequestedRoom = Boolean(requestedId || requestedPapa || requestedProgram || requestedTeam)
  const requestedRoom = rooms.find(room => requestedId ? room.id === requestedId : requestedPapa
    ? room.papaId === requestedPapa && (!requestedProgram || room.programId === requestedProgram)
    : requestedProgram ? room.programId === requestedProgram && !room.papaId
      : requestedTeam ? room.team === requestedTeam : false)
  const active = selected ? rooms.find(room => room.id === selected) : requestedRoom || (!hasRequestedRoom ? rooms.find(room => room.kind === 'program') || rooms.find(room => room.kind === 'papa') || rooms[0] : undefined)
  const selectRoom = (room: ChatRoomSummary) => { setSelection({ id: room.id, requestKey }); setMembersOpen(false) }
  const platform = isPlatformAdministrator(me?.role)
  const loading = userLoading || (Boolean(me) && query.isPending)
  const initialMessage = !selected && !consumedSeeds.includes(requestKey) ? params.get('message') || undefined : undefined
  useEffect(() => {
    if (active && initialMessage) setConsumedSeeds(previous => previous.includes(requestKey) ? previous : [...previous, requestKey])
  }, [active?.id, initialMessage, requestKey])

  return <div className="min-w-0 space-y-4">
    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border bg-card text-primary"><MessagesSquare className="h-5 w-5" /></span><div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Chat</h1><p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">Stay connected. Keep everyone in step.</p></div></div>
    {!loading && !query.isError && hasRequestedRoom && !requestedRoom && !selected && <p role="status" className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">This conversation is unavailable. It may be archived, or you may need an invitation. Choose another conversation from the dropdowns.</p>}
    {!loading && me && !me.team && !platform && <details className="rounded-xl border bg-card px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Choose your team</summary><div className="pt-3"><TeamChatRoom joinOnly /></div></details>}
    <ChatWorkspace key={`${me?.id}:${requestKey}`} rooms={rooms} selectedRoomId={active?.id ?? null} loading={loading}
      error={query.isError ? 'Conversations could not load. Check your connection and retry.' : !me && !userLoading ? 'Sign in to load your conversations.' : null}
      canManageMembers={query.data?.canManageMembers} showConversationInitially={hasRequestedRoom}
      onSelectRoom={selectRoom} onRetry={() => void query.refetch()} onOpenMembers={() => setMembersOpen(true)}
      actions={active && platform ? <AdminChatControls programId={active.programId} papaId={active.papaId} programName={active.kind !== 'team' ? active.label : null} team={active.team} teamName={active.kind === 'team' ? active.label : null} canManageAll onChanged={() => setVersion(value => value + 1)} /> : null}>
      {active && me && <ErrorBoundary key={`${active.id}:${version}`} fallback={<div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><AlertTriangle className="h-6 w-6 text-muted-foreground" /><p className="text-sm">This conversation could not display.</p><Button variant="outline" onClick={() => setVersion(value => value + 1)}>Try again</Button></div>}><ChatSystem key={`${me.id}:${active.id}:${version}`} programId={active.programId ?? undefined} papaId={active.papaId ?? undefined} team={active.team ?? undefined} roomLabel={active.label} initialMessage={initialMessage} embedded onOpenMembers={() => setMembersOpen(true)} /></ErrorBoundary>}
    </ChatWorkspace>
    {active && <ChatMembersPanel key={active.id} room={active} open={membersOpen} onOpenChange={setMembersOpen} />}
  </div>
}

export default function ChatPage() {
  return <Suspense fallback={<div aria-label="Loading chat" className="skeleton h-[70dvh] rounded-2xl" />}><ChatContent /></Suspense>
}
