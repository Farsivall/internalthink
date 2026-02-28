# Applying the schema (from new.md Section 2)

The schema is defined in **new.md Section 2** and implemented in **`supabase/schema.sql`**. It has three tables only: `projects`, `context_sources`, `decisions`, plus indexes on `project_id`.

---

## Via Supabase MCP

Call **`apply_migration`** with:

- **name:** `loaf_initial_schema_from_new_md`
- **query:** contents of `supabase/schema.sql`

Or use **`execute_sql`** with the same SQL as the `query` parameter.

---

## Via Supabase Dashboard

1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor**.
3. Paste and run the contents of `supabase/schema.sql`.

---

## Via Supabase CLI

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

(Uses migrations in `supabase/migrations/`.)
