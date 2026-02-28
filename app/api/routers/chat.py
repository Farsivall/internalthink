"""
Chat API — project chat with AI specialists (personas).
Saves messages to Supabase when configured.
"""

import logging
from fastapi import APIRouter, HTTPException

from app.schemas.chat import ChatRequest, ChatResponse, SpecialistResponse
from app.personas import SPECIALISTS
from app.services.context import get_context_for_project
from app.engine.decisions import evaluate_all_specialists
from app.db.client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


def _resolve_project_uuid(project_id: str) -> str | None:
    """Return project UUID for saving messages. Only returns UUID, never slug."""
    from uuid import UUID
    try:
        UUID(project_id)
        return project_id
    except ValueError:
        pass
    try:
        supabase = get_supabase()
        if not supabase:
            return None
        r = supabase.table("projects").select("id").eq("slug", project_id).limit(1).execute()
        if r.data and len(r.data) > 0:
            return str(r.data[0]["id"])
        return None
    except Exception:
        return None


def _save_messages(project_uuid: str, user_text: str, responses: list[SpecialistResponse]):
    supabase = get_supabase()
    if not supabase:
        return
    try:
        supabase.table("project_chat_messages").insert({
            "project_id": project_uuid,
            "sender": "user",
            "text": user_text,
        }).execute()
        for r in responses:
            supabase.table("project_chat_messages").insert({
                "project_id": project_uuid,
                "sender": r.specialist_id,
                "text": r.text,
                "thinking_process": r.thinking_process,
            }).execute()
    except Exception:
        pass


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Send a message and get responses from selected specialists. Uses Anthropic. Saves to Supabase when configured."""
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if not request.specialist_ids:
        raise HTTPException(status_code=400, detail="At least one specialist required")

    for sid in request.specialist_ids:
        if sid not in SPECIALISTS:
            raise HTTPException(status_code=400, detail=f"Unknown specialist: {sid}")

    sources = get_context_for_project(request.project_id)
    responses = await evaluate_all_specialists(request.message, sources, request.specialist_ids)

    try:
        project_uuid = _resolve_project_uuid(request.project_id)
        if project_uuid:
            _save_messages(project_uuid, request.message, responses)
    except Exception as e:
        logger.warning("Failed to save messages: %s", e)

    return ChatResponse(responses=responses)
