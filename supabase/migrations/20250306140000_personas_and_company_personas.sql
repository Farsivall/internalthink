-- Persona registry and company installation (prompt_files/hydropower.md)
-- Apply via Supabase MCP: apply_migration with this file, or run in Dashboard SQL editor.
-- Enables optional subpersonas (e.g. Hydroelectric) and company_personas for "Add to workspace".

-- Personas: base personas and subpersonas (shared library)
CREATE TABLE IF NOT EXISTS personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('base_persona', 'subpersona')),
    parent_persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
    description TEXT,
    domain TEXT,
    subdomain TEXT,
    default_instructions TEXT,
    created_by_company_id UUID,
    is_searchable BOOLEAN NOT NULL DEFAULT true,
    visibility TEXT NOT NULL DEFAULT 'shared_library' CHECK (visibility IN ('private', 'shared_library')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_personas_parent ON personas(parent_persona_id);
CREATE INDEX IF NOT EXISTS idx_personas_visibility ON personas(visibility);
CREATE INDEX IF NOT EXISTS idx_personas_slug ON personas(slug);

-- Company persona installation: which personas are active in a company workspace
-- company_id can reference your org/tenant (add companies table later if needed)
CREATE TABLE IF NOT EXISTS company_personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    added_from_library BOOLEAN NOT NULL DEFAULT false,
    custom_instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, persona_id)
);
CREATE INDEX IF NOT EXISTS idx_company_personas_company ON company_personas(company_id);
CREATE INDEX IF NOT EXISTS idx_company_personas_persona ON company_personas(persona_id);

-- Seed base personas (match existing SPECIALISTS: Legal, Financial, Technical, BD, Tax)
INSERT INTO personas (id, name, slug, type, parent_persona_id, description, visibility, is_searchable)
VALUES
  ('a0000001-0001-4000-8000-000000000001', 'Legal', 'legal', 'base_persona', NULL, 'Legal specialist for regulatory, compliance, and contractual implications.', 'shared_library', true),
  ('a0000001-0001-4000-8000-000000000002', 'Financial', 'financial', 'base_persona', NULL, 'Financial specialist for runway, burn, revenue impact, and financial risk.', 'shared_library', true),
  ('a0000001-0001-4000-8000-000000000003', 'Technical', 'technical', 'base_persona', NULL, 'Technical specialist for feasibility, architecture, performance, reliability, and technical debt.', 'shared_library', true),
  ('a0000001-0001-4000-8000-000000000004', 'Business Development', 'bd', 'base_persona', NULL, 'Business Development specialist for distribution, partnerships, and market positioning.', 'shared_library', true),
  ('a0000001-0001-4000-8000-000000000005', 'Tax', 'tax', 'base_persona', NULL, 'Tax specialist for R&D credits, VAT, and international tax exposure.', 'shared_library', true)
ON CONFLICT (slug) DO NOTHING;

-- Seed Hydroelectric Power Specialist as subpersona of Technical (hydropower.md §4)
INSERT INTO personas (id, name, slug, type, parent_persona_id, domain, subdomain, description, default_instructions, visibility, is_searchable)
SELECT
  'a0000001-0001-4000-8000-000000000006',
  'Hydroelectric Power Specialist',
  'hydroelectric',
  'subpersona',
  p.id,
  'energy',
  'hydroelectric',
  'A technical specialist focused on evaluating hydroelectric power projects, including hydrology, turbine systems, civil infrastructure, grid connection, construction risks, and operational reliability.',
  'Evaluate hydroelectric projects from a technical feasibility perspective. Consider hydrology variability, plant design, turbine selection, civil engineering complexity, grid interconnection constraints, sediment management, construction execution risk, and long-term operations and maintenance.',
  'shared_library',
  true
FROM personas p WHERE p.slug = 'technical' LIMIT 1
ON CONFLICT (slug) DO NOTHING;
