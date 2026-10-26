'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, ShieldCheck, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ChatRoomSummary } from '@/lib/chat-access'
import { conversationKey } from '@/lib/chat-conversation'
import { getChatRoomMembers } from '@/hooks/useChatConversation'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function ChatMembersPanel({ room, open, onOpenChange }: { room: ChatRoomSummary; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: me } = useCurrentUser()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'members' | 'add'>('members')
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const key = ['chat-room-members', me?.id, conversationKey(room)]
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => getChatRoomMembers(room, signal), enabled: open && Boolean(me), staleTime: 0, retry: false })
  const list = mode === 'add' ? query.data?.candidates ?? [] : query.data?.members ?? []
  const filtered = list.filter(member => `${member.full_name || ''} ${member.oscar || ''} ${member.role || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const change = async (userId: string, remove: boolean) => {
    if (pending) return
    setPending(userId)
    try {
      const response = await fetch('/api/chat/room-members', {
        method: remove ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId: room.programId, papaId: room.papaId, userId }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'The membership could not be changed.')
      await Promise.all([queryClient.invalidateQueries({ queryKey: key }), queryClient.invalidateQueries({ queryKey: ['chat-rooms'] })])
      toast.success(remove ? 'Removed from this chat' : 'Added to this chat')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'The membership could not be changed.') }
    finally { setPending(null) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{mode === 'add' ? 'Add people to this chat' : room.kind === 'papa' ? 'Papa room members' : room.kind === 'program' ? 'Program chat members' : 'Team members'}</DialogTitle><DialogDescription>{room.label}{room.kind === 'papa' ? ` · ${room.programName}` : ''}. {room.kind === 'team' ? 'Team membership follows officer assignments.' : room.kind === 'papa' ? 'This room is created automatically for this Papa. Add its members here; Program chat access does not include this room.' : 'This main room is created automatically with the program. Active officers assigned to the program join automatically. Add people invites additional officers to this chat only.'}</DialogDescription></DialogHeader>
    {query.data?.canManageMembers && <div role="group" aria-label="Member actions" className="flex gap-2"><Button variant={mode === 'members' ? 'secondary' : 'ghost'} size="sm" onClick={() => { setMode('members'); setSearch('') }}>Members ({query.data.members.length})</Button><Button variant={mode === 'add' ? 'secondary' : 'ghost'} size="sm" onClick={() => { setMode('add'); setSearch('') }}><UserPlus className="mr-2 h-3.5 w-3.5" />Add people</Button></div>}
    <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={mode === 'add' ? 'Find an officer to add' : 'Find a room member'} placeholder={mode === 'add' ? 'Find an officer to add' : 'Find a member'} value={search} onChange={event => setSearch(event.target.value)} className="pl-9" /></div>
    <div className="max-h-[min(55dvh,28rem)] space-y-1 overflow-y-auto py-1">
      {query.isPending ? <div className="space-y-3 py-3"><div className="skeleton h-12 rounded-lg" /><div className="skeleton h-12 rounded-lg" /></div> : query.isError ? <div role="alert" className="space-y-3 py-7 text-center"><p className="text-sm text-muted-foreground">Members could not load. The room may no longer be available.</p><Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div> : filtered.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{mode === 'add' ? 'No officers match. Everyone eligible may already be added.' : 'No members match your search.'}</p> : filtered.map(member => <div key={member.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/40"><Avatar className="h-10 w-10 rounded-xl"><AvatarImage src={member.photo_url || undefined} /><AvatarFallback className="rounded-xl text-xs">{(member.full_name || 'Officer').split(' ').map(part => part[0]).slice(0, 2).join('')}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.full_name || 'Officer'}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">{member.accessType === 'executive' ? <><ShieldCheck className="h-3 w-3" />Executive access</> : member.accessType === 'program' ? 'Program assignment' : member.oscar || (member.role || 'Officer').replaceAll('_', ' ')}</p></div>{query.data?.canManageMembers && member.accessType === 'member' ? <Button variant={mode === 'add' ? 'outline' : 'ghost'} size="sm" aria-label={mode === 'add' ? `Add ${member.full_name || 'officer'} to this chat` : `Remove ${member.full_name || 'officer'} from this chat`} disabled={pending !== null} onClick={() => void change(member.id, mode !== 'add')} className={mode !== 'add' ? 'text-muted-foreground hover:text-destructive' : ''}>{pending === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mode === 'add' ? <><UserPlus className="mr-1.5 h-3.5 w-3.5" />Add</> : <X className="h-4 w-4" />}</Button> : member.accessType === 'program' ? <span className="text-xs text-muted-foreground">Automatic</span> : member.is_online && <span className="text-xs text-emerald-600 dark:text-emerald-400">Online</span>}</div>)}
    </div>
    <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">Executives always have access. {room.kind === 'team' ? 'Team assignments are managed in officer profiles.' : room.kind === 'program' ? 'Automatic members follow program assignments. Update their program assignment to change that access. Additional invitations affect only this chat.' : 'Adding or removing someone here affects only this Papa room, not their program or team assignment.'}</p>
  </DialogContent></Dialog>
}
