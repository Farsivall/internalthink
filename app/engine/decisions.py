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
from app.services.persona import SPECIALIST_ID_TO_PERSONA_NAME
from app.services.rag import retrieve_chunks_for_evaluation, format_chunks_for_citation
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
    project_id: str | None = None,
    dimensions_by_persona: dict[str, list[dict]] | None = None,
) -> list[SpecialistResponse]:
    """
    Call specialists in parallel. Defaults to all 5.
    When project_id (and optionally dimensions_by_persona) are provided, RAG retrieval
    (company + domain) is used to inject relevant chunks into each specialist's context.
    Failed specialists return fallback responses, never crash.
    """
    ids = specialist_ids or list(SPECIALISTS.keys())
    loop = asyncio.get_running_loop()
    dimensions_by_persona = dimensions_by_persona or {}

    def _context_for(sid: str) -> str:
        context_str = filter_context_for_specialist(sid, sources)
        if project_id and question.strip():
            persona_name = SPECIALIST_ID_TO_PERSONA_NAME.get(sid, getattr(SPECIALISTS.get(sid), "name", sid))
            dims = dimensions_by_persona.get(persona_name) or []
            dimension_names = [(d.get("dimension_name") or "").strip() for d in dims if (d.get("dimension_name") or "").strip()]
            try:
                chunks = retrieve_chunks_for_evaluation(
                    project_id=project_id,
                    query=question[:800],
                    persona_name=persona_name,
                    dimension_names=dimension_names,
                    top_k_company=6,
                    top_k_domain=4,
                )
                if chunks:
                    context_str += "\n\n**Retrieved evidence (use to ground your answer; cite by source when relevant):**\n"
                    context_str += format_chunks_for_citation(chunks)
            except Exception as e:
                logger.warning("RAG retrieval failed for chat specialist %s: %s", sid, e)
        return context_str

    tasks = [
        loop.run_in_executor(executor, _evaluate_sync, sid, question, _context_for(sid))
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


async def evaluate_all_specialists_for_decision_call(
    question: str,
    decision_row: dict,
    sources: list[dict],
    specialist_ids: list[str] | None = None,
    dimensions_by_persona: dict[str, list[dict]] | None = None,
) -> list[SpecialistResponse]:
    """
    Call specialists in parallel for a *decision-focused call*.

    Context is built from the stored decision data plus main project documents,
    and optionally RAG-retrieved chunks when dimensions_by_persona is provided.
    """
    ids = specialist_ids or list(SPECIALISTS.keys())
    loop = asyncio.get_running_loop()
    dimensions_by_persona = dimensions_by_persona or {}

    # Pre-index specialist responses from the stored decision for quick lookup.
    specialist_responses = decision_row.get("specialist_responses") or []
    by_specialist: dict[str, dict] = {}
    if isinstance(specialist_responses, list):
        for item in specialist_responses:
            sid = item.get("specialist_id")
            if sid:
                by_specialist[sid] = item

    decision_id = str(decision_row.get("id"))
    project_label = str(decision_row.get("project_id") or "")
    summary = decision_row.get("question", "")

    async def _eval_one(sid: str) -> SpecialistResponse:
        spec_meta = SPECIALISTS.get(sid)
        spec_name = spec_meta.name if spec_meta else sid

        # Pull precomputed outputs if available
        item = by_specialist.get(sid, {})
        score_0_100 = item.get("score_0_100")
        if isinstance(score_0_100, (int, float)):
            score_str = f"{int(score_0_100)}"
        else:
            score_str = ""
        objections = item.get("objections") or []
        if isinstance(objections, list):
            risks_list = ", ".join(str(o) for o in objections) if objections else "None explicitly listed."
        else:
            risks_list = "None explicitly listed."

        # Pull main project docs/evidence for this specialist
        docs_for_spec = filter_context_for_specialist(sid, sources)
        if not docs_for_spec or docs_for_spec == "(No context available for this specialist.)":
            retrieved_docs = "(No additional documents or evidence were retrieved.)"
        else:
            retrieved_docs = docs_for_spec

        # RAG: inject company + domain chunks when project and question are available
        rag_block = ""
        if project_label and question.strip():
            persona_name = SPECIALIST_ID_TO_PERSONA_NAME.get(sid, spec_name)
            dims = dimensions_by_persona.get(persona_name) or []
            dimension_names = [(d.get("dimension_name") or "").strip() for d in dims if (d.get("dimension_name") or "").strip()]
            try:
                chunks = retrieve_chunks_for_evaluation(
                    project_id=project_label,
                    query=question[:800],
                    persona_name=persona_name,
                    dimension_names=dimension_names,
                    top_k_company=6,
                    top_k_domain=4,
                )
                if chunks:
                    rag_block = "\n\n**Retrieved evidence (use to ground your answer; cite by source when relevant):**\n"
                    rag_block += format_chunks_for_citation(chunks)
            except Exception as e:
                logger.warning("RAG retrieval failed for decision-call specialist %s: %s", sid, e)

        # Build decision-focused context inline, mirroring prompt_files/chat.md
        context_str = f"""
You are an expert persona: {spec_name}.

You are only reasoning about the specific decision provided. Your task is to simulate a real-time "call" where a user asks you questions about that decision.

### Decision Context:
- Decision ID: {decision_id}
- Project: {project_label}
- Summary: {summary}
- Precomputed Persona Outputs:
  - Score: {score_str} (0-100)
  - Key Risks: {risks_list}
  - Key Objections: {risks_list}
  - Evidence Gaps: (not explicitly recorded; infer from missing data in the documents if relevant)
- Relevant Documents / Evidence:
{retrieved_docs}
{rag_block}

### Rules for Your Call Behavior:
1. Only use the context above. Do NOT invent facts outside of the decision or documents.
2. Respond in short, streaming-friendly sentences so the user perceives a real-time call.
3. If the user asks about missing evidence, clearly list what is missing.
4. Highlight trade-offs where multiple risks or objections conflict.
5. Keep all reasoning within your domain.
6. Do NOT recalculate scores — explain reasoning from the existing score.
7. Make the conversation natural and explanatory, like an expert speaking to a colleague.

### Output Style:
- Friendly but authoritative.
- Streamed in short sentences.
- Reference documents minimally, e.g., "Based on contract section X…" if needed.
- End each answer ready for the next user prompt.
""".strip()

        text, thinking = call_specialist(sid, question, context_str)
        return SpecialistResponse(
            specialist_id=sid,
            text=text,
            thinking_process=thinking,
        )

    # Run in parallel similar to evaluate_all_specialists
    tasks = [loop.run_in_executor(executor, asyncio.run, _eval_one(sid)) for sid in ids]  # type: ignore[arg-type]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    responses: list[SpecialistResponse] = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            sid = ids[i]
            logger.warning("Decision-call specialist %s failed: %s", sid, r)
            responses.append(
                SpecialistResponse(
                    specialist_id=sid,
                    text=f"Analysis unavailable: {str(r)[:80]}",
                    thinking_process=str(r),
                )
            )
        else:
            responses.append(r)  # type: ignore[arg-type]

    return responses
