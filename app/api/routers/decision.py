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
    DecisionPersonaScoreDetail,
    DimensionScoreDetail,
)
from app.engine.decision import (
    evaluate_specialist,
    synthesize_agreement_and_tradeoffs,
)
from app.personas import SPECIALISTS
from app.personas.definitions import filter_context_for_specialist
from app.services.context import get_context_for_project
from app.services.persona import (
    get_dimensions_grouped_by_persona,
    SPECIALIST_ID_TO_PERSONA_NAME,
)
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
    if body.document_ids:
        doc_id_set = set(body.document_ids)
        sources = [s for s in sources if str(s.get("id") or "") in doc_id_set]
    if body.inline_documents:
        for i, inv in enumerate(body.inline_documents):
            content = (inv.content or "").strip()
            if not content:
                continue
            sources.append({
                "id": f"inline-{i}",
                "project_id": "",
                "type": "document",
                "label": (inv.label or "").strip() or f"Attachment {i + 1}",
                "content": content,
                "permitted_specialists": "all",
            })
    specialist_ids = list(SPECIALISTS.keys())

    # Load scoring matrix from Supabase (persona_dimensions) for each persona
    dimensions_by_persona: dict[str, list] = {}
    try:
        supabase = require_supabase()
        dimensions_by_persona = get_dimensions_grouped_by_persona(supabase)
    except Exception:
        pass

    has_attached_documents = bool(body.document_ids or body.inline_documents)

    def _eval_one(sid: str):
        context_str = filter_context_for_specialist(
            sid, sources, as_proposal_context=has_attached_documents
        )
        extra = f"\n\nAdditional context: {body.context}" if body.context else ""
        desc = description + extra
        persona_name = SPECIALIST_ID_TO_PERSONA_NAME.get(sid, SPECIALISTS[sid].name)
        dimensions = dimensions_by_persona.get(persona_name) or []
        result = evaluate_specialist(
            sid, title, desc, context_str, dimensions=dimensions,
            has_attached_documents=has_attached_documents,
        )
        return (sid, SPECIALISTS[sid].name, persona_name, result)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    tasks = [loop.run_in_executor(executor, _eval_one, sid) for sid in specialist_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    scores: list[SpecialistScore] = []
    outputs_for_synthesis: list[tuple[str, str, int, str, list[str]]] = []

    persona_details: list[tuple[str, dict]] = []  # (persona_name, detail)

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
            _sid, _name, persona_name, (score, summary, objections, persona_detail) = r
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
            if persona_detail and persona_name:
                persona_details.append((persona_name, persona_detail))

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
            # Persist persona scoring matrix results (decision_persona_scores)
            for pname, detail in persona_details:
                try:
                    supabase.table("decision_persona_scores").insert({
                        "decision_id": decision_id,
                        "persona_name": pname,
                        "total_score": detail.get("total_score", 50),
                        "dimensions": json.dumps(detail.get("dimensions") or []),
                        "what_would_change_my_mind": json.dumps(detail.get("what_would_change_my_mind") or []),
                        "high_structural_risk": bool(detail.get("high_structural_risk", False)),
                    }).execute()
                except Exception as score_err:
                    logger.warning("Failed to save persona score for %s: %s", pname, score_err)
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

        # Fetch decision_persona_scores for dimensions, what_would_change_my_mind, high_structural_risk
        persona_scores: list[DecisionPersonaScoreDetail] = []
        try:
            score_r = supabase.table("decision_persona_scores").select("*").eq("decision_id", decision_id).order("persona_name").execute()
            for ps_row in (score_r.data or []):
                dims_raw = ps_row.get("dimensions") or []
                if isinstance(dims_raw, str):
                    try:
                        dims_raw = json.loads(dims_raw)
                    except Exception:
                        dims_raw = []
                dimensions = []
                for d in dims_raw:
                    if isinstance(d, dict):
                        dimensions.append(DimensionScoreDetail(
                            Name=str(d.get("Name") or d.get("name") or ""),
                            Score=int(d.get("Score") or d.get("score") or 0),
                            KeyRisks=list(d.get("KeyRisks") or d.get("key_risks") or []),
                            TradeOffs=list(d.get("TradeOffs") or d.get("trade_offs") or []),
                            EvidenceGaps=list(d.get("EvidenceGaps") or d.get("evidence_gaps") or []),
                        ))
                wwcm_raw = ps_row.get("what_would_change_my_mind") or []
                if isinstance(wwcm_raw, str):
                    try:
                        wwcm_raw = json.loads(wwcm_raw)
                    except Exception:
                        wwcm_raw = []
                what_would_change = [str(x) for x in wwcm_raw] if isinstance(wwcm_raw, list) else []
                persona_scores.append(DecisionPersonaScoreDetail(
                    persona_name=str(ps_row.get("persona_name") or ""),
                    total_score=int(ps_row.get("total_score") or 0),
                    dimensions=dimensions,
                    what_would_change_my_mind=what_would_change,
                    high_structural_risk=bool(ps_row.get("high_structural_risk")),
                ))
        except Exception as e:
            logger.warning("Failed to load decision_persona_scores for %s: %s", decision_id, e)

        return DecisionEvaluateResponse(
            decision_id=str(row.get("id")),
            decision_title=row.get("question", ""),
            scores=scores,
            agreement=agreement,
            tradeoffs=tradeoffs,
            persona_scores=persona_scores,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to load decision %s: %s", decision_id, e)
        raise HTTPException(status_code=500, detail="Failed to load decision")


@router.get("/decisions/{decision_id}/scores")
def get_decision_persona_scores(decision_id: str):
    """
    Get persona dimension scores for a decision (from decision_persona_scores table).
    Returns one row per persona with total_score, dimensions (Name, Score, KeyRisks, TradeOffs, EvidenceGaps), what_would_change_my_mind, high_structural_risk.
    """
    try:
        supabase = require_supabase()
    except HTTPException:
        raise
    try:
        r = supabase.table("decision_persona_scores").select("*").eq("decision_id", decision_id).order("persona_name").execute()
        return r.data or []
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to load decision persona scores %s: %s", decision_id, e)
        raise HTTPException(status_code=500, detail="Failed to load decision scores")


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
