#!/bin/sh
# Run from project root. Loads .env and starts the API on http://localhost:8000
cd "$(dirname "$0")"
. .venv/bin/activate 2>/dev/null || true
exec python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
