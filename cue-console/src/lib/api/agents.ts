import { createClient } from '@/lib/supabase/client'

export interface Agent {
  id: string
  owner_id: string
  agent_name: string
  display_name?: string
  avatar_url?: string
  runtime?: string
  status: 'ONLINE' | 'OFFLINE'
  last_seen_at?: string
  metadata?: any
  created_at: string
  updated_at: string
}

export async function getAgents() {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data as Agent[]
}

export async function getAgent(id: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .single()
  
  if (error) throw error
  return data as Agent
}

export async function createAgent(
  agentName: string,
  runtime: string,
  displayName?: string,
  metadata?: any
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')
  
  const { data, error } = await supabase
    .from('agents')
    .insert({
      owner_id: user.id,
      agent_name: agentName,
      display_name: displayName || agentName,
      runtime,
      metadata,
      status: 'ONLINE',
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single()
  
  if (error) throw error
  return data as Agent
}

export async function updateAgentStatus(id: string, status: 'ONLINE' | 'OFFLINE') {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('agents')
    .update({
      status,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data as Agent
}

export async function deleteAgent(id: string) {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('agents')
    .delete()
    .eq('id', id)
  
  if (error) throw error
}
