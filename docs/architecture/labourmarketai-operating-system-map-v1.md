# Labourmarket.ai Operating System Map v1

> The technical layer-by-layer view of the product. Companion to
> `docs/product/labourmarketai-supergrand-vision-os-v1.md` (the
> narrative) and the public `/[locale]/vision` page (the user-facing
> map).

Each layer is documented as:

- **Purpose** — what it does conceptually.
- **Current state** — what's actually in the repo today.
- **Target state** — what the layer becomes when the OS is whole.
- **Dependencies** — what other layers must be ready first.
- **Risks** — what makes the layer hard to ship safely.
- **Allowed next slice** — the smallest sprint that meaningfully
  advances the layer without crossing a TABU rule (no DB / RLS / RPC /
  PR #18 / billing / deploy in this sprint family).

## 0. Conventions

- "Live today" = the layer has at least one renderable surface backed
  by real data the user controls.
- "Preparing" = the layer has catalogue rows + i18n copy + a config
  flag, but no live surface that mutates state.
- "Hidden" = explicitly out of scope. Catalogue row exists ONLY so
  the honesty guards have a canonical home.

## 1. Identity Layer

- **Purpose**: one human identity that can hold many roles and many
  evidence trails over time.
- **Current state**: Supabase Auth + `profiles` table + `profile_roles`
  + `active_role`. One sign-in → one profile → 0..n roles. Worker is
  the only fully active role today.
- **Target state**: same identity grows roles as the user expands;
  history of role assumption preserved.
- **Dependencies**: existing auth + DB. Layer is mature.
- **Risks**: future role enums require migrations (PR #18 family) —
  out of scope for this sprint.
- **Allowed next slice**: no code change; this layer is healthy.

## 2. Role Layer

- **Purpose**: the catalogue of role kinds + which are active.
- **Current state**: `lib/config/roles.ts` (PR #38). 7 ids; worker
  active; company / agency / customer preparing; freelancer /
  team_lead / service_provider hidden. Renderers consume the catalogue
  uniformly (RoleSwitcher, account list, dashboard role expansion,
  public vision map).
- **Target state**: 7+ active roles, each with a working management
  surface.
- **Dependencies**: Identity layer + per-role dashboards.
- **Risks**: accidentally promoting a row without shipping the
  underlying flow — feature-availability bridge guards against it.
- **Allowed next slice**: one role at a time, paired with its feature
  flip. The vision page + the dashboard grid are both ready.

## 3. Profile / CV Layer

- **Purpose**: a living profile that the user controls; CV is a
  *view*, not the source.
- **Current state**: `app/[locale]/dashboard/profile/page.tsx` with
  `ProfileTextFirstFlow` (PR #30). Text-first composer + CV input
  panel + suggestion review + manual chip picker as secondary.
  Confirmed-state trail: "Confirmed by you · Added to your profile
  · Needs external confirmation later".
- **Target state**: the profile assembles itself from real entries
  (work journal + confirmations) plus the worker's narrative.
- **Dependencies**: Skill / Capability + Work Journal + Confirmation.
- **Risks**: profile-as-truth without manager confirmation is
  honestly labelled today.
- **Allowed next slice**: extend the structured-suggestion confirmation
  to write into the `suggestion_proposals` / `suggestion_confirmations`
  audit tables — but only after PR #18 (issue #32) opens the path.

## 4. Skill / Capability Layer

- **Purpose**: a typed catalogue of what a worker can do.
- **Current state**: `messages/{locale}/skill-names.json` taxonomy +
  `worker_skills` table. Rule-based parser proposes skill claims from
  free text (`lib/structuring/extract-profile-suggestions.ts`).
  Honestly labelled rule-based, not AI.
- **Target state**: capability claims linked to confirmed journal
  entries; trust score is a derived view (later layer).
- **Dependencies**: Profile, Work Journal, Confirmation.
- **Risks**: dictionary drift across verticals — fixed by extending
  the dictionary, not by AI.
- **Allowed next slice**: add domain dictionaries (cleaning, customer
  support, design, dev, etc.) to `keywords.ts`. Zero DB.

## 5. Work Journal Layer

- **Purpose**: the substrate of evidence. Worker writes what they
  did; entries become the proof CV.
- **Current state**: `app/[locale]/dashboard/journal/page.tsx` +
  `JournalEntryComposer` (PR #30). Free-text first, suggestion
  review, save via `createJournalEntry` server action. Entries live
  with `visibility_scope: "closed"`. The pilot-backbone note (PR #39)
  honestly tells workers the security layer is preparing.
- **Target state**: append-only hash-chained entries, manager /
  client confirmation, narrowed RLS, audit logs.
- **Dependencies**: PR #18 / issue #32 — blocks the audit-grade
  upgrade.
- **Risks**: pretending the journal is legally hardened before PR #18
  ships. The pilotBackboneNote is the live guard against this.
- **Allowed next slice**: copy / clarity only until PR #18 lands.

## 6. Evidence / Proof Layer

- **Purpose**: turn journal entries into externally-confirmable
  artifacts (photos, documents, manager attestations).
- **Current state**: the `proof_of_work` scaffold is part of PR #18
  (blocked). No surface today.
- **Target state**: each journal entry can carry attached evidence
  (photos, files), visible to the manager confirmation flow.
- **Dependencies**: PR #18.
- **Risks**: privacy + audit obligations. Storage scope decisions
  need owner approval.
- **Allowed next slice**: design doc only until PR #18 lands.

## 7. Confirmation Layer

- **Purpose**: external attestation by a manager / client.
- **Current state**: `journal_entry_confirmations` direct-insert path
  works (used by `apps/web/lib/journal/confirm-actions.ts`).
  Suggestion-status catalogue has `externally_confirmed` row but
  marked preparing — UI must not render it for arbitrary records
  (guard-enforced).
- **Target state**: AFTER INSERT trigger logs to `audit_logs`;
  RPC-driven confirm / reject / revoke; reason required.
- **Dependencies**: PR #18.
- **Risks**: trust system breaks if confirmations can be silently
  revoked. PR #18 addresses this via the ledger.
- **Allowed next slice**: PR #18 migration review.

## 8. Project / Team / Company Layer

- **Purpose**: organisations and their needs, not just individuals.
- **Current state**: `engagement_contexts` table + organisations
  taxonomy (PR #20–#26). Pilot cockpit surface for company / agency
  / customer roles.
- **Target state**: real workspace per role with team / project
  management.
- **Dependencies**: Role catalogue promotion; per-role dashboard
  routes.
- **Risks**: company workspace before the journal is hardened means
  managers attest without an audit trail — keeps the layer
  preparing.
- **Allowed next slice**: small slice of company workspace UI
  surfacing existing pilot data honestly.

## 9. Opportunity / Draft / Scouting Layer

- **Purpose**: discovery — who can do this work?
- **Current state**: `matching` + `marketplace` are
  `availability: "hidden"` in the feature catalogue. No surface.
- **Target state**: contextual fit signals (PRODUCT_CONSTITUTION §10);
  draft / scouting board; no universal score.
- **Dependencies**: confirmed evidence layer (otherwise matching is
  on self-declared text, which is fake matching).
- **Risks**: fake matching is the biggest reputational risk; the
  guard test forbids any "matching" / "score" / "ranking" claim.
- **Allowed next slice**: none until evidence is real. Doctrine doc
  references already exist.

## 10. Communication / Notifications Layer

- **Purpose**: tell the right person the right thing at the right
  time.
- **Current state**: `NotificationPanel` + cross-role "switch to X
  to view" CTA. No notifications table yet.
- **Target state**: notifications table; in-product feed;
  per-channel preferences.
- **Dependencies**: notifications schema (DB).
- **Risks**: spam / opt-out compliance.
- **Allowed next slice**: schema sketch only.

## 11. Next Action Engine

- **Purpose**: tell the user the one thing to do next.
- **Current state**: dashboard's "Next move" card computes the next
  incomplete worker step (profile → skills → journal). First-use
  panel surfaces the 5-step path.
- **Target state**: every role's dashboard answers the same question
  using per-role logic + feature gates.
- **Dependencies**: per-role surfaces.
- **Risks**: pointing at preparing flows would surface broken CTAs.
  The feature gate prevents this.
- **Allowed next slice**: extend the worker engine to surface
  "external confirmation pending" once PR #18 lands.

## 12. Trust / Reputation Layer

- **Purpose**: a derived view of confirmed evidence.
- **Current state**: none. Honestly absent — no trust score, no
  rating.
- **Target state**: contextual fit signals (PRODUCT_CONSTITUTION §10),
  never one universal score.
- **Dependencies**: confirmed evidence at scale.
- **Risks**: any premature score is a fake claim. Layer stays absent
  until evidence is real.
- **Allowed next slice**: nothing. Doctrine already documented.

## 13. AI / Agent Orchestrator Layer

- **Purpose**: longer term — an internal agent layer that helps with
  summarisation, suggestion ranking, anomaly detection.
- **Current state**: rule-based parser only (no AI). UI labels honest.
- **Target state**: real AI assist gated by explicit "AI suggestion"
  label; never auto-approval.
- **Dependencies**: a real LLM or model integration + privacy review.
- **Risks**: any fake AI claim. The honesty guard blocks "AI verified"
  / "AI matched" / "AI-powered extraction" copy.
- **Allowed next slice**: zero until a real engine ships behind an
  honest label.

## 14. Safety / Privacy / Audit Layer

- **Purpose**: protect the user's data + create legal-grade evidence.
- **Current state**: RLS on user-owned tables; `visibility_scope:
  "closed"` default on journal entries. Audit hardening blocked on
  PR #18.
- **Target state**: append-only journal + audit logs + RPC-only
  external mutations + per-flag exposure (`visibility.public_proof`,
  `visibility.client_report`).
- **Dependencies**: PR #18 / issue #32.
- **Risks**: shipping anything that depends on this layer (public
  proof, client reports) before the migration is reviewed.
- **Allowed next slice**: PR #18 review sprint.

## 15. Billing / Paid Pilot Layer — explicitly disabled

- **Purpose**: monetisation.
- **Current state**: **not touched in any PR in this family**
  (#30–#39). No pricing CTA, no checkout, no subscription, no
  provider integration.
- **Target state**: founder-decided pricing surface, well after the
  paid-pilot cohort sees consistent value.
- **Dependencies**: founder decision + legal review (VAT, invoicing,
  refunds).
- **Risks**: turning on billing before the product earns trust.
- **Allowed next slice**: zero. Sprint contracts forbid touching it.

## Cross-cutting: catalogues are the source of truth

Every UI decision flows from one of:

- `lib/config/roles.ts` (Role layer)
- `lib/config/feature-availability.ts` (Feature layer)
- `lib/config/activity-types.ts` (Activity layer)
- `lib/config/suggestion-statuses.ts` (Suggestion-state layer)
- `lib/config/navigation.ts` (derived from feature catalogue)

The vision page (`/[locale]/vision`), the dashboard role grid, the
feature availability grid, the role switcher, and the account roles
list all read from the same source. Adding / hiding / promoting a
row updates every surface at once.
