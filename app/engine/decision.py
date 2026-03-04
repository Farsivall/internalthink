"""
Decision evaluation — each specialist scores a decision; we synthesize agreement and tradeoffs.
Uses OpenAI (OPEN_API_KEY). Returns structured scores, agreement, tradeoffs.
"""

import re
from app.personas import get_system_prompt, SPECIALISTS
from app.personas.definitions import filter_context_for_specialist
from app.services.context import get_context_for_project


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


def evaluate_specialist(
    specialist_id: str,
    decision_title: str,
    decision_description: str,
    context_str: str,
) -> tuple[int, str, list[str]]:
    """Get one specialist's score, summary, and objections for a decision."""
    system = get_system_prompt(specialist_id)
    system += """

**Task:** Evaluate the following decision from your specialist perspective. Reply with exactly this structure (use these labels):

Score (1-10): [single number, 1=strong no, 10=strong yes]
Summary: [1-3 sentences: your view and main point]
Objections: [1-4 short bullet points of risks or concerns, or "None" if you have none]
"""

    if context_str and context_str != "(No context available for this specialist.)":
        system += f"\n**Project context:**\n{context_str}\n"

    user = f"**Decision:** {decision_title}\n\n**Description:** {decision_description}"

    key = _get_openai_key()
    if not key:
        return (5, "Analysis unavailable — OPEN_API_KEY not configured.", [])

    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=400,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        text = (r.choices[0].message.content or "").strip()
        return _parse_specialist_reply(text)
    except Exception as e:
        return (5, f"Evaluation failed: {str(e)[:150]}", [])


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
