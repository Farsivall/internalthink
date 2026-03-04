"""Shared API dependencies."""
from fastapi import HTTPException

from app.db.client import get_supabase

SUPABASE_REQUIRED_MESSAGE = (
    "Supabase is required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env."
)


def require_supabase():
    """Return the Supabase client or raise 503 if not configured."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail=SUPABASE_REQUIRED_MESSAGE,
        )
    return supabase
