import json
import logging
from fastapi import APIRouter, HTTPException, status, Query, UploadFile, File, Form
from pydantic import ValidationError
from typing import List, Optional
from uuid import UUID
from app.schemas.context import (
    ContextSourceCreate, ContextSourceResponse, GitHubContextRequest, DocumentTextRequest,
)
from app.db.client import get_supabase
from app.services.github import parse_repo_url, fetch_file_tree, select_important_files, fetch_file_contents
from app.services.summariser import summarise_codebase
from app.services.documents import extract_text_from_pdf, truncate_to_word_limit

logger = logging.getLogger(__name__)

router = APIRouter()

def _resolve_project_uuid(project_id: str) -> str | None:
    """Resolve slug (proj-1) or UUID to project UUID."""
    try:
        return str(UUID(project_id))
    except ValueError:
        pass
    try:
        supabase = get_supabase()
        if not supabase:
            return None
        r = supabase.table("projects").select("id").eq("slug", project_id).limit(1).execute()
        if r.data and len(r.data) > 0:
            return str(r.data[0]["id"])
        return None
    except Exception:
        return None


@router.get("/", response_model=List[ContextSourceResponse])
def get_context_sources(project_id: str = Query(...)):
    """Get context sources for a project. project_id can be slug (proj-1) or UUID."""
    pid = _resolve_project_uuid(project_id)
    if not pid:
        return []
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        response = supabase.table("context_sources").select("*").eq("project_id", pid).order("created_at").execute()
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

@router.post("/", response_model=ContextSourceResponse, status_code=status.HTTP_201_CREATED)
def create_context_source(source: ContextSourceCreate):
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        data = source.model_dump(exclude_none=True)
        data["project_id"] = str(data["project_id"])
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
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    content = truncate_to_word_limit(request.content)
    label = request.label or "Document"
    data = {
        "project_id": str(request.project_id),
        "type": "document",
        "label": label,
        "content": content,
        "permitted_specialists": json.dumps(request.permitted_specialists),
    }

    try:
        response = supabase.table("context_sources").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to store document")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

@router.post("/document/upload", response_model=ContextSourceResponse, status_code=status.HTTP_201_CREATED)
async def upload_document_file(
    project_id: str = Form(...),
    file: UploadFile = File(...),
    label: Optional[str] = Form(None),
    permitted_specialists: Optional[str] = Form(None),
):
    """Upload a PDF or text file, extract text, and store as a document context source."""
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    file_bytes = await file.read()

    # Detect file type and extract text
    filename = file.filename or ""
    content_type = file.content_type or ""

    if filename.lower().endswith(".pdf") or content_type == "application/pdf":
        try:
            text = extract_text_from_pdf(file_bytes)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to read PDF: {str(e)}"
            )
    else:
        # Plain text file
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is not valid UTF-8 text. Please upload a PDF or plain text file."
            )

    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File contains no extractable text. Please paste the content manually instead."
        )

    text = truncate_to_word_limit(text)

    # Parse permitted_specialists from form string
    specialists_value = "all"
    if permitted_specialists:
        try:
            parsed = json.loads(permitted_specialists)
            if isinstance(parsed, list):
                specialists_value = parsed
            elif parsed == "all":
                specialists_value = "all"
        except json.JSONDecodeError:
            specialists_value = "all"

    data = {
        "project_id": project_id,
        "type": "document",
        "label": label or filename or "Uploaded Document",
        "content": text,
        "permitted_specialists": json.dumps(specialists_value),
    }

    try:
        response = supabase.table("context_sources").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to store document")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

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
    data = {
        "project_id": str(request.project_id),
        "type": "codebase",
        "label": label,
        "content": summary,
    }

    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
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
