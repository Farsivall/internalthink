"""
Resolve project identifier (UUID or slug) to project UUID via Supabase only.
"""
from uuid import UUID

from app.db.client import get_supabase


def _is_uuid(s: str) -> bool:
    try:
        UUID(s)
        return True
    except ValueError:
        return False


def resolve_project_uuid(project_id: str) -> str | None:
    """Return the project UUID for the given id_or_slug using Supabase. Returns None if not found or Supabase not configured."""
    if not project_id or not str(project_id).strip():
        return None
    pid = str(project_id).strip()
    if _is_uuid(pid):
        return pid
    supabase = get_supabase()
    if not supabase:
        return None
    try:
        r = supabase.table("projects").select("id").eq("slug", pid).limit(1).execute()
        if r.data and len(r.data) > 0:
            return str(r.data[0]["id"])
    except Exception:
        pass
    return None
