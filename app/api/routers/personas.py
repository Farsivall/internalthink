"""
Persona dimensions API — retrieve persona scoring dimensions (from personas.md) stored in Supabase.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import require_supabase
from app.schemas.persona import PersonaDimensionResponse

router = APIRouter(prefix="/personas", tags=["personas"])


@router.get("/dimensions", response_model=List[PersonaDimensionResponse])
def list_persona_dimensions(
    persona_name: Optional[str] = Query(None, description="Filter by persona (e.g. Financial, Legal)"),
):
    """
    List persona dimension definitions: name, base weight, notes per dimension.
    Matches the structure in prompt_files/personas.md.
    """
    try:
        supabase = require_supabase()
    except HTTPException:
        raise
    try:
        q = supabase.table("persona_dimensions").select("*").order("persona_name").order("sort_order")
        if persona_name and persona_name.strip():
            q = q.eq("persona_name", persona_name.strip())
        r = q.execute()
        return list(r.data or [])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
