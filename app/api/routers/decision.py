"""
Decision evaluation API — submit a decision, get specialist scores, agreement, tradeoffs.
"""

import asyncio
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException

from app.schemas.decision import (
    DecisionEvaluateRequest,
    DecisionEvaluateResponse,
    SpecialistScore,
    DecisionPersonaScoreDetail,
    DimensionScoreDetail,
    CitationItem,
)
from app.engine.decision import (
    evaluate_specialist,
    synthesize_agreement_and_tradeoffs,
    synthesize_decision_tree,
)
from app.personas import SPECIALISTS
from app.personas.definitions import filter_context_for_specialist
from app.services.context import get_context_for_project
from app.services.rag import retrieve_chunks_for_evaluation, format_chunks_for_citation, get_chunk_labels
from app.services.persona import (
    get_dimensions_grouped_by_persona,
    SPECIALIST_ID_TO_PERSONA_NAME,
    PERSONA_NAME_TO_SPECIALIST_ID,
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
    attached_labels = [
        (str(s.get("label") or s.get("file_name") or "Document")).strip() or "Document"
        for s in sources
    ]
    DEFAULT_SPECIALISTS = ["legal", "financial", "technical", "bd", "tax"]
    specialist_ids = body.specialist_ids if body.specialist_ids else DEFAULT_SPECIALISTS
    for sid in specialist_ids:
        if sid not in SPECIALISTS:
            raise HTTPException(status_code=400, detail=f"Unknown specialist: {sid}")
    if not specialist_ids:
        raise HTTPException(status_code=400, detail="At least one specialist required for evaluation")

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
        # RAG: retrieve company + domain chunks for citation-grounded evaluation
        query = f"{title}\n{description}"[:800]
        try:
            chunks = retrieve_chunks_for_evaluation(
                project_id=project_id,
                query=query,
                persona_name=persona_name,
                dimension_names=[(d.get("dimension_name") or "").strip() for d in dimensions if (d.get("dimension_name") or "").strip()],
                top_k_company=6,
                top_k_domain=4,
            )
            rag_citation_context_str = format_chunks_for_citation(chunks)
            evidence_labels = get_chunk_labels(chunks)
        except Exception as e:
            logger.warning("RAG retrieval failed for specialist %s: %s", sid, e)
            rag_citation_context_str = ""
            evidence_labels = []
        result = evaluate_specialist(
            sid, title, desc, context_str, dimensions=dimensions,
            has_attached_documents=has_attached_documents,
            rag_citation_context=rag_citation_context_str,
        )
        return (sid, SPECIALISTS[sid].name, persona_name, result, evidence_labels)

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
            outputs_for_synthesis.append((sid, name, 5, scores[-1].summary, [], None))
        else:
            _sid, _name, persona_name, result, evidence_labels = r
            score, summary, objections, persona_detail, citations = result
            score_100 = int(persona_detail.get("total_score", score * 10)) if isinstance(persona_detail, dict) else (score * 10)
            scores.append(
                SpecialistScore(
                    specialist_id=sid,
                    specialist_name=name,
                    score=score,
                    summary=summary,
                    objections=objections,
                    citations=citations,
                    sources_used=evidence_labels if evidence_labels else None,
                )
            )
            outputs_for_synthesis.append((sid, name, score, summary, objections, score_100))
            if persona_detail and persona_name:
                persona_details.append((persona_name, persona_detail))

    # Run agreement/tradeoffs synthesis in background thread while we build response data
    synthesis_future = executor.submit(synthesize_agreement_and_tradeoffs, title, outputs_for_synthesis)

    decision_id: str | None = None

    # Response persona_scores from persona_details (built while synthesis runs)
    response_persona_scores: list[DecisionPersonaScoreDetail] = []
    for pname, detail in persona_details:
        dims = detail.get("dimensions") or []
        raw_citations = detail.get("citations") or []
        citations_list = None
        if raw_citations and isinstance(raw_citations, list):
            citations_list = [
                CitationItem(
                    claim_or_section=str(c.get("claim_or_section") or c.get("claim") or ""),
                    source_label=str(c.get("source_label") or c.get("source") or ""),
                    snippet_or_quote=str(c.get("snippet_or_quote") or c.get("snippet") or ""),
                )
                for c in raw_citations if isinstance(c, dict)
            ]
        response_persona_scores.append(
            DecisionPersonaScoreDetail(
                persona_name=pname,
                total_score=int(detail.get("total_score", 50)),
                dimensions=[
                    DimensionScoreDetail(
                        Name=str(d.get("Name") or d.get("name") or ""),
                        Score=int(d.get("Score") or d.get("score") or 0),
                        KeyRisks=list(d.get("KeyRisks") or d.get("key_risks") or []),
                        TradeOffs=list(d.get("TradeOffs") or d.get("trade_offs") or []),
                        EvidenceGaps=list(d.get("EvidenceGaps") or d.get("evidence_gaps") or []),
                    )
                    for d in dims if isinstance(d, dict)
                ],
                what_would_change_my_mind=list(detail.get("what_would_change_my_mind") or []),
                high_structural_risk=bool(detail.get("high_structural_risk", False)),
                citations=citations_list,
            )
        )

    # Build specialist_responses payload while synthesis runs in background
    persona_details_by_name = {pname: detail for pname, detail in persona_details}
    specialist_responses_payload = []
    for i, sid in enumerate(specialist_ids):
        persona_name = SPECIALIST_ID_TO_PERSONA_NAME.get(sid, SPECIALISTS[sid].name)
        detail = persona_details_by_name.get(persona_name)
        s = scores[i]
        if detail is not None:
            total = int(detail.get("total_score", 50))
            payload = {
                "specialist_id": sid,
                "specialist_name": s.specialist_name,
                "score_0_100": total,
                "score_raw": max(1, min(10, round(total / 10))),
                "summary": s.summary,
                "objections": s.objections,
            }
        else:
            payload = {
                "specialist_id": s.specialist_id,
                "specialist_name": s.specialist_name,
                "score_0_100": s.score * 10,
                "score_raw": s.score,
                "summary": s.summary,
                "objections": s.objections,
            }
        if s.sources_used:
            payload["sources_used"] = s.sources_used
        if s.citations:
            payload["citations"] = [c.model_dump() if hasattr(c, "model_dump") else c for c in s.citations]
        specialist_responses_payload.append(payload)

    # Wait for agreement/tradeoffs/core_tensions (was running in parallel with payload build above)
    try:
        agreement, tradeoffs, core_tensions = synthesis_future.result(timeout=60)
    except Exception as e:
        logger.warning("Agreement/tradeoffs synthesis failed: %s", e)
        agreement, tradeoffs, core_tensions = "Synthesis unavailable.", "—", []

    # Persist decision to Supabase (best-effort; errors logged but don't break the API)
    try:
        supabase = require_supabase()
        pid = resolve_project_uuid(project_id) or project_id
        insert_payload: dict = {
            "project_id": pid,
            "question": title,
            "description": description,
            "specialist_responses": json.dumps(specialist_responses_payload),
            "conflict_summary": json.dumps({
                "agreement": agreement,
                "tradeoffs": tradeoffs,
                "attached_labels": attached_labels,
                "core_tensions": core_tensions,
            }),
            "decision_synthesis": json.dumps({}),
        }
        if body.parent_id:
            insert_payload["parent_id"] = body.parent_id
        result = supabase.table("decisions").insert(insert_payload).execute()
        data = (result.data or [])
        if data:
            decision_id = str(data[0].get("id"))
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

            try:
                supabase.table("project_chat_messages").insert({
                    "project_id": pid,
                    "sender": "decision",
                    "text": title,
                    "decision_id": decision_id,
                }).execute()
            except Exception as chat_err:
                logger.warning("Failed to save decision chat message for project %s: %s", project_id, chat_err)

            # Fire-and-forget: run decision tree synthesis in a background thread
            # so the user gets scores + agreement/tradeoffs immediately.
            _decision_id = decision_id
            summary_by_persona = {}
            for i, sid in enumerate(specialist_ids):
                pname = SPECIALIST_ID_TO_PERSONA_NAME.get(sid, SPECIALISTS[sid].name)
                summary_by_persona[pname] = scores[i].summary
            persona_outputs = [
                (
                    pname,
                    int(detail.get("total_score", 50)),
                    summary_by_persona.get(pname, ""),
                    list(detail.get("what_would_change_my_mind") or []),
                )
                for pname, detail in persona_details
            ]

            def _bg_synthesize():
                try:
                    syn = synthesize_decision_tree(title, description, agreement, tradeoffs, persona_outputs)
                    if syn:
                        sb = require_supabase()
                        sb.table("decisions").update({
                            "decision_synthesis": json.dumps(syn),
                        }).eq("id", _decision_id).execute()
                except Exception as e:
                    logger.warning("Background decision_synthesis failed for %s: %s", _decision_id, e)

            threading.Thread(target=_bg_synthesize, daemon=True).start()
    except Exception as e:
        logger.warning("Failed to persist decision for project %s: %s", project_id, e)

    return DecisionEvaluateResponse(
        decision_id=decision_id,
        decision_title=title,
        scores=scores,
        agreement=agreement,
        tradeoffs=tradeoffs,
        persona_scores=response_persona_scores,
        attached_labels=attached_labels,
        decision_summary=None,
        core_tensions=core_tensions or None,
        paths=None,
        path_ranking=None,
        recommended_path=None,
        recommended_path_next_steps=None,
        decision_tree=None,
    )


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

        # specialist_responses is stored as JSON (fallback for summary/objections)
        specialist_raw = row.get("specialist_responses") or []
        if isinstance(specialist_raw, str):
            try:
                specialist_responses = json.loads(specialist_raw)
            except Exception:
                specialist_responses = []
        else:
            specialist_responses = specialist_raw
        by_specialist_id = {item.get("specialist_id"): item for item in specialist_responses if item.get("specialist_id")}

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
        attached_labels = conflict.get("attached_labels")
        if attached_labels is not None and not isinstance(attached_labels, list):
            attached_labels = None
        stored_core_tensions = conflict.get("core_tensions") or []

        # Parse decision_synthesis JSONB for new output structure (decision_tree.md)
        synthesis_raw = row.get("decision_synthesis") or {}
        if isinstance(synthesis_raw, str):
            try:
                synthesis = json.loads(synthesis_raw)
            except Exception:
                synthesis = {}
        else:
            synthesis = synthesis_raw or {}

        # Fetch decision_persona_scores — source of truth for scores; also used to build scores list
        persona_scores: list[DecisionPersonaScoreDetail] = []
        scores: list[SpecialistScore] = []
        try:
            score_r = supabase.table("decision_persona_scores").select("*").eq("decision_id", decision_id).order("persona_name").execute()
            for ps_row in (score_r.data or []):
                persona_name = str(ps_row.get("persona_name") or "")
                total_score = int(ps_row.get("total_score") or 0)
                sid = PERSONA_NAME_TO_SPECIALIST_ID.get(persona_name)
                specialist_name = SPECIALISTS[sid].name if sid and sid in SPECIALISTS else persona_name
                resp = by_specialist_id.get(sid, {}) if sid else {}
                # Scores list derived from decision_persona_scores (total_score 0–100); summary/objections from specialist_responses
                score_1_10 = max(1, min(10, round(total_score / 10))) if total_score else 5
                raw_cites = resp.get("citations") or []
                citations_list = [CitationItem(**c) for c in raw_cites if isinstance(c, dict)] if raw_cites else None
                if citations_list is not None and not citations_list:
                    citations_list = None
                scores.append(
                    SpecialistScore(
                        specialist_id=sid or "",
                        specialist_name=specialist_name,
                        score=score_1_10,
                        summary=resp.get("summary", ""),
                        objections=resp.get("objections") or [],
                        citations=citations_list,
                        sources_used=resp.get("sources_used"),
                    )
                )
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
                    persona_name=persona_name,
                    total_score=total_score,
                    dimensions=dimensions,
                    what_would_change_my_mind=what_would_change,
                    high_structural_risk=bool(ps_row.get("high_structural_risk")),
                ))
        except Exception as e:
            logger.warning("Failed to load decision_persona_scores for %s: %s", decision_id, e)

        # Legacy: if no decision_persona_scores, build scores from specialist_responses
        if not scores and specialist_responses:
            for item in specialist_responses:
                raw = item.get("score_raw")
                score_0_100 = item.get("score_0_100")
                if isinstance(raw, int):
                    score = raw
                elif isinstance(score_0_100, (int, float)):
                    score = max(1, min(10, int(round(score_0_100 / 10))))
                else:
                    score = 5
                raw_cites = item.get("citations") or []
                citations_list = [CitationItem(**c) for c in raw_cites if isinstance(c, dict)] if raw_cites else None
                if citations_list is not None and not citations_list:
                    citations_list = None
                scores.append(
                    SpecialistScore(
                        specialist_id=item.get("specialist_id", ""),
                        specialist_name=item.get("specialist_name", ""),
                        score=score,
                        summary=item.get("summary", ""),
                        objections=item.get("objections") or [],
                        citations=citations_list,
                        sources_used=item.get("sources_used"),
                    )
                )

        return DecisionEvaluateResponse(
            decision_id=str(row.get("id")),
            decision_title=row.get("question", ""),
            scores=scores,
            agreement=agreement,
            tradeoffs=tradeoffs,
            persona_scores=persona_scores,
            attached_labels=attached_labels,
            decision_summary=synthesis.get("decision_summary"),
            core_tensions=stored_core_tensions if stored_core_tensions else synthesis.get("core_tensions"),
            paths=synthesis.get("paths"),
            path_ranking=synthesis.get("path_ranking"),
            recommended_path=synthesis.get("recommended_path"),
            recommended_path_next_steps=synthesis.get("recommended_path_next_steps"),
            decision_tree=synthesis.get("decision_tree"),
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

            parent_id_val = row.get("parent_id")
            items.append(
                {
                    "id": str(row.get("id")),
                    "project_id": str(row.get("project_id")),
                    "parent_id": str(parent_id_val) if parent_id_val else None,
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
