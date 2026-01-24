import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Conversation } from '@/lib/api/conversations'

export function useConversationsSubscription() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('channels')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channels',
        },
        (payload: any) => {
          setConversations((prev) => [payload.new as Conversation, ...prev])
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'channels',
        },
        (payload: any) => {
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === payload.new.id ? (payload.new as Conversation) : conv
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return conversations
}
