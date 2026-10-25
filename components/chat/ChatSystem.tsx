'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { format, isSameDay, isToday, isYesterday } from 'date-fns'
import { AlertCircle, ArrowDown, AtSign, Check, CornerUpLeft, Hash, Loader2, LockKeyhole, MessageSquare, Pencil, Search, Send, Users, WifiOff, X } from 'lucide-react'
import { toast } from 'sonner'
import { useChatConversation, type OutgoingChatMessage } from '@/hooks/useChatConversation'
import { useChatTyping } from '@/hooks/useChatTyping'
import { compareChatMessages, conversationKey, newChatMessageId } from '@/lib/chat-conversation'
import { cn, isPlatformAdministrator } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { MessageBubble, type Message } from './MessageBubble'

type Mention = { id: string; name: string; restricted: boolean }
type SavedConversationDraft = {
  draft: string
  mentions: Mention[]
  replyTo: Message | null
  editingMessage: Message | null
  failedMessage: OutgoingChatMessage | null
}

// Keep unsent work across room switches without persisting private content to disk.
const conversationDrafts = new Map<string, SavedConversationDraft>()
const revokedDrafts = new Set<string>()
type Props = {
  programId?: string
  papaId?: string
  team?: string
  initialMessage?: string
  roomLabel?: string
  embedded?: boolean
  onOpenMembers?: () => void
}

function initials(name: string | null) {
  return (name || 'Officer').trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()
}

function dayLabel(value: string) {
  const date = new Date(value)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEE, d MMM yyyy')
}

export default function ChatSystem({ programId, papaId, team, initialMessage, roomLabel = 'Conversation', embedded = false, onOpenMembers }: Props) {
  const scope = { programId, papaId, team }
  const roomKey = conversationKey(scope)
  const chat = useChatConversation(scope)
  const draftKey = chat.me?.id ? `${chat.me.id}:${roomKey}` : null
  const draftContext = draftKey || `pending:${roomKey}`
  const savedDraft = draftKey ? conversationDrafts.get(draftKey) : undefined
  const confirm = useConfirm()
  const params = useSearchParams()
  const highlightId = params.get('highlight')
  const [draft, setDraft] = useState(savedDraft?.draft ?? initialMessage ?? '')
  const [mentions, setMentions] = useState<Mention[]>(savedDraft?.mentions ?? [])
  const [replyTo, setReplyTo] = useState<Message | null>(savedDraft?.replyTo ?? null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(savedDraft?.editingMessage ?? null)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [failedMessage, setFailedMessage] = useState<OutgoingChatMessage | null>(savedDraft?.failedMessage ?? null)
  const failedMessageRef = useRef<OutgoingChatMessage | null>(savedDraft?.failedMessage ?? null)
  const restoredDraftContext = useRef(draftContext)
  const [search, setSearch] = useState('')
  const [pickerId, setPickerId] = useState<string | null>(null)
  const [membersOpen, setMembersOpen] = useState(false)
  const [mentionCursor, setMentionCursor] = useState(0)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [documentVisible, setDocumentVisible] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const previousIds = useRef(new Set<string>())
  const previousNewest = useRef<{ id: string; created_at: string } | null>(null)
  const previousRoom = useRef(roomKey)
  const prependAnchor = useRef<{ height: number; top: number } | null>(null)
  const marked = useRef(new Set<string>())
  const highlightDone = useRef(false)
  const typing = useChatTyping(roomKey, chat.me?.id, chat.members, chat.allowed && chat.connection !== 'offline')
  const admin = isPlatformAdministrator(chat.me?.role)
  const canModerate = admin || Boolean(team && chat.me?.team === team && chat.me?.is_team_head)
  const beforeCursor = draft.slice(0, mentionCursor)
  const token = mentionOpen ? beforeCursor.match(/(?:^|\s)(@@?)([^@\n]{0,40})$/u) : null
  const mentionQuery = token?.[2].toLocaleLowerCase()
  const candidates = useMemo(() => {
    if (mentionQuery === undefined) return []
    return chat.members.filter(member => member.id !== chat.me?.id && member.full_name?.toLocaleLowerCase().includes(mentionQuery)).slice(0, 5)
  }, [chat.members, chat.me?.id, mentionQuery])
  const visibleMessages = useMemo(() => chat.messages.filter(message => !search.trim() || message.content.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [chat.messages, search])
  const messageMap = useMemo(() => new Map(chat.messages.map(message => [message.id, message])), [chat.messages])
  const activeMentions = mentions.filter(mention => draft.includes(`${mention.restricted ? '@@' : '@'}${mention.name}`))
  const restricted = editingMessage?.is_private || activeMentions.some(mention => mention.restricted)
  const { markRead } = chat

  useLayoutEffect(() => {
    if (chat.denied) {
      if (draftKey) { conversationDrafts.delete(draftKey); revokedDrafts.add(draftKey) }
      restoredDraftContext.current = draftContext
      failedMessageRef.current = null
      setDraft(''); setMentions(previous => previous.length ? [] : previous)
      setReplyTo(null); setEditingMessage(null); setFailedMessage(null)
      return
    }
    if (draftKey && chat.allowed) revokedDrafts.delete(draftKey)
    if (restoredDraftContext.current !== draftContext) {
      restoredDraftContext.current = draftContext
      const saved = draftKey ? conversationDrafts.get(draftKey) : undefined
      setDraft(saved?.draft ?? initialMessage ?? ''); setMentions(saved?.mentions ?? [])
      setReplyTo(saved?.replyTo ?? null); setEditingMessage(saved?.editingMessage ?? null)
      failedMessageRef.current = saved?.failedMessage ?? null
      setFailedMessage(saved?.failedMessage ?? null)
      return
    }
    if (!draftKey) return
    if (!draft && !failedMessage && !replyTo && !editingMessage) conversationDrafts.delete(draftKey)
    else conversationDrafts.set(draftKey, { draft, mentions, replyTo, editingMessage, failedMessage })
  }, [draftKey, draftContext, draft, mentions, replyTo, editingMessage, failedMessage, initialMessage, chat.allowed, chat.denied])

  // The workspace keys conversations by room. This also protects standalone callers.
  useEffect(() => {
    if (previousRoom.current === roomKey) return
    previousRoom.current = roomKey
    previousIds.current.clear(); marked.current.clear(); highlightDone.current = false
    previousNewest.current = null
    setAtBottom(true); setUnreadCount(0)
    stickToBottom.current = true
  }, [roomKey])

  useLayoutEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    if (prependAnchor.current) {
      pane.scrollTop = prependAnchor.current.top + pane.scrollHeight - prependAnchor.current.height
      prependAnchor.current = null
    } else if (stickToBottom.current) pane.scrollTop = pane.scrollHeight
  }, [chat.messages, chat.loading])

  useEffect(() => {
    if (chat.loading) return
    const known = previousIds.current
    const newest = previousNewest.current
    if (known.size && newest && !stickToBottom.current) {
      const count = chat.messages.filter(message => !known.has(message.id) && message.sender_id !== chat.me?.id && compareChatMessages(message, newest) > 0).length
      if (count) setUnreadCount(previous => previous + count)
    }
    previousIds.current = new Set(chat.messages.map(message => message.id))
    previousNewest.current = chat.messages.at(-1) ?? null
  }, [chat.messages, chat.loading, chat.me?.id])

  useEffect(() => {
    if (!chat.allowed || !atBottom || !documentVisible) return
    const pending = marked.current
    const ids = chat.messages.filter(message => message.sender_id !== chat.me?.id && !message.read_by.includes(chat.me?.id || '') && !pending.has(message.id)).map(message => message.id)
    if (!ids.length) return
    ids.forEach(id => pending.add(id))
    const timer = setTimeout(() => {
      void markRead(ids).catch(() => { ids.forEach(id => pending.delete(id)) })
    }, 800)
    return () => { clearTimeout(timer); ids.forEach(id => pending.delete(id)) }
  }, [chat.messages, chat.allowed, chat.me?.id, atBottom, documentVisible, markRead])

  useEffect(() => {
    const onVisible = () => setDocumentVisible(document.visibilityState === 'visible')
    onVisible()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    if (!highlightId || chat.loading || highlightDone.current) return
    const element = document.getElementById(`msg-${highlightId}`)
    if (element && paneRef.current) {
      stickToBottom.current = false
      paneRef.current.scrollTop += element.getBoundingClientRect().top - paneRef.current.getBoundingClientRect().top - 60
      highlightDone.current = true
      setAtBottom(false)
    }
  }, [highlightId, chat.loading, chat.messages])

  useLayoutEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 144)}px`
  }, [draft])

  const scrollLatest = () => {
    stickToBottom.current = true
    setAtBottom(true); setUnreadCount(0)
    if (paneRef.current) paneRef.current.scrollTop = paneRef.current.scrollHeight
  }

  const pickMention = (member: typeof chat.members[number]) => {
    if (!token || !member.full_name) return
    const start = mentionCursor - token[2].length - token[1].length
    const text = `${token[1]}${member.full_name} `
    setDraft(draft.slice(0, start) + text + draft.slice(mentionCursor))
    setMentions(previous => [...previous.filter(item => item.id !== member.id), { id: member.id, name: member.full_name!, restricted: token[1] === '@@' }])
    setMentionOpen(false)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const deliver = async (message: OutgoingChatMessage, retry = false) => {
    if (sendingRef.current || !chat.allowed || (failedMessageRef.current && !retry)) return
    sendingRef.current = true; setSending(true)
    try {
      await chat.sendMessage(message)
      if (retry) {
        failedMessageRef.current = null; setFailedMessage(null)
        const saved = draftKey ? conversationDrafts.get(draftKey) : undefined
        if (saved?.failedMessage?.id === message.id) conversationDrafts.set(draftKey!, { ...saved, failedMessage: null })
      }
      stickToBottom.current = true
      scrollLatest()
    } catch {
      failedMessageRef.current = message
      setFailedMessage(message)
      if (draftKey && !revokedDrafts.has(draftKey)) {
        const saved = conversationDrafts.get(draftKey)
        conversationDrafts.set(draftKey, { draft: '', mentions: [], replyTo: null, editingMessage: null, ...saved, failedMessage: message })
      }
      toast.error('Message not sent. Your message is saved here to retry.')
    } finally { sendingRef.current = false; setSending(false); textareaRef.current?.focus() }
  }

  const send = async () => {
    if (!draft.trim() || sendingRef.current || failedMessageRef.current || !chat.allowed || chat.connection === 'offline') return
    if (editingMessage) {
      sendingRef.current = true; setSending(true)
      try {
        await chat.editMessage(editingMessage.id, draft)
        setEditingMessage(null); setDraft(''); setMentions([])
      } catch { toast.error('This edit could not be saved. Your draft is still here.') }
      finally { sendingRef.current = false; setSending(false) }
      return
    }
    const message: OutgoingChatMessage = {
      id: newChatMessageId(), content: draft, mentions: activeMentions.map(item => item.id),
      isPrivate: activeMentions.some(item => item.restricted), replyId: replyTo?.id || null,
    }
    setDraft(''); setMentions([]); setReplyTo(null); setMentionOpen(false)
    await deliver(message)
  }

  const remove = async (id: string, permanently = false) => {
    try { await chat.deleteMessage(id, permanently) }
    catch { toast.error('This message could not be removed. Please retry.') }
  }
  const react = async (id: string, emoji: string) => {
    try { await chat.toggleReaction(id, emoji) }
    catch { toast.error('The reaction could not be saved. Please retry.') }
  }
  const loadEarlier = async () => {
    if (paneRef.current) prependAnchor.current = { height: paneRef.current.scrollHeight, top: paneRef.current.scrollTop }
    try { await chat.loadEarlier() }
    catch { prependAnchor.current = null; toast.error('Earlier messages could not load. Please retry.') }
  }

  return (
    <div className={cn('relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-card', embedded ? 'h-full' : 'h-[min(42rem,calc(100dvh-12rem))] min-h-72 rounded-2xl border')}>
      {!embedded && (
        <header className="flex min-h-16 items-center justify-between gap-3 border-b px-4">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Hash className="h-5 w-5" /></div><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{roomLabel}</h2><p className="text-xs text-muted-foreground">{chat.members.length} participants</p></div></div>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Conversation members" onClick={() => onOpenMembers ? onOpenMembers() : setMembersOpen(true)}><Users className="h-4 w-4" /></Button>
        </header>
      )}

      <div className="flex min-h-12 flex-none items-center justify-between gap-3 border-b border-border/60 bg-muted/15 px-4 py-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search aria-hidden="true" className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search this conversation" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search this conversation" className="h-9 border-0 bg-transparent pl-8 text-base shadow-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:text-sm" /></div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" role="status">
          {chat.connection === 'offline' ? <><WifiOff className="h-3 w-3" />Offline</> : chat.connection === 'connected' ? <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Connected</> : <><Loader2 className="h-3 w-3 animate-spin" />Connecting</>}
        </span>
      </div>

      {chat.connection === 'offline' && <div role="status" className="border-b bg-amber-500/5 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">You’re offline. Your draft stays here while you reconnect.</div>}

      <div ref={paneRef} role="log" aria-label={`${roomLabel} messages`} aria-live="polite" aria-busy={chat.loading} onScroll={() => {
        const pane = paneRef.current
        if (!pane) return
        const bottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 60
        stickToBottom.current = bottom; setAtBottom(bottom)
        if (bottom) setUnreadCount(0)
      }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/[0.16] px-4 py-4 sm:px-6">
        {chat.loading ? (
          <div className="space-y-5 py-4" aria-label="Loading messages"><div className="skeleton h-14 w-3/5 rounded-2xl" /><div className="skeleton ml-auto h-20 w-2/3 rounded-2xl" /><div className="skeleton h-14 w-1/2 rounded-2xl" /></div>
        ) : chat.denied ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"><LockKeyhole className="h-8 w-8 text-muted-foreground" /><div><h3 className="font-semibold">This room is no longer available</h3><p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">You may have been removed, or the program was archived. Ask an executive to add you to an open chat.</p></div></div>
        ) : chat.error ? (
          <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 text-center"><AlertCircle className="h-7 w-7 text-muted-foreground" /><p className="max-w-xs text-sm text-muted-foreground">{chat.error}</p><Button variant="outline" onClick={chat.retry}>Retry connection</Button></div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border bg-card text-muted-foreground"><MessageSquare className="h-6 w-6" /></div><div><h3 className="text-sm font-semibold">{search ? 'No messages match your search' : 'Start the conversation'}</h3><p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">{search ? 'Try another name or phrase.' : 'Share an update, ask a question, or mention someone in this room.'}</p></div>{search && <Button variant="ghost" onClick={() => setSearch('')}>Clear search</Button>}</div>
        ) : (
          <div className="mx-auto max-w-3xl pb-1">
            {chat.hasMore && <div className="pb-4 text-center"><Button variant="ghost" size="sm" disabled={chat.loadingEarlier} onClick={() => void loadEarlier()}>{chat.loadingEarlier && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Load earlier messages</Button></div>}
            {visibleMessages.map((message, index) => {
              const previous = visibleMessages[index - 1]
              const next = visibleMessages[index + 1]
              const dateChange = !previous || !isSameDay(new Date(previous.created_at), new Date(message.created_at))
              const first = dateChange || previous.sender_id !== message.sender_id || Date.parse(message.created_at) - Date.parse(previous.created_at) > 300_000
              const last = !next || next.sender_id !== message.sender_id || Date.parse(next.created_at) - Date.parse(message.created_at) > 300_000
              return (
                <div key={message.id}>
                  {dateChange && <div className="my-5 flex items-center justify-center"><span className="rounded-md border border-border/60 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">{dayLabel(message.created_at)}</span></div>}
                  <MessageBubble msg={message} isFirst={first} isLast={last} isOwn={message.sender_id === chat.me?.id} displayName={message.users.full_name} isEditable={message.sender_id === chat.me?.id && !message.deleted_at && Date.now() - Date.parse(message.created_at) < 180_000}
                    repliedMsg={message.reply_to_id ? messageMap.get(message.reply_to_id) : null} msgReactions={chat.reactions[message.id] || []} isHighlighted={message.id === highlightId} isPickerOpen={pickerId === message.id} searchQuery={search} currentUserRole={chat.me?.role || undefined} currentUserId={chat.me?.id} canModerate={canModerate}
                    setShowReactionPicker={setPickerId} handleReply={message => { setReplyTo(message); setEditingMessage(null); textareaRef.current?.focus() }} handleEdit={message => { setEditingMessage(message); setReplyTo(null); setDraft(message.content); setMentions([]); textareaRef.current?.focus() }} handleDeleteMessage={remove} toggleReaction={react} confirm={confirm} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {!atBottom && <button type="button" onClick={scrollLatest} aria-label={unreadCount ? `Jump to latest, ${unreadCount} new` : 'Jump to latest messages'} className="absolute bottom-36 right-5 z-20 inline-flex min-h-10 items-center gap-2 rounded-full border bg-card px-3 text-xs font-semibold shadow-elevation-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><ArrowDown className="h-4 w-4" />{unreadCount ? `${unreadCount} new` : 'Latest'}</button>}

      <div className="flex-none border-t bg-card p-3 sm:px-5 sm:py-4">
        <div className="mx-auto max-w-3xl">
          {failedMessage && (
            <div role="alert" className="mb-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs">
              <p className="font-semibold text-destructive">Message wasn’t sent</p>
              <p className="mt-0.5 truncate text-muted-foreground">{failedMessage.content}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-xs text-muted-foreground">Retry or discard this message before sending another.</p>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" disabled={sending} onClick={() => { failedMessageRef.current = null; setFailedMessage(null) }}>Discard</Button>
                  <Button size="sm" variant="outline" disabled={sending || !chat.allowed || chat.connection === 'offline'} onClick={() => void deliver(failedMessage, true)}>Retry</Button>
                </div>
              </div>
            </div>
          )}
          {(replyTo || editingMessage) && <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border-l-2 border-primary bg-muted/40 px-3 py-2 text-xs"><div className="min-w-0"><p className="flex items-center gap-1.5 font-semibold text-primary">{editingMessage ? <Pencil className="h-3 w-3" /> : <CornerUpLeft className="h-3 w-3" />}{editingMessage ? 'Editing message' : `Replying to ${replyTo?.users.full_name}`}</p>{replyTo && <p className="mt-0.5 truncate text-muted-foreground">{replyTo.deleted_at ? 'Message removed' : replyTo.content}</p>}</div><button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted" aria-label={editingMessage ? 'Cancel editing' : 'Cancel reply'} onClick={() => { if (editingMessage) setDraft(''); setEditingMessage(null); setReplyTo(null) }}><X className="h-4 w-4" /></button></div>}
          <div className="relative flex items-end gap-2 rounded-2xl border bg-background p-1.5 shadow-xs focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
            <textarea ref={textareaRef} aria-label={editingMessage ? 'Edit message' : 'Write a message'} aria-autocomplete="list" aria-controls={candidates.length ? 'chat-mention-list' : undefined} aria-activedescendant={mentionOpen && candidates[mentionIndex] ? `chat-mention-${candidates[mentionIndex].id}` : undefined}
              value={draft} placeholder={chat.denied ? 'You don’t have access to this room' : `Message ${roomLabel}…`} maxLength={4000} rows={1} disabled={!chat.allowed || (sending && Boolean(editingMessage))}
              onChange={event => { setDraft(event.target.value); setMentionCursor(event.target.selectionStart); setMentionIndex(0); setMentionOpen(true); typing.announce() }}
              onKeyDown={event => {
                if (event.nativeEvent.isComposing) return
                if (candidates.length && mentionOpen) {
                  if (event.key === 'ArrowDown') { event.preventDefault(); setMentionIndex(index => (index + 1) % candidates.length); return }
                  if (event.key === 'ArrowUp') { event.preventDefault(); setMentionIndex(index => (index - 1 + candidates.length) % candidates.length); return }
                  if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); pickMention(candidates[Math.min(mentionIndex, candidates.length - 1)]); return }
                  if (event.key === 'Escape') { setMentionOpen(false); return }
                }
                const coarse = window.matchMedia?.('(pointer: coarse)').matches
                if (event.key === 'Enter' && !event.shiftKey && !coarse) { event.preventDefault(); void send() }
              }}
              className="block max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-base leading-6 outline-none placeholder:text-muted-foreground/75 disabled:opacity-50 sm:text-sm" />
            <Button type="button" aria-label={editingMessage ? 'Save edited message' : 'Send message'} disabled={!chat.allowed || !draft.trim() || sending || Boolean(failedMessage) || chat.connection === 'offline'} aria-busy={sending} className="h-11 w-11 shrink-0 rounded-xl p-0" onClick={() => void send()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
            {mentionOpen && candidates.length > 0 && <div id="chat-mention-list" role="listbox" aria-label={token?.[1] === '@@' ? 'Restricted message recipients' : 'Mention a participant'} className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border bg-popover p-1 shadow-elevation-lg"><p className="px-3 py-2 text-xs font-medium text-muted-foreground">{token?.[1] === '@@' ? 'Mentioned participants and executives can read this message' : 'Mention a participant'}</p>{candidates.map((member, index) => <button type="button" role="option" id={`chat-mention-${member.id}`} aria-selected={index === mentionIndex} key={member.id} onMouseDown={event => event.preventDefault()} onClick={() => pickMention(member)} onMouseEnter={() => setMentionIndex(index)} className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left', index === mentionIndex ? 'bg-accent' : 'hover:bg-muted/50')}><Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{initials(member.full_name)}</AvatarFallback></Avatar><span className="min-w-0"><span className="block truncate text-sm font-medium">{member.full_name}</span><span className="block text-xs text-muted-foreground">{member.accessType === 'executive' ? 'Executive access' : (member.oscar || member.role || 'Room member').replaceAll('_', ' ')}</span></span></button>)}</div>}
          </div>
          <div className="mt-2 flex min-h-4 items-center justify-between gap-3 text-xs text-muted-foreground"><span aria-live="polite" className="min-w-0 truncate">{restricted ? <><LockKeyhole className="mr-1 inline h-3 w-3" />Only mentioned members and executives can read this</> : typing.names.length ? `${typing.names.slice(0, 2).join(' and ')} ${typing.names.length > 1 ? 'are' : 'is'} typing…` : <><AtSign className="mr-1 inline h-3 w-3" />Mention someone with @</>}</span><span className="hidden shrink-0 [@media(pointer:fine)]:inline">Enter to send · Shift+Enter for a new line</span>{draft.length > 3600 && <span className="tabular-nums">{draft.length}/4000</span>}</div>
        </div>
      </div>

      <Dialog open={membersOpen} onOpenChange={setMembersOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Room members</DialogTitle><DialogDescription>Executives have access automatically. Other participants belong to this room.</DialogDescription></DialogHeader><div className="max-h-96 space-y-3 overflow-y-auto">{chat.members.map(member => <div key={member.id} className="flex items-center gap-3"><Avatar className="h-9 w-9"><AvatarFallback className="text-xs">{initials(member.full_name)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.full_name || 'Officer'}</p><p className="text-xs text-muted-foreground">{member.accessType === 'executive' ? 'Executive access' : member.is_online ? 'Online' : 'Room member'}</p></div>{member.is_online && <Check className="h-4 w-4 text-emerald-600" />}</div>)}</div></DialogContent></Dialog>
    </div>
  )
}
