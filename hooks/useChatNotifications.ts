'use client'

import { useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePathname, useRouter } from 'next/navigation'
import { presentNotification } from '@/lib/notification-presentation'
import { uniqueTopic } from '@/lib/realtime/topic'
import { showSystemNotification } from '@/lib/services/system-notification'
import { devicePushConnected } from '@/lib/device-push'

// Audio is handled by the global AudioManager singleton (respects global mute)

/**
 * Global hook — mount once in the dashboard layout.
 * Listens for new chat_messages and notifies the user when they are
 * not on the /chat page, or when they are @mentioned anywhere.
 */
export function useChatNotifications(currentUserId: string | null) {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const router = useRouter()
  // Read through a ref: with pathname as a dependency the channel was torn down and
  // rebuilt on every navigation, and the rebuilt one never received events.
  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  useEffect(() => {
    if (!currentUserId) return
    let live = true

    const channel = supabase
      .channel(uniqueTopic('global-chat-notify'))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          const msg = payload.new as {
            id: string
            sender_id: string
            content: string
            mentions: string[] | null
            is_private: boolean
            program_id?: string | null
            papa_id?: string | null
            team?: string | null
          }

          // Don't notify for own messages
          if (msg.sender_id === currentUserId) return

          const mentions = Array.isArray(msg.mentions) ? msg.mentions : []
          const isMentioned = mentions.includes(currentUserId)
          const isOnChatPage = pathnameRef.current?.startsWith('/chat') ?? false

          // Skip toast if user is on chat page and not mentioned
          if (isOnChatPage && !document.hidden && document.hasFocus() && !isMentioned) return

          // Fetch sender name
          let senderName = 'Team member'
          try {
            const { data } = await supabase
              .from('users')
              .select('full_name')
              .eq('id', msg.sender_id)
              .maybeSingle()
            if (data?.full_name) senderName = data.full_name
          } catch {
            // Non-fatal
          }

          const preview = (msg.content ?? '').slice(0, 100)
          const toastTitle = isMentioned
            ? `${senderName} mentioned you`
            : senderName
          const params = new URLSearchParams({ highlight: msg.id })
          if (msg.program_id) params.set('programId', msg.program_id)
          if (msg.papa_id) params.set('papaId', msg.papa_id)
          if (msg.team) params.set('team', msg.team)
          const roomUrl = `/chat?${params}`

          if (!live) return
          // The stored mention and this realtime message use the same key, so
          // either may arrive first without duplicating the banner or sound.
          presentNotification({ id: `chat:${msg.id}`, title: toastTitle, message: preview,
            kind: isMentioned ? 'mention' : 'chat', category: 'chat', persisted: false, onOpen: () => router.push(roomUrl) })

          // System notification while the tab is in the background
          if ((document.hidden || !document.hasFocus()) && !(isMentioned && await devicePushConnected())) {
            void showSystemNotification(`TCNP — ${toastTitle}`, {
              body: preview,
              tag: `chat-${msg.id}`,
              requireInteraction: isMentioned,
              onClickUrl: roomUrl,
            })
          }
        }
      )
      .subscribe()

    return () => {
      live = false
      supabase.removeChannel(channel)
    }
  }, [currentUserId, supabase, router])
}
