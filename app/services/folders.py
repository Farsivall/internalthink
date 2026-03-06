"""
Folder hierarchy for project documents. Resolves folder_id <-> folder_path.
"""

from typing import Any

def _get_supabase() -> Any:
    from app.api.deps import require_supabase
    return require_supabase()


def get_folder_path(supabase: Any, folder_id: str) -> str | None:
    """
    Return full path string for a folder (e.g. "Legal/Contracts") by walking up parent_id.
    Returns None if folder_id is invalid or not found.
    """
    if not folder_id:
        return None
    path_parts: list[str] = []
    current_id: str | None = folder_id
    while current_id:
        r = supabase.table("folders").select("id, name, parent_id").eq("id", current_id).limit(1).execute()
        rows = r.data or []
        if not rows:
            return None
        row = rows[0]
        path_parts.insert(0, row.get("name") or "")
        current_id = row.get("parent_id")
        if current_id:
            current_id = str(current_id)
        else:
            break
    return "/".join(p for p in path_parts if p)


def list_folders(supabase: Any, project_id: str, parent_id: str | None) -> list[dict]:
    """List direct child folders. parent_id None = root folders."""
    q = supabase.table("folders").select("*").eq("project_id", project_id).order("name")
    if parent_id is None or parent_id == "" or parent_id == "__root__":
        q = q.is_("parent_id", "null")
    else:
        q = q.eq("parent_id", parent_id)
    r = q.execute()
    return list(r.data or [])


def folder_has_children(supabase: Any, folder_id: str) -> bool:
    """True if folder has any subfolders or files."""
    r = supabase.table("folders").select("id").eq("parent_id", folder_id).limit(1).execute()
    if (r.data or []):
        return True
    r2 = supabase.table("context_sources").select("id").eq("folder_id", folder_id).eq("type", "document").limit(1).execute()
    return bool(r2.data or [])
