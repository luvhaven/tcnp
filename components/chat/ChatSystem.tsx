'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { MessageCircle, Send, Users, AtSign, Lock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  RealtimePresenceState
} from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row']
type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert']
type NotificationInsert = Database['public']['Tables']['notifications']['Insert']

type RawMessage = ChatMessageRow & {
  users?: {
    full_name: string
    oscar: string
    role: string
  }
}

const pickFirstNonEmpty = (...values: (string | null | undefined)[]) => {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }
  return null
}

const resolveDisplayName = (
  fullName?: string | null,
  oscar?: string | null,
  role?: string | null,
  fallback = 'Unknown User'
) => {
  return pickFirstNonEmpty(fullName, oscar, role) ?? fallback
}

const parseJsonArray = (value: unknown): string[] => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : []
    } catch {
      return []
    }
  }
  return []
}

type MessageUserMeta = {
  full_name: string
  oscar: string
  role: string
}

type Message = {
  id: string
  sender_id: string
  content: string
  mentions: string[]
  read_by: string[]
  is_private: boolean
  created_at: string
  users: MessageUserMeta
}

type User = {
  id: string
  full_name: string
  oscar: string
  role: string
  is_online: boolean
  last_seen: string | null
}

type ChatParticipant = {
  id: string
  full_name: string
  oscar: string
  role: string
  is_online: boolean | null
  last_seen: string | null
}

export default function ChatSystem({ programId }: { programId?: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [messages, setMessages] = useState<Message[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [newMessage, setNewMessage] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(true)
  const [showUserList, setShowUserList] = useState(false)
  const [selectedMentions, setSelectedMentions] = useState<string[]>([])
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [mentionType, setMentionType] = useState<'@' | '@@'>('@')
  const [cursorPosition, setCursorPosition] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const presenceChannelRef = useRef<RealtimeChannel | null>(null)
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const markedMessagesRef = useRef<Set<string>>(new Set())
  const missingUsersRef = useRef<Set<string>>(new Set())
  const onlineUserIdsRef = useRef<string[]>([])

  const userDirectory = useMemo<Record<string, MessageUserMeta>>(() => {
    const directory: Record<string, MessageUserMeta> = {}

    users.forEach((user) => {
      directory[user.id] = {
        full_name: user.full_name,
        oscar: user.oscar,
        role: user.role
      }
    })

    if (currentUser?.id) {
      directory[currentUser.id] = {
        full_name: currentUser.full_name ?? 'You',
        oscar: currentUser.oscar ?? '',
        role: currentUser.role ?? ''
      }
    }

    return directory
  }, [users, currentUser])

  const ensureUserProfile = useCallback(async (userId: string) => {
    if (!userId) return
    if (userDirectory[userId]) return
    if (missingUsersRef.current.has(userId)) return

    missingUsersRef.current.add(userId)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, oscar, role, last_seen')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        console.error('❌ Failed to fetch user profile for message sender:', { userId, error })
        return
      }

      if (data) {
        setUsers((prev) => {
          if (prev.some((user) => user.id === userId)) {
            return prev.map((user) =>
              user.id === userId
                ? {
                    ...user,
                    full_name: data.full_name || user.full_name || 'Unknown User',
                    oscar: data.oscar || user.oscar,
                    role: data.role || user.role
                  }
                : user
            )
          }

          return [
            ...prev,
            {
              id: data.id,
              full_name: data.full_name || 'Unknown User',
              oscar: data.oscar || '',
              role: data.role || '',
              is_online: false,
              last_seen: data.last_seen ?? null
            }
          ]
        })
      }
    } catch (error) {
      console.error('❌ Unexpected error fetching user profile:', { userId, error })
    } finally {
      missingUsersRef.current.delete(userId)
    }
  }, [supabase, userDirectory])

  const playNotification = useCallback(() => {
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = context.createOscillator()
      const gainNode = context.createGain()

      oscillator.type = 'triangle'
      oscillator.frequency.value = 880
      gainNode.gain.value = 0.15

      oscillator.connect(gainNode)
      gainNode.connect(context.destination)

      oscillator.start()
      oscillator.stop(context.currentTime + 0.15)

      if ('vibrate' in navigator) {
        navigator.vibrate(120)
      }
    } catch (error) {
      console.error('❌ Notification playback failed:', error)
    }
  }, [])

  const transformMessage = useCallback((message: RawMessage): Message => {
    const mentions = parseJsonArray(message.mentions)
    const readBy = parseJsonArray(message.read_by)
    
    // Safely extract user metadata with fallbacks
    let userMeta: MessageUserMeta = { full_name: 'Unknown User', oscar: '', role: '' }
    
    if (message.users) {
      userMeta = {
        full_name: message.users.full_name || 'Unknown User',
        oscar: message.users.oscar || '',
        role: message.users.role || ''
      }
    } else if (message.sender_id && userDirectory[message.sender_id]) {
      userMeta = userDirectory[message.sender_id]
    }

    if (userMeta.full_name === 'Unknown User' && message.sender_id) {
      void ensureUserProfile(message.sender_id)
    }

    return {
      id: message.id,
      sender_id: message.sender_id,
      content: message.content,
      mentions,
      read_by: readBy,
      is_private: Boolean(message.is_private),
      created_at: message.created_at ?? new Date().toISOString(),
      users: userMeta
    }
  }, [userDirectory, ensureUserProfile])

  useEffect(() => {
    setMessages((prev) =>
      prev.map((message) => {
        const directoryMeta = userDirectory[message.sender_id]
        if (!directoryMeta) return message

        if (
          message.users.full_name === directoryMeta.full_name &&
          message.users.oscar === directoryMeta.oscar &&
          message.users.role === directoryMeta.role
        ) {
          return message
        }

        return {
          ...message,
          users: directoryMeta
        }
      })
    )
  }, [userDirectory])

  const upsertMessage = useCallback((items: Message[], message: Message) => {
    const index = items.findIndex((m) => m.id === message.id)
    if (index !== -1) {
      const next = [...items]
      next[index] = message
      return next.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    }
    return [...items, message].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }, [])

  const updatePresenceFlags = useCallback(async (online: boolean) => {
    if (!currentUser?.id) return

    try {
      const { error } = await (supabase as any).rpc('set_user_presence', {
        is_user_online: online
      })

      if (error) {
        console.error('Error updating presence flag:', error)
      }
    } catch (error) {
      console.error('Unexpected error updating presence flag:', error)
    }
  }, [supabase, currentUser?.id])

  const markMessageRead = useCallback(async (message: Message) => {
    if (!currentUser?.id) return
    if (message.sender_id === currentUser.id) return
    if (message.read_by.includes(currentUser.id)) return
    if (markedMessagesRef.current.has(message.id)) return

    markedMessagesRef.current.add(message.id)

    try {
      const { error } = await (supabase as any).rpc('mark_message_read', {
        message_uuid: message.id,
        user_uuid: currentUser.id
      })

      if (error) {
        markedMessagesRef.current.delete(message.id)
        console.error('Error marking message as read:', error)
      }
    } catch (error) {
      markedMessagesRef.current.delete(message.id)
      console.error('Unexpected error marking message as read:', error)
    }
  }, [supabase, currentUser?.id])

  const loadParticipants = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any).rpc('get_chat_participants')

      if (error) throw error

      const participants = (data ?? []) as ChatParticipant[]
      const onlineIds = onlineUserIdsRef.current

      setUsers((prev) => {
        const merged = new Map<string, User>()
        prev.forEach((user) => {
          merged.set(user.id, user)
        })

        participants.forEach((participant) => {
          const existing = merged.get(participant.id)
          const isOnline = onlineIds.includes(participant.id)

          merged.set(participant.id, {
            id: participant.id,
            full_name: participant.full_name || existing?.full_name || 'Unknown User',
            oscar: participant.oscar || existing?.oscar || '',
            role: participant.role || existing?.role || '',
            is_online: isOnline,
            last_seen: participant.last_seen ?? existing?.last_seen ?? null
          })
        })

        return Array.from(merged.values())
      })
    } catch (error) {
      console.error('Error loading chat participants:', error)
    }
  }, [supabase])

  useEffect(() => {
    // Load current user first, then set up subscriptions
    const initializeChat = async () => {
      await loadCurrentUser()
      await loadMessages()
      await loadParticipants()
    }
    
    void initializeChat()

    const channel = supabase.channel(`chat-messages-${programId || 'global'}`, {
      config: {
        broadcast: { self: true },
        presence: { key: currentUser?.id || 'anonymous' }
      }
    })

    const handlePayload = async (payload: RealtimePostgresChangesPayload<ChatMessageRow>) => {
      console.log('📨 Realtime payload received:', payload.eventType, payload)
      const raw = payload.new as RawMessage
      
      // For INSERT events, fetch the full message with user data
      if (payload.eventType === 'INSERT' && raw.id) {
        try {
          const { data: fullMessage, error } = await supabase
            .from('chat_messages')
            .select(`
              *,
              users:sender_id(full_name, oscar, role)
            `)
            .eq('id', raw.id)
            .single()

          if (!error && fullMessage) {
            console.log('✅ Fetched full message with user data:', fullMessage)
            const message = transformMessage(fullMessage as RawMessage)
            setMessages((prev) => {
              const updated = upsertMessage(prev, message)
              console.log('💬 Messages updated, count:', updated.length)
              return updated
            })
            
            // Only mark as read if not sent by current user
            if (message.sender_id !== currentUser?.id) {
              void markMessageRead(message)
            }
            return
          } else if (error) {
            console.error('❌ Error fetching full message:', error)
          }
        } catch (err) {
          console.error('❌ Error fetching full message:', err)
        }
      }
      
      // Fallback to raw payload transformation
      console.log('⚠️ Using fallback transformation for message')
      const message = transformMessage(raw)
      setMessages((prev) => upsertMessage(prev, message))

      if (payload.eventType === 'INSERT' && message.sender_id !== currentUser?.id) {
        void markMessageRead(message)
      }
    }

    const subscriptionConfig: any = {
      event: '*',
      schema: 'public',
      table: 'chat_messages'
    }

    if (programId) {
      subscriptionConfig.filter = `program_id=eq.${programId}`
    }

    channel
      .on('postgres_changes', subscriptionConfig, handlePayload)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Chat realtime subscription active')
        } else if (status === 'CHANNEL_ERROR') {
          const state = channel.presenceState()
          const presenceKeys = state ? Object.keys(state) : []
          const hasDetails =
            presenceKeys.length > 0 || Boolean(subscriptionConfig.filter) || Boolean(currentUser?.id)

          if (hasDetails) {
            console.warn('❌ Chat realtime subscription reported CHANNEL_ERROR', {
              channel: channel.topic,
              presenceKeys,
              currentUserId: currentUser?.id,
              filter: subscriptionConfig.filter
            })
          } else {
            console.warn('❌ Chat realtime subscription reported CHANNEL_ERROR (no additional details)')
          }
        } else if (status === 'TIMED_OUT') {
          console.warn('⏱️ Chat realtime subscription timed out')
        } else if (status === 'CLOSED') {
          console.warn('🔒 Chat realtime subscription closed')
        }
      })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        console.log('🧹 Cleaning up chat subscription')
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [supabase, programId])

  useEffect(() => {
    if (!currentUser?.id) return

    messages.forEach((message) => {
      if (message.sender_id !== currentUser.id && !message.read_by.includes(currentUser.id)) {
        void markMessageRead(message)
      }
    })
  }, [messages, currentUser?.id, markMessageRead])

  useEffect(() => {
    if (!currentUser?.id) return

    void updatePresenceFlags(true)

    const handleVisibilityChange = () => {
      void updatePresenceFlags(!document.hidden)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    if (presenceIntervalRef.current) {
      clearInterval(presenceIntervalRef.current)
    }

    presenceIntervalRef.current = setInterval(() => {
      void updatePresenceFlags(!document.hidden)
    }, 30000)

    const handleBeforeUnload = () => {
      void updatePresenceFlags(false)
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current)
        presenceIntervalRef.current = null
      }
      void updatePresenceFlags(false)
    }
  }, [currentUser?.id, updatePresenceFlags])

  useEffect(() => {
    if (!currentUser?.id) return

    const channel = supabase.channel(`chat-presence`, {
      config: {
        presence: {
          key: currentUser.id
        }
      }
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as RealtimePresenceState<{
          online_at: string
        }>

        const onlineIds = Object.keys(state || {})
        onlineUserIdsRef.current = onlineIds

        setUsers((prev) =>
          prev.map((user) => ({
            ...user,
            is_online: onlineIds.includes(user.id)
          }))
        )
      })
      .on('presence', { event: 'join' }, () => {
        void loadParticipants()
      })
      .on('presence', { event: 'leave' }, () => {
        void loadParticipants()
      })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() })
      }
    })

    presenceChannelRef.current = channel

    return () => {
      if (presenceChannelRef.current) {
        presenceChannelRef.current.untrack()
        supabase.removeChannel(presenceChannelRef.current)
        presenceChannelRef.current = null
      }
    }
  }, [supabase, currentUser?.id, loadParticipants])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data, error } = await supabase
          .from('users')
          .select('id, full_name, oscar, role, email')
          .eq('id', user.id)
          .single()
        
        if (error) {
          console.error('❌ Error loading current user:', error)
          return
        }
        
        console.log('✅ Current user loaded:', data)
        setCurrentUser(data)
      }
    } catch (error) {
      console.error('❌ Error in loadCurrentUser:', error)
    }
  }

  const loadMessages = async () => {
    setLoadingMessages(true)

    try {
      let query = supabase
        .from('chat_messages')
        .select(`
          *,
          users:sender_id(full_name, oscar, role)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(100)

      if (programId) {
        query = query.eq('program_id', programId)
      } else {
        query = query.is('program_id', null)
      }

      const { data, error } = await query

      if (error) throw error
      
      // Safely transform messages with null checks
      const transformedMessages = (data || []).map((msg) => {
        try {
          return transformMessage(msg as RawMessage)
        } catch (err) {
          console.error('Error transforming message:', msg, err)
          return null
        }
      }).filter((msg): msg is Message => msg !== null)
      
      setMessages(transformedMessages)
    } catch (error) {
      console.error('Error loading messages:', error)
      toast.error('Failed to load messages')
    } finally {
      setLoadingMessages(false)
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return
    
    if (!currentUser?.id) {
      toast.error('You must be logged in to send messages')
      return
    }

    const sanitizedMentions = selectedMentions.filter((id) => id !== currentUser.id)
    if (sanitizedMentions.length !== selectedMentions.length) {
      toast.warning('You cannot mention yourself. Self-mentions were removed.')
      setSelectedMentions(sanitizedMentions)
    }

    try {
      const isPrivate = sanitizedMentions.length > 0 && newMessage.includes('@@')

      const payload: ChatMessageInsert = {
        sender_id: currentUser.id,
        content: newMessage,
        mentions: sanitizedMentions as unknown as ChatMessageInsert['mentions'],
        is_private: isPrivate,
        program_id: programId || null
      }

      console.log('Sending message:', payload)

      const { data, error } = await (supabase as any)
        .from('chat_messages')
        .insert([payload])
        .select(`
          *,
          users:sender_id(full_name, oscar, role)
        `)

      if (error) {
        console.error('Supabase error details:', error)
        throw error
      }

      console.log('Message sent successfully:', data)

      if (Array.isArray(data) && data.length > 0) {
        const inserted = transformMessage(data[0] as RawMessage)
        setMessages((prev) => upsertMessage(prev, inserted))
      }

      // Send notifications to mentioned users
      if (sanitizedMentions.length > 0) {
        await createNotifications(sanitizedMentions, newMessage)
      }

      setNewMessage('')
      setSelectedMentions([])
      toast.success('Message sent!')
    } catch (error: any) {
      console.error('Error sending message:', error)
      toast.error(error.message || 'Failed to send message')
    }
  }

  const createNotifications = async (userIds: string[], message: string) => {
    if (!currentUser?.id || userIds.length === 0) return

    try {
      const notificationPayloads: NotificationInsert[] = userIds.map((userId) => ({
        user_id: userId,
        title: 'New chat message',
        message,
        type: 'chat_message',
        channel: 'push'
      }))

      const { error } = await (supabase as any)
        .from('notifications')
        .insert(notificationPayloads)

      if (error) {
        console.error('Error creating notifications:', error)
      }
    } catch (error) {
      console.error('Unexpected error creating notifications:', error)
    }
  }

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart || 0
    setNewMessage(value)
    setCursorPosition(cursorPos)

    // Check for @ or @@ mentions
    const textBeforeCursor = value.substring(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex)
      
      // Check if it's @@ or @
      if (textAfterAt.startsWith('@@')) {
        const searchText = textAfterAt.substring(2)
        if (searchText.length === 0 || /^[a-zA-Z\s]*$/.test(searchText)) {
          setMentionType('@@')
          setMentionSearch(searchText.toLowerCase())
          setShowMentionSuggestions(true)
          return
        }
      } else if (textAfterAt.startsWith('@')) {
        const searchText = textAfterAt.substring(1)
        if (searchText.length === 0 || /^[a-zA-Z\s]*$/.test(searchText)) {
          setMentionType('@')
          setMentionSearch(searchText.toLowerCase())
          setShowMentionSuggestions(true)
          return
        }
      }
    }
    
    setShowMentionSuggestions(false)
  }

  const selectMention = (user: User) => {
    const textBeforeCursor = newMessage.substring(0, cursorPosition)
    const textAfterCursor = newMessage.substring(cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtIndex !== -1) {
      if (user.id === currentUser?.id) {
        toast.warning('You cannot mention yourself')
        setShowMentionSuggestions(false)
        return
      }
      const beforeAt = textBeforeCursor.substring(0, lastAtIndex)
      const mentionText = mentionType === '@@' ? `@@${user.full_name.split(' ')[0]} ` : `@${user.full_name.split(' ')[0]} `
      const newText = beforeAt + mentionText + textAfterCursor
      
      setNewMessage(newText)
      if (!selectedMentions.includes(user.id)) {
        setSelectedMentions([...selectedMentions, user.id])
      }
      
      setShowMentionSuggestions(false)
      setMentionSearch('')
      
      // Focus back on input
      setTimeout(() => {
        if (inputRef.current) {
          const newCursorPos = beforeAt.length + mentionText.length
          inputRef.current.focus()
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
        }
      }, 0)
    }
  }

  const handleMention = (userId: string) => {
    if (userId === currentUser?.id) {
      toast.warning('You cannot mention yourself')
      return
    }
    if (!selectedMentions.includes(userId)) {
      setSelectedMentions([...selectedMentions, userId])
      const user = users.find(u => u.id === userId)
      if (user) {
        setNewMessage(prev => prev + `@${user.full_name} `)
      }
    }
    setShowUserList(false)
  }

  const handleDoubleMention = (userId: string) => {
    if (userId === currentUser?.id) {
      toast.warning('You cannot mention yourself')
      return
    }
    if (!selectedMentions.includes(userId)) {
      setSelectedMentions([...selectedMentions, userId])
      const user = users.find(u => u.id === userId)
      if (user) {
        setNewMessage(prev => prev + `@@${user.full_name} `)
      }
    }
    setShowUserList(false)
  }

  // Filter users for mention suggestions
  const filteredUsers = users.filter(u => {
    if (u.id === currentUser?.id) return false // Exclude sender
    if (!mentionSearch) return true
    const firstName = u.full_name.split(' ')[0].toLowerCase()
    return firstName.startsWith(mentionSearch)
  })

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase()
  }

  const getDisplayName = (meta: MessageUserMeta) => {
    return resolveDisplayName(meta.full_name, meta.oscar, meta.role)
  }

  const canViewMessage = (message: Message) => {
    if (!currentUser) return false
    
    // Admins can see all messages
    if (['super_admin', 'admin'].includes(currentUser.role)) return true
    
    // Sender can see their own messages
    if (message.sender_id === currentUser.id) return true
    
    // Public messages
    if (!message.is_private) return true
    
    // Private messages where user is mentioned
    if (message.is_private && message.mentions.includes(currentUser.id)) return true
    
    return false
  }

  return (
    <div className="relative flex flex-col h-[calc(100vh-12rem)] min-h-[500px] max-h-[800px] bg-card/95 rounded-lg border shadow-sm backdrop-blur-sm">
      {/* Header */}
      <div className="border-b bg-muted/30 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Team Chat</h2>
              <p className="text-xs text-muted-foreground">
                {messages.filter(canViewMessage).length} messages
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUserList(!showUserList)}
            className="gap-2"
          >
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <Users className="h-4 w-4" />
            </div>
            <span className="font-medium">
              {users.filter((user) => user.is_online).length}
            </span>
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <AtSign className="h-3 w-3" />
          <span>@ to mention</span>
          <span>•</span>
          <Lock className="h-3 w-3" />
          <span>@@ for private</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted/10">
        {loadingMessages ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, index) => (
              <div
                key={index}
                className="flex items-end gap-3"
              >
                <div className="h-9 w-9 rounded-full skeleton" />
                <div className="flex flex-col gap-2 max-w-[70%]">
                  <div className="h-3 w-24 rounded-md skeleton" />
                  <div className="h-9 w-40 rounded-2xl skeleton" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.filter(canViewMessage).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
            <div className="p-4 bg-muted/50 rounded-full">
              <MessageCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start the conversation!</p>
            </div>
          </div>
        ) : (
          messages.filter(canViewMessage).map((message) => {
            const isOwn = message.sender_id === currentUser?.id
            const displayName = getDisplayName(message.users)
            return (
              <div
                key={message.id}
                className={`flex items-end gap-3 animate-in slide-in-from-bottom-2 duration-300 ${
                  isOwn ? 'flex-row-reverse' : ''
                }`}
              >
                <Avatar className="h-9 w-9 border-2 border-background shadow-sm">
                  <AvatarFallback className={`text-xs font-semibold ${
                    isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}>
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className={`flex flex-col gap-1 max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-2 px-1 ${
                    isOwn ? 'flex-row-reverse' : ''
                  }`}>
                    <span className="text-xs font-semibold">{displayName}</span>
                    {message.is_private && (
                      <div className="flex items-center gap-1 text-amber-600">
                        <Lock className="h-3 w-3" />
                        <span className="text-[10px] font-medium">Private</span>
                      </div>
                    )}
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                      isOwn
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-background border rounded-bl-sm'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground px-1">
                    {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* User List Overlay */}
      {showUserList && (
        <div className="absolute bottom-24 right-6 w-80 bg-background border rounded-xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-4 duration-200">
          <div className="bg-muted/50 px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">Active Users</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {users.filter(u => u.is_online).length} online • {users.length} total
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {users
              .sort((a, b) => (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0))
              .map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="relative">
                      <Avatar className="h-10 w-10 border-2 border-background">
                        <AvatarFallback className="text-xs font-semibold">
                          {getInitials(user.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                        user.is_online ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.full_name}</p>
                      <span className="text-xs text-muted-foreground">
                        {user.is_online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleMention(user.id)}
                      title="Mention publicly"
                    >
                      <AtSign className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleDoubleMention(user.id)}
                      title="Send private message"
                    >
                      <Lock className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t bg-background p-4">
        {selectedMentions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 p-3 bg-muted/50 rounded-lg">
            <span className="text-xs font-medium text-muted-foreground">Mentioning:</span>
            {selectedMentions.map((userId) => {
              const user = users.find(u => u.id === userId)
              return user ? (
                <Badge key={userId} variant="secondary" className="gap-1.5">
                  <AtSign className="h-3 w-3" />
                  {user.full_name}
                  <button
                    onClick={() => setSelectedMentions(selectedMentions.filter(id => id !== userId))}
                    className="ml-0.5 hover:text-destructive transition-colors"
                  >
                    ×
                  </button>
                </Badge>
              ) : null
            })}
          </div>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              placeholder="Type your message..."
              value={newMessage}
              onChange={handleMessageChange}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (!showMentionSuggestions) {
                    handleSendMessage()
                  }
                }
              }}
              className="pr-12 h-11"
            />
            
            {/* Mention Suggestions Dropdown */}
            {showMentionSuggestions && filteredUsers.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-background border rounded-xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-200">
                <div className="bg-muted/50 px-4 py-2.5 border-b">
                  <div className="flex items-center gap-2">
                    {mentionType === '@@' ? (
                      <>
                        <Lock className="h-3.5 w-3.5 text-amber-600" />
                        <span className="text-xs font-semibold text-amber-600">Private mention</span>
                      </>
                    ) : (
                      <>
                        <AtSign className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold text-primary">Public mention</span>
                      </>
                    )}
                    <span className="text-xs text-muted-foreground">• Type first name</span>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredUsers.slice(0, 5).map((user) => (
                    <div
                      key={user.id}
                      onClick={() => selectMention(user)}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors border-b last:border-b-0"
                    >
                      <Avatar className="h-8 w-8 border-2 border-background">
                        <AvatarFallback className="text-xs font-semibold">
                          {getInitials(user.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.full_name}</p>
                      </div>
                      {mentionType === '@@' && (
                        <Lock className="h-3.5 w-3.5 text-amber-600" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Button 
            onClick={handleSendMessage} 
            disabled={!newMessage.trim()}
            size="lg"
            className="h-11 px-6"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
