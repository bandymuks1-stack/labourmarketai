# 0024 — One memory and context architecture (owner direction, 2026-10-11)

## Decision
LabourMarket.ai has **one** long-term memory: the canonical domain tables in Supabase/PostgreSQL,
read under RLS. Chat First, Living CV, organizations, teams, projects, calendar, supply, demand,
matching and learning all read and write the same facts. There is no second "AI memory", no
separate vector database, no external notebook or workflow engine as a store of record. A new
store needs a measured technical need and an owner decision.

This extends `PLATFORM_DOCTRINE.md` §3 (append-only, hash chain, audit), §6.1 (do not store what
can be recomputed), §7/§7.1 (AI suggests, humans confirm), `OWNER_TARGET_ARCHITECTURE_V1.md` §1.3
("one AI, one conversation" over the graph), SEP-1 (FACT ≠ DERIVED ≠ FORECAST), decisions 0014
and 0017. It replaces none of them.

## The six layers — kept apart, never collapsed
| Layer | What it is | Where it lives today | Rule |
|---|---|---|---|
| **Facts** | work entries, engagements, projects, plans, needs, offers, invitations, confirmations | `journal_entries` (+skills/metrics/confirmations), `engagement_contexts`, `projects`, `work_plan_entries`, `customer_requests`, `team_demand_offers`, `invitations`, … | append-only where doctrine says so; corrected by new rows, never silently rewritten |
| **Events** | what happened, by whom, when | per-domain event tables, `audit_logs`, `notification_events`, journal hash chain | the history of a fact is its event trail, not a summary |
| **Confirmations** | a human's attestation of a specific fact | `journal_entry_confirmations`, `worker_skills.verified` via the confirm RPC | scoped to exactly what was reviewed (#2271); never widened by inference |
| **Derived readings** | work intelligence, growth, potential capabilities (0023), CV tiers, capacity, spine counts | computed at read time | recomputed, never stored unless cached with TTL + invalidation (§6.1) |
| **AI output** | extraction candidates, intent proposals, suggestions | `journal_entry_extractions`, `ai_runs`, `skill_candidate_clarifications` | a hypothesis with provenance; **never replaces or overwrites a confirmed fact** |
| **Short-term conversation** | the current goal, last sentences, offered/declined | the chat's in-memory goal; the transcript (owner-gated) | context for the next turn only; never a source of truth |

## Context keys
Every read and write is bound to **who** (`auth.uid()`), **in which workspace**
(`profiles.active_organization_id`, resolved server-side — never a client claim) and, where
relevant, **to which object** (`project_id`, `engagement_context_id`, `request_id`,
`conversation_id`). One organization's context never appears in another:
- the chat transcript is one thread per **(person, workspace)** — `assistant_conversations.organization_id`,
  null = personal space (proposal `assistant-transcript-v1`, owner-gated);
- creating an organization (company setup, a brigade) keeps the person in a working context —
  the new or originating workspace is pinned through the switcher's validated core (#2284, #2287);
- RLS decides visibility everywhere; a summary, a brief or a search never bypasses it.

## Action lifecycle
understood → prepared → **confirmed once** → executed → saved → verified.
- A confirmation token is bound to a state the write itself changes, so a replay or a double
  submit is refused (`stale_confirmation`) before the executor runs — `worker.log-work`,
  `company.create-demand`, `company.create-project`, `engagement.end`, … (#2286).
- An executor returns the real result; the UI never reports success the database did not return.
- A second, complete statement in chat is a new action, never merged into an unsaved one (#2274).

## Regression guards
`lib/guards/memory-architecture-0024.test.ts`, `dispatch-create-single-use.test.ts`,
`brigade-keeps-workspace.test.ts`, `new-org-becomes-active.test.ts`,
`confirm-skills-entry-scope.test.ts`, `living-cv-potential-inference.test.ts`.

## Known open items (owner-gated or next)
- Apply the transcript migration (RED) — now workspace-scoped; record `action_id`/`action_status` on
  result turns so the transcript can prove what was executed.
- Single-use fingerprints for the remaining confirm-tier creates (`assign-worker`, `move-worker`,
  education creates, `agency.propose-candidate`); a submit guard for `reversible_write` actions.
- `company.move-worker` must not answer `ok` when ending the source assignment failed.
