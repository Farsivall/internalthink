#!/bin/sh
# Run from project root. Loads .env and starts the API.
cd "$(dirname "$0")"
[ -f .env ] && export $(grep -v '^#' .env | xargs) 2>/dev/null
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
