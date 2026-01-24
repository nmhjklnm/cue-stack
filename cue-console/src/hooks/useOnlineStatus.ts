import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface OnlineStatus {
  id: string
  type: 'agent' | 'user'
  status: 'ONLINE' | 'OFFLINE' | 'AWAY'
  last_seen_at?: string
}

export function useOnlineStatus() {
  const [statuses, setStatuses] = useState<Map<string, OnlineStatus>>(new Map())
  const supabase = createClient()

  useEffect(() => {
    const agentsChannel = supabase
      .channel('agents-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agents',
        },
        (payload: any) => {
          const agent = payload.new as any
          setStatuses((prev) => {
            const next = new Map(prev)
            next.set(`agent:${agent.id}`, {
              id: agent.id,
              type: 'agent',
              status: agent.status,
              last_seen_at: agent.last_seen_at,
            })
            return next
          })
        }
      )
      .subscribe()

    const usersChannel = supabase
      .channel('users-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
        },
        (payload: any) => {
          const user = payload.new as any
          setStatuses((prev) => {
            const next = new Map(prev)
            next.set(`user:${user.id}`, {
              id: user.id,
              type: 'user',
              status: user.status,
              last_seen_at: user.last_seen_at,
            })
            return next
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(agentsChannel)
      supabase.removeChannel(usersChannel)
    }
  }, [supabase])

  return statuses
}
