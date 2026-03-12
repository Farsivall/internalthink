We need to extend the current system to support reusable personas and subpersonas with their own domain knowledge ingestion.

Goal:
Create a new subpersona called "Hydroelectric Power Specialist" under the existing Technical persona. This subpersona should be able to ingest external domain PDFs (hydropower engineering knowledge) using the same ingestion pipeline we already use for company-uploaded documents.

This persona should also be stored in a shared persona registry so other companies can discover and add it, but it should NOT automatically appear in other companies’ workspaces unless they search for it and add it.

Key requirements:

1. Persona hierarchy
Add support for personas and subpersonas.

Example:
Technical (base persona)
└── Hydroelectric Power Specialist (subpersona)

Fields for personas table:
- id
- name
- slug
- type (base_persona | subpersona)
- parent_persona_id (nullable)
- description
- domain
- subdomain
- default_instructions
- created_by_company_id
- is_searchable
- visibility (private | shared_library)
- created_at

2. Company persona installation
Create a table that maps personas to companies that have added them.

company_personas table:
- id
- company_id
- persona_id
- status (active | archived)
- added_from_library (boolean)
- custom_instructions
- created_at

This allows a persona to exist globally but only appear in a company’s workspace when installed.

3. Persona library search
Implement a persona library search endpoint.

Behavior:
- Companies can search personas where visibility = shared_library
- Results should include persona metadata
- A company can click "Add Persona" to install it into their workspace
- This creates a row in company_personas

4. Hydroelectric Power Specialist persona
Create a seeded subpersona with the following configuration:

name: Hydroelectric Power Specialist
parent_persona: Technical
domain: energy
subdomain: hydroelectric

description:
A technical specialist focused on evaluating hydroelectric power projects, including hydrology, turbine systems, civil infrastructure, grid connection, construction risks, and operational reliability.

default_instructions:
Evaluate hydroelectric projects from a technical feasibility perspective. Consider hydrology variability, plant design, turbine selection, civil engineering complexity, grid interconnection constraints, sediment management, construction execution risk, and long-term operations and maintenance.

visibility: shared_library
is_searchable: true

5. Domain knowledge ingestion
Extend the existing PDF ingestion pipeline so that it can ingest external technical references for personas.

Current ingestion flow:
PDF → text extraction → chunking → metadata → embeddings → upsert to vector DB.

Add metadata fields:
- source_type (company_document | external_reference)
- persona_id
- domain
- subdomain
- topic
- source_name
- source_url
- document_type

External hydropower PDFs should be tagged like:

source_type: external_reference
domain: energy
subdomain: hydroelectric
persona: technical
subpersona: hydroelectric_specialist

6. Vector DB organization
Store persona knowledge in separate namespaces or via metadata filters.

Example namespaces:
- company_documents
- persona_domain_knowledge

During retrieval for the Hydroelectric Power Specialist persona:
Query both:
- company hydro documents
- hydroelectric domain knowledge documents

7. Retrieval behavior
When the Hydroelectric Power Specialist runs an analysis:

Retrieve:
- company project documents related to hydroelectric
- external hydroelectric technical knowledge

Merge results and pass them into the model as context.

8. Example external PDFs to ingest for this persona

These are examples of the type of documents that should be ingested:

- hydropower engineering manuals
- turbine selection guides
- run-of-river hydropower design reports
- dam and civil works engineering guides
- grid interconnection for hydropower plants
- sediment management in hydropower systems
- hydropower construction risk studies
- hydropower operations and maintenance guides
- small hydropower technical design manuals
- hydropower environmental engineering reports

Each document should be chunked and stored with source metadata.

9. UI requirements

Add a Persona Library page where users can:

- search personas
- see description and domain
- click "Add Persona to Workspace"

Only installed personas appear in a company’s decision analysis system.

10. Ensure backward compatibility

Existing personas and document ingestion must continue to work unchanged.
The new persona system should extend the current architecture rather than replacing it.

---

## Implementation note

- **Schema and seed:** `supabase/migrations/20250306140000_personas_and_company_personas.sql` creates `personas` and `company_personas` and seeds base personas + Hydroelectric Power Specialist (subpersona of Technical). Apply via Supabase MCP or Dashboard SQL editor.
- **Group chat:** Users can add the Hydroelectric specialist in project chat (it appears in the specialist list with the other Technical subpersona). The frontend uses the same specialist id `hydroelectric` as the backend.
- **Domain knowledge:** Seed hydro domain chunks with `PYTHONPATH=. python scripts/seed_domain_index.py` (see `scripts/domain_seed/`). Ingest external PDFs via the existing document pipeline; tag with `source_type: external_reference`, `domain: energy`, `subdomain: hydroelectric` when you extend ingestion.