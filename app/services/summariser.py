import anthropic

SUMMARISER_SYSTEM_PROMPT = """You are a senior software architect reviewing a codebase. Your job is to produce a clear, structured summary that gives business decision-makers enough technical context to evaluate product decisions.

Produce a summary of 300-500 words covering:
1. **What this codebase is and what it does** — the product purpose in plain language
2. **Overall architecture** — monolith, microservices, serverless, etc.
3. **Key components** — the main modules/services and what each one does
4. **Main dependencies** — notable third-party libraries and integrations
5. **Fragile or complex areas** — parts that look tightly coupled, brittle, or hard to change
6. **Decision-sensitive areas** — which parts of the codebase are most likely to be affected by changes in product direction

Be specific. Reference actual file and directory names. Do not use filler language.
Write in plain text with section headers. Do not use markdown code fences."""

MODEL = "claude-sonnet-4-20250514"


def summarise_codebase(file_tree: list[str], file_contents: dict[str, str]) -> str:
    """Send fetched codebase data to Claude for a structured 300-500 word summary."""

    # Build the user message with file tree and selected file contents
    parts = []

    parts.append("=== FILE TREE (all files in the repository) ===")
    parts.append("\n".join(file_tree))

    parts.append("\n\n=== SELECTED FILE CONTENTS ===")
    for path, content in file_contents.items():
        parts.append(f"\n--- {path} ---")
        parts.append(content)

    user_message = "\n".join(parts)

    from app.core.config import settings
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model=MODEL,
        max_tokens=1000,
        system=SUMMARISER_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    return response.content[0].text
