from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    openai_api_key: Optional[str] = None
    open_api_key: Optional[str] = None  # alias for OPEN_API_KEY in .env
    anthropic_api_key: Optional[str] = None
    supabase_url: Optional[str] = None
    supabase_service_role_key: Optional[str] = None
    elevenlabs_api_key: Optional[str] = None
    github_token: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=(Path(__file__).resolve().parent.parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

settings = Settings()
