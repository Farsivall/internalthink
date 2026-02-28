import re
import httpx
from typing import Optional

GITHUB_API_BASE = "https://api.github.com"

# File extensions to skip (binaries, images, lockfiles)
SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".bmp",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".zip", ".tar", ".gz", ".bz2", ".rar", ".7z",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".mp3", ".mp4", ".wav", ".avi", ".mov",
    ".pyc", ".pyo", ".class", ".o", ".so", ".dll", ".exe",
    ".lock",
}

# Exact filenames to skip
SKIP_FILES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
    "Pipfile.lock", "composer.lock", "Gemfile.lock", "Cargo.lock",
    ".DS_Store", "Thumbs.db",
}

# Directory prefixes to skip entirely
SKIP_DIRS = {
    "node_modules/", ".git/", "__pycache__/", ".venv/", "venv/",
    "dist/", "build/", ".next/", ".nuxt/", "coverage/",
    ".mypy_cache/", ".pytest_cache/", ".tox/",
}

# Priority 1: README and top-level docs
README_PATTERNS = re.compile(r"^(README|CONTRIBUTING|ARCHITECTURE|CHANGELOG)\.(md|txt|rst)$", re.IGNORECASE)

# Priority 2: Dependency manifests
MANIFEST_FILES = {
    "package.json", "requirements.txt", "pyproject.toml", "setup.py", "setup.cfg",
    "Cargo.toml", "go.mod", "go.sum", "Gemfile", "pom.xml", "build.gradle",
    "build.gradle.kts", "composer.json", "mix.exs", "Makefile",
}

# Priority 4: Config files
CONFIG_FILES = {
    ".env.example", "docker-compose.yml", "docker-compose.yaml",
    "Dockerfile", "Procfile", "vercel.json", "netlify.toml",
    "tsconfig.json", "next.config.js", "next.config.mjs", "next.config.ts",
    "vite.config.ts", "vite.config.js", "webpack.config.js",
}

# Common source directories
SOURCE_DIRS = {"src/", "app/", "lib/", "pkg/", "cmd/", "internal/", "api/", "server/", "backend/"}

MAX_FILE_SIZE = 100_000  # 100KB
MAX_FILES = 20
MAX_CONTENT_LENGTH = 5000  # chars per file


def _get_headers(token: Optional[str] = None) -> dict:
    headers = {"Accept": "application/vnd.github.v3+json"}
    tok = token
    if not tok:
        try:
            from app.core.config import settings
            tok = settings.github_token
        except Exception:
            pass
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    return headers


def parse_repo_url(url: str) -> tuple[str, str]:
    """Parse a GitHub URL into (owner, repo)."""
    url = url.strip().rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]

    # Match https://github.com/owner/repo or github.com/owner/repo
    match = re.match(r"(?:https?://)?github\.com/([^/]+)/([^/]+)", url)
    if not match:
        raise ValueError(f"Invalid GitHub URL: {url}")

    owner, repo = match.group(1), match.group(2)
    if not owner or not repo:
        raise ValueError(f"Invalid GitHub URL: {url}")

    return owner, repo


def fetch_file_tree(owner: str, repo: str, token: Optional[str] = None) -> list[dict]:
    """Fetch the full file tree from a GitHub repo.

    Returns a list of dicts with 'path' and 'size' keys (blobs only).
    """
    headers = _get_headers(token)

    # Get the default branch
    repo_resp = httpx.get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}", headers=headers, timeout=15)
    repo_resp.raise_for_status()
    default_branch = repo_resp.json()["default_branch"]

    # Fetch recursive tree
    tree_resp = httpx.get(
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1",
        headers=headers,
        timeout=30,
    )
    tree_resp.raise_for_status()

    tree_data = tree_resp.json().get("tree", [])
    # Filter to blobs (files) only, exclude truncated trees
    return [
        {"path": item["path"], "size": item.get("size", 0)}
        for item in tree_data
        if item["type"] == "blob"
    ]


def _should_skip(path: str) -> bool:
    """Check if a file should be skipped based on path/extension."""
    # Skip known directories
    for skip_dir in SKIP_DIRS:
        if path.startswith(skip_dir) or f"/{skip_dir}" in path:
            return True

    filename = path.rsplit("/", 1)[-1]

    # Skip known files
    if filename in SKIP_FILES:
        return True

    # Skip by extension
    for ext in SKIP_EXTENSIONS:
        if filename.endswith(ext):
            return True

    return False


def _get_depth(path: str) -> int:
    """Return the directory depth of a path."""
    return path.count("/")


def select_important_files(tree: list[dict]) -> list[str]:
    """Select 10-20 architecturally significant files from a file tree.

    Priority order:
    1. README and top-level docs
    2. Dependency manifests
    3. Files in top two levels of source directories
    4. Config files
    """
    # Filter out files to skip and oversized files
    candidates = [f for f in tree if not _should_skip(f["path"]) and f["size"] <= MAX_FILE_SIZE]

    selected: list[str] = []
    remaining: list[dict] = []

    # Priority 1: README and top-level docs
    for f in candidates:
        filename = f["path"].rsplit("/", 1)[-1]
        if README_PATTERNS.match(filename) and _get_depth(f["path"]) == 0:
            selected.append(f["path"])
        else:
            remaining.append(f)

    # Priority 2: Dependency manifests
    still_remaining = []
    for f in remaining:
        filename = f["path"].rsplit("/", 1)[-1]
        if filename in MANIFEST_FILES and _get_depth(f["path"]) <= 1:
            if len(selected) < MAX_FILES:
                selected.append(f["path"])
            else:
                still_remaining.append(f)
        else:
            still_remaining.append(f)
    remaining = still_remaining

    # Priority 3: Files in top two levels of source directories (or root)
    still_remaining = []
    for f in remaining:
        depth = _get_depth(f["path"])
        in_source_dir = any(f["path"].startswith(sd) for sd in SOURCE_DIRS)
        # Top two levels: depth 0-1 for root, or depth 1-2 within a source dir
        if (depth <= 1) or (in_source_dir and depth <= 2):
            if len(selected) < MAX_FILES:
                selected.append(f["path"])
            else:
                still_remaining.append(f)
        else:
            still_remaining.append(f)
    remaining = still_remaining

    # Priority 4: Config files
    for f in remaining:
        if len(selected) >= MAX_FILES:
            break
        filename = f["path"].rsplit("/", 1)[-1]
        if filename in CONFIG_FILES:
            selected.append(f["path"])

    return selected[:MAX_FILES]


def fetch_file_contents(
    owner: str, repo: str, file_paths: list[str], token: Optional[str] = None
) -> dict[str, str]:
    """Fetch raw content for selected files from a GitHub repo.

    Returns {path: content} dict. Truncates each file to MAX_CONTENT_LENGTH chars.
    """
    headers = _get_headers(token)
    headers["Accept"] = "application/vnd.github.v3.raw"
    contents: dict[str, str] = {}

    for path in file_paths:
        try:
            resp = httpx.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}",
                headers=headers,
                timeout=15,
            )
            resp.raise_for_status()
            text = resp.text[:MAX_CONTENT_LENGTH]
            contents[path] = text
        except Exception:
            # Skip files that fail to fetch
            continue

    return contents
