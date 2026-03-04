"""
Chat messages API — fetch project chat from Supabase only.
"""

from fastapi import APIRouter, Query
from app.api.deps import require_supabase
from app.db.project_resolve import resolve_project_uuid

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/messages")
def get_chat_messages(project_id: str = Query(...)):
    """Get chat messages for a project. project_id can be slug or UUID. Supabase only."""
    supabase = require_supabase()
    pid = resolve_project_uuid(project_id)
    if not pid:
        return []
    r = (
        supabase.table("project_chat_messages")
        .select("*")
        .eq("project_id", pid)
        .order("created_at")
        .execute()
    )
    return [
        {
            "id": str(m.get("id", "")),
            "sender": m.get("sender", "unknown"),
            "text": m.get("text", ""),
            "at": m.get("created_at", ""),
            "thinkingProcess": m.get("thinking_process"),
            "decisionId": m.get("decision_id"),
        }
        for m in (r.data or [])
    ]
