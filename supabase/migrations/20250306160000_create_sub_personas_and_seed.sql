-- Sub-personas: dedicated table for subpersona definitions (e.g. Hydroelectric).
-- Persona_dimensions unchanged; list/install read from here and materialize into personas on install.

CREATE TABLE IF NOT EXISTS sub_personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    parent_slug TEXT NOT NULL,
    description TEXT,
    domain TEXT,
    subdomain TEXT,
    default_instructions TEXT,
    visibility TEXT NOT NULL DEFAULT 'shared_library' CHECK (visibility IN ('private', 'shared_library')),
    is_searchable BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sub_personas_slug ON sub_personas(slug);
CREATE INDEX IF NOT EXISTS idx_sub_personas_parent_slug ON sub_personas(parent_slug);

-- Remove any broken Hydroelectric row from personas so canonical definition is only in sub_personas
DELETE FROM personas WHERE slug = 'hydroelectric';

-- Seed Hydroelectric Power Specialist (hydropower.md §4)
INSERT INTO sub_personas (name, slug, parent_slug, domain, subdomain, description, default_instructions, visibility, is_searchable)
VALUES (
  'Hydroelectric Power Specialist',
  'hydroelectric',
  'technical',
  'energy',
  'hydroelectric',
  'A technical specialist focused on evaluating hydroelectric power projects, including hydrology, turbine systems, civil infrastructure, grid connection, construction risks, and operational reliability.',
  'Evaluate hydroelectric projects from a technical feasibility perspective. Consider hydrology variability, plant design, turbine selection, civil engineering complexity, grid interconnection constraints, sediment management, construction execution risk, and long-term operations and maintenance.',
  'shared_library',
  true
)
ON CONFLICT (slug) DO NOTHING;
