"""
Decision evaluation engine — parallel fan-out for all specialists.
Calls all specialists simultaneously via ThreadPoolExecutor + asyncio.gather.
"""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from app.engine.chat import call_specialist
from app.personas import SPECIALISTS
from app.personas.definitions import filter_context_for_specialist
from app.schemas.chat import SpecialistResponse

logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=5)


def _evaluate_sync(specialist_id: str, question: str, context_str: str) -> SpecialistResponse:
    """Synchronous wrapper for call_specialist, run inside thread pool."""
    text, thinking = call_specialist(specialist_id, question, context_str)
    return SpecialistResponse(
        specialist_id=specialist_id,
        text=text,
        thinking_process=thinking,
    )


async def evaluate_all_specialists(
    question: str,
    sources: list[dict],
    specialist_ids: list[str] | None = None,
) -> list[SpecialistResponse]:
    """
    Call specialists in parallel. Defaults to all 5.
    Failed specialists return fallback responses, never crash.
    """
    ids = specialist_ids or list(SPECIALISTS.keys())
    loop = asyncio.get_running_loop()

    tasks = [
        loop.run_in_executor(
            executor, _evaluate_sync, sid, question,
            filter_context_for_specialist(sid, sources),
        )
        for sid in ids
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    responses: list[SpecialistResponse] = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            sid = ids[i]
            logger.warning("Specialist %s failed: %s", sid, r)
            responses.append(SpecialistResponse(
                specialist_id=sid,
                text=f"Analysis unavailable: {str(r)[:80]}",
                thinking_process=str(r),
            ))
        else:
            responses.append(r)

    return responses
