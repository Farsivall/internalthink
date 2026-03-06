-- =============================================================================
-- Schema from new.md Section 2 — Database Schema
-- Three tables only. Apply via Supabase MCP (apply_migration) or Dashboard.
-- =============================================================================

-- projects — top-level workspace
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    slug TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- context_sources — documents/codebase attached to a project (type enforced at DB level)
-- content can be NULL for Drive files (file in Storage; content extracted for RAG later)
CREATE TABLE IF NOT EXISTS context_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('document', 'codebase')),
    label TEXT,
    content TEXT,
    permitted_specialists JSONB DEFAULT '"all"'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Drive-style file metadata
    storage_path TEXT,
    file_name TEXT,
    folder_path TEXT,
    uploaded_by UUID,
    version INT NOT NULL DEFAULT 1,
    size_bytes BIGINT,
    mime_type TEXT
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

-- project_chat_messages — chat thread per project (user + specialist messages)
CREATE TABLE IF NOT EXISTS project_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    text TEXT NOT NULL,
    thinking_process TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- folders — Drive-style hierarchy per project
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID NULL REFERENCES folders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_folders_project_parent ON folders(project_id, parent_id);

-- context_sources.folder_id added by migration add_folders_table (FK to folders.id)

-- document_chunks — RAG-ready chunks per context_sources row (for embedding later)
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_source_id UUID NOT NULL REFERENCES context_sources(id) ON DELETE CASCADE,
    version INT NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_document_chunks_source ON document_chunks(context_source_id, version, chunk_index);

-- persona_dimensions — scoring dimensions per persona (from personas.md)
CREATE TABLE IF NOT EXISTS persona_dimensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_name TEXT NOT NULL,
    dimension_name TEXT NOT NULL,
    base_weight NUMERIC(5,4) NOT NULL,
    notes TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE(persona_name, dimension_name)
);
CREATE INDEX IF NOT EXISTS idx_persona_dimensions_persona ON persona_dimensions(persona_name);

-- decision_persona_scores — per-decision, per-persona evaluation (0-100 dimensions, risks, evidence gaps)
CREATE TABLE IF NOT EXISTS decision_persona_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
    persona_name TEXT NOT NULL,
    total_score INT NOT NULL,
    dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
    what_would_change_my_mind JSONB NOT NULL DEFAULT '[]'::jsonb,
    high_structural_risk BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(decision_id, persona_name)
);
CREATE INDEX IF NOT EXISTS idx_decision_persona_scores_decision ON decision_persona_scores(decision_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_context_sources_project_id ON context_sources(project_id);
CREATE INDEX IF NOT EXISTS idx_context_sources_project_folder ON context_sources(project_id, folder_path) WHERE type = 'document';
CREATE INDEX IF NOT EXISTS idx_decisions_project_id ON decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_chat_messages_project_id ON project_chat_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_project_chat_messages_created_at ON project_chat_messages(created_at);
