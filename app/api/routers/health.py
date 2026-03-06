from fastapi import APIRouter
from app.core.config import settings
from app.db.client import get_supabase
from app.services.rag import check_pinecone_connection

router = APIRouter()

@router.get("/health")
def health_check():
    using_supabase = get_supabase() is not None
    pinecone_status = check_pinecone_connection()
    return {
        "status": "OK",
        "using_supabase": using_supabase,
        "keys_loaded": {
            "openai": bool(settings.openai_api_key or settings.open_api_key),
            "anthropic": bool(settings.anthropic_api_key),
            "supabase_url": bool(settings.supabase_url) and "your_supabase" not in (settings.supabase_url or "").lower(),
            "supabase_service_role": bool(settings.supabase_service_role_key) and "your_supabase" not in (settings.supabase_service_role_key or "").lower(),
            "elevenlabs": bool(settings.elevenlabs_api_key),
            "github_token": bool(settings.github_token),
            "pinecone": pinecone_status.get("configured", False),
        },
        "pinecone": pinecone_status,
    }
