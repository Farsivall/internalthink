#!/bin/sh
# Run from project root. Loads .env and starts the API on http://localhost:8000
# Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
cd "$(dirname "$0")"
. .venv/bin/activate 2>/dev/null || true
[ -f .env ] && set -a && . ./.env && set +a 2>/dev/null || true
exec python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
