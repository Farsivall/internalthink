"""
Supabase-centric data layer. All persistence goes through the Supabase client;
no direct Postgres connection or raw SQL. Schema is defined in supabase/schema.sql
and applied via Supabase (Dashboard, CLI, or MCP).
"""
from supabase import create_client, Client
from app.core.config import settings


def get_supabase() -> Client:
    """
    Returns the configured Supabase client (service role).
    This is the single entry point for all DB access in the backend.
    """
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# Single shared client for the app lifecycle
supabase = get_supabase()
