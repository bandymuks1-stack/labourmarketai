# Labour Market OS — constitution v1

**Status:** ACTIVE (2026-07-13, "labour-market-os-workforce-planning-ai-routing v1" program)
**Scope:** the operating rules every LabourMarket.ai surface, model, and agent
must honour. Sub-contracts referenced below are binding parts of this
constitution.

## 1. What LabourMarket.ai is

LabourMarket.ai is a **Labour Market OS**: an operating system that turns
future work into staffed, delivered work. It is NOT reducible to:

- a job-posting form,
- a candidate CRM,
- a CV generator,
- a headcount calculator,
- a single AI assistant,
- another dashboard.

The core process the OS serves:

```
future work
→ work breakdown
→ required people and skills
→ current team capacity
→ upcoming capacity and skill shortfall
→ recommended resolution
→ internal assignment / training / hiring / agency / partner
→ candidates from multiple sources
→ one pipeline
→ communication
→ assignment
→ work result
```

Every new feature must locate itself on this chain. A feature that cannot is
out of scope.

### 1.1 Entry-point freedom (owner correction, 2026-07-13)

The chain above describes what the system can DERIVE — it is **not** a
mandated user sequence. LabourMarket.ai never dictates where a user must
start or in which order they work. Binding principles:

- **multiple valid entry points** — a company or agency may start from a
  future work package, a position, a specific candidate, a skill gap, a
  client need, a brigade, a CV/contact import, free text, or any other real
  part of their job; a worker may start from a CV, profile, offer, job
  search, journal, external profile, skills, availability, or desired
  conditions;
- **one canonical underlying system** — every entry path normalizes into the
  same canonical objects (§2); no duplicate objects are created because of a
  different entry path, and no path requires re-entering data another path
  already captured;
- **suggestions, not coercion** — recommendations (including "next action")
  are clearly labeled recommendations; the user may always choose a
  different action; no legitimate alternative path is blocked;
- **progressive completion** — missing information is collected when it is
  needed, can be skipped, and can be completed later; no mandatory long
  onboarding when the user's current goal doesn't need it;
- **user-controlled workflow** — "work first" means only that the system is
  ABLE to derive workforce needs from real future work; it is not a
  mandatory first screen or a mandatory workflow for every company.

### 1.2 User-entered facts stay authoritative (owner correction, 2026-07-13)

**Canonical data does not mean prescribed user behavior. User-entered facts
and choices remain authoritative until the user explicitly replaces or
confirms an alternative.**

Binding consequences (enforced by `lib/workforce/` and its guards):

- a value the user typed (e.g. required headcount) is projected, derived,
  and displayed AS the user's value — it is never silently replaced by a
  derived default, a fallback, or an AI suggestion;
- a system-derived number is always carried and displayed as a labelled
  suggestion (`system_suggested_*`), separately explained, editable,
  confirmable, and rejectable;
- these values stay distinct end-to-end:
  `user_entered_required_headcount`, `system_suggested_headcount`,
  `confirmed_required_headcount`, `available_headcount`, `headcount_gap`;
- a human edit is a user statement: it becomes the authoritative value and
  clears any competing system suggestion;
- the 2026-07-13 browser-proof defect (user entered 5, zone displayed 1 —
  the `team_size` column was never selected, so a fallback silently
  replaced the user's fact) is the canonical example of what this rule
  forbids; its regression matrix lives in
  `apps/web/lib/workforce/headcount-fidelity.test.ts`.

## 2. Canonical models (one truth per concept)

| Concept | Canonical store | Contract |
|---|---|---|
| Structured demand / future work intake | `customer_requests` (+ `payload.structured_v2`, `payload.workforce_plan`) | `future-work-planning-contract-v1.md` |
| Execution / delivery | `projects` (+ assignments, members) | — |
| Workforce requirements (derived) | `payload.workforce_plan` on the demand row; derivation is deterministic + human-confirmed | `workforce-requirements-contract-v1.md` |
| Capacity & gaps (derived) | pure read composition (`lib/workforce/`) — never stored as a parallel model | `workforce-capacity-skill-gap-contract-v1.md` |
| Skills truth | `profile_skill_claims` + `worker_skills` (Living CV) | `living-cv-contract-v1.md` |
| Candidate pipeline | derived, never stored | `candidate-pipeline-contract-v1.md` |
| Talent source provenance | `talent_source_records` (draft, owner-gated) | `multi-source-talent-provenance-contract-v1.md` |
| External profiles | `worker_external_profiles` (draft, owner-gated) — never a second truth model | `external-profile-consent-contract-v1.md` |
| Identity resolution | append-only `identity_resolution_events` (draft, owner-gated) | `identity-resolution-contract-v1.md` |
| AI task routing | `lib/ai/runtime/task-routing.ts` policies + audit records | `cost-aware-ai-task-routing-contract-v1.md` |
| AI data minimization | per-task allowed/prohibited field lists | `ai-data-minimization-contract-v1.md` |

Hard rule: **no fourth demand model, no second project model, no second CV
truth store, no second company dashboard.** New demand-adjacent concepts are
an additive column, a satellite fact table, or a derived read on the
canonical rows — exactly as `agency_clients`, `demand_shortlist`, and
`workforce_plan` did it.

## 3. Derivation honesty

Every system-derived suggestion (requirements, gaps, recommendations, AI
outputs) carries:

- **source** (rule id or model tier),
- **explanation** (why it was suggested),
- **confidence**,
- a **human decision state** (suggested / confirmed / edited / rejected).

Nothing derived is treated as fact until a human confirms it. A position
(vacancy) may be created **only** from a human-confirmed gap.

## 4. Human control (P11 hard bans)

The system never, under any configuration:

- auto-rejects or auto-accepts a candidate,
- auto-publishes a position,
- auto-sends communication,
- auto-merges profiles (see `identity-resolution-contract-v1.md` —
  `AUTO_MERGE_ENABLED = false`),
- auto-edits CV facts,
- sends a full CV where a task needs a few fields,
- sends one CV to multiple AI providers simultaneously,
- transmits address, phone, exact coordinates, or documents without necessity.

High-impact outputs must be explainable, editable, confirmable, rejectable,
and audited.

## 5. AI doctrine

- Deterministic first; the cheapest model that clears the quality threshold;
  the maximum model is never the default; every routing decision audited.
- Capacity and skill gaps are computed deterministically — never by an LLM.
- Fallback never silently lowers quality; cost ceilings block instead of
  degrade; missing provider = honest manual/deterministic flow, no fake AI.
- Technical model names never appear in primary user-facing UI.
- Provider adapters are declared seams (`adapter-contract.ts`): only wired
  providers are `active`; everything else is `declared_inactive` or
  `unavailable` — no fake operation.

## 6. Data & sourcing doctrine

- People enter the system only through the eight legitimate source types
  (provenance contract). **No hidden scraping, no import without consent.**
- Every person-source carries provenance (type, name, reference, consent
  status, first seen, last confirmed, import method, canonical person link).
- Original sources are never deleted by identity resolution; merge/unmerge
  are audited, human-decided events.

## 7. Migration doctrine

Schema changes: prove existing schema is insufficient first; additive only;
fail-closed RLS; server-side role checks; SECURITY DEFINER RPC writes; paired
rollback; APPLIED_LEDGER "Deferred" entry; `@human-gate-required`; **never
applied by an agent** — owner applies via Supabase MCP `apply_migration`.

## 8. Surface doctrine

- One workspace per identity (`canonical-identity-workspace-contract-v1.md`).
- The workforce planning zone lives INSIDE the company workspace — never a
  second dashboard.
- Visual planning uses timeline, capacity bars, short numbers, skill chips,
  status indicators, one primary CTA. Forbidden: text walls, multiple
  next-action blocks, technical AI copy, horizontal scroll hiding the primary
  action, button-like elements without an action.
- The primary CTA is a labeled recommendation, never a mandatory command
  (§1.1); alternative legitimate entry actions stay visible and unblocked;
  empty states offer a choice of starting points, not a single funnel.
- Honest degradation everywhere: an unapplied migration or missing provider
  renders a truthful "prepared, owner activation pending" state — never a
  fake control.

## 9. Proof doctrine

Green tests alone never prove a product principle. Every product claim must
be backed by a real user scenario (browser proof at 360/390/412/1366/1440
viewports, employer + worker + agency journeys, AI-routing behaviour).
Browser proof ledger: `docs/launch/labour-market-os-browser-proof-v1.md`.
