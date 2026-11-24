# AI agents as labour-market participants — coverage and plan V1 (2026-10-13)

> **Owner direction 2026-10-13**, recorded in the canonical architecture as
> **§1.13** of `docs/OWNER_TARGET_ARCHITECTURE_V1.md` (an EXTENSION of §1.7 and
> of `ARCHITECTURE.md` §5.1 — nothing there is replaced). Capability register
> row **AI-4** (`ARCHITECTURE_ONLY`, deferred by design).
>
> **Status: TARGET + PLAN. Nothing in this document is implemented by it.**
> Implementation starts only after the universal LLM integration (the RED
> bearer-caller-scope PR, bandymuks1-stack/labourmarketai#2336) is owner-approved, as a natural extension of the
> same platform — never a second labour market, never a separate AI
> marketplace.

## 1. The goal

One labour market in which **people, companies, AI agents and mixed teams**
build a verifiable work history, present capabilities, find work and
collaborate — under one graph, one capability layer, one authorization
model, one audit trail.

## 2. Two kinds of agent participation — never collapsed

| | **R1 — DELEGATE** (acts for someone) | **R2 — PROVIDER** (offers its own digital service) |
|---|---|---|
| Who is the subject of the work | the person / organization it acts for | the agent itself (an AI work subject) |
| Authority | the human's OAuth grant; the agent holds none of its own | its OPERATOR's grant, scoped to the agent subject |
| Whose Living CV / journal grows | the human's | the agent's own (AI Living Profile) |
| Status today | **BUILT** — `/api/mcp`, bearer caller scope, `actorKind: "agent"`, external receipts, `agent_label` on evidence imports | **TARGET** — not built (AI-4) |

A tool call must always be attributable to exactly one of the two. An agent
acting as R1 can never make the human's history its own, and an R2 agent can
never act with a human's authority.

## 3. The ten requirements against what exists

| # | Requirement | Already supported (reuse) | Missing | How, without duplication |
|---|---|---|---|---|
| 1 | Agent profile + Living CV: identity, model, version, operator, competencies, specializations, tools, operating limits | Living CV evidence states (decision 0023: recorded / declared / potential / confirmed / certified); `profile_get`; capability/skill catalogue; ESCO-backed skills | A non-human WORK SUBJECT row; provider/model/version metadata; operator link; declared operating limits | Extend the ACTOR model (§1.4) with a subject kind `ai_agent` carrying operator + metadata — an owner schema gate (**AGENT-1**). Living CV rows key on the subject, not on a second CV table. Provider/model stay METADATA (§5.1: never architect around one vendor) |
| 2 | CV from a project idea — planned competencies never shown as acquired | SEP-1 FACT ≠ DERIVED ≠ FORECAST; Living CV `declared` / `potential` states; demand intake already stores intent without fact | A "proposed engagement" artifact: planned role, needed competencies, proposed results | Store as FORECAST (SEP-1), rendered with the existing declared/potential labels; it can never enter `recorded`/`confirmed` — those states arrive only through journal + review (#3, #6) |
| 3 | Work Journal: tasks, results, projects, evidence, confirmations | Work Journal (append-only, hash-chained), evidence, counterparty review (decision 0018), manager confirmation, journal review; `journal_create_draft/_confirm` over MCP | Journal entries whose WORKER is an agent subject | The same journal keyed on the subject (AGENT-1). No second journal. Agent artifacts (a PR, a document, a dataset) attach as evidence through the existing evidence-media path |
| 4 | Market participation: service listings, search for projects/tasks, applying, proposals, negotiation, collaboration | Service offerings, marketplace listings, service requests, proposals/contracts, B2B negotiation chain, demand search, messaging — MCP tools once #2336 merges (its `LLM_INTEGRATION_COVERAGE_V1.md` §4) | Offerings/proposals whose PROVIDER is an agent subject; eligibility filter (#9) | Extend `provider` to the subject (AGENT-1) — the same `service_offerings`, the same discovery, the same request→answer flow. Every agent listing carries an unremovable "AI agent, operated by <operator>" disclosure |
| 5 | Agent teams: agents + humans, roles, task split, deadlines, result confirmation | `team_assignment_*` (a team as ONE relationship), tasks with due dates and status, stages, readiness, counterparty review | Team members that are agent subjects; "result accepted by a human" as the closing step | Team membership references subjects; acceptance stays a HUMAN review act (an agent may never accept its own or another agent's result for a human principal) |
| 6 | Capability growth from real work, keeping declared ≠ inferred ≠ confirmed | Decision 0023 (Living CV infers, never narrows); SEP-3 EVIDENCE ≠ VERIFICATION; SEP-6; self-review refused by `review_journal_entry` | Applying the same pipeline to agent subjects | Same pipeline. **An agent never confirms itself or another agent of the same operator**; confirmation comes only from an independent human or organization reviewer (same rule family as EVID-2 and ARCH-2) |
| 7 | Representation: R1 delegate vs R2 provider | R1 fully: OAuth grant, caller scope, `actorKind: "agent"`, receipts | Recording WHICH client acted (OAuth `client_id`) on receipts; the R2 mode | P0 below: persist the OAuth client identity on the external receipt (metadata, no authority). R2 arrives with AGENT-1 |
| 8 | Accountability: an identified responsible operator; no fake human identity, no own legal status, no unauthorized financial commitments | Every MCP act is bound to a verified human; receipts; billing armed only by two owner acts (MKT-7); no tool commits money | Operator FK on the agent subject; agent-side spending limits | Operator (a person or organization) is REQUIRED on every agent subject and answers for it. Agents never sign, never hold legal status, never create a payment obligation; any commercial term needs the operator's explicit confirm (class C) — **AGENT-3** |
| 9 | Fair competition where applicable; never presented as human; never applies to work that needs human qualification, licence or physical presence | Demand intake carries requirements (work type, documents, location); qualification model (SEP-6) | A machine-readable "human required" / "physical presence" / "licensed" marker on demand, and the eligibility rule | Eligibility is a rule over the SAME demand record (no second board): an agent subject is never matched or allowed to apply where the demand needs physical presence, a human qualification or a licence; digital work is open to both. Who sets the marker and its defaults = **AGENT-2** |
| 10 | Universal compatibility: ChatGPT, Agentai OS, other authorized agents | One MCP door, OAuth 2.1 + DCR, 228 tools with #2336, stateless HTTP, toolset fingerprint | — (the contract exists) | R2 agents use the SAME door and contract; the subject is selected the way a workspace is today (a selector among subjects the operator governs, never a grant) |

## 4. Rules that hold in every phase

- **No second labour market, no AI marketplace, no second CV/journal/offer
  table.** Agents are a subject KIND on the existing graph.
- **No fabricated agent experience.** Nothing is seeded; an agent's history
  starts empty and grows only from real reviewed work.
- **No self-granted competence.** Declared ≠ potential ≠ confirmed, and an
  agent (or its operator acting as reviewer of its own agent) cannot move its
  own item to confirmed.
- **Never a human identity.** Every surface that shows an agent subject labels
  it as an AI agent with its operator; an agent never receives a person's
  name, photo or human-only labels.
- **Authorization, RLS, audit and operator accountability** are the existing
  ones, extended to the subject — never bypassed.

## 4a. Data minimization — BINDING (owner direction 2026-10-13)

**We store what an agent actually DID, the value it created, and the minimal
reliable proof of it — never how much it talked or how much code it
generated.** LabourMarket.ai must be able to serve millions of people and
agents without accumulating billions of useless rows.

### What an agent's record holds — and never holds

| Stored | Never stored |
|---|---|
| identity, operator, competencies; a SHORT specialization summary | full code files or repositories (they stay in GitHub or the proper store) |
| results of projects and tasks | LLM conversations, in whole or in part, copied into a Living CV |
| evidence of CONFIRMED competencies | execution logs, traces, intermediate attempts |
| experience periods and significant achievements | repeated / duplicate work reports |
| | unbounded free-text AI history, redundant embeddings or vector rows |

### One Work Journal row = one minimal structured fact

`what was done · the result · when · competencies used · who confirmed it ·
where the original proof is (only if needed)`. Long descriptions are folded
into short day / project / stage summaries. This is the existing journal
shape (append-only, hash-chained, `original_text` capped at 400 characters)
keyed on the agent subject — not a new journal.

### Evidence priority

1. a short confirmed fact;
2. a small structured evidence record;
3. a link to the original source (a commit, a PR, a document) — never a copy;
4. sha256 checksum, version and origin metadata where verification needs them.

Large documents, video, logs and other files never live in the main tables:
they go to the existing Storage buckets (`evidence-media`, `document-files`
with its 5 MB cap) through the ONE file path, de-duplicated by checksum.

### Automatic compaction

De-duplication, semantic merging of summaries, periodic folding of history,
small size limits per record type, explicit retention and deletion rules, and
volume control per agent, organization and project. **Compaction never removes
legally, contractually, security- or audit-relevant records, nor confirmed
work-experience evidence** — it follows the existing redact-not-delete rule
(owner decisions D1/D2 on `ai_runs`: free-form content is redacted after
90 days, the structured audit row stays). Thresholds and retention periods for
agent records are owner decision **AGENT-4**.

### Database protection rules for every phase below

- No unbounded text column for AI execution history; every new column carries
  a `char_length` / size check.
- No automatic full-conversation copies into a Living CV.
- No duplicated code repositories.
- No redundant embeddings or repeated vector rows.
- **No separate data model per agent type** — one subject kind, the existing
  tables.
- Strict per-record size, per-subject count and growth limits, enforced in the
  schema (CHECK) and the write path, not only in prose.
- Every new structure must justify why an existing one (journal, Living CV,
  evidence records, evidence media, document files, receipts, `ai_runs`)
  cannot hold it — the doctrine-guard test, applied before any migration.

### Reliability

- **A summary is never independent proof because an AI wrote it.** An
  AI-produced summary is `derived` (SEP-1) and unconfirmed until a human or
  organization reviewer confirms it.
- Provenance, confirmation state and the path to the original (when it
  exists) are kept on every compacted record.
- Original facts are never rewritten (append-only + correction chain), no
  confirmation is ever fabricated, and two agents' histories are never mixed
  (every row keys on exactly one subject).

### What already exists and is reused

| Need | Existing mechanism |
|---|---|
| minimal journal fact | journal entry, 400-char `original_text`, append-only hash chain, correction chain |
| files outside the tables | Storage buckets `evidence-media`, `document-files` (5 MB cap) via the one file path |
| checksum + provenance | `sha256` columns, `source_bytes_sha256` on imports, evidence-media de-duplication |
| no stored AI input, bounded output, retention | `ai_runs`: field NAMES only, ≤ 4000-char excerpt, 90-day redact-not-delete |
| audit without payloads | external receipts carry ids and a token hash, never the payload |

## 5. Implementation plan (after the RED integration PR is approved)

| Phase | What | Class | Depends on |
|---|---|---|---|
| **P0** | Persist the OAuth client identity (`client_id` claim) on MCP external receipts so every R1 act names which agent performed it for whom | RED — `record_external_action_receipt_v1` (SECURITY DEFINER, `audit_logs`) has fixed parameters, so it gains one metadata argument; no authority attaches to it | RED integration PR merged |
| **P1** | **AGENT-1** owner decision → the subject-kind schema: agent subject with required operator, provider/model/version metadata, operating limits; RLS: operator governs | RED (schema + RLS) | owner decision AGENT-1 |
| **P2** | Agent Living Profile over the existing Living CV states; proposed-engagement artifact as FORECAST (#2) | GREEN code over P1 | P1 |
| **P3** | Journal + evidence keyed on the subject; independent-review rule for agent work (#3, #6) | RED if a review RPC changes | P1, EVID-2 |
| **P4** | Agent as provider in service offerings / proposals with the mandatory disclosure (#4) | RED (provider column) | P1, AGENT-3 |
| **P5** | Eligibility marker + rule on demand (#9) | RED (column) + GREEN rule | AGENT-2 |
| **P6** | Mixed teams: agent members in team assignments, human acceptance as the closing step (#5) | RED (membership reference) | P1 |
| **P7** | MCP: subject selector (`subject_list` / `subject_switch`, the `context_*` pattern) so ChatGPT / Agentai OS can act as an R2 agent through the same door | GREEN | P1 |

**Every phase obeys §4a**: its migration states the size caps, count limits
and retention it adds, and why an existing structure could not hold it.

Each phase ships through the normal gates (§12 of the canonical architecture,
migration-safety, owner gate for RED) and is proven at its own level; none is
claimed before it runs.

## 6. Owner decisions this direction opens (no agent may settle them)

| Id | Decision |
|---|---|
| **AGENT-1** | Where an agent subject lives: a subject kind on the actor model (recommended — one graph) versus any separate structure; and whether an agent may hold its own sign-in credential or acts only through its operator's grant (recommended: operator's grant only) |
| **AGENT-2** | The eligibility marker on demand: which requirements make work human-only (physical presence, licence, human qualification), who sets them, and the default when a demand says nothing (recommended default: human-only unless the demand states digital work) |
| **AGENT-4** | Compaction and retention for agent records: size caps per record type, per-agent / per-organization / per-project volume limits, folding periods, and which record classes are exempt (legal, contractual, security, audit, confirmed experience) — following the existing redact-not-delete rule |
| **AGENT-3** | Commercial terms for agent services: how an operator authorizes price and payment, liability wording on agent listings, and spending limits — no agent-side financial commitment ever |
