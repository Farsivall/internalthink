from supabase import create_client, Client
from app.core.config import settings

def get_supabase() -> Client:
    """
    Returns a configured Supabase client using the settings.
    We use the service role key to bypass RLS for this backend service.
    """
    return create_client(settings.supabase_url, settings.supabase_service_role_key)

supabase = get_supabase()
