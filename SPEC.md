# AI Decision Simulation Platform – Master Spec

**Architecture:** Project → Decisions. Each project is a container; inside each project are decisions. Each decision has:
- Attached documents
- Chats (persona discussion threads)
- Slides / presentations
- Persona scores per decision

---

## 1. Top-Level Structure

- **Header**
- **Sidebar** (optional)
- **Main Panel – Projects Overview**
- **Footer** (optional)

### Header

- Logo / Platform Name
- Current User / Profile Menu
- **“New Project”** button (primary CTA)
- Global Search (projects, decisions, documents)

### Sidebar (Optional Desktop)

- Projects List / Navigation
- Filters: Active / Completed / Draft
- Persona Library
- Reports / Dashboard
- Settings

---

## 2. Main Panel – Projects Overview

**Project Card / Row** – Each card represents a **project**, not a single decision.

### Card Elements

- **Project Name** (clickable → opens Project Detail Page)
- Short description
- **Status Badge** (Active / Completed / Draft)
- Number of Decisions in Project
- Last Updated / Created Date
- **Quick Actions:** Open / Archive / Duplicate

### Empty State

*“No projects yet. Start by creating a project to add decisions, attach documents, and simulate persona judgment.”*

---

## 3. Project Detail Page

All decisions for the project live here.

### A. Project Header

- Project Name & Description
- Status Badge
- Edit Project Info
- **Add New Decision** button

### B. Decision List / Grid

Each card or row = one **decision** within the project.

**Decision Card Elements:**

- **Decision Title** (clickable → opens Decision Detail)
- Persona Scores Summary (small chart or numeric per persona)
- Key Risks / Top Objections (1–3 bullets)
- **Status:** Draft / Evaluated / Reviewed
- **Attachments Summary** (Icons: Docs / Slides / Chat Threads Count)
- Last Updated / Created Date

**Row View Alternative:**

| Decision | Persona Scores | Top Risks | Documents | Slides | Chat Threads | Status | Actions |

### C. Decision Detail Page

For each decision:

- **Decision Summary / Context** – Description, assumptions, constraints
- **Evidence / documents** attached
- **Slides / decks** attached
- **Persona Chat Panel**
  - One tab per persona
  - Chat-like reasoning thread
  - Each message: Score, Objections / Risks / Evidence gaps
- **Persona Score Dashboard**
  - Table or mini bar chart: each persona’s score
  - Highlight disagreement / alignment, visual trade-offs
- **Attachments**
  - Documents (PDF, Word, CSV)
  - Slides (PowerPoint / PDF)
  - Ability to upload new files
- **Actions**
  - Add follow-up chat message (if allowed)
  - Flag evidence gaps
  - Export decision summary / dashboard

### D. Interaction Patterns

- Click Decision → Decision Detail
- Hover persona score → tooltip with reasoning summary
- Expand/collapse attached files
- Filter decision list by status, risk level, or disagreement
- Search within project for decisions or keywords

---

## 4. Mobile Layout

- Project list → scrollable stacked cards
- Decisions inside project → collapsible list
- Persona chat → swipe between personas
- Attachments → collapsible file list

---

## 5. Visual / UX Notes

- **Persona Scores:** Consistent color per persona across project & decision pages
- **Risk Highlights:** Red/orange boxes for high-risk decisions
- **Attachments:** Icons with counts for easy scanning
- **Decision Status:** Badge or label for evaluation progress

**Design inspiration:** Dark theme, project cards with distinct accent colors, clean typography (see reference: MOBIN.DEV-style portfolio – cards with colored backgrounds, clear hierarchy).

---

## 6. Key Takeaways

- Homepage shows **all projects**
- Each project contains **multiple decisions**
- Each decision has: Persona scores, Documents, Chat threads, Slides, Dashboard-style summary
- Search & filters for fast navigation
