'use client'

import { Card } from '@/components/ui/card'
import ChatSystem from '@/components/chat/ChatSystem'

export default function ChatPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Team Chat</h1>
        <p className="text-muted-foreground">
          Real-time communication with your team
        </p>
      </div>

      <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
        <ChatSystem />
      </Card>
    </div>
  )
}
