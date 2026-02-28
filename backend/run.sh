#!/bin/sh
# Run from project root: ./backend/run.sh
cd "$(dirname "$0")/.." 2>/dev/null && [ -f .env ] && export $(grep -v '^#' .env | xargs) 2>/dev/null
cd "$(dirname "$0")"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
