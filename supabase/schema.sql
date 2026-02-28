-- =============================================================================
-- Schema from new.md Section 2 — Database Schema
-- Three tables only. Apply via Supabase MCP (apply_migration) or Dashboard.
-- =============================================================================

-- projects — top-level workspace
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- context_sources — documents/codebase attached to a project (type enforced at DB level)
CREATE TABLE IF NOT EXISTS context_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('document', 'codebase')),
    label TEXT,
    content TEXT NOT NULL,
    permitted_specialists JSONB DEFAULT '"all"'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- decisions — submitted question and full evaluation result
CREATE TABLE IF NOT EXISTS decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    specialist_responses JSONB NOT NULL DEFAULT '[]'::jsonb,
    conflict_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes on project_id for both context_sources and decisions
CREATE INDEX IF NOT EXISTS idx_context_sources_project_id ON context_sources(project_id);
CREATE INDEX IF NOT EXISTS idx_decisions_project_id ON decisions(project_id);
