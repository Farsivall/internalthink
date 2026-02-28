import logging
import uuid
from fastapi import APIRouter, HTTPException, status
from uuid import UUID
from datetime import datetime, timezone
from typing import List
from app.schemas.projects import ProjectCreate, ProjectResponse
from app.db.client import get_supabase
from app.db.local_store import add_local_project, get_local_project as get_local_project_store, get_all_local_projects

logger = logging.getLogger(__name__)
router = APIRouter()

# Fallback projects when Supabase not configured (chat-only mode)
FALLBACK_PROJECTS: list[ProjectResponse] = [
    ProjectResponse(id=UUID("a1b2c3d4-0000-4000-8000-000000000001"), name="Q1 Product Strategy", description="Feature prioritization and launch timeline for core product.", slug="proj-1", created_at=datetime(2025, 2, 1, tzinfo=timezone.utc)),
    ProjectResponse(id=UUID("a1b2c3d4-0000-4000-8000-000000000002"), name="Vendor Selection", description="Evaluate and select infrastructure and tooling vendors.", slug="proj-2", created_at=datetime(2025, 2, 10, tzinfo=timezone.utc)),
    ProjectResponse(id=UUID("a1b2c3d4-0000-4000-8000-000000000003"), name="Risk & Compliance", description="Regulatory and risk decisions for new markets.", slug="proj-3", created_at=datetime(2025, 2, 20, tzinfo=timezone.utc)),
]


def _is_uuid(s: str) -> bool:
    try:
        UUID(s)
        return True
    except ValueError:
        return False


@router.get("/", response_model=List[ProjectResponse])
def get_projects():
    try:
        supabase = get_supabase()
        if not supabase:
            local = get_all_local_projects()
            items = FALLBACK_PROJECTS + [ProjectResponse(**p) for p in local]
            return items
        response = supabase.table("projects").select("*").execute()
        return response.data or FALLBACK_PROJECTS
    except Exception as e:
        logger.exception("get_projects failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)[:200])

@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(project: ProjectCreate):
    supabase = get_supabase()
    if not supabase:
        p = add_local_project(project.name, project.description)
        return ProjectResponse(**p)
    try:
        slug = "proj-" + uuid.uuid4().hex[:8]
        data = {**project.model_dump(exclude_none=True), "slug": slug}
        response = supabase.table("projects").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create project")
        return response.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )


@router.get("/{id_or_slug}", response_model=ProjectResponse)
def get_project(id_or_slug: str):
    """Get a single project by UUID or slug (e.g. proj-1)."""
    try:
        for p in FALLBACK_PROJECTS:
            if str(p.id) == id_or_slug or (p.slug and p.slug == id_or_slug):
                return p

        local = get_local_project_store(id_or_slug)
        if local:
            return ProjectResponse(**local)

        supabase = get_supabase()
        if not supabase:
            raise HTTPException(status_code=404, detail="Project not found")
        if _is_uuid(id_or_slug):
            r = supabase.table("projects").select("*").eq("id", id_or_slug).limit(1).execute()
        else:
            r = supabase.table("projects").select("*").eq("slug", id_or_slug).limit(1).execute()
        if not r.data or len(r.data) == 0:
            raise HTTPException(status_code=404, detail="Project not found")
        return r.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("get_project failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)[:200]
        )
