'use client'

import { Card } from '@/components/ui/card'
import ChatSystem from '@/components/chat/ChatSystem'

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Team Chat</h1>
        <p className="text-muted-foreground">
          Real-time communication with your team
        </p>
      </div>

      <Card>
        <ChatSystem />
      </Card>
    </div>
  )
}
