"""
Chat API — project chat with AI specialists (personas).
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException

from app.schemas.chat import ChatRequest, ChatResponse, SpecialistResponse
from app.engine.chat import call_specialist
from app.personas import filter_context_for_specialist, SPECIALISTS
from app.services.context import get_context_for_project, get_persona_access_for_project

router = APIRouter(prefix="/chat", tags=["chat"])
executor = ThreadPoolExecutor(max_workers=5)


def _call_sync(specialist_id: str, message: str, context_str: str) -> SpecialistResponse:
    text, thinking = call_specialist(specialist_id, message, context_str)
    return SpecialistResponse(
        specialist_id=specialist_id,
        text=text,
        thinking_process=thinking,
    )


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Send a message and get responses from selected specialists."""
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if not request.specialist_ids:
        raise HTTPException(status_code=400, detail="At least one specialist required")

    for sid in request.specialist_ids:
        if sid not in SPECIALISTS:
            raise HTTPException(status_code=400, detail=f"Unknown specialist: {sid}")

    sources = get_context_for_project(request.project_id)
    persona_access = get_persona_access_for_project(request.project_id)

    loop = asyncio.get_event_loop()
    tasks = []
    for sid in request.specialist_ids:
        context_str = filter_context_for_specialist(sid, sources, persona_access)
        tasks.append(loop.run_in_executor(executor, _call_sync, sid, request.message, context_str))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    responses: list[SpecialistResponse] = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            sid = request.specialist_ids[i]
            responses.append(
                SpecialistResponse(
                    specialist_id=sid,
                    text=f"Analysis unavailable: {str(r)[:80]}",
                    thinking_process=str(r),
                )
            )
        else:
            responses.append(r)

    return ChatResponse(responses=responses)
