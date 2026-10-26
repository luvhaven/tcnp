import React, { memo, useState } from 'react'
import { format } from 'date-fns'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Smile, CornerUpLeft, Pencil, Trash2, Lock, Check, CheckCheck } from 'lucide-react'
import { cn, isPlatformAdministrator } from '@/lib/utils'

// Types (mirrored from ChatSystem to prevent circular dependencies while keeping it simple)
export type MessageUserMeta = {
    full_name: string
    oscar: string
    role: string
}

export type Message = {
    id: string
    sender_id: string
    content: string
    mentions: string[]
    read_by: string[]
    is_private: boolean
    created_at: string
    reply_to_id?: string | null
    is_archived?: boolean
    deleted_at?: string | null
    deleted_by_admin?: boolean
    edited_at?: string | null
    users: MessageUserMeta
}

export type Reaction = { emoji: string; count: number; userIds: string[] }

export interface MessageBubbleProps {
    msg: Message
    isFirst: boolean
    isLast: boolean
    isOwn: boolean
    displayName: string
    isEditable: boolean
    repliedMsg: Message | null | undefined
    msgReactions: Reaction[]
    // Booleans rather than the shared ids, so only the affected bubble re-renders.
    isHighlighted: boolean
    isPickerOpen: boolean
    searchQuery: string
    currentUserRole: string | undefined
    currentUserId: string | undefined
    canModerate?: boolean
    // Actions
    setShowReactionPicker: (id: string | null) => void
    handleReply: (msg: Message) => void
    handleEdit: (msg: Message) => void
    handleDeleteMessage: (msgId: string, hardDelete?: boolean) => Promise<void>
    toggleReaction: (msgId: string, emoji: string) => Promise<void>
    confirm: (opts: any) => Promise<boolean>
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const

function renderContent(content: string, searchQuery: string, isOwnBubble = false): React.ReactNode {
    const parts = content.split(/(@@?[\w]+(?:\s[\w]+)?)/g)
    return parts.map((part, i) => {
        if (part.startsWith('@@')) return <span key={i} className={cn('inline-flex items-center gap-0.5 rounded px-1 font-semibold', isOwnBubble ? 'bg-white/20' : 'bg-amber-500/15 text-amber-800 dark:text-amber-300')}><Lock aria-hidden="true" className="inline h-3 w-3" />{part}</span>
        if (part.startsWith('@') && part.length > 1) return <span key={i} className={cn('rounded px-1 font-semibold', isOwnBubble ? 'bg-white/20' : 'bg-primary/10 text-primary')}>{part}</span>
        if (searchQuery && part) {
            const segs = part.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
            return segs.map((seg, j) => seg.toLowerCase() === searchQuery.toLowerCase()
                ? <mark key={`${i}-${j}`} className="bg-yellow-300/80 dark:bg-yellow-500/50 text-foreground rounded px-0.5">{seg}</mark>
                : seg)
        }
        return part
    })
}

function getInitials(name?: string | null): string {
    if (!name || typeof name !== 'string') return '?'
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function safeFormatTime(dateStr?: string | null): string {
    if (!dateStr) return ''
    try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return ''
        return format(d, 'HH:mm')
    } catch {
        return ''
    }
}

const resolveDisplayName = (
    fullName?: string | null,
    oscar?: string | null,
    role?: string | null,
    fallback = 'Unknown User'
) => {
    for (const value of [fullName, oscar, role]) {
        if (typeof value !== 'string') continue
        const trimmed = value.trim()
        if (trimmed.length > 0) return trimmed
    }
    return fallback
}

export const getDisplayName = (users?: MessageUserMeta | null) =>
    resolveDisplayName(users?.full_name, users?.oscar, users?.role)

const actionButton = 'hit-area h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:h-8 sm:w-8'

export const MessageBubble = memo(({
    msg,
    isFirst,
    isLast,
    isOwn,
    displayName,
    isEditable,
    repliedMsg,
    msgReactions,
    isHighlighted,
    isPickerOpen,
    searchQuery,
    currentUserRole,
    currentUserId,
    canModerate = isPlatformAdministrator(currentUserRole),
    setShowReactionPicker,
    handleReply,
    handleEdit,
    handleDeleteMessage,
    toggleReaction,
    confirm
}: MessageBubbleProps) => {
    // Touch screens have no hover, so a tap on the bubble reveals its actions instead.
    const [actionsOpen, setActionsOpen] = useState(false)
    const mentionsMe = !isOwn && !!currentUserId && msg.mentions.includes(currentUserId)
    const canDelete = isOwn || canModerate
    const time = safeFormatTime(msg.created_at)
    const readCount = msg.read_by.filter(id => id !== msg.sender_id).length

    const bubbleClasses = isOwn
        ? cn('bg-primary text-primary-foreground', isLast && 'rounded-br-md')
        : cn('bg-card text-foreground border border-border/70', isLast && 'rounded-bl-md', mentionsMe && 'border-primary/30 bg-primary/5')

    const toggleActionsOnTouch = () => {
        if (typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches) {
            setActionsOpen(open => !open)
        }
    }

    const closeAfter = (action: () => void) => () => {
        setActionsOpen(false)
        action()
    }

    const meta = (
        <span
            className={cn(
                'float-right ml-3 mt-1.5 inline-flex translate-y-0.5 items-center gap-1 text-xs leading-none tabular-nums select-none',
                isOwn ? 'text-primary-foreground/75' : 'text-muted-foreground'
            )}
        >
            {!msg.deleted_at && msg.edited_at && <span className="italic">edited</span>}
            <time dateTime={msg.created_at}>{time}</time>
            {isOwn && !msg.deleted_at && (
                readCount > 0
                    ? <CheckCheck aria-label={`Seen by ${readCount}`} className="h-3.5 w-3.5" />
                    : <Check aria-label="Sent" className="h-3.5 w-3.5" />
            )}
        </span>
    )

    return (
        <div id={`msg-${msg.id}`}
            className={cn(
                'flex items-end gap-2 w-full',
                isOwn ? 'flex-row-reverse' : 'justify-start',
                isFirst ? 'mt-3' : 'mt-0.5',
                isHighlighted && 'rounded-xl bg-primary/5 ring-2 ring-primary/40 px-2'
            )}
        >
            {!isOwn && (
                <div className="w-7 flex-shrink-0 self-end">
                    {isLast ? (
                        <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-[11px] font-semibold bg-muted">{getInitials(displayName)}</AvatarFallback>
                        </Avatar>
                    ) : <div className="h-7 w-7" />}
                </div>
            )}

            <div className={cn('flex flex-col relative max-w-[min(85%,36rem)] sm:max-w-[min(75%,36rem)]', isOwn ? 'items-end' : 'items-start')}>
                {!isOwn && isFirst && (
                    <div className="mb-1 px-1 text-xs font-semibold text-primary">
                        {displayName}
                        {msg.is_private && <span title="Visible to mentioned members, executives and admins" className="ml-2 inline-flex items-center gap-1 font-medium text-muted-foreground"><Lock aria-hidden="true" className="h-3 w-3" />Restricted</span>}
                    </div>
                )}
                {isOwn && isFirst && msg.is_private && (
                    <div className="mb-1 flex items-center gap-0.5 px-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <Lock aria-hidden="true" className="h-3 w-3" />Mentioned members + executives + admins
                    </div>
                )}

                {msg.reply_to_id && (
                    <div className="mb-1 max-w-full truncate rounded-lg border-l-2 border-primary/60 bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                        <strong className="text-foreground/80">{repliedMsg ? getDisplayName(repliedMsg.users) : 'Earlier message'}: </strong>
                        <span>{repliedMsg?.deleted_at ? 'Message removed' : repliedMsg?.content || 'Original message unavailable'}</span>
                    </div>
                )}

                <div className="group/msg relative flex max-w-full flex-col">
                    <div
                        onClick={toggleActionsOnTouch}
                        className={cn(
                            'relative rounded-2xl px-3.5 py-2.5 text-[15px] sm:text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]',
                            bubbleClasses,
                            msg.is_private && !isOwn && 'border-l-4 border-l-amber-500',
                            msg.deleted_at && 'opacity-70'
                        )}
                    >
                        {msg.deleted_at ? (
                            msg.deleted_by_admin ? (
                                <span className="italic text-xs">This message was removed by an admin</span>
                            ) : (
                                <span className="italic text-xs">This message was deleted</span>
                            )
                        ) : (
                            <span>{renderContent(msg.content, searchQuery, isOwn)}</span>
                        )}
                        {meta}
                    </div>

                    {(!msg.deleted_at || isPlatformAdministrator(currentUserRole)) && (
                        <div
                            className={cn(
                                'absolute -top-10 z-20 flex gap-0.5 rounded-xl border bg-popover p-1 shadow-lg transition-opacity',
                                isOwn ? 'right-0' : 'left-0',
                                actionsOpen ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'
                            )}
                        >
                            {!msg.deleted_at ? (
                                <>
                                    <button type="button" aria-label="React" aria-expanded={isPickerOpen} onClick={() => setShowReactionPicker(isPickerOpen ? null : msg.id)} className={cn(actionButton, 'hover:bg-muted hover:text-foreground')}><Smile aria-hidden="true" className="h-4 w-4" /></button>
                                    <button type="button" aria-label="Reply" onClick={closeAfter(() => handleReply(msg))} className={cn(actionButton, 'hover:bg-muted hover:text-foreground')}><CornerUpLeft aria-hidden="true" className="h-4 w-4" /></button>
                                    {isEditable && <button type="button" aria-label="Edit" onClick={closeAfter(() => handleEdit(msg))} className={cn(actionButton, 'hover:bg-muted hover:text-foreground')}><Pencil aria-hidden="true" className="h-4 w-4" /></button>}
                                    {canDelete && <button type="button" aria-label="Delete" onClick={async (e) => { e.stopPropagation(); setActionsOpen(false); if (await confirm({ message: 'Delete this message?', variant: 'destructive' })) { void handleDeleteMessage(msg.id) } }} className={cn(actionButton, 'hover:bg-destructive/10 hover:text-destructive')}><Trash2 aria-hidden="true" className="h-4 w-4" /></button>}
                                </>
                            ) : (
                                <button type="button" aria-label="Destroy permanently" onClick={async (e) => { e.stopPropagation(); setActionsOpen(false); if (await confirm({ message: 'Permanently destroy this message?', variant: 'destructive' })) { void handleDeleteMessage(msg.id, true) } }} className={cn(actionButton, 'hover:bg-destructive/10 hover:text-destructive')}><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
                            )}
                        </div>
                    )}

                    {isPickerOpen && (
                        <div role="group" aria-label="Reactions" className={cn('absolute bottom-full z-30 mb-1.5 flex gap-1 rounded-2xl border bg-popover p-1.5 shadow-2xl animate-in slide-in-from-bottom-2 duration-150', isOwn ? 'right-0' : 'left-0')}>
                            {QUICK_REACTIONS.map(emoji => (
                                <button type="button" key={emoji} aria-label={`React ${emoji}`} onClick={() => { void toggleReaction(msg.id, emoji); setShowReactionPicker(null); setActionsOpen(false) }}
                                    className="h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center text-lg transition-transform hover:scale-110 active:scale-95">
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {msgReactions.length > 0 && (
                    <div className={cn('mt-1 flex flex-wrap gap-1 px-0.5', isOwn ? 'justify-end' : 'justify-start')}>
                        {msgReactions.map(r => {
                            const mine = r.userIds.includes(currentUserId ?? '')
                            return (
                                <button type="button" key={r.emoji} aria-pressed={mine} aria-label={`${r.emoji} ${r.count}${mine ? ', including you' : ''}`} onClick={() => void toggleReaction(msg.id, r.emoji)}
                                    className={cn('flex h-7 items-center gap-1 rounded-full border px-2 text-xs transition-colors', mine ? 'border-primary/40 bg-primary/10 font-semibold text-primary' : 'border-border bg-background text-muted-foreground hover:border-primary/30')}>
                                    {r.emoji}<span>{r.count}</span>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
})

MessageBubble.displayName = 'MessageBubble'
