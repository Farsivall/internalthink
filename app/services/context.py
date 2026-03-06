"""
Context service — fetches context sources from Supabase only.
"""

from app.db.client import get_supabase
from app.db.project_resolve import resolve_project_uuid


def get_context_for_project(project_id: str) -> list[dict]:
    """Fetch context sources for a project from Supabase only. Returns [] if not configured or no rows."""
    supabase = get_supabase()
    if not supabase:
        return []
    pid = resolve_project_uuid(project_id)
    if not pid:
        return []
    try:
        response = supabase.table("context_sources").select("*").eq("project_id", pid).order("created_at").execute()
        rows = response.data or []
        return [
            {
                "id": str(r.get("id", "")),
                "project_id": str(r.get("project_id", "")),
                "type": r.get("type", "document"),
                "label": r.get("label"),
                "content": r.get("content") or "",
                "permitted_specialists": r.get("permitted_specialists", "all"),
            }
            for r in rows
        ]
    except Exception:
        return []
