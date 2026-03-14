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


import logging as _logging

_log = _logging.getLogger(__name__)


def _extract_json_object(text: str) -> dict | None:
    """Try to parse text as JSON; if that fails, find first { ... } and parse that.
    Also attempts to recover truncated JSON by closing open brackets/braces."""
    raw = text.strip()
    if "```" in raw:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        if m:
            raw = m.group(1).strip()
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        pass
    start = raw.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(raw)):
        if raw[i] == "{":
            depth += 1
        elif raw[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(raw[start : i + 1])
                except (json.JSONDecodeError, TypeError):
                    return None

    # JSON was likely truncated (depth > 0). Try to recover by stripping the
    # last incomplete value and closing all open brackets/braces.
    fragment = raw[start:]
    fragment = re.sub(r',\s*$', '', fragment)           # trailing comma
    fragment = re.sub(r':\s*"[^"]*$', ': ""', fragment) # truncated string value
    fragment = re.sub(r':\s*$', ': null', fragment)      # trailing colon with no value
    open_sq = fragment.count("[") - fragment.count("]")
    open_br = fragment.count("{") - fragment.count("}")
    fragment += "]" * max(open_sq, 0) + "}" * max(open_br, 0)
    try:
        obj = json.loads(fragment)
        _log.warning("Recovered truncated JSON for specialist response (closed %d brackets, %d braces)", max(open_sq, 0), max(open_br, 0))
        return obj
    except (json.JSONDecodeError, TypeError):
        _log.warning("JSON extraction failed even after truncation recovery. First 300 chars: %s", raw[:300])
        return None


def _looks_like_json_summary(s: str) -> bool:
    """True only if the string is clearly JSON (e.g. model put Dimensions blob in Summary)."""
    t = (s or "").strip()
    if not t:
        return False
    if t.startswith("{") and ('"Dimensions"' in t or '"Name":' in t):
        return True
    if re.search(r'\s*\{\s*"Dimensions"', t) or re.search(r'"Name":\s*"[^"]+",\s*"Score"', t):
        return True
    return False


def _summary_from_dimensions(dimensions: list[dict], total_score: int) -> str:
    """Build a short prose summary from dimension scores when Summary field was JSON."""
    if not dimensions:
        return f"Evaluation completed. Total score: {total_score}/100."
    parts = [f"Total score: {total_score}/100."]
    for d in dimensions[:5]:
        name = (d.get("Name") or d.get("name") or "").strip()
        score = d.get("Score") or d.get("score")
        if name and score is not None:
            parts.append(f"{name} {int(score)}")
    if len(parts) > 1:
        return " ".join(parts[:1]) + " By dimension: " + ", ".join(parts[1:]) + "."
    return parts[0]


def _sanitize_summary(s: str, total_score: int = 50, dimensions: list[dict] | None = None) -> str:
    """If summary looks like JSON, return a prose fallback (from dimensions if available)."""
    t = (s or "").strip()
    if not t:
        return _summary_from_dimensions(dimensions or [], total_score)
    if _looks_like_json_summary(t):
        return _summary_from_dimensions(dimensions or [], total_score)
    return t[:500]


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

    data = _extract_json_object(text)
    if not data or not isinstance(data, dict):
        _log.error("Specialist response not valid JSON. Length=%d, first 500 chars: %s", len(text), text[:500])
        return (5, "Evaluation could not be parsed. Please try again.", [], None)

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
    summary = _sanitize_summary(
            summary, persona_detail["total_score"], persona_detail.get("dimensions")
        )
    objections = data.get("Objections") or data.get("objections") or []
    if isinstance(objections, str):
        objections = [objections] if objections else []
    persona_detail["what_would_change_my_mind"] = (
        data.get("WhatWouldChangeMyMind") or data.get("what_would_change_my_mind") or []
    )
    if isinstance(persona_detail["what_would_change_my_mind"], str):
        persona_detail["what_would_change_my_mind"] = [persona_detail["what_would_change_my_mind"]]

    raw_citations = data.get("Citations") or data.get("citations") or []
    if isinstance(raw_citations, list):
        persona_detail["citations"] = [
            {
                "claim_or_section": (c.get("claim_or_section") or c.get("claim") or ""),
                "source_label": (c.get("source_label") or c.get("source") or ""),
                "snippet_or_quote": (c.get("snippet_or_quote") or c.get("snippet") or ""),
            }
            for c in raw_citations[:20]
            if isinstance(c, dict)
        ]
    else:
        persona_detail["citations"] = []

    score_1_10 = max(1, min(10, round(persona_detail["total_score"] / 10)))
    return (score_1_10, summary[:500], objections[:10], persona_detail)


PROPOSAL_CONTEXT_INSTRUCTIONS = """
**Attached proposal/document(s):** The context below is from document(s) attached specifically for this decision (e.g. a proposal, pitch deck, or brief). You must:
1. Use the **full** proposal as primary context for your evaluation.
2. **Reference specific parts** when giving feedback: cite sections, slides, page numbers, or direct quotes (e.g. "In the section on pricing...", "Slide 4 states...", "The proposal's assumption that...").
3. Give **insightful, proposal-grounded feedback**: tie your risks, trade-offs, and evidence gaps to what the proposal actually says or omits. Avoid generic advice—call out concrete strengths and gaps.
"""

RAG_CITATION_INSTRUCTIONS = """
**Retrieved evidence:** The following passages were retrieved from company and domain knowledge. You **must** cite them by their exact label when making claims.
- Use the label as given (e.g. "[Company | Doc Title | chunk 2]" or "[Domain | Title]") in your Summary, Objections, and in dimension-level KeyRisks/TradeOffs/EvidenceGaps where relevant.
- Generic or unsourced claims are not acceptable when this evidence is provided—tie each key point to a specific source label.
"""

# When context or RAG evidence is provided, require specialists to reference concrete numbers or quotes in their evaluation.
SPECIALIST_GROUNDING_RULES: dict[str, str] = {
    "financial": "In your evaluation you **must** reference specific numbers from the evidence when available: amounts ($), percentages, timelines, runway, IRR, revenue or cost assumptions. Do not give vague financial feedback—cite concrete figures from the documents.",
    "hydroelectric_finance": "In your evaluation you **must** reference specific numbers from the evidence when available: capex, tariff, revenue, payback, hydrology assumptions, or cost figures. Do not give vague financial feedback—cite concrete numbers from the documents.",
    "technical": "In your evaluation you **must** quote or reference specific technical details from the evidence: file names, components, metrics, stack, or direct quotes. Do not give vague technical feedback—cite concrete details from the documents.",
    "hydroelectric": "In your evaluation you **must** reference specific project details from the evidence: capacity, head, flow, scope, timelines, or direct quotes from studies/documents. Do not give vague feedback—cite concrete technical or project details.",
    "legal": "In your evaluation reference specific clauses, risks, or terms from the documents when available (e.g. contract terms, permit conditions).",
    "hydroelectric_regulatory": "In your evaluation reference specific regulatory or compliance details from the documents when available (e.g. permit types, water rights, compliance obligations).",
    "bd": "In your evaluation reference specific market, partner, or distribution details from the documents when available (e.g. numbers, timelines, counterparties).",
    "tax": "In your evaluation reference specific tax-related numbers or regimes from the documents when available (e.g. amounts, jurisdictions, rules).",
}


def evaluate_specialist(
    specialist_id: str,
    decision_title: str,
    decision_description: str,
    context_str: str,
    dimensions: list[dict] | None = None,
    *,
    has_attached_documents: bool = False,
    rag_citation_context: str = "",
) -> tuple[int, str, list[str], dict | None, list[dict] | None]:
    """
    Get one specialist's score, summary, objections, optional persona_detail, and optional citations.
    If dimensions (from persona_dimensions) are provided, uses the scoring matrix and returns persona_detail.
    If has_attached_documents is True, instructs the model to use the full proposal as context and reference specific parts.
    When rag_citation_context is provided, the model must cite retrieved evidence by source label.
    """
    system = get_system_prompt(specialist_id)

    if has_attached_documents and context_str and context_str != "(No context available for this specialist.)":
        system += "\n\n" + PROPOSAL_CONTEXT_INSTRUCTIONS

    if rag_citation_context and rag_citation_context.strip():
        system += "\n\n" + RAG_CITATION_INSTRUCTIONS
        system += "\n\n**Retrieved evidence (cite by source and chunk in your evaluation):**\n" + rag_citation_context.strip() + "\n"

    has_evidence = (
        (context_str and context_str != "(No context available for this specialist.)")
        or (rag_citation_context and rag_citation_context.strip())
    )
    if has_evidence and specialist_id in SPECIALIST_GROUNDING_RULES:
        system += "\n\n**Evaluation grounding:** " + SPECIALIST_GROUNDING_RULES[specialist_id] + "\n"

    if dimensions:
        system += "\n\n**Scoring matrix (use these dimensions and weights):**\n"
        system += _build_matrix_prompt(dimensions)
        cite_note = " When retrieved evidence is provided above, reference its source labels (e.g. [Company | Doc Title | chunk 2]) in Summary, Objections, and in dimension KeyRisks/TradeOffs/EvidenceGaps." if rag_citation_context and rag_citation_context.strip() else ""
        system += """

**Task:** Evaluate the decision using the dimensions above. Reply with a single JSON object (no other text) in this exact shape:
{
  "Dimensions": [
    { "Name": "<dimension name>", "Score": <0-100>, "KeyRisks": [], "TradeOffs": [], "EvidenceGaps": [] }
  ],
  "Summary": "<1-3 sentences>",
  "Objections": ["<risk or concern>", ...],
  "WhatWouldChangeMyMind": ["<evidence or change that would shift your score>", ...],
  "HighStructuralRisk": false,
  "Citations": [
    { "claim_or_section": "Summary|Objection 1|Dimension <name>", "source_label": "[Company | Doc Title | chunk 2]", "snippet_or_quote": "<optional short quote>" }
  ]
}
Rules: Assign 0-100 per dimension. If any critical (high-weight) dimension scores < 20, we will cap your total; if < 10 we flag high structural risk. Be concise.""" + cite_note + """ When retrieved evidence is provided, include Citations listing where you used each source (claim_or_section, source_label, optional snippet). Omit Citations array if no evidence was provided.
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
        if rag_citation_context and rag_citation_context.strip():
            system += "\nWhen retrieved evidence is provided above, cite its source labels (e.g. [Company | Doc Title | chunk 2]) in your Summary and Objections.\n"

    if context_str and context_str != "(No context available for this specialist.)":
        label = "**Attached proposal/document(s) (use in full; reference specific parts in your feedback):**" if has_attached_documents else "**Project context:**"
        system += f"\n{label}\n{context_str}\n"

    user = f"**Decision:** {decision_title}\n\n**Description:** {decision_description}"

    key = _get_openai_key()
    if not key:
        return (5, "Analysis unavailable — OPEN_API_KEY not configured.", [], None, None)

    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=1200 if dimensions else 500,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        text = (r.choices[0].message.content or "").strip()
        if dimensions:
            score_1_10, summary, objections, persona_detail = _parse_matrix_response(text, dimensions)
            citations = (persona_detail or {}).get("citations") if persona_detail else None
            return (score_1_10, summary, objections, persona_detail, citations)
        score, summary, objections = _parse_specialist_reply(text)
        return (score, summary, objections, None, None)
    except Exception as e:
        return (5, f"Evaluation failed: {str(e)[:150]}", [], None, None)


def synthesize_agreement_and_tradeoffs(
    decision_title: str,
    specialist_outputs: list[tuple[str, str, int, str, list[str], int | None]],
) -> tuple[str, str, list[dict]]:
    """Return (agreement, tradeoffs, core_tensions) using gpt-4o for high-signal synthesis.

    core_tensions is a list of {"title": str, "explanation": str} dicts.
    """
    if not specialist_outputs:
        return ("No specialist views to synthesize.", "—", [])

    lines = []
    for t in specialist_outputs:
        sid, name, score_1_10, summary, objections = t[0], t[1], t[2], t[3], t[4]
        score_100 = t[5] if len(t) > 5 and t[5] is not None else (score_1_10 * 10)
        lines.append(f"{name}: {score_100}/100 — {summary}")
        if objections:
            lines.append("  Objections: " + "; ".join(objections[:5]))

    key = _get_openai_key()
    if not key:
        return ("Unable to synthesize.", "—", [])

    system_prompt = (
        "You are an executive-level decision strategist. You synthesize specialist panel views into a "
        "premium strategic brief for founders and CEOs.\n\n"
        "Given the specialist views below (each with a 0-100 score), produce a JSON object with exactly three keys:\n\n"
        '{\n'
        '  "agreement": "...",\n'
        '  "tradeoffs": "...",\n'
        '  "core_tensions": [ { "title": "...", "explanation": "..." }, ... ]\n'
        '}\n\n'
        "**agreement** — What the panel agrees on (key strengths & shared concerns).\n"
        "Write 3-6 substantive bullets (each a full sentence). Reference specific specialists by short name "
        "(Legal, Financial, Technical, BD, Tax, HP, HPF, HR) and their scores where it adds clarity. "
        "Highlight consensus risks as well as consensus strengths. Do not be generic — each bullet must be grounded "
        "in what the specialists actually said.\n\n"
        "**tradeoffs** — Where specialists disagree and why it matters.\n"
        "Write 2-5 bullets. Each bullet must name the disagreeing specialists with their exact 0-100 scores "
        "(e.g. 'Legal (44) vs HPF (64)') and explain *why* they see it differently in 1-2 sentences. "
        "Focus on the most decision-relevant tensions. Do not invent scores.\n\n"
        "**core_tensions** — The 3-5 most important strategic tensions driving this decision.\n"
        "Each must have:\n"
        '- "title": a short tension label (e.g. "Regulatory risk vs project feasibility")\n'
        '- "explanation": a 2-3 sentence description explaining the tension, what drives it, '
        "and why it matters for the decision. Reference specialist findings or evidence where relevant.\n\n"
        "Be specific, analytical, and decision-oriented. Avoid generic business jargon. "
        "Every claim should be traceable to specialist input.\n"
        "Output only the JSON object — no markdown, no code fences, no other text."
    )

    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)
        r = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=1200,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Decision: {decision_title}\n\nSpecialist views (scores are 0-100):\n" + "\n".join(lines),
                },
            ],
        )
        text = (r.choices[0].message.content or "").strip()

        data = _extract_json_object(text)
        if data and isinstance(data, dict):
            raw_agree = data.get("agreement") or ""
            raw_trade = data.get("tradeoffs") or ""
            if isinstance(raw_agree, list):
                agreement = "\n".join(str(b) for b in raw_agree if b).strip()
            else:
                agreement = str(raw_agree).strip()
            if isinstance(raw_trade, list):
                tradeoffs = "\n".join(str(b) for b in raw_trade if b).strip()
            else:
                tradeoffs = str(raw_trade).strip()
            agreement = agreement or "No strong agreement."
            tradeoffs = tradeoffs or "—"
            raw_tensions = data.get("core_tensions") or []
            core_tensions = []
            for item in raw_tensions:
                if isinstance(item, dict) and item.get("title"):
                    core_tensions.append({
                        "title": str(item["title"]),
                        "explanation": str(item.get("explanation") or ""),
                    })
                elif isinstance(item, str):
                    core_tensions.append({"title": item, "explanation": ""})
            return (agreement[:1200], tradeoffs[:1200], core_tensions[:6])

        # Fallback: parse as plain text sections
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
            agreement = "\n".join(collected["agreement"])[:1200]
        if collected["tradeoffs"]:
            tradeoffs = "\n".join(collected["tradeoffs"])[:1200]
        return (agreement, tradeoffs, [])
    except Exception as e:
        _log.warning("Agreement/tradeoffs/tensions synthesis failed: %s", e)
        return ("Synthesis failed.", str(e)[:150], [])


DECISION_SYNTHESIS_SYSTEM = """You are an executive decision synthesizer. Given specialist (persona) scores and consensus/tradeoffs for a decision, you produce a structured decision output following the decision_tree.md format.

You must output a single JSON object (no other text) with exactly these keys:
- decision_summary: string — concise synthesis of the actual decision; clarify the strategic choice; reframe if ambiguous.
- paths: array of exactly 3 objects. Each has: id (e.g. "path_a"), title, description, assumptions (array), upside (array), downside (array), execution_difficulty (string), favored_by (array of {persona, reason}), concerned_by (array of {persona, reason}), next_steps_outline (array).
- path_ranking: array of 3 objects. Each has: path_id, rank (0=recommended, 1=second, 2=third), rationale (string), confidence_level (string), key_condition (string, what could change the ranking).
- recommended_path: object with path_id, title, why_best (string), risks_remain (string), outperforms_alternatives (string).
- recommended_path_next_steps: array of objects. Each has: title, reason, owner_type, expected_outcome, timeline_estimate (optional), specialist_support.
- decision_tree: object with root (object), nodes (array), edges (array) — optional; can be minimal.

Do NOT include core_tensions — that is handled separately.
Paths should be realistic (e.g. Move now / Pilot / Delay). Map specialists to paths using favored_by and concerned_by. Be specific, not generic."""


def synthesize_decision_tree(
    decision_title: str,
    decision_description: str,
    agreement: str,
    tradeoffs: str,
    persona_outputs: list[tuple[str, int, str, list[str]]],  # (persona_name, total_score, summary, what_would_change_my_mind)
) -> dict:
    """
    After specialists score and we have agreement/tradeoffs, produce decision_tree.md structure:
    decision_summary, core_tensions, paths (3), path_ranking, recommended_path, recommended_path_next_steps, decision_tree.
    """
    key = _get_openai_key()
    if not key:
        return {}

    lines = [f"{name} (score {score}/100): {summary}" for name, score, summary, _ in persona_outputs]
    for name, _, _, wwcm in persona_outputs:
        if wwcm:
            lines.append(f"  {name} — would change mind: {', '.join(wwcm[:2])}")

    user = f"""Decision: {decision_title}
Description: {decision_description}

Agreement:
{agreement}

Tradeoffs:
{tradeoffs}

Specialist views (scores 0–100, from decision_persona_scores):
""" + "\n".join(lines) + """

Output the single JSON object only (no markdown, no code fence)."""

    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=2200,
            messages=[
                {"role": "system", "content": DECISION_SYNTHESIS_SYSTEM},
                {"role": "user", "content": user},
            ],
        )
        text = (r.choices[0].message.content or "").strip()
        if "```" in text:
            import re
            m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
            if m:
                text = m.group(1).strip()
        return json.loads(text)
    except Exception as e:
        __import__("logging").getLogger(__name__).warning("Decision synthesis failed: %s", e)
        return {}
