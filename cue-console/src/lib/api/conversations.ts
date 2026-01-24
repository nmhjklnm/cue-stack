import { createClient } from '@/lib/supabase/client'

export interface Conversation {
  id: string
  type: 'direct' | 'group'
  title?: string
  created_by_type: 'human' | 'agent'
  created_by_id: string
  created_at: string
  updated_at: string
  last_message_at?: string
}

export async function getConversations() {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      conversation_participants!inner(participant_type, participant_id)
    `)
    .order('last_message_at', { ascending: false, nullsFirst: false })
  
  if (error) throw error
  return data as Conversation[]
}

export async function getConversation(id: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('conversations')
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
  
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .insert({
      type,
      title,
      created_by_type: 'human',
      created_by_id: user.id,
    })
    .select()
    .single()
  
  if (convError) throw convError
  
  const participantsToInsert = [
    { conversation_id: conversation.id, participant_type: 'human', participant_id: user.id },
    ...participants.map(p => ({
      conversation_id: conversation.id,
      participant_type: p.type,
      participant_id: p.id,
    })),
  ]
  
  const { error: partError } = await supabase
    .from('conversation_participants')
    .insert(participantsToInsert)
  
  if (partError) throw partError
  
  return conversation as Conversation
}

export async function getOrCreateDirectConversation(agentId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')
  
  const { data: existing } = await supabase
    .from('conversations')
    .select(`
      *,
      conversation_participants!inner(participant_type, participant_id)
    `)
    .eq('type', 'direct')
    .eq('conversation_participants.participant_type', 'agent')
    .eq('conversation_participants.participant_id', agentId)
  
  if (existing && existing.length > 0) {
    const conv = existing.find((c: any) => 
      c.conversation_participants.some((p: any) => 
        p.participant_type === 'human' && p.participant_id === user.id
      )
    )
    if (conv) return conv as Conversation
  }
  
  return createConversation('direct', [{ type: 'agent', id: agentId }])
}
