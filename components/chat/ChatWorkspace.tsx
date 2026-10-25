'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, ChevronRight, Hash, LockKeyhole, MessageSquare, RefreshCw, Search, UserRound, Users } from 'lucide-react'
import type { ChatRoomSummary } from '@/lib/chat-access'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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

export function ChatWorkspace({ rooms, selectedRoomId, loading, error, canManageMembers, showConversationInitially, onSelectRoom, onRetry, onOpenMembers, actions, children }: Props) {
  const [filter, setFilter] = useState<'all' | 'team' | 'program'>('all')
  const [search, setSearch] = useState('')
  const [showRooms, setShowRooms] = useState(!showConversationInitially)
  const frameRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const active = rooms.find(room => room.id === selectedRoomId)
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return rooms.filter(room => (filter === 'all' || (filter === 'team' ? room.kind === 'team' : room.kind !== 'team')) && (!query || `${room.label} ${room.programName || ''}`.toLocaleLowerCase().includes(query)))
  }, [rooms, filter, search])
  const teams = filtered.filter(room => room.kind === 'team')
  const programs = useMemo(() => {
    const groups = new Map<string, { name: string; rooms: ChatRoomSummary[] }>()
    for (const room of filtered.filter(room => room.kind !== 'team')) {
      const id = room.programId || room.id
      if (!groups.has(id)) groups.set(id, { name: room.programName || room.label, rooms: [] })
      groups.get(id)!.rooms.push(room)
    }
    return [...groups.entries()]
  }, [filtered])

  useEffect(() => {
    const update = () => {
      const frame = frameRef.current
      if (!frame) return
      const height = window.visualViewport?.height ?? window.innerHeight
      const keyboard = height < window.innerHeight * 0.78
      document.documentElement.classList.toggle('chat-keyboard-open', keyboard)
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

  const select = (room: ChatRoomSummary) => {
    onSelectRoom(room)
    setShowRooms(false)
  }
  const roomButton = (room: ChatRoomSummary) => {
    const selected = room.id === active?.id
    const Icon = room.kind === 'papa' ? UserRound : room.kind === 'team' ? Hash : MessageSquare
    return (
      <button key={room.id} type="button" onClick={() => select(room)} aria-pressed={selected} aria-label={`${room.kind === 'papa' ? 'Papa chat' : room.kind === 'program' ? 'Program chat' : 'Team chat'}: ${room.label}`}
        className={cn('group flex min-h-[4.25rem] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', selected ? 'bg-primary/[0.09] text-foreground ring-1 ring-inset ring-primary/15' : 'text-foreground/80 hover:bg-accent/70')}>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', selected ? 'border-primary/15 bg-card text-primary' : 'border-border/70 bg-card text-muted-foreground')}><Icon aria-hidden="true" className="h-[18px] w-[18px]" /></span>
        <span className="min-w-0 flex-1"><span className={cn('block truncate text-sm', selected ? 'font-semibold' : 'font-medium')}>{room.kind === 'program' ? 'Program room' : room.label}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{room.kind === 'team' ? 'Team conversation' : room.kind === 'papa' ? 'Papa coordination' : 'Program coordination'}</span></span>
        <ChevronRight aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0 transition-opacity', selected ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-70')} />
      </button>
    )
  }

  return (
    <section ref={frameRef} aria-label="Chat workspace" className="chat-workspace grid min-h-0 min-w-0 overflow-hidden rounded-2xl border bg-card shadow-elevation-sm lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      <aside aria-label="Conversations" className={cn('min-h-0 flex-col border-border/80 bg-muted/20 lg:flex lg:border-r', showRooms ? 'flex' : 'hidden')}>
        <div className="flex h-[4.5rem] shrink-0 items-center justify-between px-5"><div><h2 className="text-sm font-semibold tracking-tight">Conversations</h2><p className="mt-0.5 text-xs text-muted-foreground">{canManageMembers ? 'All teams and open programs' : 'Rooms you belong to'}</p></div><span className="rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-muted-foreground">{rooms.length}</span></div>
        <div className="space-y-3 px-4 pb-4"><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input ref={searchRef} value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a conversation" aria-label="Find a conversation" className="h-10 rounded-xl bg-card pl-9 text-base shadow-none sm:text-sm" /></div><div role="group" aria-label="Conversation types" className="flex gap-1 rounded-lg bg-muted/70 p-1">{([['all', 'All'], ['team', 'Teams'], ['program', 'Programs']] as const).map(([value, label]) => <button type="button" aria-pressed={filter === value} key={value} onClick={() => setFilter(value)} className={cn('min-h-8 flex-1 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', filter === value ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>{label}</button>)}</div></div>
        <nav aria-label="Chat rooms" className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 pb-5">
          {loading ? <div aria-label="Loading conversations" className="space-y-2 px-1">{[0, 1, 2, 3].map(index => <div key={index} className="skeleton h-16 rounded-xl" />)}</div> : error ? <div role="alert" className="space-y-3 px-3 py-7 text-center"><p className="text-sm text-muted-foreground">{error}</p><Button variant="outline" size="sm" onClick={onRetry}><RefreshCw className="mr-2 h-3.5 w-3.5" />Retry</Button></div> : filtered.length === 0 ? <div className="px-4 py-10 text-center"><Search className="mx-auto mb-3 h-6 w-6 text-muted-foreground/50" /><p className="text-sm font-medium">{search ? 'No matching conversations' : 'No rooms here yet'}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{search ? 'Try another name or switch filters.' : 'An executive can add you to a program or Papa conversation.'}</p></div> : <>
            {teams.length > 0 && <section aria-label="Team conversations"><h3 className="mb-2 px-3 text-xs font-medium text-muted-foreground">Teams</h3><div className="space-y-1">{teams.map(roomButton)}</div></section>}
            {programs.map(([id, group]) => <section key={id} aria-label={`${group.name} conversations`}><h3 className="mb-2 truncate px-3 text-xs font-medium text-muted-foreground">{group.name}</h3><div className="space-y-1">{group.rooms.map(roomButton)}</div></section>)}
          </>}
        </nav>
        <div className="flex shrink-0 items-start gap-2 border-t border-border/60 px-5 py-3.5 text-xs leading-relaxed text-muted-foreground"><LockKeyhole aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{canManageMembers ? 'Executive access is always included.' : 'Program and Papa rooms are invitation only.'}</span></div>
      </aside>

      <div className={cn('min-h-0 min-w-0 flex-col lg:flex', showRooms ? 'hidden' : 'flex')}>
        {active ? <>
          <header className="flex min-h-[4.5rem] shrink-0 items-center justify-between gap-3 border-b px-3 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3"><Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 lg:hidden" aria-label="Back to conversations" onClick={() => { setShowRooms(true); requestAnimationFrame(() => searchRef.current?.focus()) }}><ArrowLeft className="h-4 w-4" /></Button><span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-muted/25 text-muted-foreground sm:flex">{active.kind === 'papa' ? <UserRound className="h-5 w-5" /> : active.kind === 'team' ? <Hash className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}</span><div className="min-w-0"><h2 className="truncate text-sm font-semibold tracking-tight sm:text-base">{active.label}</h2><p className="mt-0.5 truncate text-xs text-muted-foreground">{active.kind === 'team' ? 'Team conversation' : active.kind === 'papa' ? active.programName : 'Program conversation'}{active.kind !== 'team' && <span className="ml-1.5">· Invitation only</span>}</p></div></div>
            <div className="flex shrink-0 items-center gap-1"><Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" aria-label={`Members of ${active.label}`} onClick={onOpenMembers}><Users className="h-[18px] w-[18px]" /></Button>{actions}</div>
          </header>
          <div className="min-h-0 flex-1">{children}</div>
        </> : <div className="flex h-full flex-col items-center justify-center px-8 text-center"><div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border bg-muted/20 text-muted-foreground"><MessageSquare className="h-7 w-7" /></div><h2 className="text-lg font-semibold tracking-tight">{loading ? 'Getting your conversations ready' : 'A place to coordinate'}</h2><p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{error || (rooms.length ? 'Choose a room to catch up with your team and keep operations moving.' : 'Your team and invited program chats will appear here.')}</p><Button variant="ghost" className="mt-4 gap-2 lg:hidden" onClick={() => setShowRooms(true)}>View conversations<ArrowUpRight className="h-4 w-4" /></Button></div>}
      </div>
    </section>
  )
}
