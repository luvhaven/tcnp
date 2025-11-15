'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { MessageCircle, Send, Users, AtSign, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

type Message = {
  id: string
  sender_id: string
  content: string
  mentions: string[]
  is_private: boolean
  created_at: string
  users: {
    full_name: string
    oscar: string
    role: string
  }
}

type User = {
  id: string
  full_name: string
  oscar: string
  role: string
  is_active: boolean
}

export default function ChatSystem({ programId }: { programId?: string }) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [newMessage, setNewMessage] = useState('')
  const [showUserList, setShowUserList] = useState(false)
  const [mentioning, setMentioning] = useState(false)
  const [selectedMentions, setSelectedMentions] = useState<string[]>([])
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [mentionType, setMentionType] = useState<'@' | '@@'>('@')
  const [cursorPosition, setCursorPosition] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadCurrentUser()
    loadUsers()
    loadMessages()
    
    // Subscribe to new messages
    const subscription = supabase
      .channel('chat_messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: programId ? `program_id=eq.${programId}` : undefined
        },
        () => {
          loadMessages()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [programId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()
      setCurrentUser(data)
    }
  }

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, oscar, role, is_active')
        .eq('is_active', true)
        .order('full_name')

      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error('Error loading users:', error)
    }
  }

  const loadMessages = async () => {
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
      }

      const { data, error } = await query

      if (error) throw error
      setMessages(data || [])
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return

    try {
      const isPrivate = selectedMentions.length > 0 && newMessage.includes('@@')
      
      const { error } = await supabase
        .from('chat_messages')
        .insert([{
          sender_id: currentUser.id,
          content: newMessage,
          mentions: selectedMentions,
          is_private: isPrivate,
          program_id: programId || null
        }])

      if (error) throw error

      // Send push notifications to mentioned users
      if (selectedMentions.length > 0) {
        await sendPushNotifications(selectedMentions, newMessage)
      }

      setNewMessage('')
      setSelectedMentions([])
      setMentioning(false)
      toast.success('Message sent!')
    } catch (error: any) {
      console.error('Error sending message:', error)
      toast.error(error.message || 'Failed to send message')
    }
  }

  const sendPushNotifications = async (userIds: string[], message: string) => {
    // This would integrate with your push notification service
    // For now, we'll just log it
    console.log('Sending push notifications to:', userIds, message)
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
    <div className="flex flex-col h-[600px] max-h-[80vh]">
      {/* Header */}
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <MessageCircle className="h-5 w-5" />
            <span>Team Chat</span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUserList(!showUserList)}
          >
            <Users className="mr-2 h-4 w-4" />
            {users.length} Online
          </Button>
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Use @ to mention someone • Use @@ for private messages
        </div>
      </CardHeader>

      {/* Messages */}
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.filter(canViewMessage).map((message) => (
          <div
            key={message.id}
            className={`flex items-start space-x-3 ${
              message.sender_id === currentUser?.id ? 'flex-row-reverse space-x-reverse' : ''
            }`}
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                {getInitials(message.users.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className={`flex-1 ${message.sender_id === currentUser?.id ? 'text-right' : ''}`}>
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-sm font-medium">{message.users.full_name}</span>
                {message.users.oscar && (
                  <Badge variant="secondary" className="text-xs">
                    {message.users.oscar}
                  </Badge>
                )}
                {message.is_private && (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                </span>
              </div>
              <div
                className={`inline-block rounded-lg px-4 py-2 ${
                  message.sender_id === currentUser?.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </CardContent>

      {/* User List Overlay */}
      {showUserList && (
        <div className="absolute bottom-20 right-4 w-64 bg-background border rounded-lg shadow-lg p-2 max-h-64 overflow-y-auto z-50">
          <div className="text-xs font-medium text-muted-foreground mb-2 px-2">
            Active Users
          </div>
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer"
            >
              <div className="flex items-center space-x-2 flex-1">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {getInitials(user.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.full_name}</p>
                  <p className="text-xs text-muted-foreground">{user.oscar}</p>
                </div>
              </div>
              <div className="flex space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => handleMention(user.id)}
                >
                  <AtSign className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => handleDoubleMention(user.id)}
                >
                  <Lock className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t p-4">
        {selectedMentions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedMentions.map((userId) => {
              const user = users.find(u => u.id === userId)
              return user ? (
                <Badge key={userId} variant="secondary">
                  @{user.full_name}
                  <button
                    onClick={() => setSelectedMentions(selectedMentions.filter(id => id !== userId))}
                    className="ml-1 hover:text-destructive"
                  >
                    ×
                  </button>
                </Badge>
              ) : null
            })}
          </div>
        )}
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              placeholder="Type a message... (@ to mention, @@ for private)"
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
              className="flex-1"
            />
            
            {/* Mention Suggestions Dropdown */}
            {showMentionSuggestions && filteredUsers.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto z-50">
                <div className="text-xs font-medium text-muted-foreground px-3 py-2 border-b">
                  {mentionType === '@@' ? 'Private mention' : 'Public mention'} - Type first name
                </div>
                {filteredUsers.slice(0, 5).map((user) => (
                  <div
                    key={user.id}
                    onClick={() => selectMention(user)}
                    className="flex items-center space-x-2 p-2 hover:bg-muted cursor-pointer"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {getInitials(user.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.full_name}</p>
                      <p className="text-xs text-muted-foreground">{user.oscar}</p>
                    </div>
                    {mentionType === '@@' && (
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
