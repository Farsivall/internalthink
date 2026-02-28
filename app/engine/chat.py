"""
Chat engine — calls OpenAI or Anthropic with specialist prompts.
Context from project documents and codebase summaries is included in the system prompt.
"""

import os
import re
from app.personas import get_system_prompt


def _get_openai_key() -> str | None:
    """Get OpenAI/Open API key from env or .env."""
    for env_key in ("OPENAI_API_KEY", "OPEN_API_KEY"):
        key = os.environ.get(env_key)
        if key:
            return key
    try:
        from app.core.config import settings
        if settings.openai_api_key:
            return settings.openai_api_key
        if settings.open_api_key:
            return settings.open_api_key
    except Exception:
        pass
    for p in [os.path.join(os.path.dirname(__file__), "..", "..", ".env"), ".env"]:
        path = os.path.abspath(p)
        if os.path.exists(path):
            with open(path) as f:
                for line in f:
                    for prefix in ("OPENAI_API_KEY=", "OPEN_API_KEY="):
                        if line.startswith(prefix):
                            return line.split("=", 1)[1].strip().strip('"\'')
    return None


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
    return (text.strip(), thinking.strip())


def call_specialist(
    specialist_id: str,
    user_message: str,
    context_str: str = "",
) -> tuple[str, str]:
    """
    Call AI as a specialist. Uses OpenAI (OPEN_API_KEY) if set, else Anthropic.
    Returns (response_text, thinking_process). context_str is appended to the system prompt.
    """
    system = get_system_prompt(specialist_id)
    system += "\n\n**Instructions:** Reply as this specialist. Be concise (2–4 sentences). Include your reasoning. After your main reply, add a line 'Thinking process:' followed by 1–3 bullet points describing how you arrived at your answer — this will be shown when the user clicks your message."

    if context_str and context_str != "(No context available for this specialist.)":
        system += f"\n\n**Project Context (use this to inform your analysis):**\n{context_str}"

    # Use OpenAI only (OPEN_API_KEY or OPENAI_API_KEY)
    openai_key = _get_openai_key()
    if not openai_key:
        return (
            "Analysis unavailable — OPEN_API_KEY not configured in .env.",
            "Backend missing API key.",
        )
    try:
        from openai import OpenAI
        client = OpenAI(api_key=openai_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=800,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_message},
            ],
        )
        text = response.choices[0].message.content or ""
        return _parse_thinking(text)
    except Exception as e:
        return (
            f"Analysis temporarily unavailable: {str(e)[:100]}",
            f"Error: {str(e)}",
        )
