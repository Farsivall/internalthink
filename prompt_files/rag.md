You are a senior backend/platform engineer.

We are building the document ingestion and retrieval pipeline for a Decision Intelligence platform. The system will support persona-based decision scoring using RAG.

IMPORTANT CONSTRAINTS

1. A codebase ingestion pipeline already exists and works correctly.
2. DO NOT modify, extend, or interfere with the codebase ingestion system.
3. Only implement ingestion for user-uploaded documents (PDF, DOCX, PPTX, TXT, MD).
4. Retrieval must always be company-isolated and secure.

Infrastructure already created:

Pinecone indexes:
- di-company-knowledge-dev
- di-domain-knowledge-dev

Supabase:
- Postgres database
- Storage bucket: "Documents"

Embedding model:
text-embedding-3-small

--------------------------------------------------

SYSTEM ARCHITECTURE

Supabase responsibilities:
- Store original documents
- Store metadata, folder hierarchy, and audit trail
- Enforce company-level security

Pinecone responsibilities:
- Store embeddings of document chunks
- Store chunk metadata
- Enable semantic retrieval for RAG

LLMs should NEVER receive entire documents.
Only retrieved chunks are passed to models.

--------------------------------------------------

PART 1 — DATABASE STRUCTURE (SUPABASE)

Create tables if they do not exist.

folders
- id (uuid)
- company_id (uuid)
- parent_folder_id (uuid, nullable)
- name (text)
- created_at
- created_by

documents
- id (uuid)
- company_id (uuid)
- folder_id (uuid)
- title (text)
- filename (text)
- mime_type (text)
- size_bytes (bigint)
- storage_path (text)
- version (integer)
- status (enum: uploading, uploaded, processing, ready, failed)
- checksum (text)
- created_at
- uploaded_by

document_versions
- id (uuid)
- document_id (uuid)
- company_id (uuid)
- version (integer)
- storage_path (text)
- checksum (text)
- created_at
- created_by

Enable Row Level Security so users can only access rows where company_id matches their organization.

--------------------------------------------------

PART 2 — DOCUMENT UPLOAD FLOW

Implement this upload flow.

Step 1 — Create document metadata

Insert row in documents with:
- id
- company_id
- folder_id
- title
- filename
- status = "uploading"
- version = 1

Step 2 — Upload file

Upload file to Supabase Storage bucket "Documents".

Storage path format:

company/{company_id}/drive/{folder_path}/{document_id}/{filename}

After upload update documents row:
- storage_path
- size_bytes
- checksum
- status = "uploaded"

Step 3 — Trigger ingestion worker

Set status = "processing"

--------------------------------------------------

PART 3 — TEXT EXTRACTION

The ingestion worker must extract text depending on file type.

PDF
- Extract text
- Preserve page numbers

DOCX
- Extract paragraphs
- Preserve headings if possible

PPTX
- Extract slide text
- Include slide numbers

TXT / MD
- Read raw text

--------------------------------------------------

PART 4 — CHUNKING

Split extracted text into chunks.

Rules:
- 300–800 tokens per chunk
- 50–100 token overlap
- Preserve structural boundaries where possible

Each chunk should include metadata fields:

- company_id
- document_id
- document_version
- chunk_id
- source_type
- page_number or slide_number
- section_heading
- title
- doc_type (if available)

--------------------------------------------------

PART 5 — PERSONA + DIMENSION TAGGING (ROUTING LAYER)

To make persona scoring reliable, each chunk must be tagged with persona and dimension metadata during ingestion.

This creates deterministic routing for retrieval.

Add metadata fields:

persona_tags (array)
dimension_tags (array)

Example personas:
- Financial
- Technical
- Legal
- BusinessDev
- Tax

Example dimensions include:
- Contract Lock-In
- Downside Severity
- Capital Intensity
- Market Opportunity
- Regulatory Exposure
- Reliability / Security

Tagging should use deterministic heuristics.

Example keyword rules:

Legal / Contract Lock-In
Trigger words:
termination
renewal
auto-renew
exclusivity
penalty
minimum term
assignment
change of control

Financial / Capital Intensity
Trigger words:
burn
runway
cash
capex
opex
budget
forecast

Technical / Reliability
Trigger words:
SLA
incident
outage
vulnerability
CVE
encryption
SOC2
authentication

If a chunk matches rules:
- assign persona_tags
- assign dimension_tags

Do not force tags if confidence is low.

--------------------------------------------------

PART 6 — EMBEDDINGS

Generate embeddings using:

text-embedding-3-small

--------------------------------------------------

PART 7 — STORE CHUNKS IN PINECONE

Insert vectors into index:

di-company-knowledge-dev

Record structure:

ID format

company:{company_id}|doc:{document_id}|v:{version}|chunk:{chunk_id}

Values

embedding vector

Metadata

{
  scope: "company",
  company_id,
  document_id,
  document_version,
  chunk_id,
  source_type,
  doc_type,
  page_number,
  section_heading,
  title,
  persona_tags,
  dimension_tags,
  chunk_text
}

chunk_text should be stored in metadata for MVP simplicity.

--------------------------------------------------

PART 8 — DOMAIN KNOWLEDGE INDEX

The index:

di-domain-knowledge-dev

is reserved for curated platform knowledge.

Examples:
- decision heuristics
- market benchmarks
- regulatory frameworks
- scoring guides

Domain records use metadata:

{
  scope: "domain",
  persona,
  dimension,
  source,
  chunk_text
}

Company documents must NEVER be inserted into this index.

--------------------------------------------------

PART 9 — DOCUMENT VERSIONING

If a document is updated:

1. Increment version
2. Create document_versions row
3. Re-ingest file
4. Store new vectors with updated document_version

Retrieval must default to latest version.

--------------------------------------------------

PART 10 — RETRIEVAL SERVICE

Create function:

retrieve_chunks({
  company_id,
  query,
  persona,
  dimension,
  top_k
})

Steps:

1. Query Pinecone index:
di-company-knowledge-dev

Filter:
company_id == company_id

If persona provided:
persona_tags contains persona

If dimension provided:
dimension_tags contains dimension

2. Query Pinecone index:
di-domain-knowledge-dev

Filter:
persona == persona
dimension == dimension

3. Merge results

Return:
- chunk_text
- document_id
- chunk_id
- page_number
- citations

--------------------------------------------------

PART 11 — SECURITY

Must enforce:

- company_id filter on all retrieval
- no cross-company document access
- no full document context passed to LLM
- only retrieved chunks used

--------------------------------------------------

DELIVERABLES

Provide:

- SQL migrations
- ingestion worker
- Pinecone integration
- tagging logic
- retrieval service
- upload API

DO NOT modify the existing codebase ingestion pipeline.