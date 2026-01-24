import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Message } from '@/lib/api/messages'

export function useMessagesSubscription(channelId: number | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const supabase = createClient()

  useEffect(() => {
    if (!channelId) return

    const channel = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload: any) => {
          setMessages((prev) => [...prev, payload.new as Message])
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload: any) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === payload.new.id ? (payload.new as Message) : msg
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelId, supabase])

  return messages
}
