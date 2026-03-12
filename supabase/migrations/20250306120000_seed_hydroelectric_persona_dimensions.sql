-- Seed persona_dimensions for Hydroelectric (same five dimensions as Technical, from personas.md)
INSERT INTO persona_dimensions (persona_name, dimension_name, base_weight, notes, sort_order)
VALUES
  ('Hydroelectric', 'Scalability', 0.20, 'Score based on ability to handle 2-5x projected load without major architecture changes; penalize monoliths or outdated frameworks.', 0),
  ('Hydroelectric', 'Execution Complexity', 0.20, 'Consider dependencies, team skill gaps, external APIs; penalize projects with >3 high-risk integration points.', 1),
  ('Hydroelectric', 'Technical Debt', 0.20, 'Include unrefactored modules, outdated dependencies, and lack of tests; penalize if >50% of codebase is risky.', 2),
  ('Hydroelectric', 'Reliability / Security', 0.25, 'Catastrophic if ignored; score low if past incidents, missing monitoring, or critical vulnerabilities exist.', 3),
  ('Hydroelectric', 'Team Fit', 0.15, 'Score based on team experience, capacity, and ability to execute; penalize if skill gaps exist or knowledge transfer is needed.', 4)
ON CONFLICT (persona_name, dimension_name) DO NOTHING;
