from fastapi import APIRouter, HTTPException, status, Query
from pydantic import ValidationError
from typing import List
from uuid import UUID
from app.schemas.context import ContextSourceCreate, ContextSourceResponse
from app.db.client import get_supabase

router = APIRouter()

@router.get("/", response_model=List[ContextSourceResponse])
def get_context_sources(project_id: UUID = Query(...)):
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        response = supabase.table("context_sources").select("*").eq("project_id", str(project_id)).order("created_at").execute()
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

@router.post("/", response_model=ContextSourceResponse, status_code=status.HTTP_201_CREATED)
def create_context_source(source: ContextSourceCreate):
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        data = source.model_dump(exclude_none=True)
        data["project_id"] = str(data["project_id"])
        response = supabase.table("context_sources").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create context source")
        return response.data[0]
    except Exception as e:
        # Pydantic validates the type field before we get here (422 Unprocessable Entity)
        # Database constraint errors would surface here as a generic exception
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )
