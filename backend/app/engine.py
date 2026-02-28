"""
Chat engine — calls Claude with specialist prompts and filtered context.
"""

import json
import re
import os
from anthropic import Anthropic
from app.personas import get_system_prompt, filter_context_for_specialist


def _strip_json_fences(text: str) -> str:
    """Claude sometimes wraps JSON in ```json ... ```. Strip that."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        return match.group(1).strip()
    return text


def call_specialist(
    specialist_id: str,
    user_message: str,
    context_str: str,
) -> tuple[str, str]:
    """
    Call Claude as a specialist. Returns (response_text, thinking_process).
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return (
            "Analysis unavailable — ANTHROPIC_API_KEY not configured.",
            "Backend missing API key.",
        )

    system = get_system_prompt(specialist_id)
    system += "\n\n**Context from the project:**\n" + context_str
    system += "\n\n**Instructions:** Reply as this specialist. Be concise (2–4 sentences). Include your reasoning. After your main reply, add a line 'Thinking process:' followed by 1–3 bullet points describing how you arrived at your answer — this will be shown when the user clicks your message."

    try:
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=800,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        text = response.content[0].text if response.content else ""

        # Try to extract thinking process if we asked for it
        thinking = ""
        if "Thinking process" in text or "thinking process" in text.lower():
            parts = re.split(r"[Tt]hinking process\s*:?\s*", text, maxsplit=1)
            if len(parts) > 1:
                thinking = parts[1].strip()
                text = parts[0].strip()
        if not thinking:
            thinking = "Applied specialist lens to the question and context. Generated response based on domain expertise and hard rules."

        return (text.strip(), thinking.strip())
    except Exception as e:
        return (
            f"Analysis temporarily unavailable: {str(e)[:100]}",
            f"Error: {str(e)}",
        )
