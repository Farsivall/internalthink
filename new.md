## Overview

Loaf is an AI-powered decision consulting platform. Users create projects, attach context (documents, Slack excerpts, codebase snippets), submit a business decision, and receive structured analysis from five specialist AI personas simultaneously. The backend orchestrates this entire flow.

*Core stack decisions (do not change these):*
•⁠  ⁠Python + FastAPI for the backend
•⁠  ⁠Supabase (Postgres) for persistence
•⁠  ⁠Anthropic Claude API (⁠ claude-sonnet-4-20250514 ⁠) for all AI calls
•⁠  ⁠All five specialist calls must run in parallel, not sequentially
•⁠  ⁠The frontend is Next.js and will call this backend over REST — CORS must be configured for ⁠ localhost:3000 ⁠

---

## Section 1 — Project Setup

Set up a Python FastAPI project with a clean folder structure. Use a virtual environment and a ⁠ .env ⁠ file for secrets. The app needs four environment variables: ⁠ ANTHROPIC_API_KEY ⁠, ⁠ SUPABASE_URL ⁠, ⁠ SUPABASE_SERVICE_ROLE_KEY ⁠, and optionally ⁠ ELEVENLABS_API_KEY ⁠.

Expose a ⁠ /api/health ⁠ endpoint that confirms all required environment variables are present. This is the first thing to test before building anything else.

*Folder structure to aim for:* separate folders for database client, persona definitions, the decision engine, Pydantic schemas, and API routers. Keep concerns cleanly separated so each section of this spec maps to its own module.

*✅ Test:* Server starts, ⁠ /api/health ⁠ returns OK with confirmation that API keys are loaded.

---

## Section 2 — Database Schema

Three tables in Supabase:

*⁠ projects ⁠* — top-level workspace. Fields: id (UUID), name, description, created_at.

*⁠ context_sources ⁠* — documents/slack/codebase content attached to a project. Fields: id, project_id (FK), type (must be one of: ⁠ document ⁠, ⁠ slack ⁠, ⁠ codebase ⁠), label (e.g. "#engineering", "Pitch Deck"), content (full text), created_at. Enforce the type constraint at the database level.

*⁠ decisions ⁠* — a submitted question and its full evaluation result. Fields: id, project_id (FK), question, specialist_responses (JSONB array), conflict_summary (JSONB), created_at.

Add indexes on ⁠ project_id ⁠ for both ⁠ context_sources ⁠ and ⁠ decisions ⁠.

*✅ Test:* All three tables created. The type constraint on ⁠ context_sources ⁠ rejects invalid values. A test row can be inserted and deleted successfully.

---

## Section 3 — Context Ingestion API

Two resources to expose:

*Projects* — ⁠ GET /api/projects ⁠ returns all projects. ⁠ POST /api/projects ⁠ creates one, requiring a name and optional description.

*Context Sources* — ⁠ POST /api/context ⁠ attaches a context source to a project (requires project_id, type, content; label is optional). ⁠ GET /api/context?project_id=xxx ⁠ returns all sources for a project ordered by creation time.

Validate all inputs with Pydantic. Return appropriate HTTP status codes (201 for creation, 400 for bad input, 500 for database errors).

*✅ Test:* Create a project, attach one source of each type (document, slack, codebase), fetch them back. Confirm the type validator rejects anything outside the three allowed values.

---

## Section 4 — Context Preparation

Before specialists are called, the raw context sources attached to a project need to be prepared. This section covers how Slack and codebase context arrives and how it is processed into a clean, usable form for the specialists.

---

### Slack Context

Slack context is provided by the user as a manual paste of relevant messages, labelled with the channel name. There is no live Slack integration for the hackathon — the user copies and pastes the messages they consider relevant into the text field on the project setup page.

The paste should be formatted with a channel label and the messages below it, for example:


#product (last 7 days)
CEO: thinking we should narrow to personal statements only
Engineer: agreed, the reference module causes most of our bugs
Designer: what happens to existing users who signed up for the full suite?


This is stored as a context source with ⁠ type: slack ⁠ and passed to permitted specialists as-is. No parsing or processing is needed — the specialists read it as plain text.

This approach is intentional. The value of Slack context is not real-time access, it is giving specialists visibility into the informal reasoning and opinions of the team that never make it into formal documents. A well-chosen paste delivers exactly that. Post-hackathon, this field would be populated automatically via the Slack API's ⁠ conversations.history ⁠ endpoint — the architecture supports this swap without any structural changes.

---

### Codebase Context — GitHub Summarisation

Instead of pasting a manual codebase summary, the user provides a public GitHub repository URL. The backend fetches and summarises the codebase automatically before passing it to the Technical specialist. This is a preprocessing step that runs once when the user submits the GitHub URL, not on every decision.

*The process has three steps:*

*Step 1 — Fetch the file tree.* Call the GitHub API's git trees endpoint with ⁠ recursive=1 ⁠ to get every file path in the repository in a single request. No file content is downloaded at this stage. This gives a full structural picture of the codebase immediately. A ⁠ GITHUB_TOKEN ⁠ environment variable should be supported for authenticated requests — unauthenticated requests are rate-limited to 60 per hour, authenticated to 5,000.

*Step 2 — Select and fetch important files.* Do not fetch every file. Use a priority heuristic to select the 10–20 most architecturally significant files:
•⁠  ⁠README and top-level markdown documentation
•⁠  ⁠Dependency manifests (⁠ package.json ⁠, ⁠ requirements.txt ⁠, ⁠ pyproject.toml ⁠, etc.)
•⁠  ⁠Files in the top two levels of the source directory
•⁠  ⁠Files most recently modified (most relevant to current decisions)

Fetch only the content of these selected files.

*Step 3 — Summarise with a dedicated Claude call.* Run a separate Claude API call whose sole purpose is to read the fetched files and produce a structured codebase summary. This is not a specialist call — it is a preprocessing step. The prompt should ask Claude to produce:
•⁠  ⁠What this codebase is and what it does
•⁠  ⁠The overall architecture (monolith, microservices, etc.)
•⁠  ⁠The key components and what each one does
•⁠  ⁠The main dependencies and any notable third-party integrations
•⁠  ⁠Any areas that look fragile, complex, or heavily coupled
•⁠  ⁠Which parts of the codebase are most likely to be affected by decisions about the product direction

The output is a clean 300–500 word structured summary. Store this as the codebase context source with ⁠ type: codebase ⁠. From this point it flows through the pipeline identically to a manually pasted codebase description — specialists receive the same formatted text either way.

Add ⁠ GITHUB_TOKEN ⁠ as an optional environment variable. If absent, requests proceed unauthenticated (sufficient for the demo on a public repo). If present, use it as a Bearer token on all GitHub API calls.

*✅ Test:* Submit the Universify GitHub URL (or any real public repo). Confirm the file tree is fetched, important files are selected and downloaded, and the summarisation Claude call returns a coherent structured summary. Confirm the summary is stored as a ⁠ codebase ⁠ context source. Confirm the summary references actual file names from the real repo.

---

## Section 5 — Specialist Persona System

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
•⁠  ⁠⁠ diagrams ⁠ — structured chart data (Financial only, see Section 7)

*Permissions — each specialist only receives the context sources they are authorised to see:*
•⁠  ⁠Legal: documents + slack
•⁠  ⁠Financial: documents + slack
•⁠  ⁠Technical: documents + slack + codebase
•⁠  ⁠BD: documents + slack
•⁠  ⁠Tax: documents only

Build a function that, given a specialist name and a list of context sources, filters to only their permitted sources and assembles them into a readable context string for the prompt.

*✅ Test:* Call each specialist individually against the Universify test case (see Section 13). Every specialist returns valid JSON with all required fields. The Technical specialist references actual file names from the GitHub-generated codebase summary. Legal and BD should disagree meaningfully on the Universify pivot decision — if they don't, the prompts need more opinionated heuristics.

---

## Section 6 — Decision Evaluation Engine

A single function that takes a specialist name, the decision question, and a list of context sources, and returns that specialist's structured response.

It should: filter context to the specialist's permissions, build the prompt, call the Claude API with ⁠ max_tokens=1500 ⁠, parse the JSON response, and return a validated Pydantic object.

*Critical implementation note:* Claude will occasionally wrap its JSON response in markdown code fences (` ```json `). Strip these before parsing. If JSON parsing fails for any reason, return a graceful fallback response rather than raising an exception — the demo must never crash.

*✅ Test:* Call the evaluator for a single specialist. Confirm the response validates against the Pydantic schema. Test the fallback by simulating a malformed response — confirm it returns a degraded but valid object rather than a 500 error.

---

## Section 7 — Financial Diagram Data

The Financial specialist returns chart data embedded in its JSON response alongside its standard analysis. The frontend (Recharts) will render this directly — the backend just needs to ensure the data is clean and structured correctly.

*Two charts are required:*

*Cost/Benefit Bar Chart* — a list of items each with a label and a numeric value. Costs are negative numbers, benefits are positive. Claude should generate plausible figures based on the project context — if exact numbers aren't available, reasonable estimates with stated assumptions are fine.

*Runway Projection Line Chart* — four data points (Now, Month 3, Month 6, Month 12), each showing current runway trajectory vs. post-decision runway trajectory. This visualises the impact of the decision on the company's survival timeline.

After receiving the Financial specialist's response, validate the diagram data. If either chart's data is malformed or missing, drop it silently — the Financial card should still display text analysis even if charts fail.

*✅ Test:* Run the Financial specialist on the Universify decision. Confirm both charts are present. Confirm cost/benefit data has at least one negative value (cost) and one positive value (benefit). Confirm the runway chart has four data points with both trajectory lines.

---

## Section 8 — Parallel Fan-Out

All five specialists must be called simultaneously, not one after another. Sequential calls would take 30–60 seconds which kills the demo. Parallel calls should complete in under 15 seconds.

*Important:* The Anthropic Python SDK is synchronous. FastAPI is async. Use a thread pool executor to run the five blocking specialist calls concurrently within the async FastAPI context. ⁠ asyncio.gather ⁠ with ⁠ run_in_executor ⁠ is the right pattern here.

Use ⁠ gather ⁠ with ⁠ return_exceptions=True ⁠ (or equivalent) so that if one specialist fails, the other four still return. A failed specialist should produce a fallback response, never a crash.

*✅ Test:* Call all five specialists in parallel against the Universify test case. Confirm all five responses return. Measure total wall-clock time — should be under 15 seconds. Simulate one specialist failing (e.g. bad API key for just that call) and confirm the other four still return valid responses.

---

## Section 9 — Conflict Detection

After all five specialists respond, automatically detect meaningful disagreements between them.

A conflict exists when two specialists' scores differ by 30 or more points. For each detected conflict, record: which two specialists disagree, their respective scores, the delta, and a plain-English description of the tension (e.g. "Legal (38) and Business Development (74) are in significant disagreement — a 36-point gap. Review both assessments carefully before proceeding.").

Return all detected conflicts sorted by largest delta first. If no conflicts exist, return an empty list with ⁠ detected: false ⁠.

This conflict data is displayed prominently in the frontend as the product's key insight — it surfaces the tensions that humans would miss without a structured multi-perspective review.

*✅ Test:* Create mock responses where Legal scores 35 and BD scores 72. Confirm conflict is detected with correct delta. Create mock responses all within 25 points of each other. Confirm no conflict is detected.

---

## Section 10 — Decisions API

The main endpoint: ⁠ POST /api/decisions ⁠ accepts a ⁠ project_id ⁠ and ⁠ question ⁠, orchestrates the full evaluation, and returns the complete result.

*The flow:*
1.⁠ ⁠Fetch all context sources for the project from the database
2.⁠ ⁠Run all five specialists in parallel (Section 8)
3.⁠ ⁠Run conflict detection on the results (Section 9)
4.⁠ ⁠Persist the full result (responses + conflict summary) to the ⁠ decisions ⁠ table
5.⁠ ⁠Return everything to the frontend in a single response

Also expose ⁠ GET /api/decisions/{id} ⁠ to retrieve a past decision by ID.

*The response shape the frontend expects:*
•⁠  ⁠⁠ decision_id ⁠
•⁠  ⁠⁠ question ⁠
•⁠  ⁠⁠ responses ⁠ — array of all five specialist response objects
•⁠  ⁠⁠ conflict_summary ⁠ — detected flag + list of conflict pairs

If Supabase persistence fails, still return the result to the frontend. Log the error but don't let a database failure block the user from seeing their analysis.

*✅ Test:* Run the full end-to-end curl test from Section 13. Confirm the response contains all five specialists, Financial has diagrams, Technical has codebase references, and at least one conflict is detected on the Universify question. Confirm the decision row is persisted correctly.

---

## Section 11 — Voice Output (Optional)

Only build this if Sections 1–9 are complete and working. Do not let this block the core demo.

Expose ⁠ POST /api/voice ⁠ accepting a specialist name and text string. The endpoint calls the ElevenLabs TTS API (⁠ eleven_turbo_v2 ⁠ model — fastest option) with a pre-assigned voice for that specialist, and streams the audio binary back to the frontend.

Each specialist should have a distinct pre-selected voice ID. Cap the text at 300 characters — use just the first objection, not the full analysis. Speed matters more than completeness here.

If ElevenLabs is unavailable or the API key is missing, return a 503 with a clear message. The frontend should hide the voice toggle entirely in this case rather than showing a broken button.

*✅ Test:* Call the endpoint with a short text string for one specialist. Confirm audio binary is returned and plays correctly. Confirm the endpoint returns 503 gracefully when the API key is absent.

---

## Section 12 — Error Handling Principles

The demo must never visibly crash. Apply these principles throughout:

Every specialist call is wrapped in try/except. A failed call returns a degraded fallback response with score 50, risk_level medium, and a note that analysis is unavailable — never a 500 error.

JSON parsing from Claude is always done safely with fallback. Claude occasionally adds markdown fences or extra whitespace — strip these before parsing.

If Supabase persistence fails on a decision, return the analysis to the user anyway. Losing the ability to save is less bad than the user seeing an error instead of their results.

Pydantic validation is the contract between the AI layer and the API layer. If a specialist returns unexpected fields or types, Pydantic should catch it and either coerce or fall back cleanly.

*✅ Test:* Force each failure mode individually and confirm the system degrades gracefully without a 500 response reaching the frontend.

---

## Section 13 — Test Cases

Use these three decisions throughout development to validate specialist quality. The Universify case is the primary demo — all specialists must produce genuinely insightful responses on this one.

---

*Test Case 1 — The Universify Pivot (Primary Demo)*

Project context to load:
•⁠  ⁠Document: Universify helps university applicants with personal statements, references, and general applications. 500 active users. £2,000/month revenue. 14 months runway.
•⁠  ⁠Slack (#product): CEO proposing to narrow focus to personal statements only. Engineer notes it would remove the most bug-prone parts of the codebase.
•⁠  ⁠Codebase: ApplicationForm component handles all three application types. referenceService manages reference requests. statementService handles AI-assisted statement editing.

Decision: "Should we narrow Universify to only focus on personal statements?"

What good looks like: Legal flags ToS review and user expectation risk. BD asks about the competitive landscape for personal statement tools and who the distribution partner is. Technical references ApplicationForm specifically and estimates refactoring effort in weeks. Financial shows dev cost and lost revenue as negatives, reduced operational complexity and focused positioning as positives. A conflict is detected between Legal (cautious) and BD (opportunistic).

---

*Test Case 2 — The Fundraising Decision*

Project context: Same Universify product. Growing 15% MoM. CFO flagging increasing burn next quarter. No major investors yet.

Decision: "Should we raise a £500k seed round now or bootstrap for another 6 months?"

What good looks like: Financial models two diverging runway projections clearly. Tax flags share structure and potential EIS/SEIS implications. BD is strongly pro-raise for distribution leverage. Legal flags term sheet review requirements. A conflict between Financial and Tax is plausible here.

---

*Test Case 3 — The Hiring Decision*

Project context: 3-person team. Technical debt accumulating. Roadmap includes AI features. Codebase: monolith architecture with scaling concerns noted in README.

Decision: "Should we hire one senior engineer at £90k or two junior engineers at £45k each?"

What good looks like: Technical strongly prefers senior due to architecture risk. Financial notes short-term cost parity but diverging productivity trajectories. BD flags time-to-feature risk for the roadmap. Conflict detected between Technical (quality) and Financial (headcount efficiency).