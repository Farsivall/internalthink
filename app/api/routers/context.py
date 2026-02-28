import logging
from fastapi import APIRouter, HTTPException, status, Query
from pydantic import ValidationError
from typing import List
from uuid import UUID
from app.schemas.context import ContextSourceCreate, ContextSourceResponse, GitHubContextRequest
from app.db.client import supabase
from app.services.github import parse_repo_url, fetch_file_tree, select_important_files, fetch_file_contents
from app.services.summariser import summarise_codebase

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/", response_model=List[ContextSourceResponse])
def get_context_sources(project_id: UUID = Query(...)):
    try:
        response = supabase.table("context_sources").select("*").eq("project_id", str(project_id)).order("created_at").execute()
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

@router.post("/", response_model=ContextSourceResponse, status_code=status.HTTP_201_CREATED)
def create_context_source(source: ContextSourceCreate):
    try:
        data = source.model_dump(exclude_none=True)
        # Convert UUID to string for Supabase client serialization
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
