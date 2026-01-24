import { createClient } from '@/lib/supabase/client'
import type { Message } from './messages'

export type TimelineItem = 
  | {
      item_type: 'request'
      time: string
      request: {
        request_id: string
        agent_id: string
        prompt: string
        payload?: any
        status: 'PENDING' | 'COMPLETED' | 'CANCELLED'
        created_at: string
      }
    }
  | {
      item_type: 'response'
      time: string
      response: {
        id: string
        request_id: string
        response_json: string
        files_count?: number
        created_at: string
      }
    }

export async function fetchAgentTimeline(
  agentName: string,
  before: string | null,
  limit: number
): Promise<{ items: TimelineItem[]; nextCursor: string | null }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { items: [], nextCursor: null }
  
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('agent_name', agentName)
    .eq('owner_id', user.id)
    .single()
  
  if (!agent) return { items: [], nextCursor: null }
  
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id')
    .eq('type', 'direct')
    .filter('conversation_participants.participant_id', 'eq', agent.id)
  
  if (!conversations || conversations.length === 0) {
    return { items: [], nextCursor: null }
  }
  
  const conversationId = conversations[0].id
  
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (before) {
    query = query.lt('id', parseInt(before))
  }
  
  const { data: messages, error } = await query
  
  if (error) throw error
  
  const items: TimelineItem[] = (messages || []).map((msg: Message) => {
    if (msg.sender_type === 'agent') {
      return {
        item_type: 'request' as const,
        time: msg.created_at,
        request: {
          request_id: String(msg.id),
          agent_id: agentName,
          prompt: msg.content,
          payload: msg.payload,
          status: 'PENDING' as const,
          created_at: msg.created_at,
        },
      }
    } else {
      return {
        item_type: 'response' as const,
        time: msg.created_at,
        response: {
          id: String(msg.id),
          request_id: String(msg.reply_to_message_id || msg.id - 1),
          response_json: JSON.stringify({ text: msg.content }),
          created_at: msg.created_at,
        },
      }
    }
  })
  
  const nextCursor = messages && messages.length === limit 
    ? String(messages[messages.length - 1].id)
    : null
  
  return { items, nextCursor }
}

export async function fetchGroupTimeline(
  groupId: string,
  before: string | null,
  limit: number
): Promise<{ items: TimelineItem[]; nextCursor: string | null }> {
  return { items: [], nextCursor: null }
}

export async function bootstrapConversation(args: {
  type: 'agent' | 'group'
  id: string
  limit?: number
}): Promise<{
  config: { sound_enabled: boolean; bot_mode_enabled: boolean }
  members: string[]
  agentNameMap: Record<string, string>
  queue: any[]
  timeline: { items: TimelineItem[]; nextCursor: string | null }
}> {
  const timeline = args.type === 'agent'
    ? await fetchAgentTimeline(args.id, null, args.limit || 30)
    : await fetchGroupTimeline(args.id, null, args.limit || 30)
  
  return {
    config: { sound_enabled: true, bot_mode_enabled: false },
    members: [],
    agentNameMap: {},
    queue: [],
    timeline,
  }
}
