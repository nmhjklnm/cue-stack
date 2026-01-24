import { createClient } from '@/lib/supabase/client'

export interface Conversation {
  id: number
  slug: string
  type: 'direct' | 'group'
  title?: string
  created_by_type: 'human' | 'agent'
  created_by_id: string
  inserted_at: string
  last_message_at?: string
}

export async function getConversations() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')
  
  // 获取用户参与的所有 channel IDs
  const { data: participantData, error: partError } = await supabase
    .from('channel_participants')
    .select('channel_id')
    .eq('participant_type', 'human')
    .eq('participant_id', user.id)
  
  if (partError) throw partError
  if (!participantData || participantData.length === 0) return []
  
  const channelIds = participantData.map(p => p.channel_id)
  
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .in('id', channelIds)
    .order('last_message_at', { ascending: false, nullsFirst: false })
  
  if (error) throw error
  return data as Conversation[]
}

export async function getConversation(id: number) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('id', id)
    .single()
  
  if (error) throw error
  return data as Conversation
}

export async function createConversation(
  type: 'direct' | 'group',
  participants: Array<{ type: 'human' | 'agent'; id: string }>,
  title?: string
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')
  
  // 生成 slug
  const slug = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const { data: conversation, error: convError } = await supabase
    .from('channels')
    .insert({
      slug,
      type,
      title,
      created_by_type: 'human',
      created_by_id: user.id,
    })
    .select()
    .single()
  
  if (convError) throw convError
  
  const participantsToInsert = [
    { channel_id: conversation.id, participant_type: 'human', participant_id: user.id },
    ...participants.map(p => ({
      channel_id: conversation.id,
      participant_type: p.type,
      participant_id: p.id,
    })),
  ]
  
  const { error: partError } = await supabase
    .from('channel_participants')
    .insert(participantsToInsert)
  
  if (partError) throw partError
  
  return conversation as Conversation
}

export async function getOrCreateDirectConversation(agentId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')
  
  // 使用 RPC 函数（如果存在）或手动查询
  const { data: existing, error: rpcError } = await supabase
    .rpc('get_or_create_direct_conversation', {
      p_user_id: user.id,
      p_agent_id: agentId
    })
  
  if (!rpcError && existing) {
    return existing as Conversation
  }
  
  // 回退：手动查询
  const { data: userChannels } = await supabase
    .from('channel_participants')
    .select('channel_id')
    .eq('participant_type', 'human')
    .eq('participant_id', user.id)
  
  if (userChannels && userChannels.length > 0) {
    const channelIds = userChannels.map(p => p.channel_id)
    
    const { data: agentChannels } = await supabase
      .from('channel_participants')
      .select('channel_id')
      .eq('participant_type', 'agent')
      .eq('participant_id', agentId)
      .in('channel_id', channelIds)
    
    if (agentChannels && agentChannels.length > 0) {
      const sharedChannelId = agentChannels[0].channel_id
      const { data: channel } = await supabase
        .from('channels')
        .select('*')
        .eq('id', sharedChannelId)
        .eq('type', 'direct')
        .single()
      
      if (channel) return channel as Conversation
    }
  }
  
  return createConversation('direct', [{ type: 'agent', id: agentId }])
}
