import { createClient } from '@/lib/supabase/client'
import type { ConversationItem } from '@/lib/types'

export async function fetchConversationList(options?: {
  view?: 'active' | 'archived'
}): Promise<ConversationItem[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  console.log('[fetchConversationList] user:', user?.id)
  
  if (!user) {
    console.log('[fetchConversationList] no user, returning empty')
    return []
  }
  
  const { data: conversations, error } = await supabase
    .from('channels')
    .select(`
      *,
      channel_participants!inner(participant_type, participant_id),
      messages(id, message, sender_type, sender_id, inserted_at)
    `)
    .order('last_message_at', { ascending: false, nullsFirst: false })
  
  console.log('[fetchConversationList] conversations:', conversations?.length, 'error:', error)
  
  if (error) {
    console.error('[fetchConversationList] error fetching conversations:', error)
    throw error
  }
  
  const { data: agents } = await supabase
    .from('agents')
    .select('id, agent_name, display_name, runtime, metadata, owner_id')
    .eq('owner_id', user.id)
  
  console.log('[fetchConversationList] agents:', agents?.length)
  
  const agentMap = new Map(agents?.map(a => [a.id, a]) || [])
  
  const items: ConversationItem[] = []
  
  for (const conv of conversations || []) {
    const participants = (conv as any).channel_participants || []
    const messages = (conv as any).messages || []
    
    const agentParticipant = participants.find((p: any) => p.participant_type === 'agent')
    if (!agentParticipant) {
      console.log('[fetchConversationList] no agent participant for channel', conv.id)
      continue
    }
    
    const agent = agentMap.get(agentParticipant.participant_id)
    if (!agent) {
      console.log('[fetchConversationList] agent not found:', agentParticipant.participant_id)
      continue
    }
    
    const sortedMessages = messages.sort((a: any, b: any) => 
      new Date(b.inserted_at).getTime() - new Date(a.inserted_at).getTime()
    )
    const lastMessage = sortedMessages[0]
    const lastMessagePreview = lastMessage 
      ? (lastMessage.sender_type === 'human' ? 'You: ' : '') + (lastMessage.message || '').slice(0, 50)
      : undefined
    
    const { count: pendingCount, error: pendingError } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', conv.id)
      .eq('sender_type', 'agent')
    
    if (pendingError) {
      console.error('[fetchConversationList] error fetching pending messages:', pendingError)
    }
    
    items.push({
      type: 'agent',
      id: agent.agent_name,
      name: agent.agent_name,
      displayName: agent.display_name || agent.agent_name,
      agentRuntime: agent.runtime,
      projectName: agent.metadata?.project_dir ? agent.metadata.project_dir.split('/').pop() : undefined,
      pendingCount: pendingCount || 0,
      lastMessage: lastMessagePreview,
      lastTime: conv.last_message_at || conv.inserted_at,
    })
  }
  
  console.log('[fetchConversationList] final items:', items.length, items)
  
  items.sort((a, b) => {
    if (a.pendingCount > 0 && b.pendingCount === 0) return -1
    if (a.pendingCount === 0 && b.pendingCount > 0) return 1
    if (!a.lastTime) return 1
    if (!b.lastTime) return -1
    return new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime()
  })
  
  return items
}

export async function fetchArchivedConversationCount(): Promise<number> {
  return 0
}

export async function fetchPinnedConversationKeys(view: 'active' | 'archived'): Promise<string[]> {
  return []
}
