"use server";

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type { ConversationItem, QueuedMessage, UserResponse, ImageContent } from './types'
export type { Message as CueRequest } from './api/messages'
export type { TimelineItem as AgentTimelineItem } from './api/timeline'

export interface CueResponse {
  id: string
  request_id: string
  response_json: string
  created_at: string
}

export interface UserConfig {
  sound_enabled: boolean
  conversation_mode_default: 'chat' | 'agent'
  chat_mode_append_text: string
  pending_request_timeout_ms: number
  bot_mode_enabled: boolean
  bot_mode_reply_text: string
  agent_grouping_mode: 'default' | 'by_project'
}

const DEFAULT_USER_CONFIG: UserConfig = {
  sound_enabled: true,
  conversation_mode_default: 'agent',
  chat_mode_append_text: '',
  pending_request_timeout_ms: 600_000,
  bot_mode_enabled: false,
  bot_mode_reply_text: 'ok',
  agent_grouping_mode: 'default',
}

export async function getUserConfig(): Promise<UserConfig> {
  return DEFAULT_USER_CONFIG
}

export async function setUserConfig(config: Partial<UserConfig>): Promise<UserConfig> {
  return { ...DEFAULT_USER_CONFIG, ...config }
}

export async function fetchConversationList(options?: {
  view?: 'active' | 'archived'
}) {
  const { fetchConversationList: fetch } = await import('./api/conversation-list')
  return fetch(options)
}

export async function fetchArchivedConversationCount() {
  return 0
}

export async function fetchPinnedConversationKeys(view: 'active' | 'archived') {
  return []
}

export async function fetchAgentTimeline(
  agentName: string,
  before: string | null,
  limit: number
) {
  const { fetchAgentTimeline: fetch } = await import('./api/timeline')
  return fetch(agentName, before, limit)
}

export async function fetchGroupTimeline(
  groupId: string,
  before: string | null,
  limit: number
) {
  const { fetchGroupTimeline: fetch } = await import('./api/timeline')
  return fetch(groupId, before, limit)
}

export async function bootstrapConversation(args: {
  type: 'agent' | 'group'
  id: string
  limit?: number
}) {
  const { bootstrapConversation: fetch } = await import('./api/timeline')
  return fetch(args)
}

export async function submitResponse(
  requestId: string,
  text: string,
  images: { mime_type: string; base64_data: string }[] = [],
  mentions: { userId: string; start: number; length: number; display: string }[] = []
) {
  const supabase = await createClient()
  const messageId = parseInt(requestId)
  
  const { data: message } = await supabase
    .from('messages')
    .select('conversation_id')
    .eq('id', messageId)
    .single()
  
  if (!message) {
    return { success: false, error: 'Message not found' } as const
  }
  
  const { sendMessage } = await import('./api/messages')
  await sendMessage(message.conversation_id, text)
  
  revalidatePath('/')
  return { success: true } as const
}

export async function cancelRequest(requestId: string) {
  return { success: true } as const
}

export async function batchRespond(
  requestIds: string[],
  text: string,
  images: { mime_type: string; base64_data: string }[] = [],
  mentions: { userId: string; start: number; length: number; display: string }[] = []
) {
  for (const id of requestIds) {
    await submitResponse(id, text, images, mentions)
  }
  return { success: true, count: requestIds.length } as const
}

export async function fetchAllAgents() {
  const { getAgents } = await import('./api/agents')
  const agents = await getAgents()
  return agents.map(a => a.agent_name)
}

export async function fetchAgentDisplayNames(agentIds: string[]) {
  const { getAgents } = await import('./api/agents')
  const agents = await getAgents()
  const map: Record<string, string> = {}
  for (const agent of agents) {
    if (agentIds.includes(agent.agent_name)) {
      map[agent.agent_name] = agent.display_name || agent.agent_name
    }
  }
  return map
}

export async function setAgentDisplayName(agentId: string, displayName: string) {
  return { success: true } as const
}

export async function fetchAgentEnv(agentId: string) {
  const { getAgents } = await import('./api/agents')
  const agents = await getAgents()
  const agent = agents.find(a => a.agent_name === agentId)
  return {
    agentRuntime: agent?.runtime,
    projectName: agent?.metadata?.project_dir?.split('/').pop(),
  }
}

export async function archiveConversations(keys: string[]) {
  return { success: true } as const
}

export async function unarchiveConversations(keys: string[]) {
  return { success: true } as const
}

export async function deleteConversations(keys: string[]) {
  return { success: true } as const
}

export async function pinConversationByKey(key: string, view: 'active' | 'archived') {
  return { success: true } as const
}

export async function unpinConversationByKey(key: string, view: 'active' | 'archived') {
  return { success: true } as const
}

export async function fetchAllGroups() {
  return []
}

export async function createNewGroup(name: string, members: string[]) {
  return { success: false, error: 'Groups not yet supported' } as const
}

export async function fetchMessageQueue(type: 'agent' | 'group', id: string) {
  return []
}

export async function enqueueMessage(
  type: 'agent' | 'group',
  id: string,
  msg: any
) {
  return { success: true } as const
}

export async function removeQueuedMessage(queueId: string) {
  return { success: true } as const
}

export async function reorderQueuedMessage(
  type: 'agent' | 'group',
  id: string,
  fromIndex: number,
  toIndex: number
) {
  return { success: true } as const
}

export async function processBotTick(args: any) {
  return { success: true, acquired: false, replied: 0 } as const
}

export async function fetchBotEnabled(type: 'agent' | 'group', id: string) {
  return { enabled: false } as const
}

export async function updateBotEnabled(type: 'agent' | 'group', id: string, enabled: boolean) {
  return { success: true, enabled } as const
}

export async function fetchBotEnabledConversations(limit?: number) {
  return []
}

export async function processQueueTick(workerId: string) {
  return { success: true, processed: 0 } as const
}

export async function claimWorkerLease(args: any) {
  return { acquired: false } as const
}
