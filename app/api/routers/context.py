import json
import logging
from fastapi import APIRouter, HTTPException, status, Query, UploadFile, File, Form
from pydantic import ValidationError
from typing import List, Optional
from uuid import UUID
from app.schemas.context import (
    ContextSourceCreate, ContextSourceResponse, GitHubContextRequest, DocumentTextRequest,
    FileRenameRequest, FileMoveRequest,
    FolderResponse, FolderCreate, FolderRenameRequest, FolderMoveRequest,
)
from app.api.deps import require_supabase
from app.db.project_resolve import resolve_project_uuid
from app.services.github import parse_repo_url, fetch_file_tree, select_important_files, fetch_file_contents
from app.services.summariser import summarise_codebase
from app.services.documents import (
    extract_text_from_pdf,
    extract_text_from_image,
    IMAGE_EXTRACTION_MIMES,
    truncate_to_word_limit,
    strip_null_bytes,
)
from app.services.storage import upload_document, delete_document, move_document
from app.services.folders import get_folder_path, list_folders, folder_has_children
from app.services.rag import ingest_context_source

logger = logging.getLogger(__name__)

router = APIRouter()

def _resolve_project_uuid(project_id: str) -> str | None:
    """Resolve slug or UUID to project UUID. Supabase-first when configured."""
    return resolve_project_uuid(project_id)


@router.get("/", response_model=List[ContextSourceResponse])
def get_context_sources(project_id: str = Query(...)):
    """Get context sources for a project. project_id can be slug or UUID. Supabase only."""
    pid = _resolve_project_uuid(project_id)
    if not pid:
        return []
    supabase = require_supabase()
    try:
        response = supabase.table("context_sources").select("*").eq("project_id", pid).order("created_at").execute()
        return response.data or []
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )


@router.get("/files", response_model=List[ContextSourceResponse])
def list_files(
    project_id: str = Query(...),
    folder_path: Optional[str] = Query(None),
    folder_id: Optional[str] = Query(None),
):
    """List document files for a project. Filter by folder_id (preferred) or folder_path. Omit both for root."""
    pid = _resolve_project_uuid(project_id)
    if not pid:
        return []
    supabase = require_supabase()
    try:
        q = supabase.table("context_sources").select("*").eq("project_id", pid).eq("type", "document").order("created_at")
        if folder_id and folder_id != "" and folder_id != "__root__":
            q = q.eq("folder_id", folder_id)
        elif folder_path is not None:
            if folder_path == "" or folder_path == "__root__":
                q = q.is_("folder_path", "null").is_("folder_id", "null")
            else:
                q = q.eq("folder_path", folder_path)
        response = q.execute()
        return response.data or []
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )


# --- Folders (Drive-style) ---

@router.get("/folders", response_model=List[FolderResponse])
def list_project_folders(
    project_id: str = Query(...),
    parent_id: Optional[str] = Query(None, description="Parent folder id; omit or __root__ for root"),
):
    """List direct child folders. parent_id null/__root__ = root level."""
    pid = _resolve_project_uuid(project_id)
    if not pid:
        return []
    supabase = require_supabase()
    try:
        pid_param = None if (parent_id is None or parent_id == "" or parent_id == "__root__") else parent_id
        rows = list_folders(supabase, pid, pid_param)
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/folders", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
def create_folder(body: FolderCreate):
    """Create a folder (root or under parent_id)."""
    pid = _resolve_project_uuid(str(body.project_id)) or str(body.project_id)
    if not pid:
        raise HTTPException(status_code=404, detail="Project not found")
    supabase = require_supabase()
    try:
        data = {"project_id": pid, "name": strip_null_bytes((body.name or "").strip()), "parent_id": str(body.parent_id) if body.parent_id else None}
        if not data["name"]:
            raise HTTPException(status_code=400, detail="Folder name is required")
        response = supabase.table("folders").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create folder")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/folders/{folder_id}", response_model=FolderResponse)
def get_folder(folder_id: UUID):
    """Get a single folder by id."""
    supabase = require_supabase()
    try:
        response = supabase.table("folders").select("*").eq("id", str(folder_id)).limit(1).execute()
        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Folder not found")
        return rows[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/folders/{folder_id}", response_model=FolderResponse)
def rename_folder(folder_id: UUID, body: FolderRenameRequest):
    """Rename a folder."""
    supabase = require_supabase()
    name = strip_null_bytes((body.name or "").strip())
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    try:
        response = supabase.table("folders").update({"name": name}).eq("id", str(folder_id)).execute()
        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Folder not found")
        return rows[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/folders/{folder_id}/move", response_model=FolderResponse)
def move_folder(folder_id: UUID, body: FolderMoveRequest):
    """Move a folder under another parent (or root if parent_id null)."""
    supabase = require_supabase()
    try:
        # Prevent moving folder under itself or a descendant
        target_id = str(body.parent_id) if body.parent_id else None
        if target_id and target_id == str(folder_id):
            raise HTTPException(status_code=400, detail="Cannot move folder inside itself")
        if target_id:
            current = target_id
            while current:
                r = supabase.table("folders").select("parent_id").eq("id", current).limit(1).execute()
                rows = r.data or []
                if not rows:
                    break
                if rows[0].get("parent_id") == str(folder_id):
                    raise HTTPException(status_code=400, detail="Cannot move folder inside a descendant")
                current = rows[0].get("parent_id")
        updates = {"parent_id": target_id}
        response = supabase.table("folders").update(updates).eq("id", str(folder_id)).execute()
        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Folder not found")
        return rows[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(folder_id: UUID):
    """Delete a folder only if it has no child folders and no files. For cascade delete, delete files/folders first."""
    supabase = require_supabase()
    if folder_has_children(supabase, str(folder_id)):
        raise HTTPException(
            status_code=400,
            detail="Folder is not empty. Move or delete files and subfolders first.",
        )
    try:
        supabase.table("folders").delete().eq("id", str(folder_id)).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _sanitize_strings_for_db(obj: object) -> object:
    """Recursively strip null bytes from strings (PostgreSQL text disallows \\u0000)."""
    if isinstance(obj, str):
        return strip_null_bytes(obj)
    if isinstance(obj, dict):
        return {k: _sanitize_strings_for_db(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_strings_for_db(v) for v in obj]
    return obj


@router.post("/", response_model=ContextSourceResponse, status_code=status.HTTP_201_CREATED)
def create_context_source(source: ContextSourceCreate):
    supabase = require_supabase()
    try:
        data = source.model_dump(exclude_none=True)
        data["project_id"] = str(data["project_id"])
        data = _sanitize_strings_for_db(data)
        response = supabase.table("context_sources").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create context source")
        return response.data[0]
    except Exception as e:
        # Pydantic validates the type field before we get here (422 Unprocessable Entity)
        # Database constraint errors would surface here as a generic exception
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

@router.post("/document", response_model=ContextSourceResponse, status_code=status.HTTP_201_CREATED)
def create_document_text(request: DocumentTextRequest):
    """Store a plain text document as a context source."""
    pid = _resolve_project_uuid(str(request.project_id)) or str(request.project_id)
    content = truncate_to_word_limit(strip_null_bytes(request.content))
    label = strip_null_bytes(request.label or "Document")

    supabase = require_supabase()
    data = {
        "project_id": pid,
        "type": "document",
        "label": label,
        "content": content,
        "permitted_specialists": request.permitted_specialists,
    }
    try:
        response = supabase.table("context_sources").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to store document")
        row = response.data[0]
        # Best-effort RAG ingestion (chunking + Pinecone)
        try:
            ingest_context_source(row)
        except Exception as e:
            logger.warning("RAG ingestion failed for text document %s: %s", row.get("id"), e)
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

def _is_image_file(content_type: str, filename: str) -> bool:
    """True if file is an image type we can extract text from."""
    ct = (content_type or "").strip().lower()
    if ct in IMAGE_EXTRACTION_MIMES or ct.startswith("image/"):
        return True
    fn = (filename or "").lower()
    return any(fn.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"))


@router.post("/document/extract-text")
async def extract_document_text(file: UploadFile = File(...)):
    """Extract text from a file for use in a single evaluation (e.g. proposal). Does not save to DB or run RAG."""
    file_bytes = await file.read()
    filename = strip_null_bytes(file.filename or "document")
    content_type = file.content_type or ""
    try:
        if filename.lower().endswith(".pdf") or content_type == "application/pdf":
            content_val = truncate_to_word_limit(extract_text_from_pdf(file_bytes))
        elif _is_image_file(content_type, filename):
            content_val = truncate_to_word_limit(extract_text_from_image(file_bytes, content_type or "image/png"))
        else:
            content_val = truncate_to_word_limit(file_bytes.decode("utf-8", errors="replace"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not extract text: {e}")
    return {"content": content_val, "label": filename}


@router.post("/document/upload", response_model=ContextSourceResponse, status_code=status.HTTP_201_CREATED)
async def upload_document_file(
    project_id: str = Form(...),
    file: UploadFile = File(...),
    label: Optional[str] = Form(None),
    permitted_specialists: Optional[str] = Form(None),
    folder_path: Optional[str] = Form(None),
    folder_id: Optional[str] = Form(None),
):
    """Upload a document (PDF, image, or text file). Extracts text for RAG (PDF and images via OCR/Vision). Stores file in Storage and metadata in DB."""
    pid = _resolve_project_uuid(project_id) or project_id
    if not pid:
        raise HTTPException(status_code=404, detail="Project not found")
    file_bytes = await file.read()
    filename = file.filename or "document"
    content_type = file.content_type or ""

    # Parse permitted_specialists
    specialists_value: object = "all"
    if permitted_specialists:
        try:
            parsed = json.loads(permitted_specialists)
            if isinstance(parsed, list):
                specialists_value = parsed
            elif parsed == "all":
                specialists_value = "all"
        except json.JSONDecodeError:
            specialists_value = "all"

    # Resolve folder_path from folder_id if needed
    resolved_folder_path = folder_path.strip() if folder_path and folder_path.strip() else None
    if folder_id and folder_id.strip() and not resolved_folder_path:
        supabase = require_supabase()
        resolved_folder_path = get_folder_path(supabase, folder_id.strip())
    if resolved_folder_path is not None:
        resolved_folder_path = strip_null_bytes(resolved_folder_path)

    # Extract text for content and RAG (best-effort)
    content_val = None
    try:
        if filename.lower().endswith(".pdf") or content_type == "application/pdf":
            content_val = truncate_to_word_limit(extract_text_from_pdf(file_bytes))
        elif _is_image_file(content_type, filename):
            content_val = truncate_to_word_limit(extract_text_from_image(file_bytes, content_type or "image/png"))
        else:
            content_val = truncate_to_word_limit(file_bytes.decode("utf-8", errors="replace"))
    except Exception as e:
        logger.warning("Text extraction failed for upload %s: %s", filename, e)
        content_val = None

    filename = strip_null_bytes(filename)
    label_safe = strip_null_bytes(label or filename)

    supabase = require_supabase()
    # Insert row first so we have document id for Storage path (company/{id}/drive/...)
    data = {
        "project_id": pid,
        "type": "document",
        "label": label_safe,
        "content": content_val,
        "permitted_specialists": specialists_value,
        "storage_path": None,
        "file_name": filename,
        "folder_path": resolved_folder_path,
        "folder_id": folder_id.strip() if folder_id and folder_id.strip() else None,
        "version": 1,
        "size_bytes": len(file_bytes),
        "mime_type": content_type or None,
    }
    try:
        response = supabase.table("context_sources").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to store document")
        row = response.data[0]
        source_id = str(row.get("id", ""))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    # Upload file to Supabase Storage bucket "Documents" (path: company/{pid}/drive/[{folder}/]{id}/{filename})
    try:
        storage_path = upload_document(pid, resolved_folder_path, filename, file_bytes, document_id=source_id)
        supabase.table("context_sources").update({"storage_path": strip_null_bytes(storage_path)}).eq("id", source_id).execute()
        row["storage_path"] = storage_path
    except Exception as e:
        logger.warning("Storage upload failed for document %s: %s", source_id, e)
        # Remove the row if we never stored the file so we don't have orphan metadata
        try:
            supabase.table("context_sources").delete().eq("id", source_id).execute()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage upload failed: {str(e)}",
        )

    # RAG ingestion (chunk + embed + Pinecone)
    try:
        ingest_context_source(row)
    except Exception as e:
        logger.warning("RAG ingestion failed for uploaded document %s: %s", source_id, e)

    return row

@router.post("/github", response_model=ContextSourceResponse, status_code=status.HTTP_201_CREATED)
def create_github_context(request: GitHubContextRequest):
    """Fetch a public GitHub repo, summarise its codebase with Claude, and store as a context source."""
    # Step 1: Parse the repo URL
    try:
        owner, repo = parse_repo_url(request.repo_url)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Step 2: Fetch file tree from GitHub
    try:
        tree = fetch_file_tree(owner, repo)
    except Exception as e:
        logger.error(f"GitHub API error for {owner}/{repo}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch repository: {e}"
        )

    # Step 3: Select important files and fetch their content
    selected_paths = select_important_files(tree)
    file_contents = fetch_file_contents(owner, repo, selected_paths)

    if not file_contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not fetch any file contents from the repository"
        )

    # Step 4: Summarise with Claude
    all_paths = [f["path"] for f in tree]
    try:
        summary = summarise_codebase(all_paths, file_contents)
    except Exception as e:
        logger.error(f"Claude summarisation failed for {owner}/{repo}: {e}")
        # Fallback: store a basic file tree listing instead of crashing
        summary = f"Codebase: {owner}/{repo}\n\nFile tree:\n" + "\n".join(all_paths[:100])

    # Step 5: Store as a codebase context source
    label = request.label or f"{owner}/{repo}"
    pid = _resolve_project_uuid(str(request.project_id)) or str(request.project_id)

    supabase = require_supabase()
    data = {
        "project_id": pid,
        "type": "codebase",
        "label": label,
        "content": summary,
        "permitted_specialists": request.permitted_specialists,
    }
    try:
        response = supabase.table("context_sources").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to store context source")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )


@router.get("/sources/{source_id}", response_model=ContextSourceResponse)
def get_context_source(source_id: UUID):
    """Get a single context source by id."""
    supabase = require_supabase()
    try:
        response = supabase.table("context_sources").select("*").eq("id", str(source_id)).limit(1).execute()
        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Context source not found")
        return rows[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/sources/{source_id}", response_model=ContextSourceResponse)
def rename_context_source(source_id: UUID, body: FileRenameRequest):
    """Rename a document (update label and/or file_name)."""
    supabase = require_supabase()
    try:
        response = supabase.table("context_sources").select("id, type, label, file_name, storage_path").eq("id", str(source_id)).limit(1).execute()
        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Context source not found")
        row = rows[0]
        if row.get("type") != "document":
            raise HTTPException(status_code=400, detail="Only documents can be renamed")
        updates = {}
        if body.title is not None:
            updates["label"] = strip_null_bytes(body.title)
        if body.file_name is not None:
            updates["file_name"] = strip_null_bytes(body.file_name)
        if not updates:
            return row
        updated = supabase.table("context_sources").update(updates).eq("id", str(source_id)).execute()
        return (updated.data or [row])[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/sources/{source_id}/move", response_model=ContextSourceResponse)
def move_context_source(source_id: UUID, body: FileMoveRequest):
    """Move a document to another folder. Use folder_id (preferred) or folder_path. Updates folder_id, folder_path, and storage path."""
    supabase = require_supabase()
    try:
        response = supabase.table("context_sources").select("*").eq("id", str(source_id)).limit(1).execute()
        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Context source not found")
        row = rows[0]
        if row.get("type") != "document":
            raise HTTPException(status_code=400, detail="Only documents can be moved")
        new_folder_path = (body.folder_path or "").strip() or None
        if new_folder_path is not None:
            new_folder_path = strip_null_bytes(new_folder_path)
        new_folder_id = str(body.folder_id) if body.folder_id else None
        if body.folder_id and not new_folder_path:
            new_folder_path = get_folder_path(supabase, str(body.folder_id))
            if new_folder_path is not None:
                new_folder_path = strip_null_bytes(new_folder_path)
        old_path = row.get("storage_path")
        file_name = row.get("file_name") or row.get("label") or "document"
        project_id = row.get("project_id")
        updates = {"folder_path": new_folder_path, "folder_id": new_folder_id}
        if old_path and project_id:
            parts = [str(project_id)]
            if new_folder_path:
                parts.append(new_folder_path.strip("/"))
            parts.append(file_name)
            new_storage_path = strip_null_bytes("project/" + "/".join(parts))
            try:
                move_document(old_path, new_storage_path)
                updates["storage_path"] = new_storage_path
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Storage move failed: {str(e)}")
        updated = supabase.table("context_sources").update(updates).eq("id", str(source_id)).execute()
        return (updated.data or [row])[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_context_source(source_id: UUID):
    """Delete a context source. If it has storage_path, removes file from Storage first."""
    supabase = require_supabase()
    try:
        response = supabase.table("context_sources").select("id, storage_path").eq("id", str(source_id)).limit(1).execute()
        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Context source not found")
        storage_path = rows[0].get("storage_path")
        if storage_path:
            delete_document(storage_path)
        supabase.table("context_sources").delete().eq("id", str(source_id)).execute()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
