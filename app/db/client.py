"""
Supabase-centric data layer. All persistence goes through the Supabase client;
no direct Postgres connection or raw SQL. Schema is defined in supabase/schema.sql
and applied via Supabase (Dashboard, CLI, or MCP).

When USE_IN_MEMORY_ONLY=1 (or SUPABASE_DISABLED=1), always returns None — all data
uses in-memory store (app/db/local_store.py). Data is lost on server restart.
"""
import os
from typing import Any

_supabase: Any = None


def get_supabase() -> Any | None:
    """
    Returns the configured Supabase client (service role), or None if not configured.
    When USE_IN_MEMORY_ONLY=1 or SUPABASE_DISABLED=1, always returns None.
    """
    if os.environ.get("USE_IN_MEMORY_ONLY", "").strip() in ("1", "true", "yes"):
        return None
    if os.environ.get("SUPABASE_DISABLED", "").strip() in ("1", "true", "yes"):
        return None
    global _supabase
    if _supabase is not None:
        return _supabase
    try:
        from supabase import create_client
        from app.core.config import settings
        if not settings.supabase_url or not settings.supabase_service_role_key:
            return None
        if "your_supabase" in (settings.supabase_url or "").lower():
            return None
        if "your_supabase" in (settings.supabase_service_role_key or "").lower():
            return None
        client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        globals()["_supabase"] = client
        return client
    except Exception:
        return None


# Lazy access — use get_supabase() for code that handles None
supabase = None  # Deprecated: use get_supabase()
