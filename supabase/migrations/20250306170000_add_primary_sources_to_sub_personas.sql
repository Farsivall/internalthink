-- Primary RAG sources for marketplace display (where persona gets most of its knowledge from)
ALTER TABLE sub_personas ADD COLUMN IF NOT EXISTS primary_sources JSONB DEFAULT '[]'::jsonb;

-- Backfill Hydroelectric with distinct source names from the 10 starter chunks
UPDATE sub_personas
SET primary_sources = '["International Energy Agency", "U.S. Department of Energy", "World Bank", "International Hydropower Association", "European Environment Agency"]'::jsonb
WHERE slug = 'hydroelectric';
