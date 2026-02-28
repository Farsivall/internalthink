from fastapi import APIRouter, HTTPException, status, Query
from pydantic import ValidationError
from typing import List
from uuid import UUID
from app.schemas.context import ContextSourceCreate, ContextSourceResponse
from app.db.client import supabase

router = APIRouter()

@router.get("/", response_model=List[ContextSourceResponse])
def get_context_sources(project_id: UUID = Query(...)):
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
    try:
        data = source.model_dump(exclude_none=True)
        # Convert UUID to string for Supabase client serialization
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
