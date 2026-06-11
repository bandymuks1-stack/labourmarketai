# AI Readiness — architecture for the M4+ AI assistance layer

**Status: scaffolding only. Zero runtime LLM integration exists in this repo.
`AI_ASSIST_ENABLED` (`apps/web/lib/config/ai.ts`) is `false` and stays `false`
until the owner decides provider, budget and keys. While it is `false`,
nothing AI-branded is visible anywhere in the product.**

Binding sources this document is grounded in (read them first; on conflict
they win):

- `docs/PLATFORM_DOCTRINE.md` **§7 AI-never-lies** and **§7.1 AI as
  translator, not author** — the constitution of this layer.
- `docs/PROJECT_VISION.md` **§9** — the six agent types, documented-only,
  delivered M4+ ON TOP of the core, never with it.
- `docs/handoffs/HANDOFF_esco_taxonomy_skill_recognition.md` **ETAPAS 2** —
  the existing LLM-mapping-layer design rule: design-only, owner-gated,
  LLM mapping is *translation into canon, never creation of truth*.
- `docs/handoffs/2026-06-10_sprint_phase3_max.md` Workstream D — this
  document's mandate.

Brand: **Labourmarket.ai**.

---

## 1. Position in the system

The AI layer is an **assistance layer on top of the canonical core**, never a
parallel system and never a writer of record:

```
canonical tables (read-only inputs)
        │
        ▼
  AI assist runtime (DOES NOT EXIST YET — owner-gated)
        │  every output tagged `suggestion`
        ▼
  human confirms / rejects (worker for self-declared, manager for verified)
        │
        ▼
  existing canonical write paths (RPCs / server actions) persist
        +
  append-only ai_assist_runs log (§7.1)
```

Two invariants follow directly from doctrine §7:

1. **Every claim an AI surface makes must trace to a row in a canonical
   table, or it is labeled a suggestion.** There is no third category. A
   sentence like "this worker has a verified skill X" is only renderable when
   `worker_skills.verified = true` for that row; anything the model adds
   beyond that is rendered under an explicit suggestion label.
2. **AI never persists.** Suggestions become records only through the
   existing human-confirmed write paths. AI has no INSERT/UPDATE/DELETE
   capability on any canonical table (§7.1: "AI MUST NEVER persist these
   suggestions to verified records autonomously").

## 2. Assist surfaces (planned, all behind `AI_ASSIST_ENABLED`)

| Surface | What it does | Canonical inputs (read-only) | Output |
| --- | --- | --- | --- |
| **Profile fill helper** | Suggests profile structure from the person's own free text (profile text, CV import) | `profiles`, `profiles.profile_text`, `workers`, `worker_skills`, `profile_skill_claims` | Suggestion-tagged candidate fields; persisted only via existing profile/skill confirm flows at self-declared level |
| **Matching explainer** | Explains in plain viewer-language WHY a human-recorded match candidate fits a request — using only derivable evidence | `customer_requests`, `workers`, `worker_skills` (verified flag), `journal_entries` + confirmations, readiness items | Suggestion-tagged explanation; never a score presented as fact; never overrides the human matching decision (workbench stays human-run) |
| **Document checklist helper** | Phrases the deterministic readiness gap ("what is missing for country X") as a plain-language next-step plan | The S3 documents/readiness model (see §6 below) | Suggestion-tagged plan; the underlying missing/ready facts come from the deterministic engine, not the model |
| **Journal structuring** | Reads a freeform journal entry and suggests structure (activities, durations, skill links) | `journal_entries.original_text` + language, `journal_entry_metrics`, taxonomy | Candidate structure per §7.1: free text → AI suggests → human confirms → persists at the appropriate trust level; raw run logged append-only |

All four are *drafting* surfaces. None of them sends, approves, verifies or
edits anything (§7 rules 1–3).

## 3. The six agent types (PROJECT_VISION §9 — documented only, M4+)

The vision fixes exactly six agent types. They are not implemented now and
nothing in this repo may claim otherwise:

1. **Worker-search agent** — searches the market, prepares a candidate list.
   Inputs: `customer_requests`, `workers`, `worker_skills`, availability.
   Output: a suggestion-tagged list; a human decides who is contacted.
2. **Candidate-fit agent** — compares and explains why a candidate fits.
   This is the *matching explainer* surface above; template:
   `docs/ai/prompts/matching-explainer.md`.
3. **Document-preparation agent** — checks gaps, produces checklists.
   Wraps the deterministic S3 readiness engine; template:
   `docs/ai/prompts/document-checklist-helper.md`.
4. **Manager-decision agent** — operates the manager's decision queue
   (drafts, ordering, summaries). Decisions remain human (§7 rule 3).
5. **Market-watch agent** — where skills are scarce, where demand is.
   Aggregates only platform-real data; gaps are stated as gaps, never filled
   with invented market numbers.
6. **Communication agent** — drafts messages/letters, **NEVER sends**
   without explicit permission (§9 hard rule; doctrine §7 rule 1).

Shared hard rule (verbatim intent of §9): AI assists; risky actions need
human approval; AI never lies, never fakes verification, never mass-sends or
alters documents without permission, never creates fake data.

## 4. Data contracts

### 4.1 Inputs — strictly canonical

Agent inputs are read **only** from canonical tables/views already governed
by RLS (doctrine §4 default-closed), through the same user-scoped or
RPC-mediated read paths the app uses. Canonical sources include:
`profiles`, `workers`, `worker_skills`, `skills`, `professions`,
`customer_requests` (the SOLE demand intake, doctrine §17),
`journal_entries` / `journal_entry_metrics` / `journal_entry_confirmations` /
`journal_entry_skills`, `conversations` / `conversation_participants` /
`conversation_messages`, `profile_skill_claims`, and the S3
documents/readiness structures once applied. No agent may introduce a
parallel data source, scrape, or accept unlabeled third-party data as fact.

### 4.2 Outputs — ALWAYS suggestion-tagged

Every AI output object carries, structurally (not just in copy):

```ts
{
  kind: "suggestion";          // never "fact", never "verified"
  surface: string;              // which assist surface produced it
  claims: Array<{
    text: string;               // viewer-language rendering
    groundedIn: string | null;  // canonical table+row reference, or null
    label: "derived" | "suggestion"; // null grounding ⇒ MUST be "suggestion"
  }>;
}
```

A claim with `groundedIn: null` can never render without its suggestion
label. UI copy uses the existing honesty vocabulary ("AI pasiūlymas" /
"AI suggestion") — colours never lie, green only when truly confirmed
(PROJECT_VISION §10).

### 4.3 Run logging — append-only per §7.1

Every future LLM call is logged append-only, before any human sees the
output, with at minimum:

- `provider` and `model` (exact identifiers),
- the full **raw response** as returned,
- the input reference set (which canonical rows were read),
- the human's **accepted subset** (linked after confirmation; empty if
  rejected),
- actor, timestamps, surface, prompt-template version.

This mirrors the existing `journal_entry_extractions` shape (migration
0013) and keeps the trust chain auditable indefinitely. Logs are
append-only: no UPDATE, no DELETE, RLS default-closed.

### 4.4 Language

Inputs keep the author's `original_text` + `language` (doctrine §2). Outputs
render in the **viewer's** language, but never replace or rewrite the
author's original — AI is translator, not author (§7.1).

## 5. Gating — owner-gated hard blocker

- **API keys = hard blocker.** No provider keys exist, no env/secrets are
  added, no external AI endpoint is called from this repo until the owner
  explicitly decides provider, budget and key handling. This repeats the
  ESCO handoff ETAPAS 2 rule and the sprint spec verbatim.
- **`AI_ASSIST_ENABLED = false`** in `apps/web/lib/config/ai.ts` is the
  single flag. While false, no AI-branded UI, copy, badge or route is
  rendered anywhere. The flag-flip ships as its own reviewed slice after the
  owner's provider decision — never as a side effect.
- A source-level guard (`apps/web/lib/guards/ai-readiness.test.ts`) pins:
  the flag is false, no LLM SDK (`@anthropic-ai/sdk`, `openai`) is imported
  anywhere under `apps/web/lib`, and the prompt templates stay marked
  TEMPLATE ONLY.
- Activation order when the owner decides: provider decision → key handling
  (owner-side, never committed) → run-log table migration (additive,
  human-gated) → one surface at a time behind the flag → flag flip per
  surface.

## 6. Deterministic helpers are NOT AI — never label them as such

The platform already ships (or has gated in flight) **deterministic,
rule-based helpers** that read real data and apply fixed logic:

- the **profile process brain** (`apps/web/lib/process-brain/`) — pure
  data→data next-step suggestions, guarded by
  `internal-ai-process-brain.test.ts` to stay network- and AI-free;
- the **documents/readiness checklist engine** (S3, gated PR #288) — computes
  "missing / ready / expiring" from declared document data and country
  requirement structures. It is deliberately **not** labeled AI and is
  allowed to be visible while `AI_ASSIST_ENABLED` is false precisely because
  it is honest, deterministic and API-free.

Rules:

1. **Never label deterministic logic as "AI".** Calling an `if`-cascade "AI"
   is a §7 lie in reverse — it fakes capability. Deterministic helpers use
   neutral copy ("checklist", "suggested next step", "computed from your
   data"), never "AI", never model branding.
2. **Never label AI output as deterministic fact.** The mirror rule: an LLM
   rendering of a checklist is a suggestion wrapped around deterministic
   facts; the facts keep their grounding, the phrasing keeps its suggestion
   label.
3. Deterministic helpers do not need `AI_ASSIST_ENABLED` and do not wait for
   it. AI surfaces always do.

## 7. What this layer will never do

- Never call an external AI API without owner-approved keys (hard blocker).
- Never write to a canonical table autonomously (§7.1).
- Never present a model-invented score, metric or fact as real (§7).
- Never raise a trust/verification level — recognition and explanation are
  always self-declared-or-lower; verified comes only from the
  manager-confirmed journal → Work Proof chain.
- Never send messages, alter documents, accept workers, or create data
  (PROJECT_VISION §9 hard rule).
- Never run unlogged: no run-log row, no output shown.
