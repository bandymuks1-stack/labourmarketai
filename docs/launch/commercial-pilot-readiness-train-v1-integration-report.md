# Commercial Pilot Readiness Train V1 — Integration Report & Conflict Matrix

Date: 2026-07-16 · Baseline: main @ `39196ec8` · Companion doc:
`commercial-pilot-readiness-train-v1-delivery-truth.md`.

Four wagons implemented in isolated worktrees on independent branches, all
based on main. All four passed their full validation suites at final HEAD.
Wagon 3 (CV import) ships no PR — recorded as
`IMPLEMENTATION_COMPLETE_PRODUCTION_ACTIVATION_OWNER_GATED`.

## Wagon results

| Wagon | Branch | HEAD | Files | Tests at HEAD | Migrations (all DRAFT/owner-gated) |
|---|---|---|---|---|---|
| A — Worker Discovery & Consent v1 | `feat/cc/worker-discovery-consent-v1` | `665a1680` | 38 (+3666/−37) | 10,136 green | `20260716120000_contact_disclosure_requests_v1`, `20260716121000_request_rate_limits_v3` |
| B — Trust Connect Teams v1 | `feat/cc/trust-connect-teams-v1` | `85c2126f` | 30 (+3826/−173) | 10,099 green (re-run post-renumber) | `20260716130000_team_profile_details_v1`, `20260716131000_team_enquiries_v1` |
| C — Explainable Matching v1 | `feat/cc/explainable-matching-v1` | `d7def5d2` | 38 (+3241/−433) | 10,116 green | none |
| D — Pilot Onboarding & Measurement v1 | `feat/cc/pilot-onboarding-measurement-v1` | `85b1fad0` | 29 (+3052/−11) | 10,110 green (re-run post-renumber) | `20260716140000_pilots_cohort_v1` |

## Conflict matrix

### 1. Shared files touched by more than one wagon

| File | Wagons | Nature | Resolution |
|---|---|---|---|
| `apps/web/lib/market/match-subject.ts` | A (freshness in supply layer), C (`experienceYears` on subject) | Real source overlap | C rebases over A after A merges; changes are in different concerns of the same module — mechanical merge |
| `apps/web/lib/scouting/scouting.ts` | A (facet filters), C (need assembly extracted to `need-from-request.ts`) | Real source overlap | Same — C rebases over A; A's filter calls survive around C's extraction |
| `apps/web/lib/guards/product-readiness.test.ts`, `market-map-read-layer-v1.test.ts`, `ops-bridge-migration.test.ts` | A (140→142), B (140→142), D (140→141) | Migration-count ratchets, each bumped independently from the same baseline | Cumulative re-pin on each rebase: after A = 142, after B = 144, after D = 145. C changes none |
| `apps/web/messages/{en,lt,ru,nl,de}.json` | A, B, C, D | Additive key sets, distinct namespaces | Auto-merge / trivial; C additionally translated the 6 non-active locales (allowed) |
| `apps/web/lib/guards/telemetry-accuracy.test.ts` | D only (of the four) | — | No conflict |
| `apps/web/app/[locale]/dashboard/company/scouting/page.tsx` | A only (C deliberately avoided it) | — | No conflict |
| `apps/web/components/app/team-brigades-panel.tsx` | B only | — | No conflict |

No wagon edited another wagon's owned surface. Zero accidental cross-wagon
edits found in gate inspections.

### 2. Shared tables / types

| Object | Wagons | Verdict |
|---|---|---|
| `TeamMatchInputV1` | B defines read model (`apps/web/lib/company/team-match-input.ts` + `docs/launch/team-match-input-contract-v1.md`); C defines consumer type (`apps/web/lib/market/team-match-contract.ts`) | **Verified structurally identical** field-for-field (C's readonly modifiers accept B's output). C's workbench uses a clearly-marked temporary adapter (identity + member count only, everything else honest not-stated) — swap to B's `buildTeamMatchInput` is the one deferred integration task after A–C merge |
| New DB tables | A: `contact_disclosure_requests(+_events)`; B: `team_details`, `team_enquiries(+_events)`; D: `pilots`, `pilot_participants`, `pilot_outcomes` | Disjoint; FKs only to applied tables (`profiles`, `organizations`, `customer_requests`, `workers`); no wagon references another wagon's tables (guard-asserted in A and D) |

### 3. Migration dependencies & collision resolution

- **Collision found and fixed before any PR opened** (per addendum §4): wagons
  A, B, D independently picked `20260716120000` (A and B also both used
  `…121000`). Resolution: A keeps `1200xx/1210xx` (first in PR order); B
  renumbered to `1300xx/1310xx` (commit `85c2126f`); D renumbered to `140000`
  (commit `85b1fad0`). All code/guard/doc references updated; full suites
  re-run green in both worktrees after renumbering.
- Every migration applies against current main alone. Intra-wagon order for B
  (`130000` before `131000`) is documented in the migration headers.
- All five migration files carry `-- DRAFT — needs-human-gate — DO NOT APPLY
  without explicit owner OK`, paired rollbacks in `supabase/rollbacks/`, and
  honest 42P01/42883 in-app degradation.

### 4. Status vocabulary

- A `contact_disclosure_requests` and B `team_enquiries`: **identical** —
  statuses `created → accepted | declined | withdrawn | expired`;
  `delivered`/`viewed` exist only as event types in the append-only events
  tables (A and B both); same rate limits (10 open + 30/24h), same
  idempotency (unique partial index on open rows, duplicate create returns
  existing), same 14-day expiry with admin-only sweep and lazy finalisation,
  same audit fields (actor/event_type/from_status/to_status + `audit_logs`).
  One shared conceptual lifecycle, two domain tables. No incompatibility.
- Honest limitation (both): no `delivered` writer exists (no delivery channel
  yet); B writes `viewed` on first authorised inbox read, A does not yet
  track views. Vocabulary reserved identically in both.
- D `pilot_outcomes` is a separate append-only outcome ladder (not an enquiry
  lifecycle) — no vocabulary interaction.

### 5. Duplicated helpers

- Rate limiting: A ships app-layer `lib/limits/request-rate-limits.ts` (also
  wired to booking/conversation) + in-RPC caps; B enforces the same numbers
  in-RPC only. Same policy, two enforcement points — acceptable now;
  candidate for a shared SQL helper in a later cleanup, recorded.
- Events+audit SQL pattern: A, B, D each instantiate the canonical
  invitations/booking pattern for their own tables — pattern reuse, not
  duplication.
- No duplicated matching logic remains: C deleted `match-suggestions.ts`
  (with full a–h proof pack) and froze the staffing fork behind an
  import-ban guard.

### 6. UX route overlap

None. A: scouting + privacy + launch-readiness. B: company room + network.
C: admin/matching + demand wizard. D: admin/pilots (new) + admin/telemetry +
onboarding wizard (telemetry only). All compact/folded per PR #773 doctrine;
no new long-scroll surface.

### 7. Test overlap

Only the three ratchet guard files (see §1) and shared full-suite runs.
New guard files are disjoint per wagon (A: 3 new guards; B: 1 new + 1
re-pinned; C: 3 new + calc-version re-pins; D: 1 new + 4 extended).

### 8. Required merge / rebase order

1. **Merge A** (`worker-discovery-consent-v1`) — as-is.
2. **Rebase B over new main** → ratchets 142→144, locale JSON merge → re-run
   suite → merge B.
3. **Rebase C over new main** → resolve `match-subject.ts` + `scouting.ts`
   with A; locale JSON merge; no ratchet change → re-run suite → merge C.
4. **Rebase D over new main** → ratchets → 145; locale JSON merge → re-run
   suite → merge D.
5. **Integration hardening (small follow-up after A–C):** swap C's temporary
   workbench team adapter to B's `buildTeamMatchInput` (single call-site in
   `lib/admin/matching-workbench.ts`); optional shared rate-limit SQL helper.

## Owner-gated items (unchanged by this train — hard stops)

1. Apply draft migrations (in this order after merges): A `20260716120000` +
   `20260716121000`, B `20260716130000` + `20260716131000`, D
   `20260716140000`. Until applied, every dependent surface shows its honest
   "prepared, not enabled" state.
2. Wagon 3 production activation: verify + apply `20260714160000`
   (education/certificates/achievements), production-smoke the import fields;
   optional AI: `AI_PROVIDER_MODE` + key + `20260714150000` (`ai_runs`).
3. Booking expiry sweep scheduler (pre-existing owner gate).
4. `pnpm db:types` regeneration after applying migrations.
5. §7.4 human review of AI-seeded ru/nl/de translations.

## Honest limitations carried into the PRs

- No live-browser E2E of the new auth-gated surfaces (worker/company/
  superadmin sessions required); validation relied on the full test suites
  (10k+ each), guard tests, and production builds. Responsive E2E at the five
  viewports remains an open follow-up alongside migration application.
- Worker-side withdraw-disclosure UI is a pre-existing gap (applied RPC
  exists; flagged in Wagon A report), out of train scope.
- Cohort-scoped time-to-value requires the pilots migration + participant
  events; global TTV shipped with the limitation stated in-UI.

Terminal state upon Draft PRs opening in the order above:
**COMMERCIAL_PILOT_READINESS_TRAIN_MERGE_READY** (owner merges; agent does
not auto-merge per train directive).
