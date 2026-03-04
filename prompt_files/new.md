# Loaf — Backend Technical Specification

	⁠This document describes what the backend needs to do, the key technical decisions that have already been made, and the constraints to work within. Implementation details are left to the coding agent. Build and test each section before moving to the next.

---

## Overview

Loaf is an AI-powered decision consulting platform. Users create projects, attach context (documents, Slack excerpts, codebase snippets), submit a business decision, and receive structured analysis from five specialist AI personas simultaneously. The backend orchestrates this entire flow.

*Core stack decisions (do not change these):*
•⁠  ⁠Python + FastAPI for the backend
•⁠  ⁠SQLite for local persistence (via SQLAlchemy)
•⁠  ⁠Anthropic Claude API (⁠ claude-sonnet-4-20250514 ⁠) for all AI calls
•⁠  ⁠All five specialist calls must run in parallel, not sequentially
•⁠  ⁠The frontend is Next.js and will call this backend over REST — CORS must be configured for ⁠ localhost:3000 ⁠

---

## Section 1 — Project Setup

Set up a Python FastAPI project with a clean folder structure. Use a virtual environment and a ⁠ .env ⁠ file for secrets. The app needs the following environment variables: ⁠ ANTHROPIC_API_KEY ⁠, optionally ⁠ GITHUB_TOKEN ⁠, and optionally ⁠ ELEVENLABS_API_KEY ⁠.

Expose a ⁠ /api/health ⁠ endpoint that confirms all required environment variables are present. This is the first thing to test before building anything else.

*Folder structure to aim for:* separate folders for database models, persona definitions, the decision engine, Pydantic schemas, and API routers. Keep concerns cleanly separated so each section of this spec maps to its own module.

*✅ Test:* Server starts, ⁠ /api/health ⁠ returns OK with confirmation that API keys are loaded.

---

## Section 2 — Database Schema

Use SQLite with SQLAlchemy. The database file lives in the project root as ⁠ loaf.db ⁠ and is created automatically on first run — no setup steps required.

Three tables:

*⁠ projects ⁠* — top-level workspace. Fields: id (UUID), name, description, created_at.

*⁠ context_sources ⁠* — all context attached to a project. Fields: id, project_id (FK), type (must be one of: ⁠ document ⁠, ⁠ codebase ⁠), label (e.g. "Pitch Deck", "GitHub Repo"), content (full extracted text), created_at. Enforce the type constraint at the model level.

*⁠ decisions ⁠* — a submitted question and its full evaluation result. Fields: id, project_id (FK), question, specialist_responses (JSON), conflict_summary (JSON), created_at.

*✅ Test:* Run the app and confirm ⁠ loaf.db ⁠ is created with all three tables. Insert and delete a test row from each table. Confirm the type constraint on ⁠ context_sources ⁠ rejects anything outside ⁠ document ⁠ and ⁠ codebase ⁠.

---

## Section 3 — Context Ingestion API

Two resources to expose:

*Projects* — ⁠ GET /api/projects ⁠ returns all projects. ⁠ POST /api/projects ⁠ creates one, requiring a name and optional description.

*Context Sources* — ⁠ POST /api/context ⁠ attaches a context source to a project (requires project_id, type, content; label is optional). ⁠ GET /api/context?project_id=xxx ⁠ returns all sources for a project ordered by creation time.

Validate all inputs with Pydantic. Return appropriate HTTP status codes (201 for creation, 400 for bad input, 500 for database errors).

*✅ Test:* Create a project, attach one source of each type (document, codebase), fetch them back. Confirm the type validator rejects anything outside the two allowed values.

---

## Section 4 — Document Context

Documents are the primary context source and the most important one. They represent the formal knowledge base of the project — everything the team has written down about the product, the business, the finances, and the strategy. Every specialist reads documents. Tax reads documents exclusively and nothing else.

### What Counts as a Document

Useful documents include product specs or one-pagers, pitch decks, financial models or P&L summaries, legal agreements or terms of service, market research, and investor updates. Users should be guided to attach whatever they would hand to a new advisor joining the project cold.

### How Documents Arrive

Two supported input methods for the hackathon:

*Plain text paste* — the user pastes content directly into a text field with an optional label (e.g. "Pitch Deck", "Q3 Financial Summary"). Store immediately as a context source with ⁠ type: document ⁠. No processing needed.

*File upload (PDF or plain text)* — the user uploads a file. The backend must extract the raw text before storing. For plain text files this is trivial. For PDFs, use the ⁠ pypdf ⁠ library to extract text page by page and concatenate into a single string. Store the extracted text as the content of the context source — never the raw binary. If text extraction fails or returns empty content (e.g. a scanned image PDF with no selectable text), return a clear error telling the user to paste the content manually instead.

### Length Handling

Do not summarise document content before passing it to specialists. Documents attached by users are typically short enough to pass directly. If a document exceeds approximately 3,000 words, truncate it to the first 3,000 words and append a short note that the document was truncated. This keeps it within safe context limits without a full summarisation pass.

### Persona Access Control

When attaching a document, the user can choose which specialists are permitted to read it. This is important because not every document is appropriate for every specialist — a founder may want to share a legal contract only with the Legal specialist, or a detailed financial model only with Financial and Tax.

The user selects access at the point of upload: either *all specialists* (the default, simplest option) or a *custom selection* of one or more specific specialists from the five available. This selection is stored alongside the document as a ⁠ permitted_specialists ⁠ field — either the string ⁠ "all" ⁠ or a list of specialist identifiers (e.g. ⁠ ["legal", "tax"] ⁠).

When the context assembly function builds the context string for a specialist, it filters documents by both the specialist's base permissions and this per-document access control. A document is only included if the specialist is in the permitted list or the list is set to ⁠ "all" ⁠.

The database schema for ⁠ context_sources ⁠ should add a ⁠ permitted_specialists ⁠ column — store it as a JSON field defaulting to ⁠ "all" ⁠.

### Endpoint

Expose ⁠ POST /api/context/document ⁠ that accepts either a plain text body or a file upload, plus an optional ⁠ permitted_specialists ⁠ field. If omitted, default to ⁠ "all" ⁠. Detect which input method was used, process accordingly, and store the result as a ⁠ document ⁠ type context source linked to the project.

*✅ Test:* Upload a real PDF (a short one-pager or pitch deck works well). Confirm text is extracted and stored correctly. Paste plain text and confirm it stores without modification. Attempt to upload a scanned image PDF and confirm the endpoint returns a clear error rather than storing empty content. Upload a document with access restricted to ⁠ ["legal", "financial"] ⁠ and confirm only those two specialists receive it when a decision is evaluated. Upload a second document with ⁠ "all" ⁠ access and confirm all specialists receive it.

---

## Section 5 — Codebase Context

Instead of asking users to paste a manual codebase description, the user provides a public GitHub repository URL. The backend fetches and summarises the codebase automatically. This is a preprocessing step that runs once when the URL is submitted — not on every decision.

### The Three-Step Process

*Step 1 — Fetch the file tree.* Call the GitHub API's git trees endpoint with ⁠ recursive=1 ⁠ to retrieve every file path in the repository in a single request. No file content is downloaded at this stage. This gives a full structural picture of the codebase immediately. Support an optional ⁠ GITHUB_TOKEN ⁠ environment variable — without it requests are rate-limited to 60 per hour, with it to 5,000.

*Step 2 — Select and fetch important files.* Do not fetch every file. Use a priority heuristic to select the 10–20 most architecturally significant files:
•⁠  ⁠README and top-level markdown documentation
•⁠  ⁠Dependency manifests (⁠ package.json ⁠, ⁠ requirements.txt ⁠, ⁠ pyproject.toml ⁠, etc.)
•⁠  ⁠Files in the top two levels of the source directory
•⁠  ⁠Files most recently modified

Fetch only the content of these selected files.

*Step 3 — Summarise with a dedicated Claude call.* Run a separate Claude API call whose sole job is to read the fetched files and produce a structured codebase summary. This is not a specialist call — it is a preprocessing step. The prompt should ask Claude to produce:
•⁠  ⁠What this codebase is and what it does
•⁠  ⁠The overall architecture (monolith, microservices, etc.)
•⁠  ⁠The key components and what each one does
•⁠  ⁠The main dependencies and any notable third-party integrations
•⁠  ⁠Any areas that look fragile, complex, or heavily coupled
•⁠  ⁠Which parts of the codebase are most likely affected by product direction decisions

The output is a clean 300–500 word structured summary. Store it as a context source with ⁠ type: codebase ⁠. From this point it flows through the pipeline identically to any other context source — specialists receive the same formatted text regardless of how it arrived.

### Endpoint

Expose ⁠ POST /api/context/github ⁠ accepting a ⁠ project_id ⁠ and ⁠ github_url ⁠. Parse the owner and repo name from the URL, run the three-step process, and store the resulting summary as a codebase context source.

*✅ Test:* Submit a real public GitHub repo URL. Confirm the file tree is fetched, important files are selected and downloaded, and the summarisation call returns a coherent structured summary that references actual file names from the repo. Confirm it is stored as ⁠ type: codebase ⁠.

---

## Section 6 — Specialist Persona System

This is the most important section. The quality of the personas determines whether the demo wins or loses. Spend real time here.

There are five specialists: *Legal, Financial, Technical, Business Development, Tax.* Each has a system prompt that defines their domain expertise, what they optimise for, what they cannot do, and a set of hard rules they always apply regardless of the decision.

*Key rules per specialist to encode:*

•⁠  ⁠*Legal:* Flags GDPR/data risk automatically if new user data is involved. Flags ToS review if the core product changes. Always notes that faster launch = higher regulatory exposure.
•⁠  ⁠*Financial:* Flags runway impact for any decision that delays revenue or increases burn. Models cost and benefit with plausible numbers based on available context. Treats debt >50% of runway as automatic HIGH risk.
•⁠  ⁠*Technical:* Always references specific files or components from the codebase summary by name. Always surfaces the speed vs. technical debt trade-off. Estimates effort in weeks, not vague terms.
•⁠  ⁠*BD:* Always asks what the counterparty or distribution channel is. Flags competitive exposure if the decision slows time-to-market. Identifies who wins and who loses from the decision.
•⁠  ⁠*Tax:* Flags R&D tax credit eligibility for new software development. Notes VAT implications of pricing/product changes. Flags permanent establishment risk for international decisions.

*Each specialist must return a structured JSON response with these fields:*
•⁠  ⁠⁠ specialist ⁠ — their identifier
•⁠  ⁠⁠ score ⁠ — integer 0–100 (100 = strongly supports the decision, 0 = strongly opposes)
•⁠  ⁠⁠ thinking ⁠ — 2–4 sentences of their core reasoning
•⁠  ⁠⁠ objections ⁠ — list of 2–4 specific concerns
•⁠  ⁠⁠ evidence_gaps ⁠ — what information would change their assessment
•⁠  ⁠⁠ risk_level ⁠ — one of ⁠ low ⁠, ⁠ medium ⁠, ⁠ high ⁠
•⁠  ⁠⁠ codebase_references ⁠ — list of specific files/components mentioned (Technical only, optional)
•⁠  ⁠⁠ diagrams ⁠ — structured chart data (Financial only, see Section 8)

*Permissions — each specialist only receives the context sources they are authorised to see:*

| Specialist | Documents | Codebase |
|---|---|---|
| Legal | ✅ | ❌ |
| Financial | ✅ | ❌ |
| Technical | ✅ | ✅ |
| BD | ✅ | ❌ |
| Tax | ✅ | ❌ |

Build a function that, given a specialist name and a list of context sources, filters to only their permitted sources and assembles them into a readable context string for the prompt.

*✅ Test:* Call each specialist individually against the Universify test case (see Section 14). Every specialist returns valid JSON with all required fields. Technical references actual file names from the GitHub-generated codebase summary. Legal and BD should disagree meaningfully on the Universify pivot — if they don't, the prompts need more opinionated heuristics.

---

## Section 7 — Financial Diagram Data

The Financial specialist returns chart data embedded in its JSON response alongside its standard analysis. The frontend (Recharts) renders this directly — the backend just needs to ensure the data is clean and structured correctly.

*Two charts are required:*

*Cost/Benefit Bar Chart* — a list of items each with a label and a numeric value. Costs are negative numbers, benefits are positive. Claude should generate plausible figures based on the project context — if exact numbers aren't available, reasonable estimates with stated assumptions are fine.

*Runway Projection Line Chart* — four data points (Now, Month 3, Month 6, Month 12), each showing current runway trajectory vs. post-decision runway trajectory. This visualises the impact of the decision on the company's survival timeline.

After receiving the Financial specialist's response, validate the diagram data. If either chart's data is malformed or missing, drop it silently — the Financial card should still display text analysis even if charts fail.

*✅ Test:* Run the Financial specialist on the Universify decision. Confirm both charts are present. Confirm cost/benefit data has at least one negative value (cost) and one positive value (benefit). Confirm the runway chart has four data points with both trajectory lines.

---

## Section 8 — Decision Evaluation Engine

A single function that takes a specialist name, the decision question, and a list of context sources, and returns that specialist's structured response.

It should: filter context to the specialist's permissions, build the prompt, call the Claude API with ⁠ max_tokens=1500 ⁠, parse the JSON response, and return a validated Pydantic object.

*Critical implementation note:* Claude will occasionally wrap its JSON response in markdown code fences. Strip these before parsing. If JSON parsing fails for any reason, return a graceful fallback response rather than raising an exception — the demo must never crash.

*✅ Test:* Call the evaluator for a single specialist. Confirm the response validates against the Pydantic schema. Test the fallback by simulating a malformed response — confirm it returns a degraded but valid object rather than a 500 error.

---

## Section 9 — Parallel Fan-Out

All five specialists must be called simultaneously, not one after another. Sequential calls would take 30–60 seconds which kills the demo. Parallel calls should complete in under 15 seconds.

*Important:* The Anthropic Python SDK is synchronous. FastAPI is async. Use a thread pool executor to run the five blocking specialist calls concurrently within the async FastAPI context. ⁠ asyncio.gather ⁠ with ⁠ run_in_executor ⁠ is the right pattern here.

Use ⁠ gather ⁠ with ⁠ return_exceptions=True ⁠ so that if one specialist fails, the other four still return. A failed specialist should produce a fallback response, never a crash.

*✅ Test:* Call all five specialists in parallel against the Universify test case. Confirm all five responses return. Measure total wall-clock time — should be under 15 seconds. Simulate one specialist failing and confirm the other four still return valid responses.

---

## Section 10 — Conflict Detection

After all five specialists respond, automatically detect meaningful disagreements between them.

A conflict exists when two specialists' scores differ by 30 or more points. For each detected conflict, record: which two specialists disagree, their respective scores, the delta, and a plain-English description of the tension (e.g. "Legal (38) and Business Development (74) are in significant disagreement — a 36-point gap. Review both assessments carefully before proceeding.").

Return all detected conflicts sorted by largest delta first. If no conflicts exist, return an empty list with ⁠ detected: false ⁠.

This conflict data is displayed prominently in the frontend as the product's key insight — it surfaces the tensions that humans would miss without a structured multi-perspective review.

*✅ Test:* Create mock responses where Legal scores 35 and BD scores 72. Confirm conflict is detected with the correct delta. Create mock responses all within 25 points of each other. Confirm no conflict is detected.

---

## Section 11 — Decisions API

The main endpoint: ⁠ POST /api/decisions ⁠ accepts a ⁠ project_id ⁠ and ⁠ question ⁠, orchestrates the full evaluation, and returns the complete result.

*The flow:*
1.⁠ ⁠Fetch all context sources for the project from the database
2.⁠ ⁠Run all five specialists in parallel (Section 9)
3.⁠ ⁠Run conflict detection on the results (Section 10)
4.⁠ ⁠Persist the full result (responses + conflict summary) to the ⁠ decisions ⁠ table
5.⁠ ⁠Return everything to the frontend in a single response

Also expose ⁠ GET /api/decisions/{id} ⁠ to retrieve a past decision by ID.

*The response shape the frontend expects:*
•⁠  ⁠⁠ decision_id ⁠
•⁠  ⁠⁠ question ⁠
•⁠  ⁠⁠ responses ⁠ — array of all five specialist response objects
•⁠  ⁠⁠ conflict_summary ⁠ — detected flag + list of conflict pairs

If database persistence fails, still return the result to the frontend. Log the error but don't let a save failure block the user from seeing their analysis.

*✅ Test:* Run the full end-to-end test from Section 14. Confirm the response contains all five specialists, Financial has diagrams, Technical has codebase references, and at least one conflict is detected on the Universify question. Confirm the decision row is persisted in ⁠ loaf.db ⁠.

---

## Section 12 — Voice Output (Optional)

Only build this if Sections 1–12 are complete and working. Do not let this block the core demo.

Expose ⁠ POST /api/voice ⁠ accepting a specialist name and text string. The endpoint calls the ElevenLabs TTS API (⁠ eleven_turbo_v2 ⁠ model — fastest option) with a pre-assigned voice for that specialist, and returns the audio binary to the frontend.

Each specialist should have a distinct pre-selected voice ID — pick these from the ElevenLabs voice library before the hackathon starts. Cap the text at 300 characters — use just the first objection, not the full analysis. Speed matters more than completeness here.

If ElevenLabs is unavailable or the API key is missing, return a 503 with a clear message. The frontend should hide the voice toggle entirely in this case rather than showing a broken button.

*✅ Test:* Call the endpoint with a short text string for one specialist. Confirm audio is returned and plays correctly. Confirm the endpoint returns 503 gracefully when the API key is absent.

---

## Section 13 — Error Handling Principles

The demo must never visibly crash. Apply these principles throughout:

Every specialist call is wrapped in try/except. A failed call returns a degraded fallback response with score 50, risk_level medium, and a note that analysis is unavailable — never a 500 error.

JSON parsing from Claude is always done safely with fallback. Claude occasionally adds markdown fences or extra whitespace — strip these before parsing.

If database persistence fails on a decision, return the analysis to the user anyway. Losing the ability to save is less bad than the user seeing an error instead of their results.

Pydantic validation is the contract between the AI layer and the API layer. If a specialist returns unexpected fields or types, Pydantic should catch it and either coerce or fall back cleanly.

*✅ Test:* Force each failure mode individually and confirm the system degrades gracefully without a 500 response reaching the frontend.

---

## Section 14 — Test Cases

Use these three decisions throughout development to validate specialist quality. The Universify case is the primary demo — all specialists must produce genuinely insightful responses on this one.

---

*Test Case 1 — The Universify Pivot (Primary Demo)*

Project context to load:
•⁠  ⁠Document: Universify helps university applicants with personal statements, references, and general applications. 500 active users. £2,000/month revenue. 14 months runway.
•⁠  ⁠Slack (#product): CEO proposing to narrow focus to personal statements only. Engineer notes it would remove the most bug-prone parts of the codebase.
•⁠  ⁠Codebase: Submit the actual Universify GitHub URL if available, otherwise use any real public repo and note which files the Technical specialist references.

Decision: "Should we narrow Universify to only focus on personal statements?"

What good looks like: Legal flags ToS review and user expectation risk. BD asks about the competitive landscape for personal statement tools and who the distribution partner is. Technical references specific file names from the codebase summary and estimates refactoring effort in weeks. Financial shows dev cost and lost revenue as negatives, reduced operational complexity and focused positioning as positives. A conflict is detected between Legal (cautious) and BD (opportunistic).

---

*Test Case 2 — The Fundraising Decision*

Project context: Same Universify product. Growing 15% MoM. CFO flagging increasing burn next quarter. No major investors yet.

Decision: "Should we raise a £500k seed round now or bootstrap for another 6 months?"

What good looks like: Financial models two diverging runway projections clearly. Tax flags share structure and potential EIS/SEIS implications. BD is strongly pro-raise for distribution leverage. Legal flags term sheet review requirements. A conflict between Financial and Tax is plausible here.

---

*Test Case 3 — The Hiring Decision*

Project context: 3-person team. Technical debt accumulating. Roadmap includes AI features. Codebase shows a monolith architecture with scaling concerns noted in the README.

Decision: "Should we hire one senior engineer at £90k or two junior engineers at £45k each?"

What good looks like: Technical strongly prefers senior due to architecture risk. Financial notes short-term cost parity but diverging productivity trajectories. BD flags time-to-feature risk for the roadmap. Conflict detected between Technical (quality) and Financial (headcount efficiency).