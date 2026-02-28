from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

@router.get("/health")
def health_check():
    return {
        "status": "OK",
        "keys_loaded": {
            "anthropic": bool(settings.anthropic_api_key),
            "supabase_url": bool(settings.supabase_url),
            "supabase_service_role": bool(settings.supabase_service_role_key),
            "elevenlabs": bool(settings.elevenlabs_api_key),
        }
    }
