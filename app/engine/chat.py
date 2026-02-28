"""
Chat engine — calls Anthropic Claude with specialist prompts.
Context from project documents and codebase summaries is included in the system prompt.
"""

import os
import re
from app.personas import get_system_prompt


def _get_anthropic_key() -> str | None:
    """Get Anthropic API key from env or .env."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key
    try:
        from app.core.config import settings
        if settings.anthropic_api_key:
            return settings.anthropic_api_key
    except Exception:
        pass
    for p in [os.path.join(os.path.dirname(__file__), "..", "..", ".env"), ".env"]:
        path = os.path.abspath(p)
        if os.path.exists(path):
            with open(path) as f:
                for line in f:
                    if line.startswith("ANTHROPIC_API_KEY="):
                        return line.split("=", 1)[1].strip().strip('"\'')
    return None


def _strip_markdown(text: str) -> str:
    """Remove common markdown formatting from text."""
    text = re.sub(r"^#+\s+", "", text, flags=re.MULTILINE)  # headers
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)  # bold
    text = re.sub(r"\*(.+?)\*", r"\1", text)  # italic
    text = re.sub(r"^[-•]\s+", "", text, flags=re.MULTILINE)  # bullet points
    return text.strip()


def _parse_thinking(text: str) -> tuple[str, str]:
    """Extract thinking process from response; return (main_text, thinking)."""
    thinking = ""
    if "Thinking process" in text or "thinking process" in text.lower():
        parts = re.split(r"[Tt]hinking process\s*:?\s*", text, maxsplit=1)
        if len(parts) > 1:
            thinking = parts[1].strip()
            text = parts[0].strip()
    if not thinking:
        thinking = "Applied specialist lens to the question. Generated response based on domain expertise."
    return (_strip_markdown(text), _strip_markdown(thinking))


def call_specialist(
    specialist_id: str,
    user_message: str,
    context_str: str = "",
) -> tuple[str, str]:
    """
    Call Anthropic Claude as a specialist.
    Returns (response_text, thinking_process). context_str is appended to the system prompt.
    """
    system = get_system_prompt(specialist_id)
    system += """

Instructions for your reply format:
- Reply in plain text only. No markdown, no bold (**), no headers (#), no bullet points.
- Do NOT start with a title or label like "Financial Analysis:" or "Legal Review:". Just start your answer directly.
- Write 2–4 sentences. Be direct and actionable.
- After your main reply, on a new line write exactly "Thinking process:" followed by 1–3 short sentences describing how you arrived at your answer (this is shown when the user expands your message)."""

    if context_str and context_str != "(No context available for this specialist.)":
        system += f"\n\n**Project Context (use this to inform your analysis):**\n{context_str}"

    api_key = _get_anthropic_key()
    if not api_key:
        return (
            "Analysis unavailable — ANTHROPIC_API_KEY not configured in .env.",
            "Backend missing API key.",
        )
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=800,
            system=system,
            messages=[
                {"role": "user", "content": user_message},
            ],
        )
        text = response.content[0].text if response.content else ""
        return _parse_thinking(text)
    except Exception as e:
        return (
            f"Analysis temporarily unavailable: {str(e)[:100]}",
            f"Error: {str(e)}",
        )
