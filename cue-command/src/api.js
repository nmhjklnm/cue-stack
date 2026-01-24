const { getSupabaseClient } = require('./supabase');

async function createAgent(runtime, metadata = {}) {
  const supabase = await getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');
  
  const agentName = `agent_${Date.now()}`;
  
  const { data, error } = await supabase
    .from('agents')
    .insert({
      owner_id: user.id,
      agent_name: agentName,
      runtime,
      status: 'ONLINE',
      last_seen_at: new Date().toISOString(),
      metadata,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getOrCreateDirectConversation(agentId) {
  const supabase = await getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');
  
  const { data: existing } = await supabase
    .from('conversations')
    .select(`
      *,
      conversation_participants!inner(participant_type, participant_id)
    `)
    .eq('type', 'direct');
  
  if (existing && existing.length > 0) {
    for (const conv of existing) {
      const participants = conv.conversation_participants || [];
      const hasAgent = participants.some(p => p.participant_type === 'agent' && p.participant_id === agentId);
      const hasUser = participants.some(p => p.participant_type === 'human' && p.participant_id === user.id);
      
      if (hasAgent && hasUser) {
        return conv;
      }
    }
  }
  
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .insert({
      type: 'direct',
      created_by_type: 'agent',
      created_by_id: agentId,
    })
    .select()
    .single();
  
  if (convError) throw convError;
  
  const { error: partError } = await supabase
    .from('conversation_participants')
    .insert([
      { conversation_id: conversation.id, participant_type: 'human', participant_id: user.id },
      { conversation_id: conversation.id, participant_type: 'agent', participant_id: agentId },
    ]);
  
  if (partError) throw partError;
  
  return conversation;
}

async function sendMessage(conversationId, senderId, senderType, content, payload = null) {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: senderType,
      sender_id: senderId,
      content,
      payload,
      status: 'SENT',
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getMessages(conversationId, limit = 50) {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return (data || []).reverse();
}

async function updateAgentStatus(agentId, status) {
  const supabase = await getSupabaseClient();
  
  const { error } = await supabase
    .from('agents')
    .update({
      status,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', agentId);
  
  if (error) throw error;
}

async function subscribeToConversation(conversationId, callback) {
  const supabase = await getSupabaseClient();
  
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();
  
  return channel;
}

async function waitForNextMessage(conversationId, senderType, timeoutMs = 600000) {
  const supabase = await getSupabaseClient();
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      supabase.removeChannel(channel);
      reject(new Error('Timeout waiting for message'));
    }, timeoutMs);
    
    const channel = supabase
      .channel(`wait:${conversationId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new;
          if (msg.sender_type === senderType) {
            clearTimeout(timeout);
            supabase.removeChannel(channel);
            resolve(msg);
          }
        }
      )
      .subscribe();
  });
}

module.exports = {
  createAgent,
  getOrCreateDirectConversation,
  sendMessage,
  getMessages,
  updateAgentStatus,
  subscribeToConversation,
  waitForNextMessage,
};
