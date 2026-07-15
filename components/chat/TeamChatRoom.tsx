"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { canModerateTeamChat, cn, OFFICER_TEAMS } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import {
  Users, Send, Trash2, Flag, ShieldCheck, Crown, UserMinus, Loader2, MessagesSquare, AtSign,
} from "lucide-react"

// ─── Singleton client ───
const supabase = createClient()

type TeamMessage = {
  id: string
  sender_id: string
  content: string
  team: string | null
  created_at: string
  deleted_at: string | null
  deleted_by_admin: boolean
  flagged: boolean
  mentions?: string[] | null
  users?: { full_name: string | null; role: string | null; photo_url: string | null } | null
}

type TeamMember = {
  id: string
  full_name: string | null
  role: string | null
  photo_url: string | null
  is_team_head: boolean
  is_online?: boolean
  last_seen: string | null
}

function initials(name?: string | null) {
  if (!name) return "??"
  const parts = name.trim().split(" ")
  return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Render message text with @Full Name tokens highlighted */
function MessageText({ content, members, mine }: { content: string; members: TeamMember[]; mine: boolean }) {
  const names = members
    .map(m => m.full_name?.trim())
    .filter((n): n is string => !!n)
    .sort((a, b) => b.length - a.length)

  if (names.length === 0) return <p className="whitespace-pre-wrap break-words text-sm">{content}</p>

  const pattern = new RegExp(`@(${names.map(escapeRegExp).join("|")})`, "g")
  const parts = content.split(pattern)

  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {parts.map((part, i) =>
        // Odd indices are captured names from the alternation group
        i % 2 === 1 ? (
          <span
            key={i}
            className={cn(
              "rounded px-1 py-0.5 font-semibold",
              mine ? "bg-white/20" : "bg-primary/15 text-primary"
            )}
          >
            @{part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  )
}

const TEAM_THEME: Record<string, { label: string; gradient: string; accent: string }> = {
  strength: { label: "Team Strength", gradient: "from-red-950 via-slate-900 to-slate-900", accent: "text-red-300" },
  wisdom: { label: "Team Wisdom", gradient: "from-blue-950 via-slate-900 to-slate-900", accent: "text-blue-300" },
  swift: { label: "Team Swift", gradient: "from-violet-950 via-slate-900 to-slate-900", accent: "text-violet-300" },
}

export default function TeamChatRoom() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const team = currentUser?.team ?? null
  const theme = team ? TEAM_THEME[team] : null
  const canModerate = canModerateTeamChat(currentUser?.role, currentUser?.is_team_head)

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["team-chat", team],
    queryFn: async () => {
      if (!team) return []
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, sender_id, content, team, created_at, deleted_at, deleted_by_admin, flagged, mentions, users:sender_id(full_name, role, photo_url)")
        .eq("team", team)
        .order("created_at", { ascending: true })
        .limit(300)
      if (error) throw error
      return (data ?? []) as unknown as TeamMessage[]
    },
    enabled: !!team,
  })

  const { data: members = [] } = useQuery({
    queryKey: ["team-members", team],
    queryFn: async () => {
      if (!team) return []
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, role, photo_url, is_team_head, last_seen")
        .eq("team", team)
        .order("is_team_head", { ascending: false })
        .order("full_name")
      if (error) throw error
      return (data ?? []).map((m: any) => ({
        ...m,
        is_online: m.last_seen != null && m.last_seen >= fiveMinAgo,
      })) as TeamMember[]
    },
    enabled: !!team,
    // is_online is a snapshot of last_seen freshness at fetch time — without a
    // periodic refetch, a member who goes offline stays "online" in the UI for
    // as long as the chat stays open with no refocus/invalidation to re-check it.
    refetchInterval: 60 * 1000,
  })

  // Realtime: new/updated team messages
  useEffect(() => {
    if (!team) return
    const channel = supabase
      .channel(`team-chat-${team}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `team=eq.${team}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["team-chat", team] })
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [team, queryClient])

  // Autoscroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  // ── @mention machinery ────────────────────────────────────────────────────
  // The active "@query" is the text between the last '@' and the caret-end of
  // the draft. Selecting a member replaces it with the canonical @Full Name.
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return members
      .filter(m => m.id !== currentUser?.id && m.full_name)
      .filter(m => !q || m.full_name!.toLowerCase().includes(q))
      .slice(0, 6)
  }, [mentionQuery, members, currentUser?.id])

  const handleDraftChange = (value: string) => {
    setDraft(value)
    const at = value.lastIndexOf("@")
    if (at === -1) { setMentionQuery(null); return }
    const tail = value.slice(at + 1)
    // Close the picker once the token clearly ended (two words + space, or punctuation)
    if (/[.,!?\n]/.test(tail) || tail.split(" ").length > 3) { setMentionQuery(null); return }
    setMentionQuery(tail)
    setMentionIndex(0)
  }

  const pickMention = (member: TeamMember) => {
    if (!member.full_name) return
    const at = draft.lastIndexOf("@")
    setDraft(`${draft.slice(0, at)}@${member.full_name} `)
    setMentionQuery(null)
    inputRef.current?.focus()
  }

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionQuery === null || mentionCandidates.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setMentionIndex(i => (i + 1) % mentionCandidates.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setMentionIndex(i => (i - 1 + mentionCandidates.length) % mentionCandidates.length)
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      pickMention(mentionCandidates[mentionIndex])
    } else if (e.key === "Escape") {
      setMentionQuery(null)
    }
  }

  const send = async () => {
    const content = draft.trim()
    if (!content || !currentUser || !team) return
    setSending(true)
    try {
      // Mentions = team members whose canonical @Full Name appears in the text
      const mentionedIds = members
        .filter(m => m.id !== currentUser.id && m.full_name && content.includes(`@${m.full_name}`))
        .map(m => m.id)

      const { error } = await supabase.from("chat_messages").insert({
        sender_id: currentUser.id,
        content,
        team,
        is_private: false,
        mentions: mentionedIds,
      })
      if (error) throw error
      setDraft("")
      setMentionQuery(null)
      queryClient.invalidateQueries({ queryKey: ["team-chat", team] })
    } catch (err: any) {
      toast.error(err.message || "Failed to send")
    } finally {
      setSending(false)
    }
  }

  const moderateMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "delete" | "flag" | "unflag" }) => {
      const updates: any = action === "delete"
        ? { deleted_at: new Date().toISOString(), deleted_by_admin: true }
        : { flagged: action === "flag", flagged_by: currentUser?.id ?? null }
      const { error } = await supabase.from("chat_messages").update(updates).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-chat", team] }),
    onError: (err: any) => toast.error(err.message || "Moderation failed"),
  })

  const removeMember = async (member: TeamMember) => {
    const ok = await confirm({
      title: "Remove from team?",
      message: `${member.full_name ?? "This officer"} will be removed from ${theme?.label ?? "the team"} and its chatroom.`,
    })
    if (!ok) return
    try {
      const res = await fetch("/api/teams/remove-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: member.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to remove member")
      toast.success("Officer removed from team")
      queryClient.invalidateQueries({ queryKey: ["team-members", team] })
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member")
    }
  }

  if (userLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!team) {
    return (
      <div className="empty-state rounded-xl border">
        <Users className="h-10 w-10" />
        <p className="font-medium">You&apos;re not in a team yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Every officer belongs to Team Strength, Wisdom or Swift. Ask an admin to assign your team, then your team chatroom appears here.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      {/* Team header */}
      <div className={`bg-gradient-to-r ${theme?.gradient ?? "from-slate-900 to-slate-800"} px-4 py-3 text-white`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessagesSquare className={`h-5 w-5 ${theme?.accent ?? "text-slate-300"}`} />
            <div>
              <p className="font-semibold leading-tight">{theme?.label ?? team}</p>
              <p className="text-[11px] text-slate-400">{members.length} member{members.length === 1 ? "" : "s"} · members-only room</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canModerate && (
              <Badge className="hidden gap-1 border-0 bg-white/10 text-[10px] uppercase tracking-wide text-white sm:inline-flex">
                <ShieldCheck className="h-3 w-3" /> Moderator
              </Badge>
            )}
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-white hover:bg-white/10" onClick={() => setShowMembers(v => !v)}>
              <Users className="h-4 w-4" /> {showMembers ? "Hide" : "Members"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row">
        {/* Messages column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="h-[440px] space-y-3 overflow-y-auto p-4">
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12 w-2/3 rounded-xl" />)}</div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <MessagesSquare className="h-8 w-8 opacity-40" />
                <p className="text-sm">No messages yet — say hello to your team!</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map(msg => {
                  const mine = msg.sender_id === currentUser?.id
                  const deleted = !!msg.deleted_at
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn("group flex items-end gap-2", mine && "flex-row-reverse")}
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        {msg.users?.photo_url ? <AvatarImage src={msg.users.photo_url} /> : <AvatarFallback className="text-[10px]">{initials(msg.users?.full_name)}</AvatarFallback>}
                      </Avatar>
                      <div className={cn(
                        "chat-bubble rounded-2xl px-3.5 py-2",
                        mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted",
                        // A message that mentions ME gets an amber accent so it never slips by
                        !mine && (msg.mentions ?? []).includes(currentUser?.id ?? "") &&
                          "bg-amber-500/15 ring-1 ring-amber-500/40"
                      )}>
                        {!mine && (
                          <p className="mb-0.5 text-[10px] font-semibold opacity-70">{msg.users?.full_name ?? "Officer"}</p>
                        )}
                        {deleted ? (
                          <p className="text-xs italic opacity-60">Message removed by a moderator</p>
                        ) : (
                          <MessageText content={msg.content} members={members} mine={mine} />
                        )}
                        <div className={cn("mt-0.5 flex items-center gap-2 text-[9px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          {msg.flagged && !deleted && (
                            <span className="inline-flex items-center gap-0.5 text-amber-500"><Flag className="h-2.5 w-2.5" /> flagged</span>
                          )}
                        </div>
                      </div>
                      {/* Moderation actions */}
                      {canModerate && !deleted && (
                        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6 text-amber-500" title={msg.flagged ? "Unflag" : "Flag message"}
                            onClick={() => moderateMutation.mutate({ id: msg.id, action: msg.flagged ? "unflag" : "flag" })}
                          >
                            <Flag className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6 text-red-500" title="Delete message"
                            onClick={async () => {
                              const ok = await confirm({ title: "Delete message?", message: "The message will be hidden for all team members." })
                              if (ok) moderateMutation.mutate({ id: msg.id, action: "delete" })
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => { e.preventDefault(); void send() }}
            className="relative flex items-center gap-2 border-t p-3"
          >
            {/* @mention autocomplete popover */}
            <AnimatePresence>
              {mentionQuery !== null && mentionCandidates.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full left-3 z-20 mb-1.5 w-64 overflow-hidden rounded-xl border bg-popover shadow-xl"
                >
                  <p className="border-b bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Mention a teammate
                  </p>
                  {mentionCandidates.map((m, i) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseEnter={() => setMentionIndex(i)}
                      onClick={() => pickMention(m)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                        i === mentionIndex ? "bg-primary/10" : "hover:bg-muted/60"
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-7 w-7">
                          {m.photo_url ? <AvatarImage src={m.photo_url} /> : <AvatarFallback className="text-[9px]">{initials(m.full_name)}</AvatarFallback>}
                        </Avatar>
                        <span className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background", m.is_online ? "bg-green-500" : "bg-zinc-400")} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.full_name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{(m.role ?? "").replace(/_/g, " ")}</p>
                      </div>
                      {m.is_team_head && <Crown className="h-3 w-3 shrink-0 text-amber-500" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground"
              title="Mention a teammate"
              aria-label="Mention a teammate"
              onClick={() => { handleDraftChange(draft.endsWith("@") ? draft : `${draft}@`); inputRef.current?.focus() }}
            >
              <AtSign className="h-4 w-4" />
            </Button>
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={`Message ${theme?.label ?? "your team"}… use @ to mention`}
              maxLength={2000}
              autoComplete="off"
            />
            <Button type="submit" size="icon" disabled={sending || !draft.trim()} aria-label="Send message">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>

        {/* Members panel — sidebar on desktop, stacked section on mobile */}
        {showMembers && (
          <div className="w-full border-t sm:w-60 sm:shrink-0 sm:border-l sm:border-t-0">
            <p className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Members</p>
            <div className="max-h-[220px] space-y-0.5 overflow-y-auto p-2 sm:max-h-[440px]">
              {members.map(m => (
                <div key={m.id} className="group flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted/60">
                  <div className="relative">
                    <Avatar className="h-8 w-8">
                      {m.photo_url ? <AvatarImage src={m.photo_url} /> : <AvatarFallback className="text-[10px]">{initials(m.full_name)}</AvatarFallback>}
                    </Avatar>
                    <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background", m.is_online ? "bg-green-500" : "bg-zinc-400")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-xs font-medium">
                      {m.is_team_head && <Crown className="h-3 w-3 shrink-0 text-amber-500" />}
                      {m.full_name ?? "Officer"}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">{(m.role ?? "").replace(/_/g, " ")}</p>
                  </div>
                  {canModerate && m.id !== currentUser?.id && (
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-red-500 opacity-0 transition-opacity group-hover:opacity-100"
                      title="Remove from team"
                      onClick={() => void removeMember(m)}
                    >
                      <UserMinus className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
