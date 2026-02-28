"""
Chat messages API — fetch and persist project chat.
"""

from fastapi import APIRouter, Query
from uuid import UUID
from app.db.client import get_supabase

router = APIRouter(prefix="/chat", tags=["chat"])


def _resolve_project_id(project_id: str) -> str | None:
    """Resolve slug (proj-1) or UUID to project UUID."""
    try:
        supabase = get_supabase()
        if not supabase:
            return project_id if _is_uuid(project_id) else None
        if _is_uuid(project_id):
            return project_id
        r = supabase.table("projects").select("id").eq("slug", project_id).limit(1).execute()
        if r.data and len(r.data) > 0:
            return str(r.data[0]["id"])
        return None  # Slug not found; don't query with slug (invalid for UUID column)
    except Exception:
        return None


def _is_uuid(s: str) -> bool:
    try:
        UUID(s)
        return True
    except ValueError:
        return False


@router.get("/messages")
def get_chat_messages(project_id: str = Query(...)):
    """Get chat messages for a project. project_id can be slug (proj-1) or UUID. Returns [] when no Supabase."""
    try:
        supabase = get_supabase()
        if not supabase:
            return []
        pid = _resolve_project_id(project_id)
        if not pid:
            return []
        r = supabase.table("project_chat_messages").select("*").eq("project_id", pid).order("created_at").execute()
        return [
            {
                "id": str(m.get("id", "")),
                "sender": m.get("sender", "unknown"),
                "text": m.get("text", ""),
                "at": m.get("created_at", ""),
                "thinkingProcess": m.get("thinking_process"),
            }
            for m in (r.data or [])
        ]
    except Exception:
        return []
