"""
Chat API — project chat with AI specialists (personas).
Saves messages to Supabase when configured.
"""

import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException

from app.schemas.chat import ChatRequest, ChatResponse, SpecialistResponse
from app.engine.chat import call_specialist
from app.personas import SPECIALISTS
from app.personas.definitions import filter_context_for_specialist
from app.services.context import get_context_for_project
from app.db.client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])
executor = ThreadPoolExecutor(max_workers=5)


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


def _call_sync(specialist_id: str, message: str, context_str: str) -> SpecialistResponse:
    text, thinking = call_specialist(specialist_id, message, context_str)
    return SpecialistResponse(
        specialist_id=specialist_id,
        text=text,
        thinking_process=thinking,
    )


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

    # Fetch context sources for the project and filter per specialist
    sources = get_context_for_project(request.project_id)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    tasks = [
        loop.run_in_executor(
            executor, _call_sync, sid, request.message,
            filter_context_for_specialist(sid, sources),
        )
        for sid in request.specialist_ids
    ]

    try:
        results = await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as e:
        logger.exception("Chat gather failed")
        return ChatResponse(responses=[
            SpecialistResponse(
                specialist_id=request.specialist_ids[0],
                text=f"Backend error: {str(e)[:100]}. Check server logs.",
                thinking_process=str(e),
            )
        ])

    responses: list[SpecialistResponse] = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            sid = request.specialist_ids[i]
            logger.warning("Specialist %s failed: %s", sid, r)
            responses.append(
                SpecialistResponse(
                    specialist_id=sid,
                    text=f"Analysis unavailable: {str(r)[:80]}",
                    thinking_process=str(r),
                )
            )
        else:
            responses.append(r)

    try:
        project_uuid = _resolve_project_uuid(request.project_id)
        if project_uuid:
            _save_messages(project_uuid, request.message, responses)
    except Exception as e:
        logger.warning("Failed to save messages: %s", e)

    return ChatResponse(responses=responses)
