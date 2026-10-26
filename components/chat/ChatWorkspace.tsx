'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleHelp, MessageSquare, RefreshCw, Users } from 'lucide-react'
import type { ChatRoomSummary } from '@/lib/chat-access'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Props = {
  rooms: ChatRoomSummary[]
  selectedRoomId: string | null
  loading?: boolean
  error?: string | null
  canManageMembers?: boolean
  showConversationInitially?: boolean
  onSelectRoom: (room: ChatRoomSummary) => void
  onRetry: () => void
  onOpenMembers?: () => void
  actions?: React.ReactNode
  children: React.ReactNode
}

/** Compact selectors above one full-width conversation, using authorized rooms only. */
export function ChatWorkspace({ rooms, selectedRoomId, loading, error, canManageMembers, onSelectRoom, onRetry, onOpenMembers, actions, children }: Props) {
  const frameRef = useRef<HTMLElement>(null)
  const [remembered, setRemembered] = useState<{ team?: string; program?: string }>({})
  const [helpOpen, setHelpOpen] = useState(false)
  const active = rooms.find(room => room.id === selectedRoomId)
  const teams = rooms.filter(room => room.kind === 'team')
  const programRooms = rooms.filter(room => room.kind !== 'team')
  const programs = useMemo(() => [...new Map(programRooms.map(room => [room.programId!, room.programName || room.label])).entries()], [programRooms])
  const mode = active ? active.kind === 'team' ? 'team' : 'program' : programRooms.length ? 'program' : 'team'
  const currentProgramRooms = programRooms.filter(room => room.programId === active?.programId)
  const select = (room: ChatRoomSummary | undefined) => {
    if (!room) return
    setRemembered(previous => ({ ...previous, [room.kind === 'team' ? 'team' : 'program']: room.id }))
    onSelectRoom(room)
  }
  const switchMode = (next: 'team' | 'program') => {
    if (active && next === mode) return
    if (active) setRemembered(previous => ({ ...previous, [mode]: active.id }))
    const options = next === 'team' ? teams : programRooms
    select(options.find(room => room.id === remembered[next]) || options[0])
  }

  useEffect(() => {
    const update = () => {
      const frame = frameRef.current
      if (!frame) return
      const height = window.visualViewport?.height ?? window.innerHeight
      document.documentElement.classList.toggle('chat-keyboard-open', height < window.innerHeight * 0.78)
      frame.style.setProperty('--chat-available-height', `${Math.max(220, height - frame.getBoundingClientRect().top)}px`)
    }
    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    const observer = new ResizeObserver(update)
    if (frameRef.current?.parentElement) observer.observe(frameRef.current.parentElement)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      observer.disconnect()
      document.documentElement.classList.remove('chat-keyboard-open')
    }
  }, [])

  const selectClass = 'h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-base shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-sm'

  return <section ref={frameRef} aria-label="Chat workspace" className="chat-workspace flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
    <header className="relative grid shrink-0 grid-cols-2 items-end gap-3 border-b p-3 sm:flex sm:flex-wrap sm:px-4">
      {rooms.length > 0 && <div className="col-span-2 pr-24 sm:pr-0"><div role="group" aria-label="Chat type" className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg bg-muted p-1">
        {([['program', 'Programs'], ['team', 'Teams']] as const).filter(([value]) => value === 'program' ? programRooms.length > 0 : teams.length > 0).map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => switchMode(value)} className={cn('h-8 rounded-md px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', mode === value ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>{label}</button>)}
      </div>
      </div>}
      {mode === 'program' && programs.length > 0 && <>
        <div className="min-w-0 flex-1 basis-44 sm:max-w-xs"><label htmlFor="chat-program" className="mb-1 block text-xs font-medium text-muted-foreground">Program</label><select id="chat-program" className={selectClass} value={active?.programId || ''} onChange={event => { const options = programRooms.filter(room => room.programId === event.target.value); select(options.find(room => room.kind === 'program') || options[0]) }}>
          {!active?.programId && <option value="" disabled>Select a program</option>}
          {programs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></div>
        {currentProgramRooms.length > 0 && <div className="min-w-0 flex-1 basis-44 sm:max-w-xs"><div className="mb-1 flex items-center gap-1.5"><label htmlFor="chat-room" className="text-xs font-medium text-muted-foreground">Room</label><button type="button" aria-label="How chat rooms work" title="How chat rooms work" onClick={() => setHelpOpen(true)} className="hit-area inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><CircleHelp className="h-3.5 w-3.5" /></button></div><select id="chat-room" className={selectClass} value={active?.id || ''} onChange={event => select(currentProgramRooms.find(room => room.id === event.target.value))}>{currentProgramRooms.map(room => <option key={room.id} value={room.id}>{room.kind === 'program' ? 'Program chat' : `Papa · ${room.label}`}</option>)}</select></div>}
      </>}
      {mode === 'team' && teams.length > 0 && <div className="col-span-2 min-w-0 flex-1 basis-44 sm:max-w-xs"><label htmlFor="chat-team" className="mb-1 block text-xs font-medium text-muted-foreground">Team</label><select id="chat-team" className={selectClass} value={active?.id || ''} onChange={event => select(teams.find(room => room.id === event.target.value))}>{!active && <option value="" disabled>Select a team</option>}{teams.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select></div>}
      {active && <div className="absolute right-3 top-3 ml-auto flex h-10 shrink-0 items-center gap-1 sm:static"><Button variant="ghost" size="sm" className="h-10 gap-2" title={canManageMembers && active.kind !== 'team' ? 'Manage members of this room' : 'View room members'} aria-label={`${canManageMembers && active.kind !== 'team' ? 'Manage members' : 'Members'} of ${active.label}`} onClick={onOpenMembers}><Users className="h-4 w-4" /><span className="hidden sm:inline">{canManageMembers && active.kind !== 'team' ? 'Manage members' : 'Members'}</span></Button>{actions}</div>}
    </header>
    <div className="min-h-0 flex-1">
      {loading ? <div aria-label="Loading chat" className="space-y-4 p-5"><div className="skeleton h-14 w-3/5 rounded-xl" /><div className="skeleton ml-auto h-16 w-1/2 rounded-xl" /></div> : error ? <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-sm text-muted-foreground">{error}</p><Button variant="outline" onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></div> : active ? children : <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><MessageSquare className="h-7 w-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">{rooms.length ? 'Select a conversation above.' : 'Your team and invited program chats will appear here.'}</p></div>}
    </div>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>How chat rooms work</DialogTitle><DialogDescription>Rooms are created automatically from programs and their Papas.</DialogDescription></DialogHeader><div className="space-y-4 text-sm leading-relaxed"><p><strong>Program chat:</strong> every open program has one main chat. Active officers assigned to that program join automatically. Choose the program, then select “Program chat” under Room.</p><p><strong>Papa rooms:</strong> adding a Papa to a program creates their room automatically. Their name appears under Room. Officers need a separate invitation to each Papa room.</p><p><strong>Add members:</strong> choose the exact room, open <strong>Manage members</strong>, then <strong>Add people</strong>. You can also invite additional officers to the main Program chat. Invitations apply only to the selected room.</p><p className="text-muted-foreground">Executives and admins always have access. Archived programs are unavailable.</p></div></DialogContent></Dialog>
  </section>
}
