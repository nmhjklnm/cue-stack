#!/usr/bin/env python3
"""
Cue MCP Server (Supabase version)
Communicates via Supabase PostgreSQL + Realtime
"""
import asyncio
import uuid
import base64
from pathlib import Path
from datetime import datetime

from fastmcp import FastMCP
from fastmcp.server.middleware import Middleware, MiddlewareContext
from mcp.types import TextContent, ImageContent

from .supabase_client import get_supabase_client
from .models import UserResponse
from .naming import generate_name

CUE_TODO_CONSTRAINT_TEXT = (
    "重要：【Human Agent Protocol 强制遵循】你必须遵循Human Agent Protocol协议：在每次完成我的指令之前或回答问题时，必须向我 cue（即调用 cue(prompt, agent_id, payload?) 让我继续输入）。未实际调用 cue之前，不得结束回复；\n\n"
    "重要：【todo_list 强制检查】开始执行此条用户指令前，请检查当前 todo_list，并确保最后一条任务为'用 cue发送{{用户这条指令所对应的可能的响应}}'。 若不存在，必须立即补充添加。"
)

mcp = FastMCP("cue")

class LoggingMiddleware(Middleware):
    """Logging middleware"""
    async def on_call_tool(self, context: MiddlewareContext, call_next):
        print(f"[MCP] Calling tool: {context.method}")
        result = await call_next(context)
        print(f"[MCP] Tool finished: {context.method}")
        return result

mcp.add_middleware(LoggingMiddleware())

@mcp.tool()
async def join(runtime: str = "unknown") -> str:
    """Join the conversation and get your agent_id (identity).

    Call this at the start of a conversation to create an agent and get a conversation.

    Args:
        runtime: The runtime environment (e.g., "windsurf", "cursor", "vscode")

    Returns:
        A short message for you (includes agent_id and conversation_id).
    """
    supabase = get_supabase_client()
    agent_name = generate_name()
    
    user = supabase.auth.get_user()
    if not user or not user.user:
        raise RuntimeError("Not authenticated")
    
    agent = supabase.table("agents").insert({
        "owner_id": user.user.id,
        "agent_name": agent_name,
        "display_name": agent_name,
        "runtime": runtime,
        "status": "ONLINE",
        "last_seen_at": datetime.now().isoformat(),
    }).execute()
    
    if not agent.data:
        raise RuntimeError("Failed to create agent")
    
    agent_id = agent.data[0]["id"]
    
    conversations = supabase.table("conversations").select("*").filter(
        "conversation_participants.participant_type", "eq", "agent"
    ).filter(
        "conversation_participants.participant_id", "eq", agent_id
    ).execute()
    
    if conversations.data:
        conversation_id = conversations.data[0]["id"]
    else:
        conv = supabase.table("conversations").insert({
            "type": "direct",
            "created_by_type": "agent",
            "created_by_id": agent_id,
        }).execute()
        
        conversation_id = conv.data[0]["id"]
        
        supabase.table("conversation_participants").insert([
            {
                "conversation_id": conversation_id,
                "participant_type": "human",
                "participant_id": user.user.id,
            },
            {
                "conversation_id": conversation_id,
                "participant_type": "agent",
                "participant_id": agent_id,
            },
        ]).execute()
    
    print(f"[MCP] Created agent: {agent_name} (id={agent_id})")
    return (
        f"agent_id={agent_name}\n"
        f"conversation_id={conversation_id}\n\n"
        "Use this agent_id when calling cue(prompt, agent_id)."
    )

@mcp.tool()
async def recall(hints: str) -> str:
    """Recover a previous agent_id using hints.

    Args:
        hints: Any hint you remember

    Returns:
        A short message for you (includes agent_id).
    """
    supabase = get_supabase_client()
    user = supabase.auth.get_user()
    
    if not user or not user.user:
        raise RuntimeError("Not authenticated")
    
    agents = supabase.table("agents").select("*").eq(
        "owner_id", user.user.id
    ).order("created_at", desc=True).limit(1).execute()
    
    if agents.data:
        agent_name = agents.data[0]["agent_name"]
        print(f"[MCP] Recovered agent_id: {agent_name}")
        return f"agent_id={agent_name}\n\nUse this agent_id when calling cue(prompt, agent_id)."
    
    agent_name = generate_name()
    print(f"[MCP] No match found; generated new agent_id: {agent_name}")
    return (
        "No matching record found; generated a new agent_id.\n\n"
        f"agent_id={agent_name}\n\n"
        "Use this agent_id when calling cue(prompt, agent_id)."
    )

async def wait_for_response(conversation_id: str, timeout: float = 600.0) -> dict:
    """Wait for next human message in conversation."""
    supabase = get_supabase_client()
    start_time = asyncio.get_event_loop().time()
    
    last_message_id = None
    
    while True:
        messages = supabase.table("messages").select("*").eq(
            "conversation_id", conversation_id
        ).eq(
            "sender_type", "human"
        ).order("created_at", desc=True).limit(1).execute()
        
        if messages.data:
            msg = messages.data[0]
            if last_message_id is None:
                last_message_id = msg["id"]
            elif msg["id"] != last_message_id:
                return msg
        
        if timeout is not None and asyncio.get_event_loop().time() - start_time > timeout:
            raise TimeoutError(f"Timed out waiting for response")
        
        await asyncio.sleep(0.5)

def _build_tool_result_from_message(message: dict) -> list[TextContent | ImageContent]:
    result: list[TextContent | ImageContent] = []
    
    content = message.get("content", "").strip()
    if content:
        result.append(
            TextContent(
                type="text",
                text=f"用户希望继续，并提供了以下指令：\n\n{content}",
            )
        )
    
    result.append(TextContent(type="text", text=("\n\n" + CUE_TODO_CONSTRAINT_TEXT)))
    return result

@mcp.tool()
async def pause(agent_id: str, prompt: str | None = None) -> list[TextContent]:
    """Pause the agent indefinitely until the user clicks Continue.

    Args:
        agent_id: Your agent_id from join()
        prompt: Optional message to display

    Returns:
        User's response when they click Continue.
    """
    return await cue(
        prompt=prompt or "Paused. Click Continue when you are ready.",
        agent_id=agent_id,
        payload='{"type":"confirm","variant":"pause","text":"Paused. Click Continue when you are ready.","confirm_label":"Continue"}',
    )

@mcp.tool()
async def cue(prompt: str, agent_id: str, payload: str | None = None) -> list[TextContent | ImageContent]:
    """Send a message to the user and wait for their response.

    Args:
        prompt: Your message to the user
        agent_id: Your agent_id from join()
        payload: Optional structured interaction (JSON string)

    Returns:
        User's response.
    """
    supabase = get_supabase_client()
    user = supabase.auth.get_user()
    
    if not user or not user.user:
        raise RuntimeError("Not authenticated")
    
    agents = supabase.table("agents").select("id").eq(
        "agent_name", agent_id
    ).eq("owner_id", user.user.id).execute()
    
    if not agents.data:
        raise RuntimeError(f"Agent not found: {agent_id}")
    
    agent_db_id = agents.data[0]["id"]
    
    conversations = supabase.table("conversations").select("id").filter(
        "conversation_participants.participant_type", "eq", "agent"
    ).filter(
        "conversation_participants.participant_id", "eq", agent_db_id
    ).execute()
    
    if not conversations.data:
        raise RuntimeError(f"Conversation not found for agent: {agent_id}")
    
    conversation_id = conversations.data[0]["id"]
    
    payload_data = None
    if payload:
        import json
        try:
            payload_data = json.loads(payload)
        except:
            pass
    
    message = supabase.table("messages").insert({
        "conversation_id": conversation_id,
        "sender_type": "agent",
        "sender_id": agent_db_id,
        "content": prompt,
        "payload": payload_data,
        "status": "SENT",
    }).execute()
    
    print(f"[MCP] Sent message, waiting for response...")
    
    response_msg = await wait_for_response(conversation_id, timeout=600.0)
    
    print(f"[MCP] Received response")
    return _build_tool_result_from_message(response_msg)

def main():
    """Main entry point."""
    print("[MCP] Starting Cue MCP Server (Supabase)")
    mcp.run()

if __name__ == "__main__":
    main()
