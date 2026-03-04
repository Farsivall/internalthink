"""
Supabase-only data layer. All persistence goes through the Supabase client;
no in-memory or local store. Schema is defined in supabase/schema.sql.
"""
import logging
from typing import Any

logger = logging.getLogger(__name__)
_supabase: Any = None


def get_supabase() -> Any | None:
    """Returns the configured Supabase client (service role), or None if not configured."""
    global _supabase
    if _supabase is not None:
        return _supabase
    try:
        from supabase import create_client
        from app.core.config import settings
        if not settings.supabase_url or not settings.supabase_service_role_key:
            logger.warning("Supabase not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
            return None
        if "your_supabase" in (settings.supabase_url or "").lower():
            return None
        if "your_supabase" in (settings.supabase_service_role_key or "").lower():
            return None
        client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        globals()["_supabase"] = client
        return client
    except Exception as e:
        logger.exception("Supabase client failed: %s — check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. Service role key should be the JWT from Dashboard → Project Settings → API (service_role).", e)
        return None


# Lazy access — use get_supabase() for code that handles None
supabase = None  # Deprecated: use get_supabase()
