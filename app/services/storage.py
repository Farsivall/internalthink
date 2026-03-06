"""
Supabase Storage — Drive-style document bucket.
Bucket name: Documents (per Supabase). Paths: company/{company_id}/drive/{folder_path}/{document_id}/{filename}.
Keys must use only characters allowed by Supabase (AWS-style): alphanumeric, dot, hyphen, underscore.
"""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Must match the bucket name in Supabase (case-sensitive: "Documents")
DOCUMENTS_BUCKET = "Documents"

# Supabase Storage keys reject e.g. spaces, em dash, other Unicode. Keep extension, sanitize rest.
def _sanitize_storage_key_segment(segment: str) -> str:
    if not segment:
        return "_"
    # Keep only alphanumeric, dot, hyphen, underscore; collapse repeated replacements
    sanitized = re.sub(r"[^a-zA-Z0-9._-]", "_", segment)
    sanitized = re.sub(r"_+", "_", sanitized).strip("_")
    return sanitized or "_"


def _safe_storage_filename(original_name: str) -> str:
    """Return a storage-safe filename (extension preserved, invalid chars replaced)."""
    if not original_name or not original_name.strip():
        return "document"
    name = original_name.strip()
    last_dot = name.rfind(".")
    if last_dot > 0:
        base, ext = name[:last_dot], name[last_dot:]
        ext = _sanitize_storage_key_segment(ext)  # e.g. ".pdf" -> ".pdf"
        if not ext.startswith("."):
            ext = "." + ext
        base = _sanitize_storage_key_segment(base) or "document"
        return base + ext
    return _sanitize_storage_key_segment(name) or "document"


def _get_supabase() -> Any:
    from app.api.deps import require_supabase
    return require_supabase()


def ensure_documents_bucket(supabase: Any) -> None:
    """Create the Documents bucket if it does not exist (idempotent)."""
    try:
        supabase.storage.create_bucket(DOCUMENTS_BUCKET, options={"public": False})
        logger.info("Created storage bucket %s", DOCUMENTS_BUCKET)
    except Exception as e:
        if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
            pass
        else:
            logger.warning("Could not ensure bucket %s: %s", DOCUMENTS_BUCKET, e)


def upload_document(
    project_id: str,
    folder_path: str | None,
    file_name: str,
    data: bytes,
    document_id: str | None = None,
) -> str:
    """
    Upload file bytes to Documents bucket. Returns storage path (key).
    Path: company/{project_id}/drive/{folder_path}/{document_id}/{file_name}.
    All path segments are sanitized for Supabase (no spaces, Unicode, etc.).
    """
    supabase = _get_supabase()
    ensure_documents_bucket(supabase)
    safe_name = _safe_storage_filename(file_name or "document")
    if document_id:
        parts = ["company", project_id, "drive"]
        if folder_path and folder_path.strip():
            safe_folder = "/".join(_sanitize_storage_key_segment(p) for p in folder_path.strip().strip("/").split("/"))
            if safe_folder:
                parts.append(safe_folder)
        parts.extend([document_id, safe_name])
        storage_path = "/".join(parts)
    else:
        parts = [project_id]
        if folder_path and folder_path.strip():
            safe_folder = "/".join(_sanitize_storage_key_segment(p) for p in folder_path.strip().strip("/").split("/"))
            if safe_folder:
                parts.append(safe_folder)
        parts.append(safe_name)
        storage_path = "project/" + "/".join(parts)
    supabase.storage.from_(DOCUMENTS_BUCKET).upload(storage_path, data, {"upsert": "true"})
    return storage_path


def delete_document(storage_path: str) -> None:
    """Remove object from documents bucket. No-op if path is empty."""
    if not storage_path or not storage_path.strip():
        return
    supabase = _get_supabase()
    try:
        supabase.storage.from_(DOCUMENTS_BUCKET).remove([storage_path])
    except Exception as e:
        logger.warning("Storage delete failed for %s: %s", storage_path, e)


def move_document(old_path: str, new_path: str) -> None:
    """Move object by re-uploading and deleting old (Supabase has no native move)."""
    if not old_path or not new_path or old_path == new_path:
        return
    supabase = _get_supabase()
    try:
        data = supabase.storage.from_(DOCUMENTS_BUCKET).download(old_path)
        supabase.storage.from_(DOCUMENTS_BUCKET).upload(new_path, data, {"upsert": "true"})
        supabase.storage.from_(DOCUMENTS_BUCKET).remove([old_path])
    except Exception as e:
        logger.warning("Storage move %s -> %s failed: %s", old_path, new_path, e)
        raise
