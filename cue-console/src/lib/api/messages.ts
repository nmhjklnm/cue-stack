import { createClient } from '@/lib/supabase/client'

export type MessageStatus = 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'

export interface Message {
  id: number
  conversation_id: string
  sender_type: 'human' | 'agent'
  sender_id: string
  content: string
  payload?: any
  status: MessageStatus
  created_at: string
  updated_at: string
  edited_at?: string
  reply_to_message_id?: number
}

export async function getMessages(
  conversationId: string,
  limit: number = 50,
  before?: number
) {
  const supabase = createClient()
  
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (before) {
    query = query.lt('id', before)
  }
  
  const { data, error } = await query
  
  if (error) throw error
  return (data as Message[]).reverse()
}

export async function sendMessage(
  conversationId: string,
  content: string,
  payload?: any,
  fileIds?: string[]
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')
  
  const { data: message, error: msgError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'human',
      sender_id: user.id,
      content,
      payload,
      status: 'SENT',
    })
    .select()
    .single()
  
  if (msgError) throw msgError
  
  if (fileIds && fileIds.length > 0) {
    const messageFiles = fileIds.map((fileId, idx) => ({
      message_id: message.id,
      file_id: fileId,
      idx,
    }))
    
    const { error: filesError } = await supabase
      .from('message_files')
      .insert(messageFiles)
    
    if (filesError) throw filesError
  }
  
  return message as Message
}

export async function markAsRead(messageId: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')
  
  const { error } = await supabase
    .from('message_receipts')
    .update({ read_at: new Date().toISOString() })
    .eq('message_id', messageId)
    .eq('participant_type', 'human')
    .eq('participant_id', user.id)
  
  if (error) throw error
}

export async function editMessage(messageId: number, content: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('messages')
    .update({
      content,
      edited_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .select()
    .single()
  
  if (error) throw error
  return data as Message
}
