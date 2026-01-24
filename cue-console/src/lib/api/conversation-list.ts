import { createClient } from '@/lib/supabase/client'
import type { ConversationItem } from '@/lib/types'

export async function fetchConversationList(options?: {
  view?: 'active' | 'archived'
}): Promise<ConversationItem[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return []
  
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select(`
      *,
      conversation_participants!inner(participant_type, participant_id),
      messages(id, content, sender_type, sender_id, created_at)
    `)
    .order('last_message_at', { ascending: false, nullsFirst: false })
  
  if (error) throw error
  
  const { data: agents } = await supabase
    .from('agents')
    .select('id, agent_name, display_name, runtime, metadata')
  
  const agentMap = new Map(agents?.map(a => [a.id, a]) || [])
  
  const items: ConversationItem[] = []
  
  for (const conv of conversations || []) {
    const participants = (conv as any).conversation_participants || []
    const messages = (conv as any).messages || []
    
    const agentParticipant = participants.find((p: any) => p.participant_type === 'agent')
    if (!agentParticipant) continue
    
    const agent = agentMap.get(agentParticipant.participant_id)
    if (!agent) continue
    
    const lastMessage = messages[messages.length - 1]
    const lastMessagePreview = lastMessage 
      ? (lastMessage.sender_type === 'human' ? 'You: ' : '') + lastMessage.content.slice(0, 50)
      : undefined
    
    const pendingMessages = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .eq('sender_type', 'agent')
      .is('read_at', null)
    
    items.push({
      type: 'agent',
      id: agent.agent_name,
      name: agent.agent_name,
      displayName: agent.display_name || agent.agent_name,
      agentRuntime: agent.runtime,
      projectName: agent.metadata?.project_dir ? agent.metadata.project_dir.split('/').pop() : undefined,
      pendingCount: pendingMessages.count || 0,
      lastMessage: lastMessagePreview,
      lastTime: conv.last_message_at || conv.created_at,
    })
  }
  
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
