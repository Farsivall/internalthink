# Running InternalThink

## 1. Start the backend (required for chat)

From project root:

```bash
./run.sh
```

Or manually:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend loads `.env` for `ANTHROPIC_API_KEY` and Supabase keys.

## 2. Start the frontend

```bash
cd frontend && npm run dev
```

Vite runs on port 5173 and proxies `/api` to the backend at port 8000.

## 3. Check

- Backend health: http://localhost:8000/api/health
- Frontend: http://localhost:5173

Chat uses Anthropic for AI and Supabase (or mock) for context. Ensure `ANTHROPIC_API_KEY` is set in `.env`.
