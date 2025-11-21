declare module '@/types/supabase' {
  export interface SupabaseFunctions {
    set_user_presence: {
      Args: {
        is_user_online: boolean
      }
      Returns: void
    }
    mark_message_read: {
      Args: {
        message_uuid: string
        user_uuid: string
      }
      Returns: void
    }
    get_chat_participants: {
      Args: Record<string, never>
      Returns: Array<{
        id: string
        full_name: string
        oscar: string
        role: string
        is_online: boolean | null
        last_seen: string | null
      }>
    }
    get_unread_message_count: {
      Args: {
        user_uuid: string
      }
      Returns: number
    }
  }
}
