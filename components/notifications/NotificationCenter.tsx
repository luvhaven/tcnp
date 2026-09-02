"use client"

import { useRef, useState } from "react"
import { useNotifications, AppNotification, NotificationType, resolveNotificationRoute } from "@/hooks/useNotifications"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bell,
  BellOff,
  CheckCheck,
  Trash2,
  X,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Radio,
  MessageCircle,
  Megaphone,
  CakeSlice,
  Clock3,
  ChevronRight,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<
  NotificationType,
  { icon: React.ElementType; color: string; bg: string; border: string; label: string }
> = {
  info:         { icon: Info,          color: "text-blue-500",  bg: "bg-blue-50 dark:bg-blue-950/40",  border: "border-l-blue-500",  label: "Info"        },
  success:      { icon: CheckCircle2,  color: "text-green-500", bg: "bg-green-50 dark:bg-green-950/40",border: "border-l-green-500", label: "Success"     },
  warning:      { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40",border: "border-l-amber-500", label: "Warning"     },
  error:        { icon: AlertOctagon,  color: "text-red-500",   bg: "bg-red-50 dark:bg-red-950/40",    border: "border-l-red-500",   label: "Error"       },
  broken_arrow: { icon: AlertOctagon,  color: "text-red-600",   bg: "bg-red-100 dark:bg-red-950/60",   border: "border-l-red-600",   label: "BROKEN ARROW"},
  call_sign:    { icon: Radio,         color: "text-primary",   bg: "bg-primary/5",                    border: "border-l-primary",   label: "Call-Sign"   },
  chat:         { icon: MessageCircle, color: "text-violet-500",bg: "bg-violet-50 dark:bg-violet-950/40",border: "border-l-violet-500",label: "Chat"      },
  announcement: { icon: Megaphone,     color: "text-indigo-500",bg: "bg-indigo-50 dark:bg-indigo-950/40",border: "border-l-indigo-500",label: "Announcement" },
  birthday_reminder: { icon: CakeSlice,color: "text-pink-500",  bg: "bg-pink-50 dark:bg-pink-950/40", border: "border-l-pink-500",  label: "Birthday"    },
  alert:        { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40",border: "border-l-amber-500", label: "Alert"       },
  reminder:     { icon: Clock3,        color: "text-sky-500",   bg: "bg-sky-50 dark:bg-sky-950/40",  border: "border-l-sky-500",   label: "Reminder"    },
}

function getTypeMeta(type: string) {
  return TYPE_META[type as NotificationType] ?? TYPE_META.info
}

// ─── Individual Notification Item ─────────────────────────────────────────────

function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
  onNavigate,
}: {
  notification: AppNotification
  onMarkRead: (id: string) => void
  onDelete: (id: string) => void
  onNavigate: (url: string | null | undefined) => void
}) {
  const meta = getTypeMeta(notification.type)
  const Icon = meta.icon
  const isBrokenArrow = notification.type === 'broken_arrow'

  const timeAgo = notification.created_at && !isNaN(new Date(notification.created_at).getTime())
    ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })
    : "just now"

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "group relative flex gap-3 border-l-[3px] px-4 py-3 transition-colors",
        meta.bg,
        meta.border,
        !notification.is_read && "font-medium",
        isBrokenArrow && "animate-pulse-once"
      )}
    >
      {/* Type Icon */}
      <div className={cn("mt-0.5 flex-shrink-0", meta.color)}>
        <Icon className={cn("h-4 w-4", isBrokenArrow && "animate-ping-slow")} />
      </div>

      {/* Content */}
      <div
        className="min-w-0 flex-1 cursor-pointer"
        onClick={() => {
          if (!notification.is_read) onMarkRead(notification.id)
          onNavigate(resolveNotificationRoute(notification))
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm leading-snug", meta.color, isBrokenArrow && "font-bold uppercase tracking-wide")}>
            {notification.title}
          </p>
          {!notification.is_read && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary"
            />
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground/70">{timeAgo}</p>
      </div>

      {/* Actions.
          These used to be opacity-0 until group-hover, which meant that on any
          touch device — where no hover event ever fires — they were permanently
          invisible and dismissing a notification was impossible. Reveal-on-hover
          is now scoped to pointers that actually support hovering; touch gets
          them shown outright. focus-within keeps them reachable by keyboard. */}
      <div
        className="absolute right-2 top-2 flex items-center gap-1 transition-opacity
                   [@media(hover:hover)]:opacity-0
                   [@media(hover:hover)]:group-hover:opacity-100
                   [@media(hover:hover)]:group-focus-within:opacity-100"
      >
        {!notification.is_read && (
          <button
            type="button"
            title="Mark as read"
            aria-label="Mark notification as read"
            onClick={(e) => { e.stopPropagation(); onMarkRead(notification.id) }}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-primary"
          >
            <CheckCheck className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          title="Dismiss"
          aria-label="Dismiss notification"
          onClick={(e) => { e.stopPropagation(); onDelete(notification.id) }}
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  )
}

// ─── Filter Tab ──────────────────────────────────────────────────────────────

type FilterTab = "all" | "unread" | "broken_arrow"

// ─── Main NotificationCenter ─────────────────────────────────────────────────

export default function NotificationCenter() {
  const router = useRouter()
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<FilterTab>("all")
  const panelRef = useRef<HTMLDivElement>(null)

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.is_read
    if (filter === "broken_arrow") return n.type === "broken_arrow"
    return true
  })

  const emergencyCount = notifications.filter((n) => n.type === "broken_arrow" && !n.is_read).length

  const handleNavigate = (url: string | null | undefined) => {
    setOpen(false)
    if (url) router.push(url)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* ─── Bell Button ─── */}
      <Button
        id="notification-bell"
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        className="relative"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <motion.div
          animate={unreadCount > 0 ? { rotate: [0, -15, 15, -10, 10, 0] } : {}}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 4 }}
        >
          <Bell className="h-5 w-5" />
        </motion.div>

        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className={cn(
                "notification-badge badge-pop",
                emergencyCount > 0 && "bg-red-600 animate-pulse"
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>

      {/* ─── Notification Panel ─── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop for closing */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />

            <motion.div
              key="panel"
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className={cn(
                // Mobile: fixed to viewport so it never overflows
                "fixed right-2 top-[68px] z-50",
                // sm+: back to absolute anchored to the bell button
                "sm:absolute sm:right-0 sm:top-[calc(100%+8px)]",
                // Responsive width: fills the screen on mobile, capped at 380px on desktop
                "w-[calc(100vw-1rem)] max-w-[380px] sm:w-[380px] overflow-hidden",
                "rounded-xl border bg-popover shadow-2xl shadow-black/15 ring-1 ring-border/50",
                "flex flex-col max-h-[calc(100vh-80px)] sm:max-h-[520px]"
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b bg-card/80 px-4 py-3 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={markAllAsRead}
                      className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-primary"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setOpen(false)}
                    aria-label="Close notifications"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex border-b bg-muted/30 px-2 pt-1">
                {(["all", "unread", "broken_arrow"] as FilterTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    aria-pressed={filter === tab}
                    className={cn(
                      "relative px-3 py-2 text-xs font-medium capitalize transition-colors",
                      filter === tab
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab === "broken_arrow" ? "🚨 Emergency" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {filter === tab && (
                      <motion.div
                        layoutId="tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary"
                      />
                    )}
                    {tab === "unread" && unreadCount > 0 && (
                      <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {unreadCount}
                      </span>
                    )}
                    {tab === "broken_arrow" && emergencyCount > 0 && (
                      <span className="ml-1 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                        {emergencyCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Notification List */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                {loading ? (
                  <div className="space-y-0.5 p-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-3 rounded-lg p-3">
                        <div className="h-4 w-4 rounded-full skeleton flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 w-3/4 rounded skeleton" />
                          <div className="h-3 w-full rounded skeleton" />
                          <div className="h-2.5 w-1/3 rounded skeleton" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                    <div className="rounded-full bg-muted p-4">
                      <BellOff className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {filter === "unread" ? "You're all caught up!" : "No notifications"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground/70">
                        {filter === "unread"
                          ? "No unread notifications."
                          : "New notifications will appear here."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    <div className="divide-y divide-border/50">
                      {filtered.map((n) => (
                        <NotificationItem
                          key={n.id}
                          notification={n}
                          onMarkRead={markAsRead}
                          onDelete={deleteNotification}
                          onNavigate={handleNavigate}
                        />
                      ))}
                    </div>
                  </AnimatePresence>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="border-t bg-card/80 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => { setOpen(false); router.push('/audit-logs') }}
                    className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <span>View full activity log</span>
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
