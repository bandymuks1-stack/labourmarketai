# Labourmarket.ai — From Pilot to Grand Vision Roadmap v1

> Five honest phases between today's working worker beta and the full
> labour-market OS. Each phase declares its **user value**, **required
> real functionality**, **what must not be faked**, the **owner smoke
> requirement** before advancing, and the **merge / deploy risk**.
>
> Phases are gates, not deadlines. A later phase cannot start until
> the gates of the previous one are honestly closed.

## Phase 0 — Now / Pilot Core (where we are today)

### User value

- One sign-in.
- Worker can start text-first (write or paste a CV).
- Suggestion review → user confirmation → saved facts.
- Work journal with honest "pilot, private only" framing.
- Role-aware account surface with non-locking copy.
- Public `/vision` page that founders can share with prospective
  pilot participants.

### Required real functionality (all live)

- Auth (Supabase, Google OAuth, email + password).
- Onboarding wizard with multi-role selection.
- `ProfileTextFirstFlow` + `JournalEntryComposer` + role catalogue +
  feature catalogue + suggestion catalogue.
- Mobile bottom-nav + mobile-safe layouts.
- Guard test suite (73+ assertions).

### What must NOT be faked

- "AI verified" / "AI matched" / "auto-approved" / "guaranteed match"
  / "instant hiring" — guards enforce.
- Active state on any role beyond worker.
- External confirmation badge before PR #18 ships.

### Owner smoke requirement before advancing

- PR #30 production mobile smoke: **PENDING**. Owner walks through
  `docs/evidence/post-merge-production-smoke-pr30.md` against the
  live deploy.
- Super Max Cosmo owner checklist (PR #39): **PENDING**.
- Vision page reads cleanly to a non-engineer in LT + EN.

### Merge / deploy risk

- Low. Source-only changes since PR #30. Zero migrations.

## Phase 1 — Near / Paid Pilot (3–5 hand-picked workers + 1–2 small companies)

### User value

- Founder personally onboards 3–5 workers.
- Each worker completes profile + 5+ journal entries.
- Founder collects feedback on the text-first flow + the journal
  honesty banner.
- 1–2 small companies see the company pilot cockpit; submit lead via
  the existing `/api/leads` path.

### Required real functionality

- Everything in Phase 0.
- A founder-side review surface (could be the `/dashboard/inbox`
  route + a manager-engagement context).
- Reliable email delivery for signup / reset (this is operational —
  not in any current PR's scope, but exists today).

### What must NOT be faked

- Pilot participants must NOT see "verified" badges on their own
  declared facts.
- No pricing surface yet. Billing is explicitly disabled.

### Owner smoke requirement before advancing

- Phase 0 smoke checklists both flipped to PASSED.
- Pilot participants give written / verbal qualitative feedback.
- PR #18 migration review (issue #32) scheduled.

### Merge / deploy risk

- Low. Operational and content work, not structural.

## Phase 2 — Next / Confirmation + first non-worker workspace

### User value

- A manager / client can confirm a journal entry.
- Workers see external confirmation appear on entries that were
  reviewed.
- One non-worker role (likely company OR agency) flips from
  preparing → active, with a real workspace beyond the pilot
  cockpit.

### Required real functionality

- **PR #18 lands**: audit logs, narrowed RLS, confirm / reject /
  revoke RPCs, the `proof_of_work` scaffold, `visibility.public_proof`
  + `visibility.client_report` feature flags (DB-level).
- New routes under `/dashboard/<role>/...` for the promoted role.
- `external_confirmation` feature flips from preparing → active.
- The `pilotBackboneNote` on the journal is removed (or replaced
  with the "now live, your entries can be confirmed" wording) in
  the same PR.

### What must NOT be faked

- The promoted non-worker role must NOT activate before its real
  workspace exists.
- "Externally confirmed" still cannot appear on entries that
  weren't actually externally confirmed (the RPC path enforces
  this).

### Owner smoke requirement before advancing

- A separate Phase 2 smoke checklist (to be authored when the PR
  sequence starts).
- A worker + a manager pair walk through "I record → they confirm
  → I see externally confirmed" end-to-end.

### Merge / deploy risk

- Medium-high. Two coupled migrations (audit + RLS narrowing). PR
  #18 must be re-validated against the current schema (issue #32).
  Owner approval required before any production push.

## Phase 3 — Later / Marketplace + Scouting (no fake matching)

### User value

- Companies discover workers via contextual fit signals
  (PRODUCT_CONSTITUTION §10), never a universal score.
- Workers are visible as honest player-card / scouting cards on
  approved surfaces.
- Draft / board view for forming a team or staffing a project.

### Required real functionality

- Confirmed evidence at scale (Phase 2 must be stable for weeks
  with multiple actively-attesting managers).
- Contextual signal computation (per-context, never universal).
- Marketplace catalogue rows flip from `hidden` → `preparing` →
  `active`, paired with real surfaces.
- The `matching` feature row stays hidden until a real engine
  ships — flipping it without the engine fails the honesty guard.

### What must NOT be faked

- Matching results. No fake "AI matched", no fake "trust score".
- Discovery surfaces must NOT show workers who haven't agreed to be
  publicly listed (visibility flags from PR #18).

### Owner smoke requirement before advancing

- Phase 3 smoke checklist.
- 10+ workers + 3+ companies actively using the system for weeks.
- A separate legal review of the discovery surfaces.

### Merge / deploy risk

- High. Multi-table coordination + privacy review + GDPR / data
  rights review. New migration sprints required; out of scope until
  Phase 2 is stable.

## Phase 4 — Future / AI Labour-Market OS

### User value

- AI assist for suggestion ranking, anomaly detection, "what would
  this manager confirm next?" hints.
- Live monitor / control room for the founder + the participating
  organisations.
- Cross-role intelligence — "this worker is grouping into a team
  with these two others; they keep recording joint work" surfaced
  as an honest signal, never as auto-matching.

### Required real functionality

- A real LLM or in-house model with privacy-reviewed inference.
- An explicit "AI suggestion" label on every AI-produced row.
- Audit logs of every AI suggestion + every user confirmation /
  rejection of it.
- The `ai.extraction` + `ai.verification` feature rows flip from
  `hidden` → `preparing` → `active`, gated by the honesty guard.

### What must NOT be faked

- AI as a label when it's a regex. The guard test that forbids
  "AI-powered extraction" copy applies forever.
- Auto-approval. No record may flip from suggestion → fact
  without a human confirmation tap.

### Owner smoke requirement before advancing

- A separate Phase 4 smoke checklist + privacy review + model card.
- Public principles doc explaining what the AI does and doesn't
  decide.

### Merge / deploy risk

- High. New external dependency (model provider) + privacy
  obligations + content policy. Multiple migration sprints.

## Cross-phase invariants

- Non-locking identity: every phase preserves
  `roles.nonLockingIntro` and `auth.dashboard.account.rolesIntro`.
- Catalogue-driven UI: every UI change for a new role / feature /
  activity is a row in `lib/config/*.ts` + i18n + (optional)
  surface route. Renderer edits remain the exception.
- Honest copy: the fake-claims guard list grows, never shrinks.
- Smoke gates: every phase has an owner-led smoke checklist that
  stays PENDING until the owner physically signs off.
- PR #18 dependency: every artefact that needs the audit /
  confirmation layer waits for it. Until then, the
  `pilotBackboneNote` stays visible on the journal page.

## What this roadmap intentionally does NOT promise

- Specific calendar dates.
- Pricing decisions.
- External integrations (Telegram / email automation / outbound).
- Mobile native apps.
- Public discovery / matching engines before Phase 3 prerequisites
  are met.
