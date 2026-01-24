/* tslint:disable */
/**
/* This file was automatically generated from pydantic models by running pydantic2ts.
/* Do not modify it by hand - just update the pydantic models and then re-run the script
*/

/**
 * Request status (SQLModel stores enum names in uppercase)
 */
export type RequestStatus = "PENDING" | "COMPLETED" | "CANCELLED";

/**
 * Request from MCP -> client (cue-hub / simulator)
 */
export interface CueRequest {
  id?: number | null;
  request_id: string;
  agent_id?: string;
  prompt: string;
  payload?: string | null;
  status?: RequestStatus;
  created_at?: string;
  updated_at?: string;
}
/**
 * Response from client (cue-hub / simulator) -> MCP
 */
export interface CueResponse {
  id?: number | null;
  request_id: string;
  response_json: string;
  cancelled?: boolean;
  created_at?: string;
}
/**
 * Image content
 */
export interface ImageContent {
  mime_type: string;
  base64_data: string;
}

export interface Mention {
  userId: string;
  start: number;
  length: number;
  display: string;
}
/**
 * User response
 */
export interface UserResponse {
  text?: string;
  images?: ImageContent[];
  mentions?: Mention[];
}

// ============ Frontend extension types ============

/**
 * Group
 */
export interface Group {
  id: string;
  name: string;
  created_at: string;
}

/**
 * Group member
 */
export interface GroupMember {
  group_id: string;
  agent_name: string;
  joined_at: string;
}

/**
 * Conversation list item
 */
export interface ConversationItem {
  id: string;
  name: string;
  displayName: string;
  type: "agent" | "group";
  lastMessage?: string;
  lastTime?: string;
  pendingCount: number;
  agentRuntime?: string;
  projectName?: string;
}

/**
 * Queued message
 */
export interface QueuedMessage {
  id: string;
  text: string;
  images: { mime_type: string; base64_data: string; file_name?: string }[];
  createdAt: number;
}
