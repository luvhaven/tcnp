'use client'

import { useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { audioManager } from '@/lib/audio/AudioManager'

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
  const permissionRequestedRef = useRef(false)

  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel('global-chat-notify')
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
          }

          // Don't notify for own messages
          if (msg.sender_id === currentUserId) return

          const mentions = Array.isArray(msg.mentions) ? msg.mentions : []
          const isMentioned = mentions.includes(currentUserId)
          const isOnChatPage = pathname?.startsWith('/chat') ?? false

          // Skip toast if user is on chat page and not mentioned
          if (isOnChatPage && !isMentioned) return

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

          // Mentions get their own insistent ping; regular chat keeps the soft pop
          audioManager.playChime(isMentioned ? 'mention' : 'chat')

          // Show Sonner toast with navigation action
          toast(toastTitle, {
            description: preview,
            duration: isMentioned ? 8000 : 5000,
            action: {
              label: 'Open Chat',
              onClick: () => router.push('/chat'),
            },
          })

          // Browser notification when tab is hidden
          if (document.hidden && 'Notification' in window) {
            if (
              !permissionRequestedRef.current &&
              Notification.permission === 'default'
            ) {
              permissionRequestedRef.current = true
              await Notification.requestPermission()
            }

            if (Notification.permission === 'granted') {
              const n = new Notification(`TCNP — ${toastTitle}`, {
                body: preview,
                icon: '/icon-192.png',
                tag: `chat-${msg.id}`,
                requireInteraction: isMentioned,
              })
              n.onclick = () => {
                window.focus()
                router.push('/chat')
                n.close()
              }
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId, pathname, supabase, router])
}
