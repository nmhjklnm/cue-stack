import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface TypingUser {
  userId: string
  userType: 'human' | 'agent'
  timestamp: number
}

export function useTypingIndicator(channelId: number | null) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const supabase = createClient()

  useEffect(() => {
    if (!channelId) return

    const channel = supabase.channel(`typing:${channelId}`, {
      config: {
        broadcast: { self: false },
      },
    })

    channel
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        const { userId, userType } = payload.payload
        setTypingUsers((prev) => {
          const filtered = prev.filter((u) => u.userId !== userId)
          return [...filtered, { userId, userType, timestamp: Date.now() }]
        })
      })
      .subscribe()

    const interval = setInterval(() => {
      setTypingUsers((prev) =>
        prev.filter((u) => Date.now() - u.timestamp < 3000)
      )
    }, 1000)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [channelId, supabase])

  const sendTyping = async (userType: 'human' | 'agent', userId: string) => {
    if (!channelId) return
    
    const channel = supabase.channel(`typing:${channelId}`)
    await channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, userType },
    })
  }

  return { typingUsers, sendTyping }
}
