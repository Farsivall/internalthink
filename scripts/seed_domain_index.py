"""
One-off script to seed the Pinecone domain index (di-domain-knowledge-dev) with
curated persona/dimension chunks. Uses the same embedding model and env as app.services.rag.

Supports two chunk shapes:
- Legacy: {persona, dimension, source, chunk_text}
- Extended: {chunk_text, topic, source} plus optional domain, subdomain, persona, subpersona,
  source_type, source_name, document_title. If dimension is missing, it is set from topic or "General".

Usage (from repo root):
  PYTHONPATH=. python scripts/seed_domain_index.py

Requires: OPENAI_API_KEY or OPEN_API_KEY, PINECONE_API_KEY,
          PINECONE_DOMAIN_INDEX_HOST (or index name for describe_index).
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys

# Load .env from repo root so PINECONE_API_KEY etc. are in os.environ when rag module reads them
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_env = os.path.join(_REPO_ROOT, ".env")
if os.path.isfile(_env):
    try:
        from dotenv import load_dotenv
        load_dotenv(_env)
    except ImportError:
        pass

if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_META_STRING = 500
MAX_CHUNK_TEXT = 8000
MAX_SOURCE_LEGACY = 1000

# Map subpersona slug (from domain_seed JSON) to app persona name (used in persona_dimensions and RAG queries).
# Keep in sync with app.services.persona.SPECIALIST_ID_TO_PERSONA_NAME for subpersonas.
SUBPERSONA_TO_PERSONA_NAME: dict[str, str] = {
    "hydroelectric_project_finance_specialist": "Hydroelectric Project Finance Specialist",
    "hydroelectric_regulatory_compliance_specialist": "Hydroelectric Regulatory & Compliance Specialist",
}


def _slug(s: str) -> str:
    """Sanitize for use in vector ID (alphanumeric, underscore). Pinecone IDs allow only [a-zA-Z0-9_-]."""
    return re.sub(r"[^\w]+", "_", s).strip("_") or "dim"


def _safe_vector_id(parts: list[str]) -> str:
    """Build a Pinecone-safe vector ID (alphanumeric, hyphens, underscores only; no pipes)."""
    return "-".join(_slug(p) for p in parts)


def load_chunks(path: str) -> list[dict]:
    """
    Load JSON array of chunks. Accepts:
    - Legacy: {persona, dimension, source, chunk_text}
    - Extended: {chunk_text, topic, source} + optional domain, subdomain, persona, subpersona,
      source_type, source_name, document_title. If dimension missing, use topic or "General".
    """
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        data = [data]
    out = []
    for i, item in enumerate(data):
        chunk_text = (item.get("chunk_text") or "").strip()
        if not chunk_text:
            logger.warning("Skipping item %d: missing chunk_text", i)
            continue
        source = (item.get("source") or "").strip() or "Domain guide"
        persona = (item.get("persona") or "").strip()
        dimension = (item.get("dimension") or "").strip()
        topic = (item.get("topic") or "").strip()
        if not dimension and topic:
            dimension = topic.replace("_", " ").title()
        if not dimension:
            dimension = "General"
        if not persona:
            persona = "Technical"
        row = {
            "persona": persona,
            "dimension": dimension,
            "source": source,
            "chunk_text": chunk_text,
        }
        for key in ("domain", "subdomain", "subpersona", "source_type", "source_name", "document_title"):
            if key in item and item[key] is not None:
                row[key] = (item[key] or "").strip() or None
        if "topic" in item and item.get("topic"):
            row["topic"] = (item["topic"] or "").strip()
        out.append(row)
    return out


def main() -> None:
    seed_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "domain_seed")
    chunks: list[dict] = []
    if not os.path.isdir(seed_dir):
        logger.warning("Seed directory not found: %s", seed_dir)
        return
    for name in sorted(os.listdir(seed_dir)):
        if name.endswith(".json"):
            path = os.path.join(seed_dir, name)
            if os.path.isfile(path):
                chunks.extend(load_chunks(path))
    if not chunks:
        logger.warning("No chunks found under %s", seed_dir)
        return

    from app.services import rag

    client = rag._get_openai_client()
    if not client:
        logger.error("OpenAI client not available; set OPENAI_API_KEY or OPEN_API_KEY")
        sys.exit(1)

    _, domain_index = rag._get_pinecone_indexes()
    if not domain_index:
        logger.error(
            "Pinecone domain index not available; set PINECONE_API_KEY and PINECONE_DOMAIN_INDEX_HOST"
        )
        sys.exit(1)

    dim_opt = rag._get_embedding_dimension()
    kwargs: dict = {}
    if dim_opt is not None:
        kwargs["dimensions"] = dim_opt

    texts = [c["chunk_text"] for c in chunks]
    logger.info("Generating embeddings for %d chunks (model=%s)", len(texts), rag.EMBEDDING_MODEL)
    resp = client.embeddings.create(model=rag.EMBEDDING_MODEL, input=texts, **kwargs)
    vectors = resp.data or []
    if len(vectors) != len(chunks):
        logger.error("Embedding count %d != chunk count %d", len(vectors), len(chunks))
        sys.exit(1)

    pine_vectors = []
    for i, (chunk, vec) in enumerate(zip(chunks, vectors)):
        emb = getattr(vec, "embedding", None)
        if not emb:
            continue
        # Use app persona name when chunk has a mapped subpersona (so RAG queries find it)
        subpersona_key = (chunk.get("subpersona") or "").strip()
        effective_persona = SUBPERSONA_TO_PERSONA_NAME.get(subpersona_key) or chunk["persona"]
        # Vector ID: Pinecone allows only alphanumeric, hyphen, underscore (no pipes)
        parts = ["domain", effective_persona.replace(" ", "_"), _slug(chunk["dimension"]), str(i)]
        if chunk.get("domain"):
            parts[0] = chunk["domain"]
        if chunk.get("subpersona"):
            parts.append("sub")
            parts.append(_slug(chunk["subpersona"]))
        if chunk.get("topic"):
            parts.append(_slug(chunk["topic"]))
        vid = _safe_vector_id(parts)

        meta: dict = {
            "scope": "domain",
            "persona": effective_persona,
            "dimension": chunk["dimension"],
            "source": (chunk["source"] or "")[:MAX_SOURCE_LEGACY],
            "chunk_text": (chunk["chunk_text"] or "")[:MAX_CHUNK_TEXT],
        }
        if chunk.get("domain"):
            meta["domain"] = (chunk["domain"] or "")[:MAX_META_STRING]
        if chunk.get("subdomain"):
            meta["subdomain"] = (chunk["subdomain"] or "")[:MAX_META_STRING]
        if chunk.get("subpersona"):
            meta["subpersona"] = (chunk["subpersona"] or "")[:MAX_META_STRING]
        if chunk.get("topic"):
            meta["topic"] = (chunk["topic"] or "")[:MAX_META_STRING]
        if chunk.get("source_type"):
            meta["source_type"] = (chunk["source_type"] or "")[:MAX_META_STRING]
        if chunk.get("source_name"):
            meta["source_name"] = (chunk["source_name"] or "")[:MAX_META_STRING]
        if chunk.get("document_title"):
            meta["document_title"] = (chunk["document_title"] or "")[:MAX_META_STRING]

        pine_vectors.append({"id": vid, "values": emb, "metadata": meta})

    if not pine_vectors:
        logger.error("No valid vectors to upsert")
        sys.exit(1)

    # Log index identity for verification (host or name)
    try:
        index_host = getattr(domain_index, "host", None) or str(domain_index)
        logger.info("Domain index target: %s", index_host[:80] if index_host else "unknown")
    except Exception:
        pass
    logger.info("Upserting %d vectors to domain index (first id: %s)", len(pine_vectors), pine_vectors[0]["id"])
    try:
        result = domain_index.upsert(vectors=pine_vectors)
        upserted = getattr(result, "upserted_count", None) or (result.get("upsertedCount") if isinstance(result, dict) else None)
        if upserted is not None:
            logger.info("Upserted count: %s", upserted)
        logger.info("Done.")
    except Exception as e:
        logger.exception("Pinecone upsert failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
