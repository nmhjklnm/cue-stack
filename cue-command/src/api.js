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
  
  // 尝试使用 RPC 函数
  const { data: channelId, error: rpcError } = await supabase
    .rpc('get_or_create_direct_conversation', {
      p_user_id: user.id,
      p_agent_id: agentId
    });
  
  if (!rpcError && channelId) {
    const { data: channel } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .single();
    
    if (channel) return channel;
  }
  
  // 回退：手动查询
  const { data: userChannels } = await supabase
    .from('channel_participants')
    .select('channel_id')
    .eq('participant_type', 'human')
    .eq('participant_id', user.id);
  
  if (userChannels && userChannels.length > 0) {
    const channelIds = userChannels.map(p => p.channel_id);
    
    const { data: agentChannels } = await supabase
      .from('channel_participants')
      .select('channel_id')
      .eq('participant_type', 'agent')
      .eq('participant_id', agentId)
      .in('channel_id', channelIds);
    
    if (agentChannels && agentChannels.length > 0) {
      const sharedChannelId = agentChannels[0].channel_id;
      const { data: channel } = await supabase
        .from('channels')
        .select('*')
        .eq('id', sharedChannelId)
        .eq('type', 'direct')
        .single();
      
      if (channel) return channel;
    }
  }
  
  // 创建新 channel
  const slug = `direct-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const { data: conversation, error: convError } = await supabase
    .from('channels')
    .insert({
      slug,
      type: 'direct',
      created_by_type: 'agent',
      created_by_id: agentId,
    })
    .select()
    .single();
  
  if (convError) throw convError;
  
  const { error: partError } = await supabase
    .from('channel_participants')
    .insert([
      { channel_id: conversation.id, participant_type: 'human', participant_id: user.id },
      { channel_id: conversation.id, participant_type: 'agent', participant_id: agentId },
    ]);
  
  if (partError) throw partError;
  
  return conversation;
}

async function sendMessage(channelId, senderId, senderType, content, payload = null) {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('messages')
    .insert({
      channel_id: channelId,
      sender_type: senderType,
      sender_id: senderId,
      message: content,
      payload,
      status: 'SENT',
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getMessages(channelId, limit = 50) {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('inserted_at', { ascending: false })
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

async function subscribeToConversation(channelId, callback) {
  const supabase = await getSupabaseClient();
  
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
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();
  
  return channel;
}

async function waitForNextMessage(channelId, senderType, timeoutMs = 600000) {
  const supabase = await getSupabaseClient();
  
  // Realtime 状态 (2026-01-25)
  // ✅ WebSocket 连接：已修复（Kong 主机名配置）
  // ✅ postgres_changes：已优化配置
  //    - RLS 策略优化（auth.uid() → (select auth.uid())）
  //    - 添加外键索引
  //    - Replica Identity 设置为 FULL
  //    - 表已发布到 supabase_realtime publication
  // 
  // 当前方案：使用 Realtime（实时性 <100ms）
  const USE_POLLING = false; // 已启用 Realtime，性能优化完成
  
  if (USE_POLLING) {
    // 轮询方案（降级）
    const startTime = Date.now();
    const pollInterval = 500; // 500ms
    
    const { data: latestMessages } = await supabase
      .from('messages')
      .select('id')
      .eq('channel_id', channelId)
      .order('inserted_at', { ascending: false })
      .limit(1);
    
    const lastMessageId = latestMessages && latestMessages.length > 0 ? latestMessages[0].id : 0;
    
    return new Promise((resolve, reject) => {
      const poll = async () => {
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error('Timeout waiting for message'));
          return;
        }
        
        try {
          const { data: newMessages } = await supabase
            .from('messages')
            .select('*')
            .eq('channel_id', channelId)
            .eq('sender_type', senderType)
            .gt('id', lastMessageId)
            .order('inserted_at', { ascending: true })
            .limit(1);
          
          if (newMessages && newMessages.length > 0) {
            resolve(newMessages[0]);
            return;
          }
          
          setTimeout(poll, pollInterval);
        } catch (err) {
          reject(err);
        }
      };
      
      poll();
    });
  } else {
    // Realtime 方案（推荐）
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        supabase.removeChannel(channel);
        reject(new Error('Timeout waiting for message'));
      }, timeoutMs);
      
      const channel = supabase
        .channel(`wait:${channelId}:${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `channel_id=eq.${channelId}`,
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
