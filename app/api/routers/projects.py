import logging
import uuid
from fastapi import APIRouter, HTTPException, status
from uuid import UUID
from typing import List
from app.schemas.projects import ProjectCreate, ProjectResponse
from app.api.deps import require_supabase

logger = logging.getLogger(__name__)
router = APIRouter()


def _is_uuid(s: str) -> bool:
    try:
        UUID(s)
        return True
    except ValueError:
        return False


@router.get("/", response_model=List[ProjectResponse])
def get_projects():
    try:
        supabase = require_supabase()
        response = supabase.table("projects").select("*").order("created_at", desc=True).execute()
        return [ProjectResponse(**r) for r in (response.data or [])]
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("get_projects failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)[:200])

@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(project: ProjectCreate):
    supabase = require_supabase()
    try:
        slug = "proj-" + uuid.uuid4().hex[:8]
        data = {**project.model_dump(exclude_none=True), "slug": slug}
        response = supabase.table("projects").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create project")
        return ProjectResponse(**response.data[0])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )


@router.get("/{id_or_slug}", response_model=ProjectResponse)
def get_project(id_or_slug: str):
    """Get a single project by UUID or slug. Uses Supabase only."""
    try:
        supabase = require_supabase()
        if _is_uuid(id_or_slug):
            r = supabase.table("projects").select("*").eq("id", id_or_slug).limit(1).execute()
        else:
            r = supabase.table("projects").select("*").eq("slug", id_or_slug).limit(1).execute()
        if r.data and len(r.data) > 0:
            return ProjectResponse(**r.data[0])
        raise HTTPException(status_code=404, detail="Project not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("get_project failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)[:200]
        )
