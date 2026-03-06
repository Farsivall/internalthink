"""
Decision evaluation — each specialist scores a decision; we synthesize agreement and tradeoffs.
Uses the persona scoring matrix (dimensions, weights, notes) from Supabase when available.
Uses OpenAI (OPEN_API_KEY). Returns structured scores, agreement, tradeoffs.
"""

import json
import re
from app.personas import get_system_prompt, SPECIALISTS
from app.personas.definitions import filter_context_for_specialist
from app.services.context import get_context_for_project

# Weight >= this is treated as "critical" for caps (personas.md: critical dimension < 20 → cap at 40).
CRITICAL_WEIGHT_THRESHOLD = 0.25


def _get_openai_key() -> str | None:
    for env_key in ("OPENAI_API_KEY", "OPEN_API_KEY"):
        key = __import__("os").environ.get(env_key)
        if key:
            return key
    try:
        from app.core.config import settings
        if getattr(settings, "openai_api_key", None):
            return settings.openai_api_key
        if getattr(settings, "open_api_key", None):
            return settings.open_api_key
    except Exception:
        pass
    return None


def _parse_specialist_reply(text: str) -> tuple[int, str, list[str]]:
    """Extract score (1-10), summary, and objections from specialist reply. Returns (score, summary, objections)."""
    score = 5
    summary = ""
    objections: list[str] = []

    # Score: "Score (1-10): 7" or "Score: 7"
    score_m = re.search(r"Score\s*\(?1-10\)?\s*:?\s*(\d+)", text, re.I)
    if score_m:
        score = max(1, min(10, int(score_m.group(1))))

    # Summary: line starting with Summary:
    summary_m = re.search(r"Summary\s*:?\s*(.+?)(?=Objections|$)", text, re.I | re.S)
    if summary_m:
        summary = summary_m.group(1).strip()[:500]
    if not summary:
        summary = text.strip()[:300]

    # Objections: "Objections:" followed by list items or lines
    obj_m = re.search(r"Objections?\s*:?\s*(.+?)$", text, re.I | re.S)
    if obj_m:
        block = obj_m.group(1).strip()
        for line in re.split(r"[\n•\-*]\s*", block):
            line = line.strip()
            if re.match(r"^\d+[.)]\s*", line):
                line = re.sub(r"^\d+[.)]\s*", "", line)
            if len(line) > 10:
                objections.append(line[:200])
        objections = objections[:5]

    return (score, summary, objections)


def _build_matrix_prompt(dimensions: list[dict]) -> str:
    """Build the scoring matrix block for the system prompt (dimensions with weights and notes)."""
    lines = [
        "Evaluate this decision using the following dimensions. For each dimension assign a score 0–100 and note key risks, trade-offs, and evidence gaps.",
        "",
    ]
    for d in dimensions:
        name = d.get("dimension_name") or ""
        weight = d.get("base_weight", 0)
        notes = (d.get("notes") or "").strip()
        lines.append(f"- **{name}** (weight {weight:.2f}): {notes}")
    return "\n".join(lines)


def _parse_matrix_response(text: str, dimensions: list[dict]) -> tuple[int, str, list[str], dict | None]:
    """
    Parse JSON response with Dimensions, Summary, Objections, WhatWouldChangeMyMind, HighStructuralRisk.
    Compute total_score (0–100), apply caps, return (score_1_10, summary, objections, persona_detail).
    """
    persona_detail: dict = {
        "total_score": 50,
        "dimensions": [],
        "what_would_change_my_mind": [],
        "high_structural_risk": False,
    }
    summary = ""
    objections: list[str] = []
    dim_by_name = {d.get("dimension_name"): d for d in dimensions}

    try:
        # Extract JSON from the response (allow markdown code block)
        raw = text.strip()
        if "```" in raw:
            m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
            if m:
                raw = m.group(1).strip()
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return (5, text.strip()[:300] or "No parseable response.", [], None)

    # Dimension scores
    dim_list = data.get("Dimensions") or data.get("dimensions") or []
    weighted_sum = 0.0
    total_weight = 0.0
    critical_below_20 = False
    critical_below_10 = False

    for item in dim_list:
        name = (item.get("Name") or item.get("name") or "").strip()
        if not name and dim_list.index(item) < len(dimensions):
            name = (dimensions[dim_list.index(item)].get("dimension_name") or "").strip()
        info = dim_by_name.get(name) if name else None
        weight = float(info.get("base_weight", 0)) if info else 0.2
        score = max(0, min(100, int(item.get("Score", item.get("score", 50)))))
        weighted_sum += weight * score
        total_weight += weight
        if weight >= CRITICAL_WEIGHT_THRESHOLD:
            if score < 10:
                critical_below_10 = True
            if score < 20:
                critical_below_20 = True
        persona_detail["dimensions"].append({
            "Name": name or "Unknown",
            "Score": score,
            "KeyRisks": item.get("KeyRisks", item.get("key_risks", [])) or [],
            "TradeOffs": item.get("TradeOffs", item.get("trade_offs", [])) or [],
            "EvidenceGaps": item.get("EvidenceGaps", item.get("evidence_gaps", [])) or [],
        })

    if total_weight > 0:
        total_score = round(weighted_sum / total_weight)
    else:
        total_score = 50
    if critical_below_20:
        total_score = min(total_score, 40)
    persona_detail["total_score"] = max(0, min(100, total_score))
    persona_detail["high_structural_risk"] = critical_below_10

    summary = (data.get("Summary") or data.get("summary") or "").strip() or "No summary."
    objections = data.get("Objections") or data.get("objections") or []
    if isinstance(objections, str):
        objections = [objections] if objections else []
    persona_detail["what_would_change_my_mind"] = (
        data.get("WhatWouldChangeMyMind") or data.get("what_would_change_my_mind") or []
    )
    if isinstance(persona_detail["what_would_change_my_mind"], str):
        persona_detail["what_would_change_my_mind"] = [persona_detail["what_would_change_my_mind"]]

    score_1_10 = max(1, min(10, round(persona_detail["total_score"] / 10)))
    return (score_1_10, summary[:500], objections[:10], persona_detail)


PROPOSAL_CONTEXT_INSTRUCTIONS = """
**Attached proposal/document(s):** The context below is from document(s) attached specifically for this decision (e.g. a proposal, pitch deck, or brief). You must:
1. Use the **full** proposal as primary context for your evaluation.
2. **Reference specific parts** when giving feedback: cite sections, slides, page numbers, or direct quotes (e.g. "In the section on pricing...", "Slide 4 states...", "The proposal's assumption that...").
3. Give **insightful, proposal-grounded feedback**: tie your risks, trade-offs, and evidence gaps to what the proposal actually says or omits. Avoid generic advice—call out concrete strengths and gaps.
"""


def evaluate_specialist(
    specialist_id: str,
    decision_title: str,
    decision_description: str,
    context_str: str,
    dimensions: list[dict] | None = None,
    *,
    has_attached_documents: bool = False,
) -> tuple[int, str, list[str], dict | None]:
    """
    Get one specialist's score, summary, objections, and optional persona_detail for a decision.
    If dimensions (from persona_dimensions) are provided, uses the scoring matrix and returns persona_detail.
    If has_attached_documents is True, instructs the model to use the full proposal as context and reference specific parts.
    """
    system = get_system_prompt(specialist_id)

    if has_attached_documents and context_str and context_str != "(No context available for this specialist.)":
        system += "\n\n" + PROPOSAL_CONTEXT_INSTRUCTIONS

    if dimensions:
        system += "\n\n**Scoring matrix (use these dimensions and weights):**\n"
        system += _build_matrix_prompt(dimensions)
        system += """

**Task:** Evaluate the decision using the dimensions above. Reply with a single JSON object (no other text) in this exact shape:
{
  "Dimensions": [
    { "Name": "<dimension name>", "Score": <0-100>, "KeyRisks": [], "TradeOffs": [], "EvidenceGaps": [] }
  ],
  "Summary": "<1-3 sentences>",
  "Objections": ["<risk or concern>", ...],
  "WhatWouldChangeMyMind": ["<evidence or change that would shift your score>", ...],
  "HighStructuralRisk": false
}
Rules: Assign 0-100 per dimension. If any critical (high-weight) dimension scores < 20, we will cap your total; if < 10 we flag high structural risk. Be concise. When proposal/document context is provided, reference specific parts of it in your dimension notes (KeyRisks, TradeOffs, EvidenceGaps).
"""
    else:
        system += """

**Task:** Evaluate the following decision from your specialist perspective. Reply with exactly this structure (use these labels):

Score (1-10): [single number, 1=strong no, 10=strong yes]
Summary: [1-3 sentences: your view and main point]
Objections: [1-4 short bullet points of risks or concerns, or "None" if you have none]
"""
        if has_attached_documents:
            system += "\nWhen proposal/document context is provided, reference specific sections or quotes in your summary and objections (e.g. 'The proposal states...', 'Slide 3 assumes...').\n"

    if context_str and context_str != "(No context available for this specialist.)":
        label = "**Attached proposal/document(s) (use in full; reference specific parts in your feedback):**" if has_attached_documents else "**Project context:**"
        system += f"\n{label}\n{context_str}\n"

    user = f"**Decision:** {decision_title}\n\n**Description:** {decision_description}"

    key = _get_openai_key()
    if not key:
        return (5, "Analysis unavailable — OPEN_API_KEY not configured.", [], None)

    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=800 if dimensions else 400,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        text = (r.choices[0].message.content or "").strip()
        if dimensions:
            score_1_10, summary, objections, persona_detail = _parse_matrix_response(text, dimensions)
            return (score_1_10, summary, objections, persona_detail)
        score, summary, objections = _parse_specialist_reply(text)
        return (score, summary, objections, None)
    except Exception as e:
        return (5, f"Evaluation failed: {str(e)[:150]}", [], None)


def synthesize_agreement_and_tradeoffs(
    decision_title: str,
    specialist_outputs: list[tuple[str, str, int, str, list[str]]],  # (id, name, score, summary, objections)
) -> tuple[str, str]:
    """Return (agreement, tradeoffs) from all specialist outputs."""
    if not specialist_outputs:
        return ("No specialist views to synthesize.", "—")

    lines = []
    for _sid, name, score, summary, objections in specialist_outputs:
        lines.append(f"{name} (score {score}/10): {summary}")
        if objections:
            lines.append("  Objections: " + "; ".join(objections[:3]))

    key = _get_openai_key()
    if not key:
        return ("Unable to synthesize.", "—")

    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=450,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You summarize how a panel of specialists (Legal, Financial, Technical, Business Development, Tax) "
                        "view a single decision.\n\n"
                        "Output MUST be exactly two labeled sections, each as a short bulleted list:\n\n"
                        "Agreement:\n"
                        "- [Overall one-line summary of the decision and what most specialists agree on.]\n"
                        "- [Additional bullets for any specific shared views, referencing specialists by name where useful.]\n\n"
                        "Tradeoffs:\n"
                        "- [Each bullet should describe ONE key tradeoff or disagreement, and explicitly name which specialists are involved, "
                        "e.g. 'Legal (50) vs BD (80): ...']\n"
                        "- Focus on tensions between departments, not generic pros/cons.\n"
                        "Do not add any other sections or prose outside these bullets."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Decision: {decision_title}\n\nSpecialist views:\n" + "\n".join(lines),
                },
            ],
        )
        text = (r.choices[0].message.content or "").strip()
        agreement = "No strong agreement."
        tradeoffs = "—"
        current_section = None
        collected: dict[str, list[str]] = {"agreement": [], "tradeoffs": []}
        for raw_line in text.splitlines():
            line = raw_line.strip()
            lower = line.lower()
            if lower.startswith("agreement"):
                current_section = "agreement"
                continue
            if lower.startswith("tradeoff"):
                current_section = "tradeoffs"
                continue
            if current_section and line.startswith("-"):
                bullet = line.lstrip("-").strip()
                if bullet:
                    collected[current_section].append(bullet)
        if collected["agreement"]:
            agreement = "\n".join(collected["agreement"])[:600]
        if collected["tradeoffs"]:
            tradeoffs = "\n".join(collected["tradeoffs"])[:800]
        return (agreement, tradeoffs)
    except Exception as e:
        return ("Synthesis failed.", str(e)[:150])
