from fastapi import APIRouter, HTTPException, status
from pydantic import ValidationError
from typing import List
from app.schemas.projects import ProjectCreate, ProjectResponse
from app.db.client import supabase

router = APIRouter()

@router.get("/", response_model=List[ProjectResponse])
def get_projects():
    try:
        response = supabase.table("projects").select("*").execute()
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(project: ProjectCreate):
    try:
        response = supabase.table("projects").insert(project.model_dump(exclude_none=True)).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create project")
        return response.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )
