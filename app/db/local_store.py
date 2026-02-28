"""
In-memory store for projects and context when Supabase is not configured.
Data is lost on server restart.
"""
import uuid
from uuid import UUID
from datetime import datetime, timezone
from typing import Any

# project_id (str) -> list of context source dicts
_context_by_project: dict[str, list[dict[str, Any]]] = {}

# list of ProjectResponse-like dicts for created projects (id, name, description, slug, created_at)
_local_projects: list[dict[str, Any]] = []


def add_local_project(name: str, description: str | None) -> dict[str, Any]:
    """Create a new project in memory. Returns project dict with id, slug, etc."""
    uid = uuid.uuid4()
    slug = "proj-" + uid.hex[:8]
    now = datetime.now(timezone.utc).isoformat()
    project = {
        "id": str(uid),
        "name": name,
        "description": description or None,
        "slug": slug,
        "created_at": now,
    }
    _local_projects.append(project)
    _context_by_project[str(uid)] = []
    return project


def get_local_project(id_or_slug: str) -> dict[str, Any] | None:
    """Return a local project by id or slug, or None."""
    for p in _local_projects:
        if p["id"] == id_or_slug or p.get("slug") == id_or_slug:
            return p
    return None


def get_all_local_projects() -> list[dict[str, Any]]:
    return list(_local_projects)


def add_local_context(project_id: str, type: str, label: str | None, content: str, permitted_specialists: Any) -> dict[str, Any]:
    """Add a context source to a local project. Raises KeyError if project not found."""
    if project_id not in _context_by_project:
        _context_by_project[project_id] = []
    uid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    source = {
        "id": uid,
        "project_id": project_id,
        "type": type,
        "label": label,
        "content": content,
        "permitted_specialists": permitted_specialists,
        "created_at": now,
    }
    _context_by_project[project_id].append(source)
    return source


def get_local_context(project_id: str) -> list[dict[str, Any]]:
    """Return all context sources for a local project."""
    return list(_context_by_project.get(project_id, []))


def has_local_project(project_id: str) -> bool:
    return get_local_project(project_id) is not None or any(p["id"] == project_id for p in _local_projects)


def resolve_local_project_id(id_or_slug: str) -> str | None:
    """If id_or_slug is a local project id or slug, return its UUID string. Else None."""
    p = get_local_project(id_or_slug)
    return p["id"] if p else None
