"""
Decision evaluation API — submit a decision, get specialist scores, agreement, tradeoffs.
"""

import asyncio
import json
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
from app.api.deps import require_supabase
from app.db.project_resolve import resolve_project_uuid

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

    decision_id: str | None = None

    # Persist decision to Supabase decisions table (best-effort; errors are logged but do not break the API).
    try:
        supabase = require_supabase()
        pid = resolve_project_uuid(project_id) or project_id
        result = supabase.table("decisions").insert({
            "project_id": pid,
            "question": title,
            "description": description,
            "specialist_responses": json.dumps([
                {
                    "specialist_id": s.specialist_id,
                    "specialist_name": s.specialist_name,
                    "score_0_100": s.score * 10,
                    "score_raw": s.score,
                    "summary": s.summary,
                    "objections": s.objections,
                }
                for s in scores
            ]),
            "conflict_summary": json.dumps({
                "agreement": agreement,
                "tradeoffs": tradeoffs,
            }),
            # breakdowns will be filled by a later background job; keep as empty list for now
            "breakdowns": json.dumps([]),
        }).execute()
        data = (result.data or [])
        if data:
            decision_id = str(data[0].get("id"))
            # Also record a decision bubble in project chat so it appears in history
            try:
                supabase.table("project_chat_messages").insert({
                    "project_id": pid,
                    "sender": "decision",
                    "text": title,
                    "decision_id": decision_id,
                }).execute()
            except Exception as chat_err:
                logger.warning("Failed to save decision chat message for project %s: %s", project_id, chat_err)
    except Exception as e:
        logger.warning("Failed to persist decision for project %s: %s", project_id, e)

    response = DecisionEvaluateResponse(
        decision_id=decision_id,
        decision_title=title,
        scores=scores,
        agreement=agreement,
        tradeoffs=tradeoffs,
    )

    return response


@router.get("/decisions/{decision_id}", response_model=DecisionEvaluateResponse)
def get_decision(decision_id: str):
    """Retrieve a stored decision by ID from Supabase."""
    try:
        supabase = require_supabase()
    except HTTPException:
        raise
    try:
        r = supabase.table("decisions").select("*").eq("id", decision_id).limit(1).execute()
        rows = r.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Decision not found")
        row = rows[0]

        # specialist_responses is stored as JSON; decode if necessary
        specialist_raw = row.get("specialist_responses") or []
        if isinstance(specialist_raw, str):
            try:
                specialist_responses = json.loads(specialist_raw)
            except Exception:
                specialist_responses = []
        else:
            specialist_responses = specialist_raw

        scores: list[SpecialistScore] = []
        for item in specialist_responses:
            raw = item.get("score_raw")
            score_0_100 = item.get("score_0_100")
            if isinstance(raw, int):
                score = raw
            elif isinstance(score_0_100, (int, float)):
                score = max(1, min(10, int(round(score_0_100 / 10))))
            else:
                score = 5
            scores.append(
                SpecialistScore(
                    specialist_id=item.get("specialist_id", ""),
                    specialist_name=item.get("specialist_name", ""),
                    score=score,
                    summary=item.get("summary", ""),
                    objections=item.get("objections") or [],
                )
            )

        conflict_raw = row.get("conflict_summary") or {}
        if isinstance(conflict_raw, str):
            try:
                conflict = json.loads(conflict_raw)
            except Exception:
                conflict = {}
        else:
            conflict = conflict_raw or {}

        agreement = conflict.get("agreement", "")
        tradeoffs = conflict.get("tradeoffs", "")
        return DecisionEvaluateResponse(
            decision_id=str(row.get("id")),
            decision_title=row.get("question", ""),
            scores=scores,
            agreement=agreement,
            tradeoffs=tradeoffs,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to load decision %s: %s", decision_id, e)
        raise HTTPException(status_code=500, detail="Failed to load decision")


@router.get("/{project_id}/decisions")
def list_decisions_for_project(project_id: str):
    """
    List decisions for a given project.

    Returns lightweight summaries used by the Decision Happiness tab.
    """
    try:
        supabase = require_supabase()
    except HTTPException:
        raise

    try:
        pid = resolve_project_uuid(project_id) or project_id
        # Use select("*") so we don't break if some columns
        # (like description or updated_at) are missing in this environment.
        r = (
            supabase.table("decisions")
            .select("*")
            .eq("project_id", pid)
            .order("created_at", desc=True)
            .execute()
        )
        rows = r.data or []
        items = []
        for row in rows:
            conflict_raw = row.get("conflict_summary") or {}
            if isinstance(conflict_raw, str):
                try:
                    conflict = json.loads(conflict_raw)
                except Exception:
                    conflict = {}
            else:
                conflict = conflict_raw or {}

            agreement = conflict.get("agreement") or ""
            tradeoffs = conflict.get("tradeoffs") or ""
            description = row.get("description") or ""

            summary = agreement or tradeoffs or description

            items.append(
                {
                    "id": str(row.get("id")),
                    "project_id": str(row.get("project_id")),
                    "title": row.get("question", ""),
                    "summary": summary,
                    # For now all stored decisions are "Evaluated"
                    "status": "Evaluated",
                    "agreement": agreement,
                    "tradeoffs": tradeoffs,
                    "created_at": row.get("created_at"),
                    "updated_at": row.get("updated_at") if "updated_at" in row else None,
                }
            )

        return items
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to list decisions for project %s: %s", project_id, e)
        raise HTTPException(status_code=500, detail="Failed to list decisions")
