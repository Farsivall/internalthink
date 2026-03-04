# Supabase MCP Setup

The app uses **Supabase by default** when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. Use the Supabase MCP to get your project URL and apply migrations.

## 1. Get project URL (Supabase MCP)

In Cursor, with the Supabase MCP enabled, call:

- **`get_project_url`** — returns your project API URL (e.g. `https://<project-ref>.supabase.co`)

Add to `.env`:

```
SUPABASE_URL=<url from MCP>
SUPABASE_SERVICE_ROLE_KEY=<from Dashboard → Settings → API → service_role>
```

Optional: run `python scripts/set_supabase_env.py https://YOUR_PROJECT_REF.supabase.co YOUR_SERVICE_ROLE_KEY` to update `.env`.

## 2. Apply schema (Supabase MCP)

Apply the schema via MCP **`apply_migration`** with the SQL from `supabase/schema.sql`, or run it in the Supabase SQL Editor. Tables: `projects`, `context_sources`, `decisions`, `project_chat_messages`.

## 3. In-memory only (optional)

To disable Supabase and use in-memory store (data lost on restart), set in `.env`:

```
USE_IN_MEMORY_ONLY=1
```

## 4. Run the app

```bash
./run.sh
# or: uvicorn app.main:app --reload --port 8000
```

Frontend: `cd frontend && npm run dev` (default port 5173)
