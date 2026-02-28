"""
Supabase-centric data layer. All persistence goes through the Supabase client;
no direct Postgres connection or raw SQL. Schema is defined in supabase/schema.sql
and applied via Supabase (Dashboard, CLI, or MCP).
"""
from supabase import create_client, Client
from app.core.config import settings

_supabase: Client | None = None


def get_supabase() -> Client | None:
    """
    Returns the configured Supabase client (service role), or None if not configured.
    """
    global _supabase
    if _supabase is not None:
        return _supabase
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    if "your_supabase" in (settings.supabase_url or "").lower():
        return None
    _supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _supabase


# Lazy access — use get_supabase() for code that handles None
supabase = None  # Deprecated: use get_supabase()
