"""
Decision evaluation API — submit a decision, get specialist scores, agreement, tradeoffs.
"""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException

from app.schemas.decision import (
    DecisionEvaluateRequest,
    DecisionEvaluateResponse,
    SpecialistScore,
)
from app.engine.decision import (
    evaluate_specialist,
    synthesize_agreement_and_tradeoffs,
)
from app.personas import SPECIALISTS
from app.personas.definitions import filter_context_for_specialist
from app.services.context import get_context_for_project

logger = logging.getLogger(__name__)
router = APIRouter()
executor = ThreadPoolExecutor(max_workers=5)


@router.post("/{project_id}/decision/evaluate", response_model=DecisionEvaluateResponse)
async def evaluate_decision(project_id: str, body: DecisionEvaluateRequest):
    """
    Evaluate a decision with all specialists. Returns each specialist's score,
    summary, objections, plus synthesized agreement and tradeoffs.
    """
    title = (body.title or "").strip()
    description = (body.description or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Decision title is required")
    if not description:
        raise HTTPException(status_code=400, detail="Decision description is required")

    sources = get_context_for_project(project_id)
    specialist_ids = list(SPECIALISTS.keys())

    def _eval_one(sid: str):
        context_str = filter_context_for_specialist(sid, sources)
        extra = f"\n\nAdditional context: {body.context}" if body.context else ""
        desc = description + extra
        return (
            sid,
            SPECIALISTS[sid].name,
            evaluate_specialist(sid, title, desc, context_str),
        )

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    tasks = [loop.run_in_executor(executor, _eval_one, sid) for sid in specialist_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    scores: list[SpecialistScore] = []
    outputs_for_synthesis: list[tuple[str, str, int, str, list[str]]] = []

    for i, r in enumerate(results):
        sid = specialist_ids[i]
        name = SPECIALISTS[sid].name
        if isinstance(r, Exception):
            logger.warning("Decision eval failed for %s: %s", sid, r)
            scores.append(
                SpecialistScore(
                    specialist_id=sid,
                    specialist_name=name,
                    score=5,
                    summary=f"Evaluation failed: {str(r)[:100]}",
                    objections=[],
                )
            )
            outputs_for_synthesis.append((sid, name, 5, scores[-1].summary, []))
        else:
            _sid, _name, (score, summary, objections) = r
            scores.append(
                SpecialistScore(
                    specialist_id=sid,
                    specialist_name=name,
                    score=score,
                    summary=summary,
                    objections=objections,
                )
            )
            outputs_for_synthesis.append((sid, name, score, summary, objections))

    agreement, tradeoffs = synthesize_agreement_and_tradeoffs(title, outputs_for_synthesis)

    return DecisionEvaluateResponse(
        decision_title=title,
        scores=scores,
        agreement=agreement,
        tradeoffs=tradeoffs,
    )
