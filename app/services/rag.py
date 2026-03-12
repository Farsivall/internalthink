"""
RAG ingestion and retrieval for user-uploaded documents.

- Splits document text into chunks (stored in document_chunks).
- Tags chunks with persona and dimension metadata using keyword heuristics.
- Generates embeddings with text-embedding-3-small.
- Upserts vectors into Pinecone company index (di-company-knowledge-dev).
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from app.db.client import get_supabase
from app.db.project_resolve import resolve_project_uuid
from app.services.documents import strip_null_bytes

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-3-small"
PINECONE_COMPANY_INDEX = "di-company-knowledge-dev"
PINECONE_DOMAIN_INDEX = "di-domain-knowledge-dev"


def _get_embedding_dimension() -> Optional[int]:
    """Return embedding dimension from PINECONE_EMBEDDING_DIMENSION if set (e.g. 512 to match index). Default 1536 if unset."""
    raw = os.environ.get("PINECONE_EMBEDDING_DIMENSION", "").strip()
    if not raw:
        return None
    try:
        d = int(raw)
        if d > 0:
            return d
    except ValueError:
        pass
    return None

try:
    from pinecone import Pinecone  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    Pinecone = None  # type: ignore

try:
    from openai import OpenAI  # type: ignore
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore

_pc: Any = None
_company_index: Any = None
_domain_index: Any = None
_openai_client: Any = None


def _get_openai_client() -> Any | None:
    """Return shared OpenAI client for embeddings, or None if not configured."""
    global _openai_client
    if _openai_client is not None:
        return _openai_client
    if OpenAI is None:
        logger.warning("openai package not available; cannot generate embeddings.")
        return None

    key = os.environ.get("OPENAI_API_KEY") or os.environ.get("OPEN_API_KEY")
    if not key:
        try:
            from app.core.config import settings

            key = getattr(settings, "openai_api_key", None) or getattr(settings, "open_api_key", None)
        except Exception:
            key = None
    if not key:
        logger.warning("OpenAI API key not configured; set OPENAI_API_KEY or OPEN_API_KEY.")
        return None

    _openai_client = OpenAI(api_key=key)
    return _openai_client


def _get_pinecone_indexes() -> Tuple[Any | None, Any | None]:
    """
    Return (company_index, domain_index) Pinecone index clients, or (None, None) if unavailable.

    Uses PINECONE_COMPANY_INDEX_HOST / PINECONE_DOMAIN_INDEX_HOST if set (host only, no scheme),
    e.g. di-company-knowledge-dev-a14htcr.svc.aped-4627-b74a.pinecone.io
    Otherwise uses describe_index(name) to resolve hosts, then caches Index clients.
    """
    global _pc, _company_index, _domain_index

    if Pinecone is None:
        logger.warning("pinecone package not available; skipping vector upsert.")
        return None, None

    if _pc is None:
        api_key = os.environ.get("PINECONE_API_KEY")
        if not api_key or "your_pinecone" in api_key.lower():
            logger.warning("Pinecone not configured; set PINECONE_API_KEY.")
            return None, None
        _pc = Pinecone(api_key=api_key)

    def _host_from_describe(desc: Any) -> Optional[str]:
        """describe_index can return dict or object with host."""
        if desc is None:
            return None
        if isinstance(desc, dict):
            return desc.get("host")
        return getattr(desc, "host", None)

    def _normalize_host(h: str) -> str:
        """Pinecone expects host only (no scheme). Strip https:// or http://."""
        if not h:
            return h
        h = h.strip()
        for prefix in ("https://", "http://"):
            if h.lower().startswith(prefix):
                return h[len(prefix) :].strip()
        return h

    def _connect_index(env_value: str, default_name: str, label: str) -> Any:
        """Connect to an index. env_value can be index name or full host. Returns index or None."""
        raw = (env_value or default_name).strip()
        raw = _normalize_host(raw)
        if not raw:
            return None
        if ".pinecone.io" in raw:
            try:
                idx = _pc.Index(host=raw)
                logger.info("Pinecone %s connected via host.", label)
                return idx
            except Exception as e:
                logger.warning("Could not connect to Pinecone %s (host=%s): %s", label, raw, e)
                return None
        try:
            desc = _pc.describe_index(name=raw)
            index_host = _host_from_describe(desc)
            if index_host:
                idx = _pc.Index(host=index_host)
                logger.info("Pinecone %s connected via name %s.", label, raw)
                return idx
            logger.warning("describe_index(%s) did not return host.", raw)
        except Exception as e:
            logger.warning("Could not connect to Pinecone index %s (%s): %s", label, raw, e)
        return None

    if _company_index is None:
        _company_index = _connect_index(
            os.environ.get("PINECONE_COMPANY_INDEX_HOST", ""),
            PINECONE_COMPANY_INDEX,
            "company index",
        )

    if _domain_index is None:
        _domain_index = _connect_index(
            os.environ.get("PINECONE_DOMAIN_INDEX_HOST", ""),
            PINECONE_DOMAIN_INDEX,
            "domain index",
        )

    return _company_index, _domain_index


def check_pinecone_connection() -> Dict[str, Any]:
    """
    Check Pinecone API key and company/domain index connections. Safe to call from health endpoint.
    Returns dict with configured, company_index_ok, domain_index_ok, message, and optional error.
    """
    out: Dict[str, Any] = {
        "configured": False,
        "company_index_ok": False,
        "domain_index_ok": False,
        "message": "Pinecone not checked",
    }
    if Pinecone is None:
        out["message"] = "pinecone package not installed"
        return out
    api_key = os.environ.get("PINECONE_API_KEY", "").strip()
    if not api_key or "your_pinecone" in api_key.lower():
        out["message"] = "PINECONE_API_KEY not set or placeholder"
        return out
    out["configured"] = True
    company_index, domain_index = _get_pinecone_indexes()
    if not company_index:
        out["message"] = "Company index unavailable (set PINECONE_COMPANY_INDEX_HOST or ensure index name exists)"
        return out
    try:
        company_index.describe_index_stats()
        out["company_index_ok"] = True
        out["message"] = "Connected"
    except Exception as e:
        out["message"] = f"Index connection failed: {e}"
        out["error"] = str(e)
    if domain_index:
        try:
            domain_index.describe_index_stats()
            out["domain_index_ok"] = True
        except Exception:
            pass
    return out


def _chunk_text(text: str, chunk_words: int = 600, overlap_words: int = 80) -> List[str]:
    """
    Roughly 300–800 token chunks using word counts with overlap.
    """
    words = text.split()
    if not words:
        return []

    chunks: List[str] = []
    start = 0
    while start < len(words):
        end = min(len(words), start + chunk_words)
        chunk = " ".join(words[start:end]).strip()
        if chunk:
            chunks.append(chunk)
        if end == len(words):
            break
        # Overlap
        start = max(end - overlap_words, start + 1)
    return chunks


# --- Persona + dimension tagging heuristics (PART 5) ---

_KEYWORD_RULES: List[Dict[str, Any]] = [
    {
        "persona": "Legal",
        "dimension": "Contract Lock-In",
        "keywords": [
            "termination",
            "renewal",
            "auto-renew",
            "exclusivity",
            "penalty",
            "minimum term",
            "assignment",
            "change of control",
        ],
    },
    {
        "persona": "Financial",
        "dimension": "Capital Intensity",
        "keywords": [
            "burn",
            "runway",
            "cash",
            "capex",
            "opex",
            "budget",
            "forecast",
        ],
    },
    {
        "persona": "Technical",
        "dimension": "Reliability / Security",
        "keywords": [
            "sla",
            "incident",
            "outage",
            "vulnerability",
            "cve",
            "encryption",
            "soc2",
            "authentication",
        ],
    },
    {
        "persona": "Business Dev",
        "dimension": "Market Opportunity",
        "keywords": [
            "tam",
            "total addressable market",
            "market size",
            "go-to-market",
            "gtm",
            "share",
            "segment",
            "adoption",
        ],
    },
    {
        "persona": "Tax",
        "dimension": "Tax Efficiency",
        "keywords": [
            "tax",
            "vat",
            "withholding",
            "r&d credit",
            "r&d tax",
            "deduction",
            "deferred tax",
        ],
    },
]


def _tag_chunk(text: str) -> Tuple[List[str], List[str]]:
    """Return (persona_tags, dimension_tags) for a chunk using simple keyword rules."""
    lower = text.lower()
    persona_tags: List[str] = []
    dimension_tags: List[str] = []

    for rule in _KEYWORD_RULES:
        persona = rule["persona"]
        dimension = rule["dimension"]
        for kw in rule["keywords"]:
            if kw in lower:
                if persona not in persona_tags:
                    persona_tags.append(persona)
                if dimension not in dimension_tags:
                    dimension_tags.append(dimension)
                break

    return persona_tags, dimension_tags


def ingest_context_source(context_source: Dict[str, Any]) -> None:
    """
    Ingest a single context_sources row into document_chunks and Pinecone.

    - Only handles type == 'document'.
    - Uses context_source.content as the text source (no full-document LLM calls).
    - Stores chunks in document_chunks with metadata.
    - Upserts vectors into di-company-knowledge-dev with metadata including persona_tags/dimension_tags.
    """
    source_id = str((context_source or {}).get("id") or "").strip()
    if not context_source or context_source.get("type") != "document":
        if source_id:
            logger.debug("RAG ingest skipped for %s: not a document type.", source_id)
        return

    logger.info("RAG ingest starting for context_source id=%s", source_id or context_source.get("id"))

    supabase = get_supabase()
    if not supabase:
        logger.warning("RAG ingest skipped for %s: Supabase not available.", source_id)
        return

    raw_text = strip_null_bytes((context_source.get("content") or "").strip())
    if not raw_text:
        logger.info(
            "RAG ingest skipped for context_source %s: no content (extract text or add content for this document).",
            context_source.get("id"),
        )
        return

    project_id = str(context_source.get("project_id") or "").strip()
    if not project_id:
        logger.warning("RAG ingest skipped for %s: missing project_id.", source_id)
        return
    company_id = resolve_project_uuid(project_id) or project_id

    if not source_id:
        logger.warning("RAG ingest skipped: context_source has no id.")
        return

    version = int(context_source.get("version") or 1)
    title = strip_null_bytes((context_source.get("label") or context_source.get("file_name") or "Document").strip())
    mime_type = (context_source.get("mime_type") or "").strip() or None
    doc_type = None
    if mime_type:
        doc_type = mime_type
    else:
        file_name = (context_source.get("file_name") or "").lower()
        if file_name.endswith(".pdf"):
            doc_type = "application/pdf"
        elif file_name.endswith(".txt") or file_name.endswith(".md"):
            doc_type = "text/plain"

    chunks = _chunk_text(raw_text)
    if not chunks:
        logger.warning("RAG ingest skipped for %s: no chunks produced from text (len=%d).", source_id, len(raw_text))
        return

    # Delete existing chunks for this source + version to keep things idempotent.
    try:
        supabase.table("document_chunks").delete().eq("context_source_id", source_id).eq("version", version).execute()
    except Exception:
        # Non-fatal
        pass

    # Tag chunks with persona/dimension metadata.
    tagged_chunks: List[Dict[str, Any]] = []
    for idx, text in enumerate(chunks):
        persona_tags, dimension_tags = _tag_chunk(text)
        tagged_chunks.append(
            {
                "index": idx,
                "text": text,
                "persona_tags": persona_tags,
                "dimension_tags": dimension_tags,
            }
        )

    # Insert into document_chunks (with metadata JSON).
    records = []
    for item in tagged_chunks:
        metadata = {
            "project_id": company_id,
            "document_id": source_id,
            "document_version": version,
            "chunk_id": item["index"],
            "source_type": "document",
            "doc_type": doc_type,
            "page_number": None,
            "section_heading": None,
            "title": title,
            "persona_tags": item["persona_tags"],
            "dimension_tags": item["dimension_tags"],
        }
        chunk_content = strip_null_bytes(item["text"])
        records.append(
            {
                "context_source_id": source_id,
                "version": version,
                "chunk_index": item["index"],
                "content": chunk_content,
                "metadata": metadata,
            }
        )

    try:
        # Supabase can take a list of rows in one insert.
        supabase.table("document_chunks").insert(records).execute()
    except Exception as e:
        logger.warning("Failed to insert document_chunks for %s: %s", source_id, e)

    # Generate embeddings and upsert into Pinecone (best-effort).
    client = _get_openai_client()
    company_index, _ = _get_pinecone_indexes()
    if not client:
        logger.warning("RAG ingest: OpenAI client not available (OPENAI_API_KEY); skipping Pinecone upsert for %s", source_id)
        return
    if not company_index:
        logger.warning(
            "RAG ingest: Pinecone company index not available (PINECONE_API_KEY and index host); skipping upsert for %s",
            source_id,
        )
        return

    try:
        texts = [c["text"] for c in tagged_chunks]
        dim = _get_embedding_dimension()
        kwargs: Dict[str, Any] = {}
        if dim is not None:
            kwargs["dimensions"] = dim
        emb = client.embeddings.create(model=EMBEDDING_MODEL, input=texts, **kwargs)
        vectors = emb.data or []
        if len(vectors) != len(tagged_chunks):
            logger.warning("RAG ingest: embedding count %d != chunk count %d for %s", len(vectors), len(tagged_chunks), source_id)
    except Exception as e:  # pragma: no cover - external
        logger.exception("Failed to generate embeddings for %s: %s", source_id, e)
        return

    # Pinecone metadata: no nulls (omit keys with None), chunk_text under ~8KB to stay under 16KB limit
    MAX_CHUNK_TEXT_META = 8000
    pine_vectors = []
    for item, vec in zip(tagged_chunks, vectors):
        emb_vec = getattr(vec, "embedding", None)
        if not emb_vec:
            continue
        chunk_text = strip_null_bytes((item["text"] or "")[:MAX_CHUNK_TEXT_META])
        metadata: Dict[str, Any] = {
            "scope": "company",
            "company_id": company_id,
            "document_id": source_id,
            "document_version": version,
            "chunk_id": item["index"],
            "source_type": "document",
            "title": strip_null_bytes((title or "")[:1000]),
            "persona_tags": item["persona_tags"] or [],
            "dimension_tags": item["dimension_tags"] or [],
            "chunk_text": chunk_text,
        }
        if doc_type:
            metadata["doc_type"] = strip_null_bytes(doc_type[:200])
        vector_id = f"company:{company_id}|doc:{source_id}|v:{version}|chunk:{item['index']}"
        pine_vectors.append({"id": vector_id, "values": emb_vec, "metadata": metadata})

    if not pine_vectors:
        logger.warning("RAG ingest: no valid embedding vectors for %s", source_id)
        return

    try:
        company_index.upsert(vectors=pine_vectors)
        logger.info("Pinecone upserted %d vectors for document %s (company %s)", len(pine_vectors), source_id, company_id)
    except Exception as e:  # pragma: no cover - external
        logger.exception("Pinecone upsert failed for %s: %s", source_id, e)


def retrieve_chunks(
    *,
    project_id: str,
    query: str,
    persona: Optional[str] = None,
    dimension: Optional[str] = None,
    top_k: int = 8,
) -> List[Dict[str, Any]]:
    """
    Retrieve relevant chunks for a decision query.

    - Queries di-company-knowledge-dev filtered by project_id.
    - Optionally filters by persona_tags and dimension_tags.
    - Also queries di-domain-knowledge-dev when persona and dimension are provided.
    - Returns a list of {chunk_text, document_id, chunk_id, page_number, source, score}.
    """
    project_id = (project_id or "").strip()
    if not project_id or not query.strip():
        return []

    company_id = resolve_project_uuid(project_id) or project_id

    client = _get_openai_client()
    company_index, domain_index = _get_pinecone_indexes()
    if not client or not company_index:
        return []

    try:
        dim = _get_embedding_dimension()
        kwargs: Dict[str, Any] = {}
        if dim is not None:
            kwargs["dimensions"] = dim
        emb = client.embeddings.create(model=EMBEDDING_MODEL, input=[query], **kwargs)
        vector = (emb.data or [None])[0]
        if not vector or not getattr(vector, "embedding", None):
            return []
        base_vec = vector.embedding
    except Exception as e:  # pragma: no cover - external
        logger.warning("Failed to embed query for retrieve_chunks: %s", e)
        return []

    # Company index filter
    company_filter: Dict[str, Any] = {"company_id": company_id}
    if persona:
        company_filter["persona_tags"] = {"$in": [persona]}
    if dimension:
        company_filter["dimension_tags"] = {"$in": [dimension]}

    results: List[Tuple[float, Dict[str, Any]]] = []

    try:
        res = company_index.query(
            vector=base_vec,
            top_k=top_k,
            include_metadata=True,
            filter=company_filter,
        )
        matches = getattr(res, "matches", None) or getattr(res, "get", lambda *_: [])("matches")
    except Exception as e:  # pragma: no cover - external
        logger.warning("Pinecone company query failed: %s", e)
        matches = []

    for m in matches or []:
        meta = getattr(m, "metadata", None) or getattr(m, "get", lambda *_: None)("metadata")
        score = getattr(m, "score", None) or getattr(m, "get", lambda *_: 0.0)("score")
        if not isinstance(meta, dict):
            continue
        results.append((float(score or 0.0), meta))

    # Domain knowledge index (persona + dimension specific guidance)
    if persona and dimension and domain_index:
        domain_filter: Dict[str, Any] = {"scope": "domain", "persona": persona, "dimension": dimension}
        try:
            res2 = domain_index.query(
                vector=base_vec,
                top_k=max(1, top_k // 2),
                include_metadata=True,
                filter=domain_filter,
            )
            matches2 = getattr(res2, "matches", None) or getattr(res2, "get", lambda *_: [])("matches")
        except Exception as e:  # pragma: no cover - external
            logger.warning("Pinecone domain query failed: %s", e)
            matches2 = []

        for m in matches2 or []:
            meta = getattr(m, "metadata", None) or getattr(m, "get", lambda *_: None)("metadata")
            score = getattr(m, "score", None) or getattr(m, "get", lambda *_: 0.0)("score")
            if not isinstance(meta, dict):
                continue
            # Normalise shape to use same fields as company metadata.
            results.append(
                (
                    float(score or 0.0),
                    {
                        "scope": "domain",
                        "company_id": None,
                        "document_id": None,
                        "document_version": None,
                        "chunk_id": None,
                        "source_type": "domain",
                        "doc_type": None,
                        "page_number": None,
                        "section_heading": None,
                        "title": meta.get("source") or "",
                        "persona_tags": [meta.get("persona")] if meta.get("persona") else [],
                        "dimension_tags": [meta.get("dimension")] if meta.get("dimension") else [],
                        "chunk_text": meta.get("chunk_text") or "",
                    },
                )
            )

    # Sort combined results by score descending and shape output.
    results.sort(key=lambda x: x[0], reverse=True)

    shaped: List[Dict[str, Any]] = []
    for score, meta in results[:top_k]:
        shaped.append(
            {
                "chunk_text": meta.get("chunk_text") or "",
                "document_id": meta.get("document_id"),
                "chunk_id": meta.get("chunk_id"),
                "page_number": meta.get("page_number"),
                "score": score,
                "title": meta.get("title") or "",
                "source_type": meta.get("source_type") or meta.get("scope"),
                "persona_tags": meta.get("persona_tags") or [],
                "dimension_tags": meta.get("dimension_tags") or [],
            }
        )

    return shaped


def retrieve_chunks_for_evaluation(
    *,
    project_id: str,
    query: str,
    persona_name: Optional[str] = None,
    dimension_names: Optional[List[str]] = None,
    top_k_company: int = 6,
    top_k_domain: int = 4,
) -> List[Dict[str, Any]]:
    """
    Retrieve company + domain chunks for decision evaluation.

    - Company: queries di-company-knowledge-dev by project_id, optionally by persona.
    - Domain: for each dimension in dimension_names, queries di-domain-knowledge-dev
      with (persona_name, dimension), then merges and takes top_k_domain by score.
    - Returns combined list with same shape as retrieve_chunks (chunk_text, title, source_type, ...).
    """
    project_id = (project_id or "").strip()
    if not project_id or not query.strip():
        return []

    company_id = resolve_project_uuid(project_id) or project_id
    dimension_names = dimension_names or []

    client = _get_openai_client()
    company_index, domain_index = _get_pinecone_indexes()
    if not client or not company_index:
        return []
    if not domain_index:
        logger.warning("Domain index not configured; only company RAG will be used.")

    try:
        dim = _get_embedding_dimension()
        kwargs: Dict[str, Any] = {}
        if dim is not None:
            kwargs["dimensions"] = dim
        emb = client.embeddings.create(model=EMBEDDING_MODEL, input=[query], **kwargs)
        vector = (emb.data or [None])[0]
        if not vector or not getattr(vector, "embedding", None):
            return []
        base_vec = vector.embedding
    except Exception as e:  # pragma: no cover - external
        logger.warning("Failed to embed query for retrieve_chunks_for_evaluation: %s", e)
        return []

    results: List[Tuple[float, Dict[str, Any]]] = []

    # Company index
    company_filter: Dict[str, Any] = {"company_id": company_id}
    if persona_name:
        company_filter["persona_tags"] = {"$in": [persona_name]}
    try:
        res = company_index.query(
            vector=base_vec,
            top_k=top_k_company,
            include_metadata=True,
            filter=company_filter,
        )
        matches = getattr(res, "matches", None) or getattr(res, "get", lambda *_: [])("matches")
    except Exception as e:  # pragma: no cover - external
        logger.warning("Pinecone company query failed in retrieve_chunks_for_evaluation: %s", e)
        matches = []

    for m in matches or []:
        meta = getattr(m, "metadata", None) or getattr(m, "get", lambda *_: None)("metadata")
        score = getattr(m, "score", None) or getattr(m, "get", lambda *_: 0.0)("score")
        if isinstance(meta, dict):
            results.append((float(score or 0.0), {**meta, "_scope": "company"}))

    # Domain index: per-dimension queries (when dimension names match index) + persona-only query (for subpersonas / dimension mismatch)
    if domain_index and persona_name:
        domain_results: List[Tuple[float, Dict[str, Any]]] = []
        if dimension_names:
            per_dim = max(1, (top_k_domain + len(dimension_names) - 1) // len(dimension_names))
            for dim_name in dimension_names:
                if not (dim_name or "").strip():
                    continue
                domain_filter: Dict[str, Any] = {
                    "scope": "domain",
                    "persona": persona_name,
                    "dimension": (dim_name or "").strip(),
                }
                try:
                    res2 = domain_index.query(
                        vector=base_vec,
                        top_k=per_dim,
                        include_metadata=True,
                        filter=domain_filter,
                    )
                    matches2 = getattr(res2, "matches", None) or getattr(res2, "get", lambda *_: [])("matches")
                except Exception as e:  # pragma: no cover - external
                    logger.warning("Pinecone domain query failed for dimension %s: %s", dim_name, e)
                    continue
                for m in matches2 or []:
                    meta = getattr(m, "metadata", None) or getattr(m, "get", lambda *_: None)("metadata")
                    score = getattr(m, "score", None) or getattr(m, "get", lambda *_: 0.0)("score")
                    if not isinstance(meta, dict):
                        continue
                    domain_results.append(
                        (
                            float(score or 0.0),
                            {
                                "scope": "domain",
                                "chunk_text": meta.get("chunk_text") or "",
                                "title": meta.get("source") or (dim_name or "").strip(),
                                "source_type": "domain",
                                "document_id": None,
                                "chunk_id": None,
                                "persona_tags": [meta.get("persona")] if meta.get("persona") else [],
                                "dimension_tags": [meta.get("dimension")] if meta.get("dimension") else [],
                            },
                        )
                    )
        # Persona-only query: picks up domain chunks when dimension names in index don't match persona_dimensions (e.g. hydro subpersonas)
        try:
            persona_only_filter: Dict[str, Any] = {"scope": "domain", "persona": persona_name}
            res_p = domain_index.query(
                vector=base_vec,
                top_k=top_k_domain,
                include_metadata=True,
                filter=persona_only_filter,
            )
            matches_p = getattr(res_p, "matches", None) or getattr(res_p, "get", lambda *_: [])("matches")
            for m in matches_p or []:
                meta = getattr(m, "metadata", None) or getattr(m, "get", lambda *_: None)("metadata")
                score = getattr(m, "score", None) or getattr(m, "get", lambda *_: 0.0)("score")
                if not isinstance(meta, dict):
                    continue
                domain_results.append(
                    (
                        float(score or 0.0),
                        {
                            "scope": "domain",
                            "chunk_text": meta.get("chunk_text") or "",
                            "title": meta.get("source") or "",
                            "source_type": "domain",
                            "document_id": None,
                            "chunk_id": None,
                            "persona_tags": [meta.get("persona")] if meta.get("persona") else [],
                            "dimension_tags": [meta.get("dimension")] if meta.get("dimension") else [],
                        },
                    )
                )
        except Exception as e:  # pragma: no cover - external
            logger.warning("Pinecone domain persona-only query failed: %s", e)
        domain_results.sort(key=lambda x: x[0], reverse=True)
        domain_slice = domain_results[:top_k_domain]
    else:
        domain_slice = []

    # Reserve slots: top_k_company from company, top_k_domain from domain (so domain is not crowded out)
    company_sorted = sorted(results, key=lambda x: x[0], reverse=True)
    company_slice = company_sorted[:top_k_company]
    combined = company_slice + domain_slice

    shaped: List[Dict[str, Any]] = []
    for score, meta in combined:
        scope = meta.pop("_scope", None)
        st = "company" if scope == "company" else (meta.get("source_type") or "domain")
        shaped.append(
            {
                "chunk_text": meta.get("chunk_text") or "",
                "document_id": meta.get("document_id"),
                "chunk_id": meta.get("chunk_id"),
                "page_number": meta.get("page_number"),
                "score": score,
                "title": meta.get("title") or "",
                "source_type": st,
                "persona_tags": meta.get("persona_tags") or [],
                "dimension_tags": meta.get("dimension_tags") or [],
            }
        )
    return shaped


def format_chunks_for_citation(chunks: List[Dict[str, Any]]) -> str:
    """
    Format retrieved chunks as a single string with citation-ready labels
    so the model can reference e.g. [Company | Doc Title | chunk 2] in its answer.
    """
    if not chunks:
        return ""
    lines: List[str] = []
    for c in chunks:
        title = (c.get("title") or "Document").strip() or "Document"
        source_type = (c.get("source_type") or "company").strip().lower()
        chunk_id = c.get("chunk_id")
        text = (c.get("chunk_text") or "").strip()
        if not text:
            continue
        if source_type == "domain":
            label = f"[Domain | {title}]"
        else:
            chunk_part = f" | chunk {chunk_id}" if chunk_id is not None else ""
            label = f"[Company | {title}{chunk_part}]"
        lines.append(f"{label}\n{text}")
    return "\n\n".join(lines)


def get_chunk_labels(chunks: List[Dict[str, Any]]) -> List[str]:
    """Return the list of citation labels for the given chunks (for display as references)."""
    if not chunks:
        return []
    labels: List[str] = []
    for c in chunks:
        title = (c.get("title") or "Document").strip() or "Document"
        source_type = (c.get("source_type") or "company").strip().lower()
        chunk_id = c.get("chunk_id")
        if source_type == "domain":
            label = f"[Domain | {title}]"
        else:
            chunk_part = f" | chunk {chunk_id}" if chunk_id is not None else ""
            label = f"[Company | {title}{chunk_part}]"
        labels.append(label)
    return labels

