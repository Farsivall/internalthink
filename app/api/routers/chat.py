"""
Chat API — project chat with AI specialists (personas).
Saves messages to Supabase when configured.
"""

import logging
from fastapi import APIRouter, HTTPException

from app.schemas.chat import ChatRequest, ChatResponse, SpecialistResponse
from app.personas import SPECIALISTS
from app.services.context import get_context_for_project
from app.services.persona import get_dimensions_grouped_by_persona
from app.engine.decisions import evaluate_all_specialists, evaluate_all_specialists_for_decision_call
from app.api.deps import require_supabase
from app.db.project_resolve import resolve_project_uuid

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


def _save_messages(supabase, project_uuid: str, user_text: str, responses: list[SpecialistResponse]):
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
    """Send a message and get responses from selected specialists. Uses Anthropic. Saves to Supabase."""
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if not request.specialist_ids:
        raise HTTPException(status_code=400, detail="At least one specialist required")

    for sid in request.specialist_ids:
        if sid not in SPECIALISTS:
            raise HTTPException(status_code=400, detail=f"Unknown specialist: {sid}")

    supabase = require_supabase()
    sources = get_context_for_project(request.project_id)
    dimensions_by_persona = get_dimensions_grouped_by_persona(supabase)

    # If a decision_id is provided, treat this as a decision-focused "call"
    # where specialists only use decision data + main project docs.
    if request.decision_id:
        try:
            r = (
                supabase.table("decisions")
                .select("*")
                .eq("id", request.decision_id)
                .limit(1)
                .execute()
            )
            rows = r.data or []
            if not rows:
                raise HTTPException(status_code=404, detail="Decision not found for chat")
            decision_row = rows[0]
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Failed to load decision %s for chat: %s", request.decision_id, e)
            raise HTTPException(status_code=500, detail="Failed to load decision for chat")

        responses = await evaluate_all_specialists_for_decision_call(
            question=request.message,
            decision_row=decision_row,
            sources=sources,
            specialist_ids=request.specialist_ids,
            dimensions_by_persona=dimensions_by_persona,
        )
    else:
        responses = await evaluate_all_specialists(
            request.message,
            sources,
            request.specialist_ids,
            project_id=request.project_id,
            dimensions_by_persona=dimensions_by_persona,
        )

    try:
        project_uuid = resolve_project_uuid(request.project_id)
        if project_uuid:
            _save_messages(supabase, project_uuid, request.message, responses)
    except Exception as e:
        logger.warning("Failed to save messages: %s", e)

    return ChatResponse(responses=responses)
