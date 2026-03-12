You are a senior product engineer, AI systems designer, and UX architect.

We are improving the core “Evaluate Decision” experience in Aql.

Context:
Aql already does these things well:
- lets users brainstorm with specialist personas
- generates persona-specific scores
- shows agreements, trade-offs, evidence gaps, and “what would change my mind”
- feels interactive, like talking to real specialists

Problem:
The current decision output is not strong enough.
Right now it mostly returns:
- specialist scores
- agreements
- trade-offs
- evidence gaps
- what would change each specialist’s mind

But it does NOT go far enough into actual decision-making.

We need to upgrade Aql from:
“expert commentary + scoring”
into:
“structured decision synthesis + paths forward + next steps + branching roadmap”

The new Evaluate Decision experience should feel like:
- an AI executive decision room
- a structured strategy workshop
- a decision operating system

We want the output to become much more coherent, structured, and actionable.

==================================================
GOAL
==================================================

Redesign and implement the decision output layer so that after specialists analyze a decision, Aql also produces:

1. A coherent synthesis of the decision
2. 3 structured paths forward / decision options
3. A ranking of those paths
4. Clear explanation of which specialists favor which path and why
5. Recommended next steps for each path
6. A “recommended path” with rationale
7. A visual decision tree / branching structure inspired by Obsidian-style linked thinking
8. The ability for a chosen path to become a new branchable decision context later

This should NOT replace the existing persona analysis.
It should build on top of it.

==================================================
CURRENT STATE
==================================================

Existing output includes:
- persona scores
- agreements
- disagreements / trade-offs
- evidence gaps
- what would change my mind

Keep all of this.

But add a new structured “Decision Synthesis Layer” after persona analysis.

==================================================
NEW OUTPUT STRUCTURE
==================================================

After all personas complete their analysis, the system must generate a structured decision object with the following sections:

1. Decision Summary
- A concise synthesis of the actual decision being evaluated
- Clarify what the real strategic choice is
- Rewrite ambiguous decisions into a more precise decision framing if needed

2. Core Tensions
- Summarize the main tensions across personas
- Example:
  - High market upside vs limited runway
  - Strong strategic fit vs execution complexity
  - Fast launch vs legal/compliance uncertainty

3. Three Paths Forward
Generate exactly 3 actionable paths forward.
These should not be generic.
They should be realistic strategic options, for example:
- Move now
- Pilot / phased rollout
- Delay / gather evidence first

For each path include:
- title
- short description
- why this path exists
- what assumptions it depends on
- key upside
- key downside
- likely execution difficulty

4. Specialist Preference Mapping
For each path, show:
- which specialists support it most
- which specialists are cautious or opposed
- brief explanation why

Example:
Path 2 — Pilot with 3 customers
Favored by:
- Financial: limits downside exposure while validating demand
- Technical: reduces implementation risk
- Business Dev: creates market learning with less commitment

5. Path Ranking
Rank all 3 paths in order:
- Recommended
- Second-best
- Third-best

For each ranking include:
- rationale
- confidence level
- key condition that could change the ranking

6. Recommended Path
The system must clearly recommend one path.
This should feel like a real executive recommendation, not a generic summary.

Include:
- why this is the best current option
- what risks remain
- why it outperforms the alternatives

7. Next Steps
This is critical.

For the recommended path:
- generate 3–7 concrete next steps
- steps should be practical, specific, and sequenced
- each next step should have:
  - title
  - reason
  - owner type (e.g. founder / CTO / finance lead)
  - expected outcome
  - optional timeline estimate
  - which specialist most strongly supports this step

Also generate lighter next-step outlines for the other 2 paths.

8. Decision Tree / Branching Roadmap
Generate a structured branching roadmap inspired by Obsidian-style linked nodes.

The output should represent:
- root decision
- 3 generated paths
- branch nodes under each path
- likely follow-up decisions
- open questions
- milestones
- decision checkpoints

This should be represented in a structured data format so it can later be rendered visually in the frontend.

Example concept:
Root Decision
  ├── Path A: Build immediately
  │     ├── Sub-decision: Allocate engineering resources
  │     ├── Sub-decision: Launch pricing model
  │     └── Checkpoint: Review adoption after 30 days
  ├── Path B: Pilot first
  │     ├── Sub-decision: Choose pilot customers
  │     ├── Sub-decision: Define success metrics
  │     └── Checkpoint: Evaluate pilot outcome
  └── Path C: Delay
        ├── Sub-decision: Gather market data
        ├── Sub-decision: Reduce uncertainty
        └── Checkpoint: Reassess in 60 days

This branching structure should preserve context and be reusable for future decisions.

==================================================
PRODUCT PHILOSOPHY
==================================================

Aql should not feel like a chatbot giving opinions.
It should feel like:
- a structured decision workshop
- a boardroom assistant
- an expert decision graph builder

We are moving from:
specialist commentary
to:
decision design

The UI/logic should support this shift.

==================================================
IMPLEMENTATION REQUIREMENTS
==================================================

Please implement the following:

1. Add a new “Decision Synthesis” stage after persona evaluation
- input:
  - decision context
  - persona outputs
  - agreements
  - trade-offs
  - evidence gaps
  - what would change minds
- output:
  - structured decision synthesis object

2. Update prompts / orchestration so the LLM does not stop at scoring
It must synthesize into:
- options
- ranking
- next steps
- branching roadmap

3. Update the response schema so the decision result includes:
- decision_summary
- core_tensions
- paths
- recommended_path
- path_ranking
- next_steps
- decision_tree

4. Decision tree format
Design a clean JSON structure for branchable decision trees.
It should support:
- node id
- node type
- title
- description
- parent id
- related path
- status
- depth
- linked context / assumptions
- checkpoint / milestone fields

5. Obsidian-inspired linking
The structure should feel like connected strategic thought.
Think:
- linked nodes
- nested branches
- evolving context
- future sub-decisions
But do NOT build a generic notes graph.
This is specifically for strategic decision branching.

6. Preserve existing persona output
Do not remove:
- scores
- trade-offs
- evidence gaps
- what would change my mind

Instead:
wrap them inside a stronger decision synthesis layer.

==================================================
OUTPUT FORMAT
==================================================

Return a structured response shape like:

{
  "decision_summary": {},
  "core_tensions": [],
  "paths": [
    {
      "id": "path_a",
      "title": "",
      "description": "",
      "assumptions": [],
      "upside": [],
      "downside": [],
      "execution_difficulty": "",
      "favored_by": [
        {
          "persona": "",
          "reason": ""
        }
      ],
      "concerned_by": [
        {
          "persona": "",
          "reason": ""
        }
      ],
      "next_steps_outline": []
    }
  ],
  "path_ranking": [],
  "recommended_path": {},
  "recommended_path_next_steps": [],
  "decision_tree": {
    "root": {},
    "nodes": [],
    "edges": []
  },
  "existing_persona_analysis": {}
}

==================================================
DECISION TREE UI (replaces "Decision Happiness")
==================================================

The primary visualization is a **hierarchical decision tree**: nodes are **decisions only** (no specialists in the graph). Layout uses a **solar-system** metaphor: each decision cluster (parent + its children) has its own space, with strong repulsion and longer links so clusters don't overlap.

**Visual design:**
- **Nodes:** Decision nodes only (one per decision). Circular or compact node shape; color by depth or status (e.g. root vs child).
- **No specialist nodes** in the tree—specialists appear only inside the **decision breakdown** (scores, heatmap, persona details).
- **Edges:** Lines connecting parent decision → child decision.
- **Layout:** Solar-system style: force-directed with strong charge (repulsion) and longer link distance so each decision cluster feels like its own "solar system." No synthetic root node; root decisions (no parent_id) and their children form natural clusters.
- **Structure:** Root decisions = those with no parent_id; children = decisions with parent_id. When backend supplies parent_id, use it; otherwise all decisions are root-level.

**Interaction:**
- Click a decision node → open **decision breakdown** modal (same content as now: heatmap, agreement, tradeoffs, per-persona detail). The breakdown shows **branched decisions** (children of this decision) when available.
- Hover for title preview
- Zoom/pan for large trees

**Breakdown and tree alignment:**
- The **decision breakdown** modal must reflect the same structure as the tree: show "Branched decisions" (children of this decision), and the same synthesis fields (paths, ranking, next steps) that the backend decision_tree will provide.
- When decision synthesis (paths, ranking, next steps) is implemented, show it in the breakdown so that both the tree (structure) and the breakdown (detail + specialists) feel like one experience.
- Rename the tab from “Decision happiness” to **“Decision tree”** everywhere (nav, titles, components).

==================================================
UX GOAL
==================================================

The user should leave the decision flow feeling:
- they understand the real choice
- they have 3 clear options
- they know which path is best
- they know why specialists support different paths
- they know what to do next
- they can continue the decision as a branching roadmap over time

This is a major product improvement.
Make the experience feel more like an executive strategy system and less like a scoring report.

==================================================
DELIVERABLES
==================================================

Provide:
1. updated backend decision synthesis logic
2. updated prompt orchestration
3. updated schema / types
4. decision tree JSON structure
5. frontend rendering plan for:
   - **hierarchical decision tree** as the primary UI—decision nodes only (no specialists), top-down layout, parent-child edges
   - click a decision node → open **decision breakdown** (heatmap, agreement, tradeoffs, persona scores, synthesis/paths when available)
   - breakdown and tree share the same data model (decision_tree); breakdown shows “In tree” position and full detail including specialists
6. preserve existing specialist analysis while adding this new layer

Make reasonable assumptions and implement the MVP cleanly without asking clarifying questions.