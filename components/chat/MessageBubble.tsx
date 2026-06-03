import React, { memo } from 'react'
import { format } from 'date-fns'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Smile, CornerUpLeft, Pencil, Trash2, Lock } from 'lucide-react'

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
    highlightedMessageId: string | null
    searchQuery: string
    showReactionPicker: string | null
    currentUserRole: string | undefined
    currentUserId: string | undefined
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
        if (part.startsWith('@@')) return <span key={i} className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.78em] font-semibold mx-0.5 ${isOwnBubble ? 'bg-white/25 text-white' : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'}`}><Lock className="inline h-2.5 w-2.5" />{part}</span>
        if (part.startsWith('@') && part.length > 1) return <span key={i} className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.78em] font-semibold mx-0.5 ${isOwnBubble ? 'bg-white/25 text-white' : 'bg-primary/20 text-primary'}`}>{part}</span>
        if (searchQuery && part) {
            const segs = part.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
            return segs.map((seg, j) => seg.toLowerCase() === searchQuery.toLowerCase()
                ? <mark key={`${i}-${j}`} className="bg-yellow-300/80 dark:bg-yellow-500/50 text-foreground rounded px-0.5">{seg}</mark>
                : seg)
        }
        return part
    })
}

function getInitials(name: string): string {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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

export const getDisplayName = (users?: MessageUserMeta) =>
    resolveDisplayName(users?.full_name, users?.oscar, users?.role)

export const MessageBubble = memo(({
    msg,
    isFirst,
    isLast,
    isOwn,
    displayName,
    isEditable,
    repliedMsg,
    msgReactions,
    highlightedMessageId,
    searchQuery,
    showReactionPicker,
    currentUserRole,
    currentUserId,
    setShowReactionPicker,
    handleReply,
    handleEdit,
    handleDeleteMessage,
    toggleReaction,
    confirm
}: MessageBubbleProps) => {
    const outgoingTailClasses = isFirst ? 'rounded-[20px] rounded-tr-[4px]' : 'rounded-[20px]'
    const incomingTailClasses = isFirst ? 'rounded-[20px] rounded-tl-[4px]' : 'rounded-[20px]'
    const bubbleClasses = isOwn
        ? `bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm shadow-primary/20 ${outgoingTailClasses}`
        : `bg-card border border-border/50 text-foreground shadow-sm ${incomingTailClasses}`

    return (
        <div id={`msg-${msg.id}`}
            className={`flex items-end gap-2 group w-full animate-in fade-in slide-in-from-bottom-2 duration-300 ${isOwn ? 'flex-row-reverse justify-start' : 'justify-start'} ${isFirst ? 'mt-3' : 'mt-0.5'} ${highlightedMessageId === msg.id ? 'ring-2 ring-primary/40 rounded-xl bg-primary/5 px-2' : ''}`}
        >
            {!isOwn && (
                <div className="w-7 flex-shrink-0 self-end mb-1">
                    {isLast ? (
                        <Avatar className="h-7 w-7 border border-background shadow-sm">
                            <AvatarFallback className="text-[10px] font-bold bg-muted">{getInitials(displayName)}</AvatarFallback>
                        </Avatar>
                    ) : <div className="h-7 w-7" />}
                </div>
            )}

            <div className={`flex flex-col relative max-w-[calc(100%-2.5rem)] sm:max-w-[75%] min-w-[140px] ${isOwn ? 'items-end' : 'items-start'}`}>
                {isFirst && isOwn && msg.is_private && (
                    <div className="flex items-center gap-0.5 text-[10px] text-amber-600 font-medium mb-1 px-1 flex-row-reverse">
                        <Lock className="h-2.5 w-2.5" />Private
                    </div>
                )}

                {repliedMsg && (
                    <div className={`text-[11px] text-muted-foreground mb-1 px-2.5 py-1.5 border-l-2 border-primary/50 bg-muted/40 max-w-full truncate ${isOwn ? 'mr-0' : 'ml-0'}`}>
                        <strong className="text-foreground/70">{getDisplayName(repliedMsg.users)}: </strong>
                        <span>{repliedMsg.content}</span>
                    </div>
                )}

                <div className="relative group/msg w-full flex flex-col">
                    <div className={`relative px-3 pt-2 pb-5 shadow-sm text-[13.5px] leading-relaxed whitespace-pre-wrap break-words
            ${bubbleClasses}
            ${msg.is_private && !isOwn ? 'border-l-4 border-l-amber-400' : ''}
            ${msg.deleted_at ? 'opacity-70' : ''}`}>

                        {!isOwn && isFirst && (
                            <div className="text-[11.5px] font-extrabold text-primary mb-0.5 leading-none tracking-tight">
                                {displayName} {msg.is_private && <Lock className="inline-block h-2.5 w-2.5 text-amber-500 ml-0.5" />}
                            </div>
                        )}

                        {msg.deleted_at ? (
                            msg.deleted_by_admin ? (
                                <div className={`italic text-[11px] w-full ${isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground/60'}`}>
                                    This message was deleted by Admin
                                </div>
                            ) : (
                                ['super_admin', 'dev_admin', 'admin'].includes(currentUserRole ?? '') ? (
                                    <>
                                        <div className="break-words mb-1.5">{renderContent(msg.content, searchQuery, isOwn)}</div>
                                        <div className={`italic text-[11px] font-medium leading-tight ${isOwn ? 'text-white/80' : 'text-muted-foreground/80'}`}>
                                            (Deleted by {displayName})
                                        </div>
                                    </>
                                ) : (
                                    <div className={`italic text-[11px] leading-tight ${isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground/60'}`}>
                                        This message was deleted by {displayName}
                                    </div>
                                )
                            )
                        ) : (
                            <div className="break-words">
                                {renderContent(msg.content, searchQuery, isOwn)}
                            </div>
                        )}

                        <div className={`absolute bottom-1 right-2 flex items-center gap-1.5 ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground/70'}`}>
                            {(!msg.deleted_at && (msg as any).edited_at) && <span className="text-[9px] italic">(edited)</span>}
                            <span className="text-[9px] font-medium leading-none">{format(new Date(msg.created_at), 'HH:mm')}</span>
                        </div>
                    </div>

                    {!msg.deleted_at && (
                        <div className={`absolute -top-9 ${isOwn ? 'right-0' : 'left-0'} opacity-0 group-hover/msg:opacity-100 transition-opacity flex gap-0.5 bg-background/95 backdrop-blur-sm rounded-xl p-1 shadow-lg border z-20`}>
                            <button onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)} title="React" className="h-6 w-6 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"><Smile className="h-3.5 w-3.5" /></button>
                            <button onClick={() => handleReply(msg)} title="Reply" className="h-6 w-6 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"><CornerUpLeft className="h-3.5 w-3.5" /></button>
                            {isEditable && <button onClick={() => handleEdit(msg)} title="Edit" className="h-6 w-6 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"><Pencil className="h-3.5 w-3.5" /></button>}
                            {(isOwn || ['super_admin', 'dev_admin', 'admin'].includes(currentUserRole ?? '')) && <button onClick={async (e) => { e.preventDefault(); e.stopPropagation(); if (await confirm({ message: 'Are you sure you want to delete this message?', variant: 'destructive' })) { void handleDeleteMessage(msg.id); } }} title="Delete" className="h-6 w-6 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
                        </div>
                    )}
                    {msg.deleted_at && ['super_admin', 'dev_admin', 'admin'].includes(currentUserRole ?? '') && (
                        <div className={`absolute -top-9 ${isOwn ? 'right-0' : 'left-0'} opacity-0 group-hover/msg:opacity-100 transition-opacity flex gap-0.5 bg-background/95 backdrop-blur-sm rounded-xl p-1 shadow-lg border z-20`}>
                            <button onClick={async (e) => { e.preventDefault(); e.stopPropagation(); if (await confirm({ message: 'Permanently destroy this message?', variant: 'destructive' })) { void handleDeleteMessage(msg.id, true); } }} title="Destroy permanently" className="h-6 w-6 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                    )}

                    {showReactionPicker === msg.id && (
                        <div className={`absolute bottom-full ${isOwn ? 'right-0' : 'left-0'} mb-1.5 flex gap-1 bg-background border rounded-2xl p-1.5 shadow-2xl z-20 animate-in slide-in-from-bottom-2 duration-150`}>
                            {QUICK_REACTIONS.map(emoji => (
                                <button key={emoji} onClick={() => { void toggleReaction(msg.id, emoji); setShowReactionPicker(null) }}
                                    className="h-8 w-8 rounded-xl hover:bg-muted flex items-center justify-center text-lg transition-all hover:scale-125 active:scale-95">
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {msgReactions.length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1.5 px-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        {msgReactions.map(r => (
                            <button key={r.emoji} onClick={() => void toggleReaction(msg.id, r.emoji)}
                                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border transition-all hover:scale-105 active:scale-95 ${r.userIds.includes(currentUserId ?? '') ? 'bg-primary/15 border-primary/40 text-primary font-bold' : 'bg-background border-border text-muted-foreground hover:border-primary/30'}`}>
                                {r.emoji}<span>{r.count}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
})

MessageBubble.displayName = 'MessageBubble'
