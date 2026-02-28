# Supabase MCP Setup

Use the Supabase MCP to get your project URL and update `.env`.

## 1. Get project URL (Supabase MCP)

In Cursor, with the Supabase MCP enabled, run:

- **`get_project_url`** — returns your project API URL (e.g. `https://<project-ref>.supabase.co`)

## 2. Update .env

```bash
# After getting URL from MCP:
python scripts/set_supabase_env.py https://YOUR_PROJECT_REF.supabase.co
```

For the **service role key** (required for backend): get it from [Supabase Dashboard](https://supabase.com/dashboard) → your project → Settings → API → `service_role` (secret).

```bash
python scripts/set_supabase_env.py https://YOUR_PROJECT_REF.supabase.co YOUR_SERVICE_ROLE_KEY
```

## 3. Run the app

```bash
./run.sh
# or: uvicorn app.main:app --reload --port 8000
```

Frontend: `cd frontend && npm run dev` (default port 5173)
