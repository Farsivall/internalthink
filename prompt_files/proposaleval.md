You are a senior full-stack engineer and platform architect.

This spec extends the **Evaluate a Decision** flow (the "+" action): users can attach documents—e.g. from a proposal (pitch deck, slide deck, PDF)—to support the decision and get persona-aware feedback. The evaluation can use those documents plus company/domain context.

Context
We already have:
- Supabase Storage bucket: "Documents"
- Supabase Postgres tables for drive-like file management (folders, documents, document_versions) with RLS by company_id
- Pinecone indexes:
  - di-company-knowledge-dev
  - di-domain-knowledge-dev
- A working codebase ingestion pipeline (DO NOT MODIFY OR TOUCH ANYTHING RELATED TO CODEBASE INGESTION)
- A document ingestion pipeline for PDFs/DOCX/PPTX/TXT/MD that:
  - extracts text
  - chunks it
  - embeds chunks
  - stores embeddings + metadata in Pinecone (di-company-knowledge-dev)
  - stores chunk_text in Pinecone metadata
  - applies persona_tags + dimension_tags routing at ingestion time

Goal
Extend the “Evaluate a Decision” flow so the platform can also evaluate PROPOSALS (e.g., pitch decks, slide decks, PDFs, docs) and produce AI comments/feedback that:
1) are grounded in the proposal content (and optionally the company context)
2) are persona-aware (Financial, Technical, Legal, BusinessDev, Tax)
3) produce structured feedback + scores + evidence gaps
4) are saved back into Supabase as a new document (like Google Drive)
5) are chunked + embedded into Pinecone as well (so future decisions can reference these AI evaluations)

Key requirement:
The AI evaluation output must be stored as a first-class document (a generated artifact) and treated like any other uploaded document for RAG: it must be saved in Supabase Storage, have a documents row, and have chunks embedded into di-company-knowledge-dev.

Non-goals
- No changes to the codebase ingestion pipeline
- No fancy agentic systems; keep this deterministic and auditable
- No external browsing; only use proposal content + retrieved company/domain chunks
- Do not store full original proposal text in Postgres (except metadata); only chunks in Pinecone

------------------------------------------------------------
PART 1 — Data model changes (Supabase)

Add support for generated documents (“AI Evaluations”).

Update documents table:
- add column: source_origin (enum: "user_upload", "ai_generated") default "user_upload"
- add column: related_decision_id (uuid, nullable)
- add column: related_document_id (uuid, nullable) // the proposal being evaluated
- add column: doc_kind (text) // e.g. "proposal", "proposal_evaluation", "decision", "decision_analysis"

Add new table proposal_evaluations (recommended):
- id (uuid)
- company_id (uuid)
- decision_id (uuid, nullable) // proposals may be evaluated without a formal decision
- proposal_document_id (uuid)
- evaluation_document_id (uuid) // points to the generated doc saved in documents table
- created_by (uuid)
- created_at
- status (enum: "processing", "ready", "failed")
- error_message (text, nullable)

Ensure RLS on these tables by company_id.

------------------------------------------------------------
PART 2 — Evaluate Proposal API

Implement endpoint/service:
evaluate_proposal({
  company_id,
  proposal_document_id,
  decision_id? (optional),
  persona_list (default all 5),
  mode: "proposal_only" | "proposal_plus_company_context"
})

Flow:
1) Fetch proposal document metadata from Supabase (documents row) and verify access via RLS.
2) Retrieve proposal chunks from Pinecone (di-company-knowledge-dev) filtered by:
   - company_id
   - document_id == proposal_document_id
   - document_version == latest
3) If mode == proposal_plus_company_context:
   - additionally retrieve relevant company context chunks from di-company-knowledge-dev using a query formed from proposal summary + decision context
4) Retrieve persona-specific domain chunks from di-domain-knowledge-dev filtered by persona + dimension.

Then call the LLM to generate structured feedback:
- For each persona:
  - dimension scores (0–100) using persona base parameters (dimensions + weights + notes)
  - key risks
  - trade-offs
  - evidence gaps
  - “what would change my mind”
  - citations referencing proposal chunks (document_id, chunk_id, page/slide)
- Overall summary:
  - top strengths
  - top concerns
  - prioritized next steps
  - recommended revisions to the proposal (actionable)

Output MUST be JSON (for storage + UI).

------------------------------------------------------------
PART 3 — Save the AI Evaluation as a Document (Supabase + Storage)

After evaluation JSON is produced:

1) Create a new documents row:
- company_id
- folder_id (e.g. a folder called "Evaluations" or same folder as the proposal)
- title (e.g. "Evaluation — {proposal_title} — {YYYY-MM-DD}")
- filename (e.g. "evaluation_{proposal_document_id}.json" or ".md")
- mime_type ("application/json" or "text/markdown")
- status="uploading"
- version=1
- source_origin="ai_generated"
- related_decision_id=decision_id (if present)
- related_document_id=proposal_document_id
- doc_kind="proposal_evaluation"

2) Upload the evaluation content to Supabase Storage bucket "Documents" at:
company/{company_id}/drive/{folder_path}/{evaluation_document_id}/{filename}

3) Update the documents row:
- storage_path
- size_bytes
- checksum
- status="uploaded"

4) Trigger the existing document ingestion pipeline on the generated evaluation document (treat it like a normal document):
- status -> processing -> ready
- chunk + embed into Pinecone (di-company-knowledge-dev)
- apply persona_tags + dimension_tags (should naturally tag based on content)

The result: AI evaluation becomes retrievable evidence for future decisions.

------------------------------------------------------------
PART 4 — Proposal ingestion considerations (PPTX/PDF)

Ensure PPTX extraction keeps slide numbers.
Ensure PDF extraction keeps page numbers.
When chunking proposals, try to split by slide boundaries and section headings where possible.

Also add metadata fields to Pinecone for proposal chunks:
- doc_kind: "proposal"
- proposal_id: proposal_document_id
- slide_number/page_number
This improves citation UX.

------------------------------------------------------------
PART 5 — UI/UX hooks (minimal)

Add an action in the “Evaluate Decision” screen:
- “Evaluate Proposal” (select an existing proposal document OR upload a new one)
- After evaluation completes, show:
  - persona breakdown
  - overall recommendations
  - links to citations (page/slide)
  - link to generated evaluation document stored in Drive

------------------------------------------------------------
DELIVERABLES

Provide:
1) SQL migrations for new columns/table + RLS updates
2) evaluate_proposal service implementation
3) logic to save AI evaluation as a document in Supabase Storage + metadata row
4) trigger ingestion on the generated evaluation doc so it ends up chunked/embedded in Pinecone
5) no changes to codebase ingestion pipeline (explicitly confirm)

Make reasonable assumptions and implement the MVP cleanly without asking clarifying questions.