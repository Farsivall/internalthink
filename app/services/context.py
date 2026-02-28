"""
Context service — fetches from Supabase when configured, falls back to mock.
"""

from uuid import UUID
from app.db.client import get_supabase

# Mock context for development / when Supabase not configured
MOCK_CONTEXT: list[dict] = [
    {
        "id": "doc1",
        "project_id": "proj-1",
        "type": "document",
        "label": "Product brief (Pitch Deck)",
        "content": """Q1 Product Strategy — Universify

Product: AI-powered application support for university applicants. Current offering: full-suite (personal statements, references, interview prep). Considering narrowing to personal statements only.

Key metrics: 12k MAU, 3.2% conversion to paid. Runway: 14 months. Team: 8 (3 eng, 2 product, 1 BD, 2 ops).

Pivot rationale: Reference module causes 40% of support tickets. Personal statements drive 70% of revenue. Narrowing could reduce complexity and focus GTM.""",
    },
    {
        "id": "doc2",
        "project_id": "proj-1",
        "type": "slack",
        "label": "#product",
        "content": """#product (last 7 days)
CEO: thinking we should narrow to personal statements only
Engineer: agreed, the reference module causes most of our bugs
Designer: what happens to existing users who signed up for the full suite?
BD: we're in talks with two unis for personal-statement-only pilots""",
    },
    {
        "id": "doc3",
        "project_id": "proj-1",
        "type": "codebase",
        "label": "GitHub Repo summary",
        "content": """Codebase summary — Universify

Architecture: Next.js frontend, FastAPI backend, Supabase. Monorepo.

Key components:
- src/modules/reference/ — reference letter generation (complex, many edge cases)
- src/modules/personal-statement/ — personal statement builder (cleaner, fewer bugs)
- api/context/ — document ingestion
- lib/llm/ — Claude integration for both modules

Fragile areas: reference module has 40% of bug reports. Tightly coupled to university-specific templates in config/universities/.

Files to watch: src/modules/reference/generator.py, config/universities/*.json""",
    },
    {
        "id": "doc4",
        "project_id": "proj-2",
        "type": "document",
        "label": "Vendor comparison",
        "content": """Vendor Selection — Infrastructure

Evaluating: AWS vs GCP vs Vercel for hosting. Current: Vercel (frontend) + Railway (backend). Considering consolidation.

Cost: Vercel $200/mo, Railway $150/mo. AWS estimate $280/mo. GCP estimate $260/mo.""",
    },
]

PERSONA_ACCESS: dict[str, list[str]] = {
    "doc1": ["legal", "financial", "technical", "bd", "tax"],
    "doc2": ["legal", "financial", "technical", "bd"],
    "doc3": ["technical"],
    "doc4": ["financial", "bd"],
}


def get_context_for_project(project_id: str) -> list[dict]:
    """Fetch context sources for a project. Uses Supabase when configured, else mock."""
    supabase = get_supabase()
    if supabase:
        try:
            # project_id might be UUID (from Supabase) or string like proj-1
            pid = str(project_id)
            if _is_uuid(pid):
                response = supabase.table("context_sources").select("*").eq("project_id", pid).order("created_at").execute()
                rows = response.data or []
                # Normalize to our format: id, project_id, type, label, content
                return [
                    {
                        "id": str(r.get("id", "")),
                        "project_id": str(r.get("project_id", "")),
                        "type": r.get("type", "document"),
                        "label": r.get("label"),
                        "content": r.get("content", ""),
                    }
                    for r in rows
                ]
        except Exception:
            pass
    # Fallback to mock for proj-1, proj-2, or when Supabase fails
    return [s for s in MOCK_CONTEXT if s["project_id"] == project_id]


def get_persona_access_for_project(project_id: str) -> dict[str, list[str]]:
    """Return doc_id -> persona_ids. Uses type-based permissions for Supabase rows; mock has explicit access."""
    sources = get_context_for_project(project_id)
    # For mock ids, use PERSONA_ACCESS
    if any(s["project_id"] in ("proj-1", "proj-2") for s in sources):
        return {s["id"]: PERSONA_ACCESS.get(s["id"], []) for s in sources}
    # For Supabase: no per-doc persona_ids in schema yet — use empty to fall back to type-based
    return {str(s["id"]): [] for s in sources}


def _is_uuid(s: str) -> bool:
    try:
        UUID(s)
        return True
    except ValueError:
        return False
