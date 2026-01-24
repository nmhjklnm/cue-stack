"""Supabase client for cuemcp."""
import os
import json
from pathlib import Path
from supabase import create_client, Client

CREDENTIALS_PATH = Path.home() / ".cue" / "credentials.json"

def get_supabase_client() -> Client:
    """Get authenticated Supabase client."""
    if not CREDENTIALS_PATH.exists():
        raise RuntimeError(
            "Not authenticated. Please run: cueme login\n"
            "未认证。请先执行：cueme login"
        )
    
    with open(CREDENTIALS_PATH) as f:
        creds = json.load(f)
    
    access_token = creds.get("access_token")
    if not access_token:
        raise RuntimeError("Invalid credentials. Please run: cueme login")
    
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        raise RuntimeError(
            "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.\n"
            "缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY 环境变量。"
        )
    
    client: Client = create_client(supabase_url, supabase_key)
    client.auth.set_session(access_token, creds.get("refresh_token", ""))
    
    return client
