# Applied Migration Ledger

## Applied 2026-08-13 — notification event types v2 (V8 owner decision A)

- **`20260813100000_notification_events_v2_types.sql` — `event_type` allowlist grows by `booking_withdrawn` and `engagement_ended`. APPLIED TO PRODUCTION 2026-08-13 under the owner's conditional V8 approval.** Production ledger row: version **`20260813072402`**, name **`notification_events_v2_types`** (apply-time-as-version drift — match on name). LF-normalized SHA-256 of the applied file: migration `e39f586e…`, rollback `8a4e7948…`, both from `origin/main` `77828e37` with a clean worktree.
- **BEFORE readback:** v1 constraint (7 types), 0 rows, 2 policies, authenticated-only grants, 7 constraints. **AFTER readback:** constraint carries exactly the 9 types, rows still 0 (zero unintended DML), policies/grants/constraint-count unchanged. Dependency proof: v1 table + constraint name existed (ledger `20260813065236`). Rollback restores the v1 list; at 0 rows its cost is zero.
- **Emitters wired the same day:** every withdraw success path notifies the WORKER; ending an engagement notifies the COUNTERPARTY of the server-derived actor side; labels in all 11 catalogues; the `engagement_ended` copy is deliberately neutral about visibility (F2 — a notification may not claim what it has not measured), enforced by `lib/guards/notification-v2-emitters.test.ts`.

## Production data cleanup 2026-08-13 — the four QA-synthetic rows (V8 owner decision 3, STRICTLY BOUNDED)

- **Owner-approved bounded delete, executed 2026-08-13.** Before: `booking_requests` = 2 (both `[QA-SYNTHETIC] testinis pasiulymas - NEREAGUOTI`, ids `88a43ead-…` accepted / `435488f2-…` proposed), `customer_requests` = 19 of which 2 QA (`02684b8a-…`, `6689f801-…`, titles `[QA-SYNTHETIC - nereaguoti / test]`). Provenance proven from the rows themselves; all children (4 `booking_request_events`, 1 `demand_shortlist`, 1 `demand_interest_signals`) belonged to the same 2026-08-06 #1042 QA journey — same QA worker `2b7213f7-…`, same evening, attached ONLY to the QA parents; all FKs `ON DELETE CASCADE`.
- **The DELETE carried the QA marker in its own predicate** (`note like '[QA-SYNTHETIC]%'` / `title like '[QA-SYNTHETIC%'`) so a mistyped id could not remove a real row. One transaction: `bookings_deleted = 2`, `requests_deleted = 2`.
- **After (VERIFIED_DB):** `booking_requests` = **0**, `customer_requests` = **17 (all real)**, QA markers left in either table = **0**, orphaned children = **0/0/0**, unrelated data untouched (`journal_entries` 36, `workers` 36, `company_worker_engagements` 0). Traction counts are now clean: any non-zero booking from here on is real traffic.

## Reconciled 2026-08-13 — privacy_request_intake was ALREADY APPLIED (ledger doc gap, closed)

- **`20260706150000_privacy_request_intake.sql` — `submit_privacy_request_v1` (data-export / account-deletion intake). DISCOVERED APPLIED in production since 2026-07-06** — production ledger row version **`20260706160157`**, name **`20260706150000_privacy_request_intake`** — but never recorded in THIS document, and the 2026-08-13 trust audit consequently mis-reported the deletion-request path as "not accepted in production" by grepping this doc instead of probing `supabase_migrations.schema_migrations`. The lesson is the method: **this document is a secondary record; the production schema_migrations table is the truth.**

  **Re-verified byte-identical on 2026-08-13 (V8 owner decision 2):** deployed body md5 `99636c98902af0211eec3c4b46febf3f`, length 1543 — exactly the repo migration's `$$…$$` body. SECURITY DEFINER with `search_path=public` pinned; EXECUTE granted to `authenticated` (+ owner) only — anon/public revoked. Self-only insert (`profile_id := auth.uid()`), type allowlist (`data_export` / `account_deletion`), note bounded 500, open-request cap 3. Requester read isolation via `customer_requests_select` (`profile_id = auth.uid() OR is_admin() OR has_org_demand_access(organization_id)`), and `has_org_demand_access(NULL)` measured **false** — privacy rows (org NULL) are invisible to org readers. `customer_requests` privacy-marked rows in production today: **0** — the path works and simply has not been used.

## Applied 2026-08-13 — durable notification events (V8 owner decision 1)

- **`20260810070000_notification_events_v1.sql` — durable per-recipient notification events. APPLIED TO PRODUCTION 2026-08-13 under the owner's explicit V8-continuation approval ("APPROVED ... TIK jeigu ... byte-identical ... visi safety gates GREEN").** Production ledger row: version **`20260813065236`**, name **`notification_events_v1`**, prod `gorgitwvdzxbnaxhrsrw`. Ledger drift as documented three times before: production stamps APPLY TIME as `version` — match on `name`. Exactly one ledger row added.

  **Pre-apply gates, each verified GREEN the same day on `origin/main` `7669c61a`:** LF-normalized SHA-256 `c71a3b18…` (migration) and `d6230765…` (rollback) matched the gate doc exactly; comment-stripped executable body `2391723f…` matched; RLS decision read from the executable body (anon: no grant, no policy; authenticated: SELECT own + UPDATE of the `read_at` column only, both policies keyed `recipient_profile_id = auth.uid()`; INSERT deliberately not granted — service_role is the only writer); idempotency `(recipient_profile_id, dedupe_key)` UNIQUE; metadata bounded 2 KB with code-side allowlist; 112 notification tests GREEN locally (`lib/notifications/` 64 + notification guards 48, including the #1125 href guard).

  **Post-apply readback (VERIFIED_DB, same session):** table exists; `relrowsecurity = true`; **0 rows** (zero unintended DML); exactly 2 policies (`notification_events_select_own` r / `notification_events_mark_read_own` w, both authenticated-only); anon holds **no** table or column grant; authenticated table grant = SELECT only; the only UPDATE column grant is `read_at`; 4 indexes; 1 unique constraint. Rollback remains `drop table if exists public.notification_events` — reversible by construction.

  **Retention note, stated honestly:** the table has no automatic retention; rows persist until a future owner-approved retention policy. This is the gate-approved shape (append-only), not an oversight.

> Human-readable record of migrations **actually applied to prod**
> (`gorgitwvdzxbnaxhrsrw`), who approved each, and what it did. Source of truth
> for "is it live" is always the Supabase ledger (`supabase_migrations.schema_migrations`)
> + this file. Migrations are applied **manually via Supabase MCP `apply_migration`**
> — there is no automated apply step, and `supabase db push` is never used (the
> repo filenames don't match the ledger versions). See
> `docs/CONVERGENCE_CHANGELOG.md §3` and PLATFORM_DOCTRINE §16.
>
> **Naming note:** the repo filename (`YYYYMMDDHHMMSS_*` per §16) and the ledger
> `version` differ for everything applied via MCP `apply_migration` — the tool
> stamps its own apply-time timestamp. Both identify the migration by `name`.
>
> **⚠️ COVERAGE BOUNDARY (added 2026-08-07).** This file has never stated from
> which date it claims completeness, so "no row here" has meant two different
> things at once. Reconciled against production on 2026-08-07
> (`docs/audits/APPLIED_LEDGER_FULL_RECONCILIATION_2026-08.md`, 190 repo files ×
> 187 prod rows, read-only):
>
> * **After `20260720190000`** — this file is expected to be COMPLETE. An absent
>   row is drift and should be investigated. (Three such gaps were found on
>   2026-08-07 and are recorded below.)
> * **`20260702130000` … `20260720190000`** — the 26-migration drift window
>   documented below. 19 remain unwritten; the notice, not this boundary, is
>   their record.
> * **Before `20260702130000`** — **63 applied migrations have no row here** and
>   never did. This file does NOT claim completeness for that era. Absence
>   proves nothing; query production.
>
> **Matching a migration is name-based, and one name is currently ambiguous:**
> `company_memberships_v1` exists as TWO repo files — `20260714210000_*` (DRAFT,
> never applied) and `20260806090000_*` (applied, prod `20260805195716`). A
> name-based check reports the draft as applied. See the reconciliation §4.

---

### ✅ APPLIED TO PROD — `20260809120000_can_view_worker_booking_engagement_v1` (#1097, GDPR identity-disclosure predicate)

| Field | Value |
|---|---|
| Applied | **2026-08-12** via Supabase MCP `apply_migration` (`{"success":true}`). Never `db push` |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger version | `20260812214302`, name `can_view_worker_booking_engagement_v1` (match on `name` — prod stamps APPLY TIME as `version`, the documented drift) |
| PR | **#1097**, branch `feat/cc/can-view-worker-booking-engagement-v1`, squash-merged as main **`ae556355`** (from `343d8957`) |
| Owner gate | **TWO-STAGE, and the distinction matters.** Train v6.3 §3 approved only the PREPARATION: the widening "MUST NOT be blindly applied in its previous disclosure state" and could be merged/applied only once C1/C2a/C2b held. Those shipped in `520cfcf1` while the migration stayed deliberately UNMARKED. Train v6.4 §1 "OWNER APPROVAL A" then granted the marker outright, scoped to this migration only; it was added in commit `aca4e5e0`, the same commit that recorded the decision |
| Checksums | migration file sha256 `142c78d7…`; comment-stripped executable sha256 `a55c22d7…` (62 lines) |

**What it does**: ONE `create or replace function public.can_view_worker(uuid)`.
The applied `20260711130000` body is preserved and exactly one OR-branch is added
to the legitimate-interest arm — an ACTIVE `company_worker_engagements` row whose
company the caller owns. No table, column, index, constraint, trigger or policy
added or changed. **Zero DML.** The three `revoke`/`grant` statements re-state the
existing posture rather than widening it.

**Why it was needed**: the database was already HALF-disclosing. The applied
`list_booking_engagement_workers_v1` (prod `20260723182516`) is SECURITY DEFINER
and already hands the engaging company owner `display_name` and `profile_id`
under exactly these three conditions, bypassing `can_view_worker`. The RLS
predicate contradicted a disclosure the database performs; this makes them agree
and extends it to the professional-summary tables.

**PRODUCTION READ-BACK (verified, not asserted).** Before → after:

| Property | Before | After |
|---|---|---|
| body md5 (whitespace-normalised) | `74b4a804…` | `ef27b2ff…` |
| body length | 1196 | 2348 |
| `company_worker_engagements` branch | **false** | **true** |
| consent arm (`worker_profile_discoverable`) | intact | **intact** |
| roster / `engagement_contexts` / `project_worker_assignments` arms | intact | **intact** |
| `stable`, `security definer` | yes | **yes** |
| ACL | — | `postgres=X/postgres`, `authenticated=X/postgres` — **anon and PUBLIC hold NOTHING** |
| policies still bound | — | `workers_select`, `worker_skills_select`, `worker_professions_select`, `worker_languages_select` |

`owns_company` was re-read from production and is caller-bound
(`companies.profile_id = auth.uid()`), which is what confines the new branch to
the single company holding that engagement.

**WHAT WAS NOT PROVEN, STATED PLAINLY.** The per-role behavioural proof —
unrelated employer, sibling company, ENDED engagement, withdrawn-consent
subject, worker self-access — was **NOT executed**. The branch ships
`scripts/db-proof/can-view-worker-booking-engagement.sh`, which spins up a
throwaway Postgres and runs the real migration and rollback verbatim under
`set local role authenticated`; the harness could not be started in this session
(container creation refused by the harness permission classifier, and routing
around that refusal is forbidden). Production cannot substitute: it holds
**0 rows in `company_worker_engagements`**, so every branch evaluates false and
no behavioural signal exists there. The narrowness above is therefore proven
STRUCTURALLY (predicate text + `owns_company` body + ACL + policy bindings),
not behaviourally. **Running that harness is the top follow-up.**

**Rollback**: `supabase/rollbacks/20260809120000_can_view_worker_booking_engagement_v1.down.sql`
restores the `20260711130000` body verbatim. Not executed.

---

### ✅ APPLIED TO PROD — `20260808150000_caller_manages_worker_engagements_v1` (#1095, beta-audit P1 defect A1)

| Field | Value |
|---|---|
| Applied | **2026-08-12** via Supabase MCP `apply_migration` (`{"success":true}`). Never `db push` |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger version | `20260812180224`, name `caller_manages_worker_engagements_v1` (match on `name` — the drift documented above recurs: prod stamps APPLY TIME as `version`) |
| PR | **#1095**, branch `fix/cc/caller-manages-worker-engagements`, squash-merged as main **`9e20f1b4`** (from `1d16912d`) |
| Owner gate | "**#1095 = APPROVED YES**", public beta completion train v6.2 directive, 2026-08-12. The `@human-gate-approved` marker was added in the SAME commit that recorded the decision (`f7705f05`), never on agent initiative |
| Checksums | migration file sha256 `df8019bd…2d80a`; comment-stripped executable sha256 `aac4b753…6d7f6` (102 lines, `begin;` → `commit;`) — the executable portion is what was applied, verbatim |

**What it does**: three `create or replace function` bodies, no schema change.
(1) NEW `caller_manages_worker_by_roster(uuid)` — the pre-existing roster rule
under an honest name. (2) `caller_manages_worker(uuid)` — delegates to the
helper OR an ACTIVE `company_worker_engagements` row for a company the caller
owns (the A1 fix). (3) `assign_worker_to_project(text,text)` — restores the
`caller_has_booking_engagement_for_project` OR-branch that W11's
`20260804120000` silently reverted, bound to `by_roster` (NOT the widened
predicate) so engagement authority cannot leak to a sibling company's project.
No table, column, index, constraint, trigger or policy added/changed. **Zero DML.**

**The two claims a reviewer cannot check by eye were proven MECHANICALLY, not asserted.**
Both "body preserved from the APPLIED migration" claims were verified BEFORE
merge by comparing comment-stripped, whitespace-normalised md5 of the repo file's
function bodies against production `pg_proc.prosrc`:

| Claim | Digest | Result |
|---|---|---|
| `caller_manages_worker_by_roster` body == pre-apply `caller_manages_worker` | `0595bf33df9029f9aea83b7db4d61488` (303 chars) | **EXACT MATCH** |
| `assign_worker_to_project` body, with the ONE new auth clause reverted, == prod | `58b6d2f458466d39212dd200bb38dc77` (1190 chars) | **EXACT MATCH** |

So the migration provably changes exactly one authorization line in
`assign_worker_to_project` and nothing else in that body — W11's
completed-project guard included.

**Pre-apply checks (read-only, immediately before, all as the header predicted)**:
`caller_manages_worker` mentions `company_worker_engagements` → **false** (the
A1 defect still live); `caller_manages_worker_by_roster` → **0 rows** (name
free); `assign_worker_to_project` mentions
`caller_has_booking_engagement_for_project` → **false** (W11's revert still
live); `caller_has_booking_engagement_for_project` existed with **0 callers**
(orphaned SECURITY DEFINER function). Policies on
`workers`+`worker_skills`+`worker_professions`+`worker_languages` = **9**.
`company_worker_engagements` = **0 rows**. `worker_absences` at
`status='requested'` = **0 rows**.

**Post-apply verified by production read-back (not inferred)**:
`caller_manages_worker` now delegates to `by_roster` AND carries the engagement
branch, and does NOT re-inline `company_workers`/`agency_workers`.
`caller_manages_worker_by_roster` normalised md5 = **`0595bf33…`** — byte-for-byte
the pre-apply `caller_manages_worker` body, so the roster rule survived
verbatim. `assign_worker_to_project` carries the project-bound helper AND still
carries W11's `Project is completed` guard, and does NOT reference
`company_worker_engagements` directly. All three: `prosecdef=true`,
`search_path=public` pinned, ACL exactly `postgres=X | authenticated=X` — no
`PUBLIC`, no `anon`. **Policy count unchanged at 9**; total public policies 255,
tables 139. `company_worker_engagements` still **0 rows** and
`project_worker_assignments` still **2 rows** — zero DML confirmed.
`caller_has_booking_engagement_for_project` caller count **0 → 1**: the orphaned
bridge is reconnected, which is the measurable proof of Problem 2's fix.
`can_view_worker` still has NO engagement branch — #1097 correctly NOT applied.

**⚠️ HONEST GAP — the per-role BEHAVIOURAL proof was NOT executed.**
`scripts/db-proof/a1-caller-manages-worker-engagements.sh` (which measures
engaged-employer authority, SIBLING-company isolation, UNRELATED-employer
refusal, ENDED-engagement revocation, private-reason protection and worker
self-access, BEFORE→AFTER→ROLLBACK→RE-APPLY against a throwaway Postgres) could
not run: the sandbox classifier denied the Docker invocation. It was NOT run
against production, and no test rows were created in production.
**The exposure of that gap is bounded to zero.** Production holds **0
`company_worker_engagements` rows**, so the new OR-branch is `exists(<empty>)`
for every caller — it grants authority to nobody today, and cannot until a
worker accepts a booking. What IS proven is the structure (above) and the
static branch-narrowness guards in
`apps/web/lib/guards/caller-manages-worker-engagements.test.ts`. Running the
DB proof remains the outstanding verification for this migration.

---

### ✅ APPLIED TO PROD — `20260809160000_public_vacancy_persistence_v1` (#1107, real-supply foundation)

| Field | Value |
|---|---|
| Applied | **2026-08-09** via Supabase MCP `apply_migration` (`{"success":true}`) |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger version | `20260809175828`, name `public_vacancy_persistence_v1` (match on `name`) |
| PR | **#1107**, branch `feat/cc/real-beta-train-v1`, applied from exact HEAD `dbdbeb29` |
| Owner gate | "ARCHITECTURE APPROVED" decision 2026-08-09 (conditional on a 9-point re-verification; ALL NINE conditions verified immediately before apply), recorded in `docs/human-gates/public-vacancy-persistence-gate.md`. Migration sha256 `00d9cd87…f3143`, rollback `c91fbe75…5aa6a`, comment-stripped executable sha256 `c7e99bea…c4ddb6`. Marker covers exactly two findings (`grant-or-revoke`, `alter-drop-policy`) — the first draft's `rls-to-anon`/`grant-anon-public` findings were REMOVED (anon grant deleted), not approved |

**What it does**: creates the two-table floor under the already-complete vacancy pipeline — `public_vacancies` (canonical external public-employment-service ads) and `vacancy_import_cursors` (per-provider/channel checkpoint + health). NO function, NO extension, NO trigger, NO `CREATE OR REPLACE`, NO DML, no FK to any platform-identity table.

**Pre-apply checks (all 9 owner conditions, immediately before)**: PR head `dbdbeb29` = local HEAD, main unchanged `0d8de71d`, MERGEABLE; checksums byte-identical to the gate record; DDL surface = 2 tables + 6 indexes + 1 SELECT policy only; no source activation in the diff; no import caller in the diff; `anon` present only in REVOKE lines; governance `arbetsformedlingen` still `activation: "owner_review"`; kill switch fail-closed (`provider_disabled` when unset); CI green incl. `migration-safety`.

**Post-apply verified (read-back, not inferred)**: both tables exist with **0 rows**; RLS enabled on both; `public_vacancies` grants = exactly `authenticated:SELECT` (anon: none), 1 policy; `vacancy_import_cursors` = 0 policies, 0 anon/authenticated grants. **Zero imports occurred and none can occur**: source governance stays `owner_review` and `VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED` is unset in production. Activating any source is a SEPARATE owner decision.

---

### ✅ APPLIED TO PROD — `20260807140000_booking_engagement_org_resolution_v1` (#1047, the beta P0)

| Field | Value |
|---|---|
| Applied | **2026-08-08** via Supabase MCP `apply_migration` (`{"success":true}`) |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger name | `booking_engagement_org_resolution_v1` (match on `name`) |
| PR | **#1047**, merged to main as `40c5bff1` |
| Owner gate | Beta-stabilization P0 decision 2026-08-08 (conditional on re-verification; condition met), recorded in `docs/human-gates/booking-engagement-org-resolution-gate.md`. Executable sha256 `da6ae1cd56abc5c382424452ddb5d3a737d429c103032c0e93f78dedeffcd8c2` — identical before/after the marker. Marker covers exactly three findings (`security-definer-function`, `grant-or-revoke`, `data-dml`) |

**What it does**: replaces ONE function body (`respond_booking_request_v3`) so an organization-stamped demand resolves its engagement company deterministically via `customer_requests.organization_id → organizations.legacy_company_id`; the NULL-org profile-singleton fallback is byte-preserved. Closes the live 2026-08-06 defect where the accepted booking `88a43ead…` minted nothing because its owner holds two companies.

**Pre-apply checks** (the migration's own list, run immediately before): `organization_id` column present (1), `company_worker_engagements` present, exactly one v3. Production coverage measured: 19/19 demands org-stamped, 0 company-orgs without a bound company, 0 dangling pointers (structurally impossible — FK without ON DELETE).

**Post-apply verified (read-back, not inferred)**: live v3 body contains the org-first branch (`v_demand_org` → `legacy_company_id`); SECDEF with pinned `search_path`; EXECUTE authenticated-only, anon false; **zero rows moved** — bookings 2, engagements 0, events 4, all identical pre/post. Apply-time DML: none (the classifier's `data-dml` finding matches the UPDATE inside the function body).

**Proof on record**: `scripts/db-proof/booking-engagement-org-resolution.sh` — **39/39** on a throwaway container, BEFORE phase reproducing the live defect against the production v3 first; incl. sibling-company isolation (S9), already_active (S10), and per-role RLS visibility (S11). Silence fix shipped in the same PR: `lib/booking/engagement-invariant.ts` + the admin project-truth section (9/9 behavioural guard, mutation-checked).

**Known open item, deliberate**: the historical booking `88a43ead…` remains accepted-without-engagement. The idempotent replay branch reports `already_recorded` WITHOUT re-running the engagement branch (by design), so the fix does not retroactively mint. Repair is a separate owner decision — classified NEEDS_OWNER_APPROVAL; the invariant surface shows it as a VIOLATION until decided. The paired rollback stays unexecuted.

---

### ✅ APPLIED TO PROD — `20260808120000_worker_absence_scheduling_view_v1` (W12 employer absence privacy)

| Field | Value |
|---|---|
| Applied | **2026-08-08** via Supabase MCP `apply_migration` (`{"success":true}`) |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger name | `worker_absence_scheduling_view_v1` (version/name apply-time drift — match on `name`, per the doctrine at the top of this file) |
| PR | **#1089**, merged to main as `ca3d0fa3` |
| Owner gate | Product-direction approval given 2026-08-08, recorded in `docs/human-gates/w12-absence-privacy-hardening-gate.md`. Migration sha256 `530c262c…917a7`, rollback `dfd7b275…2ca4`, comment-stripped executable sha256 `f544129d893386090f3bb2ce9ba7dd5a2d2f233714c5e6db3b2f445d29d9a1ad`. Marker covers exactly two findings (`grant-or-revoke`, `alter-drop-policy`) |

**Preflight (read-only, immediately before apply)**: `worker_absences` held **0 rows**, so the change could not affect a single existing record; the live `worker_absences_select` expression matched the pre-change form byte-for-byte; neither `20260808120000` nor `20260808130000` was in the prod ledger.

**What it does**: narrows `worker_absences_select` so a manager reaches the whole row only while `status = 'requested'` (the window in which the free-text note is what they are being asked to act on); adds the definer view `public.worker_absence_scheduling` exposing `id, worker_id, start_date, end_date, half_day, status` for **approved** absences, carrying `caller_manages_worker() OR is_admin() OR self` as its own predicate. Worker self-access and admin branches unchanged. Writes are untouched — request/review/cancel are SECURITY DEFINER RPCs.

**Post-apply verified (independent read-back, not inferred)**: the live policy now reads `… OR (caller_manages_worker(worker_id) AND (status = 'requested'::text)) OR is_admin()`; the view exists with **exactly** `id,worker_id,start_date,end_date,half_day,status`; grants are `authenticated:SELECT` plus the table owner's implicit set, and **`anon` holds nothing**.

**Accepted consequence (owner, explicit)**: a manager loses the ability to read the reason for an absence they have already approved. That is the intent of the minimum-necessary model, not a side effect.

**Not done / out of scope**: no data touched, no row created. The paired rollback stays unexecuted.

---

### ✅ APPLIED TO PROD — `20260807090000_org_owner_membership_seed_v1` (Finding-2 / M-P0-4 gap closure)

| Field | Value |
|---|---|
| Applied | **2026-08-06 17:36:50 UTC** via Supabase MCP `apply_migration` (`{"success":true}`) |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger version | `20260806173650`, name `org_owner_membership_seed_v1` (version/name apply-time drift — match on `name`). Ledger 186 → **187**, exactly ONE row added |
| PR | **#1043** (`fix/fresh-organization-owner-membership-v1`, supersedes #1041 CLOSED) |
| Owner gate | **Finding-2 apply approval** (2026-08-06), reviewed HEAD `61b444bd`; binding comment-stripped executable sha256 `e4aebfb657122c663e1ee46a4d319988a0b77176d851cf7adc402dcd90e51668` identical pre/post marker (marker commit `9140405a` is comments-only). Migration sha256 (pre-marker) `f4e79346…0605c`, rollback `d6e3bec5…ec81c`. Marker covers exactly the four findings (`security-definer-function`, `grant-or-revoke`, `create-trigger`, `data-dml`) |

**Preflight (immediately before apply, post-#1040-merge)**: organizations 13, canonical 10, backfill-eligible EXACTLY 3 (QA-SYNTHETIC Alfa `9e4f4467` / Gama `3a2732d1` / Beta `d95280ac`), ambiguous 0, no-owner-evidence 0, active owner memberships 10, migration absent from ledger, seed trigger absent.

**What it does**: AFTER INSERT trigger `on_org_owner_membership_seed` on `public.organizations` — every new org atomically gets ONE `owner/active/org-create` membership (idempotent: live-tuple NOT EXISTS + ON CONFLICT DO NOTHING on `company_memberships_live_key`); fail-closed refusal of ownerless org INSERTs (`org_without_owner`, 23514); guarded one-time backfill (`backfill:organizations.owner_profile_id:v2`) with the §5 ambiguity guard (a different active owner → never written, NOTICE'd); post-condition raises unless zero unambiguous orphans remain. Definer function pins `search_path`; EXECUTE revoked from PUBLIC, anon AND authenticated.

**Post-apply verified**: active owner memberships **10 → 13**; exactly 3 v2-provenance rows; Alfa/Beta/Gama each hold exactly one active owner membership; zero duplicate live tuples; trigger present; SECDEF + pinned path confirmed; anon/authenticated EXECUTE = false; live fail-closed probe (rolled-back DO block): ownerless INSERT refused, 0 residue rows. **Zero business-row changes outside company_memberships** — organizations 13, companies 10, customer_requests 17, projects 5, booking_requests 0, engagement_contexts 52 (no employee converted), experience_records 0, billing 0/0, profiles 35: all identical pre/post. Security advisors: 0 ERROR, no new finding.

**Not done / out of scope**: no membership bootstrapped by hand, no QA row touched directly, no demand created pre-verification. The paired rollback (`drops trigger + function only, never membership rows`) stays unexecuted.

---

### ✅ APPLIED TO PROD — `20260806220000_stripe_multi_subject_v2` (M-P0-7 / Stripe TEST v2)

| Field | Value |
|---|---|
| Applied | **2026-08-06 15:31:28 UTC** via Supabase MCP `apply_migration` (`{"success":true}`) |
| Production ledger version | `20260806153128`, name `20260806220000_stripe_multi_subject_v2` (apply-time version drift — match on `name`). Ledger 185 → **186** |
| PR | **#1040** (`feat/stripe-test-multi-subject-v2-r1`, successor of #1035 per the blocked-force procedure; #1035 CLOSED superseded) |
| Owner gate | **Owner Decision S1** (2026-08-06, command §10) — conditions verified on HEAD `b9376d2e`: migration/rollback byte-identical to reviewed #1035 content (sha256 `fc9654c8…` / `da336d0e…`), suites 217/217, ratchets 189, no timestamp collision. Marker commit `83726345` scoped to grant-or-revoke, drop-constraint-bare, create-trigger |

**Preflight (immediately before apply)**: billing_customers **0**, billing_subscriptions **0**, payment_webhook_events **0**; `billing_subjects`/`stripe_webhook_events` absent; migration not in ledger — zero real billing rows anywhere, nothing to classify.

**What it does**: `billing_subscriptions.organization_id` (FK, on delete set null) + immutable `origin_organization_id` (no FK, trigger-captured); uniqueness remodel — the single `(owner_id, plan_key, provider)` constraint replaced by TWO partial unique indexes (personal scope WHERE origin IS NULL; organization scope WHERE organization_id IS NOT NULL) so one payer can hold Personal + org A + org B with the same plan key. TEST-only storage; enables NO payment by itself; RLS unchanged; no LMC object touched.

**Post-apply verified**: 2/2 columns, 3/3 indexes, capture trigger present, old constraint GONE, rows 0 before and after (**zero business-row changes**).

**Not done / out of scope**: no Stripe object created, no key configured, no checkout run, no Live anything. S2 (TEST env setup) is a separate owner step; the paired rollback stays unexecuted and needs its own decision once real TEST rows exist.

---

### ✅ APPLIED TO PROD — `20260806230000_experience_author_subject_v1` (W6 author/subject)

| Field | Value |
|---|---|
| Applied | **2026-08-06 13:56:49 UTC** via Supabase MCP `apply_migration` (`{"success":true}`) |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger version | `20260806135649`, name `20260806230000_experience_author_subject_v1` (version/name apply-time drift — match on `name`). Ledger 184 → **185**, exactly ONE row added |
| PR | **#1037** (`feat/w6-experience-author-subject-model-v1`) |
| Owner gate | **Owner Decision W6-D1** (2026-08-06), reviewed HEAD `30691a60`; marker commit `266df613` changed comments only — comment-stripped executable sha256 `fd7c2b5ed2c16aec0e12b9b67fcbd3f3be1e75c781b7aefdf12fd9e73e731bb1` identical pre/post marker. Migration sha256 (pre-marker) `4389e15e…1cf202d`, rollback `5155e276…d353f97`. Marker covers exactly the three emitted findings (`security-definer-function`, `grant-or-revoke`, `data-dml`) |

**Preflight (re-verified immediately before apply)**: `experience_records` **0**, `experience_responses` **0** (the approval's zero-row condition held — no newly appeared rows to classify); witnesses bookings 0 / engagements 46 / memberships 10 / projects 5 / profiles 32; merge-tree vs main `58d30738` clean; migration count main 187 + this ONE = 188; no `20260806230000` collision.

**What it does**: adds `author_side text not null default 'person' check (person|organization)` + `author_organization_id uuid references organizations(id) on delete set null` to `experience_records`; guarded backfill (**production no-op — 0 rows, 0 rows updated**); constraints `experience_records_author_side_shape` + `experience_records_org_no_self_review`; partial unique index `experience_records_one_org_author_per_interaction` (the organization speaks once per interaction) + `experience_records_author_org_idx`; replaces `submit_experience_record` (same signature) — org-scoped bookings resolve the worker's subject to the booking ORGANIZATION, employer-side org authorship requires LIVE `manages_organization()` (revoked manager refused, history immutable), author side derived server-side (not expressible by the client).

**Post-apply verified**: 2/2 columns, 2/2 constraints, 2/2 indexes present; RPC `prosecdef=true`, body carries the author-side derivation, the org-booking authority check and the org-subject inheritance; `has_function_privilege` — anon **false**, authenticated **true**; ALL business-row counts identical to preflight (0/0/0/46/10/5/32 — **zero rows rewritten**); security advisors: **0 ERROR**. Sentiment binary / no stars / no numeric score / no self-review / moderation-dispute separation / count-only consumption / anti-oracle behaviour: unchanged by construction (v1 regression proof 43/43 on identical SQL) — no numeric column exists on the table (proof 15).

**Proof package**: local db-proof 35/35 (`W6_AUTHOR_SUBJECT_DATABASE_MODEL_PROVEN`), v1 regression 43/43, rollback cycle (down → v1 restored + 43/43 → up → 35/35), browser e2e 9/9 + 4 chip screenshots (`docs/audits/evidence/premium-rebuild/w6-author-subject/`), full vitest 13843/13843. Gate doc: `docs/human-gates/experience-author-subject-v1-gate.md`.

**Not done / out of scope**: no experience row created during apply; no real users; production WRITE proof rides the separately-approved PROD_QA journey. Rollback (`…down.sql`) present, NOT executed — once real experience rows exist it needs its own owner decision (it drops the author-side classification).

---

### ✅ APPLIED TO PROD — `20260806200000_org_demand_spine_v2` (M-P0-6)

| Field | Value |
|---|---|
| Applied | **2026-08-06 09:24:29 UTC** via Supabase MCP `apply_migration` (`{"success":true}`) |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger version | `20260806092429`, name `org_demand_spine_v2` (version/name apply-time drift — match on `name`). Ledger 183 → **184**, exactly ONE row added |
| PR | **#1029** — merged via its successor branch after this accounting commit; supersedes #1016 (CLOSED) |
| Owner gate | "CLOSE MULTI-ORGANIZATION STRUCTURAL TRAIN" (2026-08-06) §1/§4; reviewed HEAD `190240b1`; rebased onto post-#1032 main with migration AND rollback byte-identical (sha256 `732fa7ab…` / `64c59ead…`; comment-stripped executable `b3b5388e…` identical through the marker commit). Shared ratchet slot resolved: 186 → **187** after #1032 took 186 |

**Preflight (classified, not guessed)**: 17 customer_requests — ALL 17 owned by exactly-one-company+exactly-one-org owners (0 multi-company owners, 0 company-less owners, 0 ambiguous); 1 demand_shortlist (stampable via its demand); 0 booking_requests; kinds `agency_offer,company_request`, statuses `closed,draft,submitted`; pre-apply SELECT policies verbatim = the legs the migration re-creates; raw authenticated UPDATE grant on customer_requests confirmed (the surface the invoker-rights guard must catch); public RPC fingerprints `list_open_demand_for_workers` `0a34c1f8…`, `list_open_demand_for_agencies` `feecf625…`; migration absent from ledger.

**Backfill (actual = predicted)**: **17 demand + 1 shortlist + 0 booking** rows stamped; 0 rows left NULL of the eligible set; 0 ambiguous rows stamped. The only production rows changed by the apply are these 18 authorized attribution stamps.

**Post-apply verified**: 3 `organization_id` columns + 3 partial indexes; 5 triggers (3 guard + 2 inherit); 5 functions — `has_org_demand_access` / `submit_demand_request_v2` / `save_demand_draft_v2` SECURITY DEFINER + pinned search_path + anon revoked/authenticated EXECUTE, the two trigger fns granted to NOBODY; `demand_org_attribution_guard` **SECURITY INVOKER by design** (so `current_user` exposes the raw authenticated surface). Live proofs (role-played, read-only/refused-write): raw PATCH value→value rewrite **refused** (`organization_attribution_immutable`); a membership-less stranger reads **0** stamped demand rows; the demand owner's own leg intact. **Public marketplace contracts unchanged**: both RPC fingerprints identical pre/post. **Zero side effects outside the authorized stamps**: organizations/companies/memberships/engagements/projects/experiences/profiles/billing counts and fingerprints identical; audit_logs still 34; **no booking row created**. Advisors: **0 ERROR**; +3 WARN = exactly the three new authenticated callables under `authenticated_security_definer_function_executable` (intended design). Full behavioural matrix (two-context stamping, forged org refusal, inheritance, member exclusion, A↛B isolation, archive-then-drop rollback) proven 14/14 on the local stack — `docs/audits/evidence/multi-org-m-p0-6/mp06-two-org-actor-proof-output.txt`.

**Not done / out of scope**: no production demand inserted, no production QA users, no #1016 apply, no marketplace read widening. Rollback (`…down.sql`) present, NOT executed — archives all attribution into `demand_org_attribution_archive` before any column drop.

### ✅ APPLIED TO PROD — `20260806180000_membership_authority_widening_v1` (M-P0-4 consumer slice, DB side)

| Field | Value |
|---|---|
| Applied | **2026-08-06 09:02:58 UTC** via Supabase MCP `apply_migration` (`{"success":true}`) |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger version | `20260806090258`, name `membership_authority_widening_v1` (version/name apply-time drift — match on `name`). Ledger 182 → **183**, exactly ONE row added |
| PR | **#1028** — merged via its successor branch after this accounting commit |
| Owner gate | "CLOSE MULTI-ORGANIZATION STRUCTURAL TRAIN" (2026-08-06) §1/§3; reviewed HEAD `47c7d818`; rebased onto `f24f55d8` with migration AND rollback byte-identical through the rebase (sha256 `b9c9e949…`, `38e9b055…`; comment-stripped executable `4f2650af…` identical before/after the marker commit) |

**Preflight**: `manages_organization` prosrc = engagement arm ONLY; `save_company_setup_v3` edit guard = creator ONLY; memberships 10 (all owner/active backfill, zero unexpected writes); 10 orgs / 7 companies (all 7 org-bound, 0 creator-less); migration absent from ledger; fingerprints org `4e788740…`, membership `024490f3…`, company `caa80f9e…`.

**Post-apply**: `manages_organization` carries BOTH arms (engagement + active membership owner/admin/manager/external_manager — `member` NEVER), SECURITY DEFINER, `search_path` pinned, anon EXECUTE false; `save_company_setup_v3` edit guard = creator OR active owner/admin membership on the bound organization, anti-oracle preserved, anon false. Live read-only role-play: a membership owner manages their org, a stranger is refused. **Edit-authority matrix 9/9 PASS** on the seeded local stack (transactional, rolled back — `docs/audits/evidence/multi-org-m-p0-4/authority-widening-matrix-proof-output.txt`): admin edits, manager refused (operations ≠ identity), member refused, stranger refused with the SAME `not_owner` as a missing row, creator compatibility intact, manages_organization matrix (manager yes / member no / stranger no). **ZERO business-row mutation**: every count and all three fingerprints identical before/after (audit_logs still 34); the data-dml finding is function-body statement text only. Advisors after apply: **0 ERROR**, 232 WARN + 2 INFO — identical to pre-apply. Rollback present, NOT executed (restores both originals verbatim).

**Not done / out of scope**: no production QA accounts, no company edits against real identities, no #1016, no seeding.

### ✅ APPLIED TO PROD — `20260806120000_company_membership_commands_v1` (M-P0-4 Slice 2)

| Field | Value |
|---|---|
| Applied | **2026-08-06 05:24:45 UTC** via Supabase MCP `apply_migration` (`{"success":true}`) |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger version | `20260806052445`, name `company_membership_commands_v1` (version/name apply-time drift, SIXTH occurrence — match on `name`, never `version`). Ledger row count: exactly ONE row added |
| PR | **#1024** — merge follows this accounting commit |
| Owner gate | "OWNER DECISION — CLOSE MEMBERSHIP AUTHORITY, MERGE DURABLE WORKSPACE, CONTINUE M-P0-6/7/8" (2026-08-06) §1; approved reviewed HEAD `62303fb5c2487d29c82ab9c9cfbe3e50784dce13`. The PR was ALREADY based on the latest main `0f716b8d` (post-#1023) — no rebase occurred; the executable SQL transmitted to production is byte-identical to the reviewed package (comment-stripped executable sha256 `c296ece209ff4b801254769a6d66d1f043f045b7070658c604a7cc4ba6d958dc`, identical before and after the human-gate marker commit) |
| Migration sha256 (repo file) | pre-marker `f11b6094b9efbc7a7ea69041be3e7a13d2f7dd9762addb8045e29507a7a24cee`; with approval header `a4331e4903627976703fd0f22e6605a8024072b39ae2d4223a3b7612813a9c73` (comment-only change) |
| Rollback sha256 | `0efd134bebd5d18b615944e98eb268c2bc9acbf9a422e72e4d4b81fb405dd7c9` (present, NOT executed; drops only the functions — table and rows untouched) |

**Preflight (immediately before apply)**: `company_memberships` 10 rows —
all 10 `owner/active/source='backfill:organizations.owner_profile_id'`, 0
invited, 0 revoked, 0 non-backfill (NO unexpected production membership
writes); Slice 1 SELECT policy confirmed RECURSIVE in `pg_policy` (the
self-subquery defect — fail-closed over-restriction, no leak); all 7
command RPCs + `is_active_org_member` + `membership_actor_role_v1` +
`membership_my_invitations_v1` ABSENT; `validate_active_organization`
ABSENT (20260714210000 never applied to prod — the migration's
feature-detected §7c block correctly SKIPPED it); migration absent from
ledger (last row `20260805200417`); table grants authenticated=SELECT
only; fingerprints organizations `4e7874098367e836de8fe6512a5778d0`
(id+owner_profile_id), engagement_contexts
`b6048ea356592bfacffcb35bc2fa7269` (id+status, 46 rows), memberships
`024490f3797df7a581eebc817a47c9ea` (id+status+role); projects 5,
assignments 1, booking_requests 0, experience_records 0, profiles 32,
audit_logs 34, billing_subscriptions 0, subscriptions 0.

**Policy repair proof (the urgent defect this apply fixes)**: post-apply
`company_memberships_select` = `(profile_id = auth.uid()) OR
is_active_org_member(organization_id) OR is_admin()` — the self-subquery
is GONE. Live role-played proof (transaction-local `set_config('role',
'authenticated')` + `request.jwt.claims`, read-only): a real owner SELECTs
their own organization's memberships with NO recursion error (≥1 row); an
unrelated authenticated actor gets **0 rows** for that organization and
**0 rows** platform-wide. Invitee reads flow only through the
caller-scoped `membership_my_invitations_v1` (returns only the CALLER's
own invited rows).

**Post-apply RPC/grant verification**: exactly the 7 reviewed commands
exist (invite / accept / decline / cancel-invite / change-role / revoke /
leave) + `is_active_org_member` + `membership_my_invitations_v1` +
widened `belongs_to_organization` — ALL `prosecdef=true` with
`search_path=public` pinned; `has_function_privilege`: anon **false** on
all, authenticated **true** on all EXCEPT `membership_actor_role_v1`
(anon false AND authenticated false — internal helper granted to NOBODY).
`belongs_to_organization` prosrc verified to carry BOTH arms (active
engagement OR active membership; legacy owner arm of the policy
untouched). Last-owner trigger + `set_updated_at` still present on the
table. Tagged outcomes / audit / anti-oracle / replay / final-owner
behavior was proven by the 293-line actor-matrix db-proof on a throwaway
local stack (`docs/audits/evidence/multi-org-m-p0-4/slice2-actor-matrix-proof-output.txt`)
— production mutation RPCs were NOT invoked against real identities, per
the owner decision §5.

**Zero side effects (measured, not assumed)**: every preflight count and
all three fingerprints re-read IDENTICAL after apply — organizations
`4e788740…`, engagement_contexts `b6048ea3…`, memberships `024490f3…`
(10 rows, still all owner/active/backfill), audit_logs still 34 (zero
rows written by the apply), projects/assignments/profiles/billing all
unchanged. **ZERO business-row mutation at apply time** — the data-dml
finding lives inside the PL/pgSQL command bodies only, exactly as the
owner decision §4 records. Security advisors after apply: **0 ERROR**
(232 WARN + 2 INFO); every new callable appears ONLY under
`authenticated_security_definer_function_executable` (the intended
design); `membership_actor_role_v1` appears in NO advisor finding; no new
function is anon-executable.

**Known honest deviation**: the §7c widening of
`validate_active_organization()` did not execute because that function
does not exist in prod (its migration `20260714210000` remains
owner-gated/unapplied) — the widened definition ships in the repo file
and lands automatically whenever that family is applied. Not a blocker
for #1025: the durable-pointer column `profiles.active_organization_id`
is likewise absent in prod, so the pointer path #1025 uses must (and
does) fail closed to its cookie/server-validated fallback.

**Not done / out of scope**: no production invitations, no role
mutations, no QA accounts, no second production company, no engagement
conversion, #1016 untouched (superseded by the M-P0-6 v2 package), no
seeding. `migration-safety`: **GREEN [human-gated]** with all four
findings (security-definer-function, grant-or-revoke, alter-drop-policy,
data-dml) still visible as notices.

### ✅ APPLIED TO PROD — `20260806090000_company_memberships_v1` (M-P0-4 Slice 1)

| Field | Value |
|---|---|
| Applied | **2026-08-05 19:57:16 UTC** via Supabase MCP `apply_migration` (`{"success":true}`) |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger version | `20260805195716`, name `company_memberships_v1` (MCP stamps apply-time versions — match on `name`) + completion entry `20260805200417`, name `company_memberships_v1_trigger_fn_revoke` — the §6 privilege closure (`revoke all on function company_memberships_protect_last_owner() from public/anon`) that the repo file carries in-place; applied minutes after the main body when the repo secdef guard surfaced the 20260722160000-closure gap. Privilege-tightening only, zero rows touched; anon AND authenticated verified unable to EXECUTE post-apply |
| PR | **#1023** — merge follows this accounting commit |
| Owner gate | "OWNER DECISION — APPLY COMPANY_MEMBERSHIPS V1 AND CONTINUE MULTI-ORG AUTHORITY TRAIN" (2026-08-05) §1; executable SQL byte-identical from reviewed package HEAD `cae1ff30` through the rebase onto post-M-P0-3 main `596eab7a` (git blob `a51710d3` unchanged) and through the human-gate commit (comment-only header change) |
| Migration sha256 (repo file, with approval header) | `5f0622fc8d6e1141a919e0a000a690f84a6b46c4da642d301e3f505faf40e51c` (canonical git-LF content at rebase: `b34cb8dc43af64e53a9ac61ae279f2e6fd7bf2b94ec0432b1a2e67c02da9d32c`) |
| Rollback sha256 | `49b6edc5a01e5b12458ed85fb26c84f5fd91e72ae5e576001d4697e78a21cd1b` (canonical git-LF; present, NOT executed; fails loudly once any non-backfill membership row exists) |

**Preflight (immediately before apply)**: 10 organizations, all 10 with
`owner_profile_id` (0 zero-owner, 3 profiles owning multiple orgs, 0 owners
without a profiles row); engagement_contexts = 10 `owner/active` + 36
`employee/active` + 0 manager-class + 0 ambiguous (46 total, fingerprint
`71ae52fddb00f5999c51b2ec91f05bae`); organizations fingerprint
`70a8a021e1b796801b7d80d0d202fc0a`; `company_memberships` ABSENT; no
function/trigger name conflicts; no ledger collision; `set_updated_at` +
`is_admin` present.

**Backfill classification & counts (actual)**: **10 rows total** — 10 ×
`owner/active` from `organizations.owner_profile_id`
(`source='backfill:organizations.owner_profile_id'`), **0** from
manager-class engagements (none exist in prod), **0 non-backfill rows**
(rollback window OPEN). **36 employee engagements EXCLUDED** — employment,
never governance. 0 organizations without an active owner membership.

**Post-apply**: table exists, RLS enabled; 3 expected indexes incl. PARTIAL
unique `company_memberships_live_key (organization_id, profile_id) WHERE
status IN ('invited','active')`; 2 triggers (`set_updated_at`,
`protect_last_owner`); exactly 1 policy, SELECT-only; anon has NO SELECT;
authenticated has SELECT and **zero write privileges**; organizations
fingerprint **identical** (`70a8a021…`), engagement_contexts fingerprint
**identical** (`71ae52fd…`, 46 rows), projects 5 / profiles 32 untouched —
zero side effects outside the new table. §5 invariants proof 10/10 PASS
(transactional, rolled back —
`docs/audits/evidence/multi-org-m-p0-4/slice1-invariants-proof-output.txt`).
Security advisors: **no ERROR findings**; the trigger function appears only
under the pre-existing SECURITY-DEFINER WARN classes and is not invokable
as an API (Postgres refuses direct calls to `trigger`-returning functions).
`migration-safety`: **GREEN [human-gated]** (security-definer-function,
grant-or-revoke, create-trigger visible as notices).

**Not done / out of scope**: no production invitations, no manual
memberships, no QA accounts, no engagement conversion, no Slice 2 RPCs (the
table has NO application write path yet — by design), #1016 untouched.

### ✅ APPLIED TO PROD — `20260805190000_save_company_setup_v3_multi_org` (M-P0-2)

| Field | Value |
|---|---|
| Applied | **2026-08-05 18:08:36 UTC** via Supabase MCP `apply_migration` (`{"success":true}`) |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger version | `20260805180836`, name `save_company_setup_v3_multi_org` (MCP stamps apply-time versions — match on `name`) |
| PR | **#1021** — merge follows this accounting commit |
| Owner gate | "OWNER DECISION — APPLY AND MERGE M-P0-2" (2026-08-05) §1, bound to reviewed HEAD `15ff08a5`; executable SQL verified byte-identical through the guard-green + human-gate commits (comment-only header change) |
| Migration sha256 (repo file, with approval header) | `b73a9b7e86a3125e5f121710c9b5006a13980d51cc0a3bd2673079d14569ea3e` (at approved HEAD `15ff08a5` the same file was `873840861e5b90dee310b4062fc4f9d442225ed255ac1fbe6c1859b325ed09fc`; the applied copy differs only in the approval-header comment — executable statements verbatim) |
| Rollback sha256 | `b2dce53da559a4882c1fee2a0fd62834b6c5e8dd14745afba5564c129d7fb761` (present, NOT executed; drops v3 and restores the v1/v2 singleton bodies verbatim) |

**Preflight (immediately before apply)**: 7 companies; 25 profiles owning 0 /
7 owning 1 / **0 owning >1**; 0 duplicate `(profile_id, canonical legal_name)`
tuples; `save_company_setup_v3` ABSENT; v1 and v2 present exactly once
(legacy defs md5 `b24b98577368ffb347ef77920f691043`, grants = authenticated +
postgres EXECUTE only); `companies_profile_id_key` absent +
`companies_creator_canonical_name_key` present (M-P0-1 active); companies
fingerprint `b0b7e585286ca9a0c0d2aa44188d144e`; ledger tail `20260805171825`
(M-P0-1) — no collision.

**Post-apply**: v3 present exactly once, signature exactly as reviewed
(`p_company_id uuid, …, p_company_type text`), SECURITY DEFINER with
`search_path=public`; anon CANNOT execute v3/v2/v1, authenticated CAN;
v1 and v2 remain present, both carrying the `multiple_companies` fail-closed
multiplicity guard; companies fingerprint **identical**
(`b0b7e585286ca9a0c0d2aa44188d144e` — all 7 rows byte-unchanged, count 7);
**zero company rows changed**, no organization / membership / demand /
booking / engagement / project / experience / billing row touched (apply-time
SQL is DDL + grants only — the scanner-visible DML lives inside the plpgsql
bodies and runs only per-request). Security advisors: no ERROR findings; the
three functions appear only under the pre-existing WARN class
`authenticated_security_definer_function_executable` shared by every
authenticated RPC. `migration-safety`: **GREEN [human-gated]** with the three
approved findings (security-definer-function, grant-or-revoke, data-dml)
visible as notices.

**Not proven / out of scope**: no second production company was created; no
production QA account exists; production multi-company usage is NOT claimed —
schema-stage verdict is
`MULTI_ORG_CREATE_SECOND_ORGANIZATION_SCHEMA_ACTIVE_LOCAL_BROWSER_PROVEN`
(browser proof is the local evidence in
`docs/audits/evidence/multi-org-m-p0-2/`).

### ✅ APPLIED TO PROD — `20260805170000_multi_org_company_ownership_cap_removal_v1` (M-P0-1)

| Field | Value |
|---|---|
| Applied | **2026-08-05 17:18:25 UTC** via Supabase MCP `apply_migration` (`{"success":true}`) |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger version | `20260805171825`, name `multi_org_company_ownership_cap_removal_v1` (MCP stamps apply-time versions — match on `name`) |
| PR | **#1019** — merge follows this accounting commit |
| Owner gate | Directive 2026-08-05 §3 "OWNER APPROVES M-P0-1 APPLY"; every condition verified (HEAD tree unchanged through rebase, no DML, no RLS/grant change, preflight matched, rollback viable, ratchet recounted to 182) |
| Migration sha256 (as reviewed/applied) | `62fb6bfb3ec0957a4961b6b5269ffce0d639948d190b8e497a2856e723971121` (applied copy differs only in the approval-header comment; executable statements verbatim) |
| Rollback sha256 | `a9fd3b337b4326a9f862da97a48dce82aa0645a10958e3938489d44a233382f3` (present, NOT executed; fails loudly once any profile owns two companies) |

**Preflight (immediately before apply)**: 7 companies, 7 distinct owners, 0
duplicate `(profile_id, canonical legal_name)` tuples, 0 profiles owning >1
company, 2 NULL `legal_name` rows (outside the partial index), constraint
present as `UNIQUE (profile_id)`, replacement absent, companies fingerprint
`2aa9903cc274a144b3ffad293d7e5f88`.

**Post-apply**: `companies_profile_id_key` ABSENT; partial unique index
`companies_creator_canonical_name_key (profile_id, lower(btrim(legal_name)))
WHERE legal_name IS NOT NULL` PRESENT; companies fingerprint **identical**
(`2aa9903c…` — all 7 rows byte-unchanged); policies md5, grants md5 and
`owns_company()` body md5 all **identical** before/after; organizations 10,
engagement_contexts 46, customer_requests 17, booking_requests 0, projects 5
— untouched. The migration's statements name only the companies constraint,
the new index and two COMMENTs; zero DML.

**What this does NOT claim**: no application behaviour changed — the
singleton writers (`save_company_setup*`, `complete_onboarding` company
branch, `getOwnCompany()`) still behave as before and are replaced in
M-P0-2/M-P0-3. No second production company was created; creating one before
M-P0-2 lands is owner-gated.

## OWNER DECISION 2b — display-name backfill ledger retention (recorded 2026-08-05)

The owner approved: **retain `public.worker_display_name_backfill_20260805`
for 90 days from production apply**, RLS enabled with zero policies (default
deny), never exposed to application clients, not dropped now.

- Apply date: **2026-08-05** (ledger `20260805155601`).
- Earliest eligible cleanup date: **2026-11-03** (90 days).
- Expected cleanup preflight (for the future owner-gated package): confirm no
  rollback of `20260805155601` is pending or contemplated; re-verify the 22
  ledger rows still match what was applied (`display_name_after` values still
  present on `workers` or legitimately user-changed since); confirm no open
  incident references the backfill; then `drop table` in a dedicated
  owner-gated migration with its own ledger row.
- Rollback implications: the ledger IS the backfill's reversal path — while
  it exists the backfill is exactly reversible (current-value-guarded); after
  the cleanup drop, reversal becomes impossible by design. Scheduling or
  executing the deletion now is explicitly out of scope.

### ✅ APPLIED TO PROD — `20260805090000_worker_display_name_write_path_v1` + `20260805090100_worker_display_name_backfill_v1`

| Field | Value |
|---|---|
| Applied | **2026-08-05 15:55:14 UTC** (write-path) and **15:56:01 UTC** (backfill) via Supabase MCP `apply_migration`, both `{"success":true}` |
| Method | Supabase MCP `apply_migration` (never `supabase db push`), strict order: write-path first, backfill second |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger versions | `20260805155514` name `worker_display_name_write_path_v1`; `20260805155601` name `worker_display_name_backfill_v1` (MCP stamps apply-time versions — match on `name`) |
| PR | **#1013 — NOT merged.** Owner approved the two migrations conditionally (Decisions 1+2, 2026-08-05); merge is a separate owner gate |
| Branch HEAD at apply | `d6046565` (rebased onto main `5e2a5458`) |
| Write-path sha256 (as reviewed / after marker) | `c41cdc5d0767…de5c8c6693` / `873eeb29dba9…a5308765be` |
| Backfill sha256 (as reviewed / after marker) | `e1e10f21ef49…7bfaaee06dfc78` / `6d55fc761e19…351babdadcd` |
| Function-body byte proof | prod `pg_proc.prosrc` md5 `8b8f0ae34bc6ec6deb249ef0463dd465` **identical** to the repo file's dollar-quoted body |
| Rollbacks (present, NOT executed, NOT authorised) | `supabase/rollbacks/20260805090000_….down.sql` (restores 0008 DO NOTHING verbatim — re-opens the defect) and `…090100_….down.sql` (ledger-driven, current-value-guarded — never reverts post-apply user edits) |
| Owner gate | Decisions 1+2 recorded 2026-08-05 in `docs/human-gates/worker-display-name-write-path-gate.md` with exact wording, reviewed sha256 and preflight counts; `-- @human-gate-approved` markers added to exactly these two files in the same commit |

**Applied-copy note.** The MCP-applied copies carry the full executable
statements verbatim; the write-path's prose header was abridged in the applied
copy (the repo file is canonical and its full audit header governs). The
function-body md5 above proves the semantic payload is byte-identical; the
backfill is DML whose effects are proven by exact counts below.

**What it did.** (1) Repaired `complete_onboarding`'s worker branch:
`ON CONFLICT (profile_id) DO NOTHING` → `DO UPDATE` with
`coalesce(excluded.…, workers.…)` for `display_name` and
`current_location_country`, explicit `updated_at = now()`. Single overload,
signature unchanged, anon EXECUTE revoked, authenticated-only, PUBLIC revoked
(verified post-apply). Zero data touched by migration 1 (workers state hash
`11add5b764d6664998dc7af31ab54402` identical before/after). (2) Backfilled
existing rows ledger-first from `profiles.full_name` / `profiles.country`.

**Production counts (authoritative).** Preflight (read-only, before apply):
32 profiles, 32 workers, 27 NULL `display_name` (blank-non-NULL 0),
24 with factual `full_name`, 19 name-eligible, 21 country-eligible,
0 conflicts, 5 rows already had a (conflict-free) nonblank `display_name`,
8 rows `updated_at`≠`created_at`, before-state hash `11add5b7…`. Post-apply:
ledger rows **22** (19 name-fills + 3 country-only rows whose existing names
were provably untouched), **19 names filled**, **21 countries filled**,
**8 residual NULL names** (= 27 − 19: no `full_name` to recover — nothing
invented), 0 conflicts after apply. Ledger table
`worker_display_name_backfill_20260805`: RLS enabled, **zero policies**
(default deny), holds exact BEFORE values for reversal.

**Not touched.** No organization/membership row, no engagement, no project,
no booking, no experience record — the two migrations' statements name only
`complete_onboarding`, `public.workers` (UPDATE-only) and the new ledger
table. Only these two migrations were applied; every other deferred migration
below remains deferred.

### ✅ APPLIED TO PROD — `20260804160000_booking_engagement_end_v2`

| Field | Value |
|---|---|
| Applied | **2026-08-04 19:09:40 UTC** via Supabase MCP `apply_migration`, name `20260804160000_booking_engagement_end_v2` (`{"success":true}`) |
| Method | Supabase MCP `apply_migration` (never `supabase db push`) |
| Production project | `gorgitwvdzxbnaxhrsrw` |
| Production ledger version | `20260804190940` (MCP stamps its own apply-time version — see the naming note above) |
| PR | **#1009 — NOT merged.** The owner approved the *schema* only; the application code that calls this function is still Draft and still `needs-human-gate` |
| Reviewed PR HEAD | `d2c4f6c86a6a68ff55ec0895945c75c25c601c28` |
| Migration sha256 (as reviewed) | `60939021e923bcbfb15a9f8baca923b8df828d54df0add980aec707f623415e2` |
| Migration sha256 (after the marker was added) | `4e19703cef93a2b0407fb3351cc5d8839cb98666c1b57fdac892645901c755f8` |
| Executable SQL sha256 (comments stripped, **identical both sides**) | `302341790ef78bc00de5a2f87f205d04c35e61d2f12128b053859e456ec00113` |
| Rollback | `supabase/rollbacks/20260804160000_booking_engagement_end_v2.down.sql`, sha256 `11454154b396f6963ba7726dd65c3e9a98d3cee7c7e810fb3be9de04ff7b4269` (unchanged) |
| Owner gate | Approved 2026-08-04 — `-- @human-gate-approved` added to the migration file, naming exactly three findings: `security-definer-function`, `grant-or-revoke`, `data-dml` |

> **THE FILE IS NOT YET ON `main`.** This row records a **production fact** that is
> true now and does not depend on PR #1009's merge decision. The migration file
> itself ships with that PR. Recording the apply only after the merge would leave
> production ahead of this ledger — the exact drift the notice below documents.

**Checksum note (why two migration hashes).** The owner approved the file at
`60939021…`, then instructed that the human-gate marker be added (§3 of the
approval). That is a **comment-only** delta and was verified statement-by-statement
before applying: with comments stripped, the approved file and the marked file
hash identically (`302341790e…`). The executable inventory is one
`CREATE OR REPLACE FUNCTION`, two `REVOKE`s, one `GRANT` and one `COMMENT`, naming
only `public.end_company_worker_engagement_v2`.

**What it did.** Created one `SECURITY DEFINER` function
`end_company_worker_engagement_v2(uuid)` returning a **tagged jsonb outcome**
(`ended` | `already_ended` | `not_found` | `conflict`). It supersedes
`end_company_worker_engagement_v1`, whose bare `boolean` `false` meant four
different things (no such row / not yours / not active / no row updated) — a UI
built on it could not tell "you may not do this" from "it was already ended", so
it would have had to guess. `search_path=public` pinned; `PUBLIC` and `anon` hold
nothing; `authenticated` holds `EXECUTE` alone; no `service_role` grant.

**Additive — v1 was NOT dropped.** PostgreSQL cannot change a function's return
type with `CREATE OR REPLACE`, and `end_company_worker_engagement_v1(uuid)` is an
object owned by applied migration `20260723120000`, whose paired rollback drops
it. Dropping and recreating it here would entangle the two rollbacks. v1 remains
in place, still granted, still owned by its own migration, and still has **zero**
application callers (guard-pinned). Its removal is a later, separate, owner-gated
decision.

**Zero business-row change — measured before and after, identical.**

| Table | Before | After |
|---|---|---|
| `company_worker_engagements` (total / active / ended / with `ended_at`) | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| `booking_requests` | 0 | 0 |
| `projects` | 5 | 5 |
| `project_worker_assignments` | 1 | 1 |
| `experience_records` | 0 | 0 |
| `audit_logs` | 34 | 34 |

**Nothing else moved.** Column set, RLS policies, indexes and table grants on
`company_worker_engagements` were fingerprinted before and after and are
byte-identical (`md5` compared, all `true`); RLS is still enabled; v1's definition
**and** ACL are unchanged. No engagement was ended, no `ended_at` written, no
`audit_logs` row created, no project or assignment or organization membership
changed, no experience record created, no auth / billing / Stripe row touched
(`auth.users` = 32, none updated in the apply window). **The function was never
invoked against a production row.**

**Security advisors (before → after).** Exactly one delta:
`authenticated_security_definer_function_executable` **213 → 214**, the new
function — the same WARN each of the other 213 SECURITY DEFINER RPCs already
carries. `anon_security_definer_function_executable` stayed at **4** (the anon
revoke worked) and `function_search_path_mutable` stayed at **2** (search_path is
pinned). **0** ERROR-level findings.

**migration-safety:** RED → **GREEN [human-gated]**, with all three findings still
recorded as approved notices. The gate script was not modified.

---

## ⚠️ RECONCILIATION 2026-08-07 — two MORE applied migrations were unrecorded, both AFTER the 2026-08-01 notice

**Ledger-integrity reconciliation, NOT a new apply. Nothing was applied,
changed, or migrated on 2026-08-07** — these rows only close record gaps found
by a read-only diff of all 190 repo migration files against production
`schema_migrations` (187 rows). Full method + classification:
`docs/audits/APPLIED_LEDGER_FULL_RECONCILIATION_2026-08.md`.

These two sit **after** the 26-migration window below, so the drift notice does
not account for them. Each was verified by probing the objects it creates. A
third candidate — `20260723180000_agency_real_client_bridge_v1` — turned out to
be recorded already, under the Deferred heading; see the placement note below.

### ✅ APPLIED TO PROD (RECONCILIATION ROW 2026-08-07) — `20260727120000_secdef_public_grant_hygiene_v1`

Prod ledger version `20260727125759`, name `20260727120000_secdef_public_grant_hygiene_v1`
(apply-time version drift — match on `name`). File carries `@human-gate-approved`.

Security audit 2026-07-27 findings L-01 / L-08: revokes the **implicit `PUBLIC`
EXECUTE** grant (visible as a leading `=X/postgres` in `proacl`) left on three
SECDEF functions that were granted to `anon, authenticated` without an
accompanying revoke. It **grants nothing to anyone** — `anon` and
`authenticated` keep their explicit grants, so the public business-profile page
is unchanged. Idempotent (REVOKE on an absent grant is a no-op). Paired
rollback: `supabase/rollbacks/20260727120000_secdef_public_grant_hygiene_v1.down.sql`.

*Not to be confused with the schema-level `CREATE` revoke, which lives in the
still-unapplied owner-gated #879. Production still has `anon` holding CREATE on
schema `public` — verified 2026-08-07, unchanged by this migration and not its job.*

### ✅ APPLIED TO PROD (RECONCILIATION ROW 2026-08-07) — `20260727180000_journal_entry_skill_provenance_v1`

Prod ledger version `20260727183554`. **Verified in production:**
`journal_entry_skills.provenance` (`text`) exists.

PR-C: stores HOW an entry↔skill link came to exist, so the UI stops re-deriving
it at render time from indirect signals. Additive single column; no draft
header, no gate marker required.

### ℹ️ PLACEMENT NOTE — `20260723180000_agency_real_client_bridge_v1` is APPLIED, and recorded under "Deferred"

**Not a new finding, and not a gate problem.** The full apply record already
exists in this file — inside the **Deferred (committed/known, NOT applied)**
bullet for this migration, which carries `PRODUCTION APPLIED 2026-07-23 (owner
gate OWNER_GATE_APPROVED_FOR_PR_860)`, the prod version `20260723155658`, both
file SHA-256s, the dependency resolution, post-apply verification and a full
production two-subject E2E.

The `DRAFT — DO NOT APPLY` header on the migration file is **deliberately**
unedited: editing it would alter the owner-pinned approved SHA, so
migration-safety stays RED by design and PR #860 stays DRAFT/unmerged on purpose.

Recorded here only because an applied migration living under a heading that says
"NOT applied" defeats every name-based check that reads the applied half of this
file — including the first pass of the 2026-08-07 reconciliation, which reported
it as unrecorded before the Deferred bullet was read. **No owner action.**

---

## ⚠️ DRIFT NOTICE 2026-08-01 — 26 applied migrations were never recorded here

The functional-reality audit
(`docs/audits/labourmarketai-functional-reality-matrix-v1.md` §4.1) diffed this
file against prod `supabase_migrations.schema_migrations` and found **26
migrations applied to production but absent from this ledger** (span
`20260702130000_admin_grant_guard` → `20260720190000_lmc_ledger_foundation_v1`;
the full 26-name list is in that section and re-verified 2026-08-01 — all 26
still unrecorded). This is exactly the drift class this file warns about.

Two of the 26 sit inside the W5 journal scope and get retroactive rows below
(marked RETROACTIVE — doc-only, the applies happened earlier). The remaining 24
need their apply context reconstructed from PR history before honest rows can
be written — recording them as a batch without that context would fake
precision this ledger exists to provide.

### ✅ APPLIED TO PROD (RETROACTIVE ROW 2026-08-01) — `20260720100000_journal_atomic_supersede_v1`

Applied ~2026-07-20 via Supabase MCP (present in prod `schema_migrations`;
behaviour verified in prod by the reality audit). Replaces the app-side
two-step supersede with ONE atomic SECURITY DEFINER RPC
`journal_entry_supersede_v2` (owner-gated, stale-chain refusal, append-only —
the original entry is never mutated beyond `superseded_by`). Consumer:
`apps/web/lib/journal/actions.ts` edit path. Rollback: paired down file.

### ✅ APPLIED TO PROD (RETROACTIVE ROW 2026-08-01) — `20260720150000_journal_photo_continuity_v1`

Applied ~2026-07-20 via Supabase MCP (present in prod `schema_migrations`).
Photo-metadata continuity across supersede (entry row-lock on register, private
bucket unchanged) + the canonical current-definition home of
`journal_entry_supersede_v2`, `confirm_entry_and_verify_skills` (the ONLY
`verified=true` writer) and `apply_learning_auto_confirmation` (policy-gated,
writes a real honestly-labelled confirmation row), + staleness guard on the
legacy direct-insert confirmation RLS. Rollback: paired down file.

### ✅ APPLIED TO PROD (RECONCILIATION ROW 2026-08-05) — `20260613200000_billing_test_mode_records`

**Ledger-integrity reconciliation, NOT a new apply. Nothing was applied,
changed, or migrated on 2026-08-05 — this row only closes a record gap.** The
migration was found applied in production without a row in this file. It
pre-dates the 26-migration span in the drift notice above (that span starts at
`20260702130000`), so it is a separate instance of the same drift class.

**What was verified 2026-08-05 (read-only check, zero writes):** all three
tables this migration creates — `billing_customers`, `billing_subscriptions`,
`payment_webhook_events` — exist in production, each with **0 rows**. The
table-existence check is the direct evidence; no production object was touched.

**Apply context (reconstructed from the repo's own audit docs, not
re-verified):** `docs/audits/stripe-test-mode-final-report.md` records the
migration as "RED draft, owner-applied" during the Stripe test-mode sprint, and
`docs/audits/labourmarketai-commercial-billing-audit-v1.md` +
`docs/audits/stripe-test-activation-runbook.md` both record it present in the
production ledger as version `20260613202244`, name
`billing_test_mode_records` (the apply-time stamp — see the naming note at the
top of this file; match on `name`, never on `version`). That places the apply
at 2026-06-13, under the owner gate those audits describe.

**What it created (all additive):** three test-mode billing tables —
`billing_customers` (profile ↔ provider customer), `billing_subscriptions`
(status/periods/flags, `unique (provider, provider_subscription_id)` AND
`unique (owner_id, plan_key, provider)`), `payment_webhook_events`
(idempotency via `unique (provider, event_id)`, `processed` default false).
`test_mode` defaults true on every row; NO money amount stored; RLS
owner/admin SELECT only; writes service-role only (the webhook). Legacy
`subscriptions` (0 rows) untouched. Paired rollback:
`supabase/rollbacks/20260613200000_billing_test_mode_records.down.sql`.

---

## ⚠️ CORRECTION 2026-07-22 — "authenticated only, no anon" was FACTUALLY WRONG

Several rows below state that a migration granted `EXECUTE` to `authenticated`
**only**, with wording such as *"GRANT SELECT + EXECUTE to authenticated only, no
anon"*, *"granted authenticated only, never anon"* and *"grants … authenticated only
(no anon)"*. **Those statements did not describe production.** This correction is
recorded here rather than by editing the history, so the mistake stays visible.

**What was actually true in production (verified 2026-07-22 by catalog read):**
of the **205** `SECURITY DEFINER` functions in `public`, **54** were executable by
the `anon` role. Only **4** of those were granted to `anon` deliberately. The other
**50** inherited `EXECUTE` from PostgreSQL's default `PUBLIC` grant, because the
migrations issued `GRANT EXECUTE … TO authenticated` without the matching
`REVOKE EXECUTE … FROM PUBLIC`. The ACL shows it plainly — the leading `=X/postgres`
entry **is** the `PUBLIC` grant:

```
add_project_stage_v1           {=X/postgres,postgres=X/postgres,authenticated=X/postgres}   <- PUBLIC present
submit_company_need_public_v1  {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres} <- correct pattern
```

**Why the original post-apply verifications missed it:** they tested a *non-owner
authenticated* caller (a non-NULL `auth.uid()`), which was correctly rejected. The
**unauthenticated** case was never tested, and the grant itself was never inspected.

**How bad it was:** seven of the 54 were genuinely exploitable, because their
ownership check was NULL-unsafe — `if v_owner <> auth.uid()` evaluates to NULL when
`auth.uid()` is NULL, and PL/pgSQL treats NULL as false, so the exception never
fired. Confirmed live and rolled back: calling
`set_marketplace_listing_status_v1` as `anon` returned no error and **changed** the
row. Affected rows below: **`20260718190000_commercial_crm.sql`** and
**`20260718210000_marketplace_listings.sql`**. Blast radius was zero rows only
because `contracts`, `proposals` and `marketplace_listings` were all empty.

**State separation — read this carefully:**

| | Statement |
|---|---|
| **Before the fix (fact)** | 54 functions anon-executable; 7 of them exploitable; production carried a live unauthenticated write path. |
| **What the fix migration guarantees (code)** | `20260722120000_secdef_anon_authz_bypass_fix_v1.sql` rejects unauthenticated callers explicitly, replaces `<>` with `is distinct from`, and revokes `PUBLIC`/`anon` on those **7 exact signatures**. |
| **Verified so far** | Static contract only — `apps/web/lib/guards/secdef-anon-authz-bypass.test.ts`, all assertions passing (reproduce: `pnpm -F web test lib/guards/secdef-anon-authz-bypass.test.ts`). A raw assertion count is deliberately NOT recorded here: it drifts every time a test is added and then silently disagrees with reality. **The acceptance criterion is the TEN proofs in the verification script, not a test count.** **No behavioural proof against any database has been run yet** (no local Postgres was available: Supabase CLI absent, Docker not running). |
| ~~**NOT yet true in production**~~ | **SUPERSEDED — APPLIED 2026-07-22.** See the applied row below. |
| ~~**Becomes true only after the owner applies it**~~ | **All TEN** runtime proofs in `supabase/tests/20260722120000_secdef_anon_authz_bypass_verification.sql` must be run and recorded — **before** the apply (expected: **FAIL 1, 2, 6, 7, 8, 10 / PASS 3, 4, 5, 9** — the six failures reproduce the defect) and **after** (all ten must PASS). **Evidence that omits PROOF 10 is incomplete and must not be accepted:** PROOF 10 is the only proof that exercises the in-body `auth.uid() is null` guard rather than the ACL. |

**Still outstanding (not fixed by that migration):** the other **47** anon-reachable
functions — 3 with no authorization logic at all, 40 that currently fail closed but
should never have been reachable, and the 4 that are intentionally public. Full
classification: `docs/security/secdef-public-execute-inventory-v1.md`.

### ✅ APPLIED TO PROD — `20260723053000_contact_demand_owner_v1`

| Field | Value |
|---|---|
| Applied | **2026-07-23** via Supabase MCP `apply_migration`, name `20260723053000_contact_demand_owner_v1` (`{"success":true}`) |
| Method | Supabase MCP `apply_migration` (never `supabase db push`) |
| PR | #853, squash-merged as **`edc4e43dc85fa0a6fb389e66c873e8f612612547`** |
| Reviewed PR HEAD | `e2da19dc3c7980fac01c217af9b682b79f40d50b` (merged with `--match-head-commit`) |
| Migration sha256 | `eaf846175af66ae10d6e658cd3a18e162b23682973a9c953aa8ce7387c6027d7` |
| Rollback | `supabase/rollbacks/20260723053000_contact_demand_owner_v1.down.sql`, sha256 `81318ebda93148275d2c33de1fdd54ca4fdcd0e63a3d5d7b0a81168a17885afe` |

> **⚠ FILE AMENDED AFTER APPLY (2026-07-25, PR #865).** One statement added:
> `revoke execute on function public.contact_demand_owner_v1(uuid) from anon`.
> Without it a clean `supabase db reset` left this function anon-reachable (a
> fifth anon-reachable SECURITY DEFINER function), because the local Supabase
> baseline grants `anon` EXPLICITLY and the file revoked only PUBLIC. New SHA-256
> `38bb9c05ffa727f897485bb1bc5f62236a234db008f63c1955391766ffb30fab`. **Production
> runtime state and this ledger version are UNCHANGED — not re-applied**; on the
> production grant model the added revoke is a no-op. Original bytes preserved at
> `docs/audits/migrations/20260723053000_original-production-applied.sql`.
| Owner gate | Approved 2026-07-23 — matrix-conditional `@human-gate-approved`, owner-instructed apply |

**What it did.** Created one `STABLE SECURITY DEFINER` read RPC
`contact_demand_owner_v1(uuid)` that resolves a demand owner for the worker
"Parašyti darbdaviui" flow. Fixes a real break: `contactEmployerAction` used the
service-role client to read `customer_requests`/`companies`, but production
allowlists service_role table grants (those tables excluded) → `42501`, so the
flow failed for **every** worker. Function-only; **no** table/policy/trigger/grant
change beyond `REVOKE ALL FROM public` + `GRANT EXECUTE TO authenticated` on the
new function itself. `search_path=public` pinned; all inequality checks
`IS DISTINCT FROM` (never bare `<>`); existence-oracle closed (`... AND s.ok`).

**Owner-gate security matrix (pre-apply, one rolled-back prod transaction, all green).**
anon rejected (no EXECUTE) · no-signal worker 0 rows even with others' signals on
the demand · legit signal holder → exactly owner id + title, flags true · closed
demand → owner NULL · unverified company → owner NULL · self-contact → owner NULL ·
nonexistent id 0 rows (indistinguishable from no-standing) · STABLE+secdef+
search_path+single overload+ACL `{postgres,authenticated=EXECUTE}` · anon secdef
surface stays the 4 allowlisted functions. Zero residue verified after rollback.

**Post-apply verification (recorded, catalog + behavioural).**

| Check | Result |
|---|---|
| function ACL — PUBLIC (`=X`) present | **absent** |
| function ACL — anon EXECUTE | **absent** |
| function ACL — authenticated EXECUTE | **present** (`{postgres=X/postgres,authenticated=X/postgres}`) |
| `search_path` | **`search_path=public`** |
| anon-reachable `SECURITY DEFINER` in `public` | **still exactly 4** (business getters + `submit_company_need_public_v1`) |
| existing-demand-without-own-signal vs nonexistent-demand (authenticated, live fn) | **both 0 rows — no existence oracle** |

**Post-apply behavioural E2E (production, marked disposable worker, cleaned after).**
Full journey green: apply (express interest) → **Parašyti darbdaviui → thread opened**
(`/dashboard/communication/<id>`, direct conversation, 2 participants) → worker's
first message sent + visible → **persists after reload** → interest status visible on
the board (`IŠSIŲSTA`). All test data (worker, conversation, participants, message,
interest signal, 14 pilot_events + 3 anon rows) deleted; verified **0 orphans**,
`pilot_events` back to baseline 224, mason demand back to 2 interest rows.

### ✅ APPLIED TO PROD — `20260722120000_secdef_anon_authz_bypass_fix_v1`

| Field | Value |
|---|---|
| Applied | **2026-07-22**, ledger version `20260722074749` |
| Method | Supabase MCP `apply_migration` (never `supabase db push`) |
| PR | #845, squash-merged as **`bfd4a5f883e375034ec94f8d27ddc98d4370c588`** |
| Reviewed PR HEAD | `75ca5c81b134e59e891f9e0e130a30d811642165` |
| Migration sha256 | `8b906b1fb51737652fb5e6faac13208188082891e5f23709b08689ae4965f18c` |
| Rollback | `supabase/rollbacks/20260722120000_secdef_anon_authz_bypass_fix_v1.down.sql`, sha256 `5199e39221ba88821631307f0e1fa244419bccc7a1ebb2b691fdfb5aeed10f00` |

**Pre-apply reproduction (recorded, defect confirmed live).** All ten proofs executed in a
single transaction ending in `ROLLBACK`. Result matched the predicted matrix exactly:
**FAIL 1, 2, 6, 7, 8, 10 · PASS 3, 4, 5, 9** (harness counter = 6). The defect was
reproduced end to end, not merely inferred:

- PROOF 6 — an **anonymous** caller rewrote a listing title to `HIJACKED TITLE`.
- PROOF 7 — an **anonymous** caller **deleted** the contract, the proposal and the listing
  (`contracts=0 proposals=0 listings=0`).
- PROOF 10 — a NULL-identity caller succeeded (`real-row err=NO_ERROR status=closed`), and
  the missing-id probe returned `listing not found`, proving the row lookup ran **before**
  any identity check — i.e. the guard did not exist.

**Post-apply verification (recorded).** Same harness, same transaction discipline:
**all TEN proofs PASS**, harness failure counter **0**, distinct proofs **10**, NULL
verdicts **0**, invalid verdicts **0**. Decisive line — PROOF 10:
`missing-id err=not authorized | real-row err=not authorized status=draft` — the explicit
guard now fires **before** the owner lookup.

**Catalog confirmation after apply:**

| Check | Result |
|---|---|
| anon-reachable `SECURITY DEFINER` in `public` | **54 → 47** |
| the 7: anon EXECUTE | **0/7** |
| the 7: `PUBLIC` entry in ACL | **0/7** |
| the 7: authenticated EXECUTE | **7/7** |
| the 7: NULL guard before owner lookup | **7/7** |
| the 7: NULL-unsafe `<> auth.uid()` remaining | **0/7** |
| Leftover verification rows | **0** (`contracts` + `proposals` + `marketplace_listings` = 0) |
| Intentionally-public RPCs still anon-callable | **4/4** (`submit_company_need_public_v1`, `get_public_business_{profile,listings,services}_v1`) |

**Evidence transport note (for reproducibility).** The shipped harness
`supabase/tests/20260722120000_secdef_anon_authz_bypass_verification.sql` reports via
`RAISE NOTICE`, which the Supabase MCP `execute_sql` channel does not return (verified by
probe: a bare `raise notice` yields `[]`). Under explicit owner authorisation a one-time
**result-set read-back wrapper** was used instead: identical fixtures, identical function
calls, identical roles and auth context, identical assertions and failure counter, identical
order and transaction boundaries — the **only** difference being that each verdict was
written to a transaction-local table and returned as a result set rather than printed as a
notice. The wrapper was **not committed** and changed no shipped file. The harness file
remains byte-identical.

> ⚠️ **This does NOT mean the `SECURITY DEFINER` exposure is resolved.** Seven of
> fifty-four are fixed. **47 remain anon-reachable**, including **3 with no authorization
> logic at all** that are stopped only by a `NOT NULL` constraint error — which is a
> constraint, not a security control. Follow-up audit plan:
> `docs/security/secdef-remaining-47-audit-plan-v1.md`. The recurrence guard specified
> there must be a reviewed exact-identity-signature **allowlist**, never a count.

### ✅ APPLIED TO PROD — `20260722160000_secdef_anon_reach_revoke_v1`

| Field | Value |
|---|---|
| Applied | **2026-07-22**, ledger version `20260722093138`, recorded as `secdef_anon_reach_revoke_v1` |
| Method | Supabase MCP `apply_migration` (never `supabase db push`) |
| PR | #847, squash-merged as **`d9d7d7ff7a0d78451197c265cc2a8b8ab92562f9`** |
| Reviewed PR HEAD | `4f96492377c87a1e2f221cf18fa22fdcfc0b1318` |
| Migration sha256 | `88ea8ef5a8a98cd5da7ea3ba24407a8b3e234c0be4052bc5f22376b086f6a286` |
| Rollback | `supabase/rollbacks/20260722160000_secdef_anon_reach_revoke_v1.down.sql`, sha256 `4f02aabb016c45e94f5f46a686a58f1103acc37500cc8e922ff899821cad6d88` |
| Owner gate | Approved 2026-07-22, "APPROVED WITH STRICT SCOPE" |

> **⚠ FILE AMENDED AFTER APPLY (2026-07-25, PR #865).** The repo file no longer
> matches what production executed: it now carries §4b/§4c/§4d, which make a clean
> `supabase db reset` reproduce this end-state. New SHA-256
> `991640deb81d2fe74228227e5d29af75464dbab44927452e2b282688b244971d`; the applied
> SHA-256 above is unchanged and still describes production. **Production runtime
> state and this ledger version are UNCHANGED — the migration was NOT re-applied.**
> The original bytes are preserved at
> `docs/audits/migrations/20260722160000_original-production-applied.sql`; rationale
> and risk wording in `docs/audits/migrations/README.md`.

**What it did.** Removed the leftover default `PUBLIC` EXECUTE grant — the root cause
of the 2026-07-22 P0 — from **43** `SECURITY DEFINER` functions, plus an explicit
`REVOKE ... FROM anon` on each. Granted `authenticated` on exactly **8** of them, the
only ones whose `proacl` was NULL and which therefore reached `authenticated` solely by
inheriting PUBLIC. Grant-only: no function body, table, policy, trigger or row touched,
nothing created, nothing dropped.

**Pre-apply run (recorded, defect reproduced).** PROOF 1 **FAIL** 43 leaked · PROOF 4
**FAIL** 43 with PUBLIC · PROOF 9 **FAIL** 10 of 10 still granted · PROOF 6 **FAIL**
(anon reached `is_admin`, `owns_company`, `create_contract_v1`). PROOFs 2, 3, 5, 10 PASS.
Exactly the predicted matrix.

**The pre-apply run earned its keep.** It caught a defect in the migration itself: both
the migration assertions and the harness resolved functions via
`('public.'||sig)::regprocedure`. That cast accepts ARGUMENT TYPES ONLY, so
`owns_company(c uuid)` raises `42601` — the migration would have aborted on apply. Both
now join `pg_proc` on the identity string. A post-apply-only verification would have hit
this as an unexplained mid-gate failure.

**Post-apply verification (recorded).** All catalog proofs PASS:

| Check | Result |
|---|---|
| anon-reachable `SECURITY DEFINER` in `public` | **47 → 4** |
| remaining 4 match the allowlist exactly | **PASS** (by signature identity) |
| the 43: PUBLIC `=X` in ACL | **0/43** |
| the 43: anon EXECUTE | **0/43** |
| the 33 authenticated-only: authenticated EXECUTE | **33/33** |
| the 9 trigger-only + 1 dead: anon or authenticated grant | **0/10** |
| the 9 trigger functions still attached | **9/9** |
| all 47 signatures resolve to exactly one function | **PASS** (no overload ambiguity) |

**Post-apply behavioural (recorded, transaction aborted).** As `anon` with
`auth.uid()=NULL`: `is_admin`, `owns_company`, `create_contract_v1`, `handle_new_user`
all **42501**. Public paths intact: all three business getters returned rows without
error, `submit_company_need_public_v1` still accepted an anonymous submission, and
`company_need_public_intakes` remained **unreadable by anon (42501)**.

**Authenticated smoke (recorded, transaction aborted).** As a real logged-in profile:
all 8 newly-granted helpers executed, and every RLS-protected surface still read —
`projects=5`, `journal_entries=32`, `workers=27`, `companies=6`, `assets=0`,
`defects=0`, `marketplace_listings=0`. No permission errors. No outage.

**Data unchanged.** `contracts=0 proposals=0 marketplace_listings=0
company_need_public_intakes=1 profiles=27 projects=5 journal_entries=32` — identical
before and after. Every probe ended in `ROLLBACK`.

**Independent corroboration.** Supabase's own security advisor now reports
`anon_security_definer_function_executable` = **4**, down from 47.

> ⚠️ **Still open, deliberately out of this migration's scope:** the lookup-before-
> authorization existence oracle in 9 functions (same shape as the P0); no rate limit or
> dedupe on `submit_company_need_public_v1`; the three create RPCs still defended only by
> a `NOT NULL` constraint rather than an authorization check; dead
> `public.owns_customer(c uuid)` revoked but not dropped. Separately, the advisor reports
> **183** `authenticated_security_definer_function_executable` — a much larger surface
> that has never been audited.

**Rollback is deliberately not a reversal.** Per owner directive it may never re-grant
PUBLIC or anon; it only re-asserts the 8 `authenticated` grants. The guard enforces this,
so a future edit cannot quietly turn it back into a hole-reopener.

| Repo file | Ledger version | Applied (UTC) | Approved by | What it did |
|---|---|---|---|---|
| `20260530120000_drop_legacy_threads_messages.sql` | `20260530120000` | 2026-05-30 | DI | Dropped the unused legacy `threads` + `messages` tables (0 rows) + `can_access_thread()`; `conversations*` is canonical. |
| `20260530120100_projects_company_to_organization.sql` | `20260530120100` | 2026-05-30 | DI | Added `projects.organization_id` (FK `organizations`, `ON DELETE RESTRICT`) + legacy-bridge backfill; kept nullable `company_id` (non-destructive). |
| `20260530130000_journal_integrity_guards.sql` | `20260530084241` | 2026-05-30 | DI + Chat-Claude | Salvaged from retired PR #10b 0014 (PR #156). Added `journal_entries_original_language_chk` CHECK (canonical 10-locale set, mirrors `apps/web/lib/i18n/config.ts`; `NOT VALID`→`VALIDATE`, 5 live rows all `lt`) + narrowed `journal_entries_insert` RLS to `owns_worker(worker_id) AND visibility_scope='closed'` (§4 default-closed). Additive, reversible. |
| `20260530140000_membership_engagement_reroute.sql` | `<mcp-ts>` | 2026-05-30 | DI | **The keystone (PR #157).** `engagement_contexts` += `operations_role`, `journal_review_enabled`. Hash-chained `SECURITY DEFINER` RPCs `add_org_member` / `grant_org_manager` / `set_engagement_journal_review` (membership on the canonical model, not the legacy link tables). Rerouted `review_journal_entry` + `reviewable_journal_entry_ids` to `engagement_contexts.journal_review_enabled`. `confirm_entry_and_verify_skills` flips a confirmed declared skill to `verified` (`manager_confirmed`/`green`). **First real verified Work Proof created on prod 2026-05-30 09:10Z** (worker `894b428e` `formwork-carpentry`, confirmed by owner `6fd1bd46` of org `a3d59458`). Additive, no RLS widened, reversible. |
| `20260530150000_demand_intake_consolidation.sql` | `<mcp-ts>` | 2026-05-30 | DI + Chat-Claude | **One canonical demand intake (PR #161, Phase 3 Slice 3.1).** `customer_requests` += `kind` / `payload` jsonb / `original_language` (§2) + partial unique draft index (one draft per `profile_id,kind`). Two owner-scoped `SECURITY DEFINER` RPCs (INSERT RLS is admin-only): `save_demand_draft` (draft form, `status='draft'`) + `submit_demand_request` (pilot-request CTA, `status='submitted'`, repointed off `/api/leads`). Folds `pilot_drafts` (dormant, not dropped). Verified live: a logged-in company saved a draft AND submitted a request — both landed in `customer_requests`, `leads` stayed 0 (e2e rows cleaned up). No RLS widened; additive, reversible. `leads` kept as a distinct anonymous funnel (§17.2). |

| `20260610190000_conversation_message_language.sql` | `20260611064355` | 2026-06-11 | DI + Chat-Claude | Doctrine §2.3 gap-fix on canonical messaging: nullable `conversation_messages.original_language` CHAR(2) (10-locale CHECK); historical rows stay NULL (honest unknown). *(Also present as ledger `20260610204051/204215` from the earlier apply pass — same change, idempotent `add column if not exists`.)* |
| `20260610213000_journal_entry_project_autolink.sql` | `20260611064312` | 2026-06-11 | DI + Chat-Claude | S4 item 1: body-replace of `create_journal_entry_full` + `journal_entry_supersede` — `journal_entries.project_id` auto-links ONLY when the worker has exactly one active same-org assignment (ambiguous → NULL, never a guess); supersede carries the old link. No schema/RLS/grant change; old entries NOT backfilled. |
| `20260610214000_market_rate_averages.sql` | `20260611064340` | 2026-06-11 | DI + Chat-Claude | S4 item 2: `market_rate_averages` admin-entered table (sourced rows only, ships empty) + `admin_set_market_rate_average` RPC (audit-logged) + `project_position_salary_avg` aggregate RPC. **Review fix in prod + repo file:** avg returned ONLY when `sample_n >= 2` (n<2 → NULL → insufficient_data; also prevents leaking a single person's declared range). |
| `20260611120000_batch_journal_review.sql` | `20260611064423` | 2026-06-11 | DI + Chat-Claude | DESIGN_SOUL §3 batch confirm: `batch_review_exceptions` (worker_first_entries / unusual_hours / new_skill — surfaced BEFORE the click) + `review_journal_entries_batch` (delegates per entry to 0034 `review_journal_entry`, refuses unacknowledged exceptions, caps 100, ONE batch-testimony `audit_logs` row naming the exact list). |

| `20260611150000_s5_agency_demand_visibility.sql` | `20260611091820` | 2026-06-11 | DI + Chat-Claude | S5 agency demand bridge: `list_open_demand_for_agencies` (curated, non-personal projection of `status='submitted'` requests for agency owners) + `mark_agency_can_offer` (append-only `payload.agency_offers` proposal marker, never touches status/match_log; audit-logged). No RLS change, no new table. Unlocks the positioning section on `/dashboard/agency/pool`. |
| `20260602130000_confirmation_role_check.sql` | `20260611091834` | 2026-06-11 | DI + Chat-Claude | PR #240 hardening: CHECK pinning `journal_entry_confirmations.confirmer_role` to manager/owner/external_manager (pre-flight asserted 0 violating rows). Defense-in-depth under 0034 + the batch RPC (both already write only those roles). |
| `20260611170000_s6_worker_docs_consent.sql` | `s6_worker_docs_consent` | 2026-06-16 | DI (owner-approved) + Claude Code | **S6 documents-readiness consent (connect-all-functions sprint).** Additive `workers.docs_aggregate_consent boolean not null default false` + two `SECURITY DEFINER` RPCs: `set_docs_aggregate_consent(boolean)` (worker-owned audited switch, `workers.profile_id=auth.uid()`) and `agency_pool_docs_readiness()` (agency-owner-gated CATEGORY counts only — never document contents; consent-off workers simply absent). No RLS widened; `worker_documents` stays owner-only. Granted to `authenticated`, NOT `anon`. Verified post-apply: column + both RPCs exist, grants correct. Unblocks the documents aggregate-consent toggle + agency-pool docs-readiness (were `needs_gate`). Reversible (rollback in file). |

| `20260705250000_journal_photos_project_gallery.sql` | `20260705160046` | 2026-07-05 | DI + Claude Code (CR train) | **WAGON 8 gallery read scope.** Two ADDITIVE SELECT policies mirroring the 0013 `journal_entries` manager boundary (`manages_organization` via the entry's engagement context) onto `journal_entry_photos` + the private `journal-entry-photos` storage objects — org managers can now see the project work gallery. Renumbered from 20260705240000 by PR #628 (prefix collided with the `20260705240000_agency_legacy_retype` ledger name). Verified post-apply: both policies exist, SELECT-only, 5 total policies on the photo table. Rollback: paired down file (two policy drops). |

| `20260705260000_help_request_intake.sql` | `20260705260000_help_request_intake` | 2026-07-05 | DI + Claude Code (CR train W10) | **WAGON 10 typed internal help requests.** ONE new-name SECURITY DEFINER RPC `submit_help_request_v1` inserting typed help rows (recruiter/accounting/legal/documents/demand_filling) on the EXISTING `customer_requests` table at status `in_review` — operator-queue-visible, never on the submitted-only agency/worker demand projections. Closed type set, 500-char note cap, demand-ownership check, 10-open abuse cap, grants postgres+authenticated only (no anon). Verified post-apply: RPC exists, SECURITY DEFINER, grants correct, 0 pre-existing help rows. Rollback: paired down file (drop function only). |

| `20260706120000_booking_requests_seen.sql` | `20260706092909` | 2026-07-06 | DI (explicit owner instruction in chat) + Claude Code (owner-away repair train) | **Audit-PR5 booking seen model (PR #640).** ONE per-user seen table `booking_requests_seen` (`user_id` PK → profiles, `seen_at`; mirrors `service_requests_seen` Option C′) + SECURITY DEFINER RPC `mark_booking_requests_seen()` (upserts only `auth.uid()`'s row; `search_path=public` pinned). RLS enabled; single SELECT-only policy `booking_requests_seen_select` (`user_id = auth.uid()`); table grant SELECT-only to authenticated (writes RPC-only); EXECUTE to authenticated only, no anon. Verified post-apply by direct SQL: table + policy + grants + RPC all as designed, 0 rows (populated on first bookings visit). Unlocks the dashboard "new booking responses" badge + PR6 top-slot promotion end-to-end. Rollback: paired down file (drop function + table). |

| `20260711130000_privacy_consent_and_disclosure_v1.sql` | `privacy_consent_and_disclosure_v1` | 2026-07-11 | DI (explicit owner goal command) + Claude Code (consent train) | **Consent-and-disclosure v1 (PR #700).** Append-only `privacy_consent_events` + `personal_data_disclosures` ledgers (UPDATE/DELETE trigger-blocked for every role incl. service role; worker-only SELECT on events), `privacy_consent_purposes` version+hash pinning (2 rows seeded, NO consent backfill — ledger ships EMPTY), **fail-closed RLS swap**: `workers`/`worker_skills`/`worker_professions` SELECT now `can_view_worker()` (employer discovery requires CURRENT granted `profile_discoverability`; active company/agency/engagement/project relationships keep contract-basis visibility), 12 narrow SECURITY DEFINER RPCs (auth.uid()-derived, authenticated-only, pinned search_path). Verified post-apply: 2 purposes, 0 events, policy quals swapped, trigger present, 12 RPCs. Rollback: paired down file (restores ORIGINAL employer-open policies — re-opens the audited exposure; hard-failure only). |
| `20260711150000_privacy_consent_event_ordering_fix_v1.sql` | `privacy_consent_event_ordering_fix_v1` | 2026-07-11 | DI (same goal command) + Claude Code | **Ordering correctness fix.** Production rollback self-test caught same-transaction grant+withdraw resolving nondeterministically (now() frozen ⇒ created_at tie; random uuid tie-break). Added monotonic `seq bigint identity` + all current-state readers order by `(created_at desc, seq desc)` — a withdrawal now ALWAYS beats a same-instant grant. Verified post-apply by a rolled-back production simulation: grant→visible(+1), withdraw→invisible immediately, ledger back to 0 rows, direct insert RLS-denied. |

| `20260711170000_privacy_consent_text_v2_controller_identity.sql` | `privacy_consent_text_v2_controller_identity` | 2026-07-11 | DI (explicit owner goal command) + Claude Code (legal-entity train) | **Consent text v2 — controller identity (PR #702).** Two UPDATE rows on `privacy_consent_purposes`: version 2026-07-11.v1 → v2 with new hashes; the v2 texts add the `controller` block (UAB „Nonstop Group“ 302676973 as controller, info@labourmarket.ai contact, IP owner Labour Market AI Sp. z o.o. receives no personal data) in all 5 locales of both purposes. 0 consent events existed at apply (verified) — no backfill, no auto-consent; any hypothetical v1 grant would read granted_stale_version (fail closed). Verified post-apply: both rows v2 with expected hash prefixes. Rollback: paired down file (restores v1 pins). |

| `20260711330000_worker_demand_structured_v2_exposure.sql` | `20260711203058` | 2026-07-11 | DI (explicit owner goal command: migration activation programme) + Claude Code | **MP-3 worker demand structured exposure (PR #730).** New IMMUTABLE pure-SQL helper `demand_structured_v2_public(jsonb)` — per-key type/enum whitelist re-projection of `payload.structured_v2` (closed enums / typed numbers / ISO dates / booleans ONLY; every free-text key dropped element-by-element) + `list_open_demand_for_workers()` recreated byte-identical to the live definition (pre-verified via `pg_get_functiondef` compare) PLUS one `structured jsonb` column. Pre-state: 10 submitted demands, 0 with structured_v2 (projection is read-time — new captures light up immediately). Verified post-apply: adversarial leak test dropped `bonuses_note`/`worksite_type`/`right_to_work_notes`/`meta`/`certificates`/language-note/`decision_owner`/invalid enums while preserving whitelisted facts; non-object/null → NULL; ACLs postgres+authenticated only; RPC signature carries the 13th `structured` column. Old records: `structured` NULL (honest not-provided). Consumer #732 (merged) mirrors the whitelist. Rollback: paired down file (restores prior RPC verbatim + drops helper). |

| `20260711250000_worker_languages_v1.sql` | `20260711203623` | 2026-07-11 | DI (explicit owner goal command: migration activation programme) + Claude Code | **MP-1 worker languages (PR #720).** New `worker_languages` table — one row per (worker, lang): closed 11-language set, CEFR A1..C2 + native, unique pair caps rows at 11/worker; self-declared ONLY (no verified flag exists; nothing may render these as verified). RLS SELECT mirrors `worker_skills_select` exactly: `can_view_worker(worker_id)` (owner/admin/consented employer/active relationship — fail-closed; policy qual equality verified pre-apply). Writes RPC-only: `save_worker_language_v1` / `remove_worker_language_v1` (SECURITY DEFINER, auth.uid()-bound, closed-set re-validation; direct DML revoked). Verified post-apply: single SELECT-only policy, RLS on, authenticated table grant SELECT-only, RPC ACLs postgres+authenticated; rolled-back production simulation — save→row id, visible to owner, remove→true, 0 rows after. Ships empty (0 rows at apply). Consumer #734 languages form (merged) lights up. Rollback: paired down file (drops 2 functions + table). |

| `20260711270000_worker_preference_columns_v2.sql` | `20260711204006` | 2026-07-11 | DI (explicit owner goal command: migration activation programme) + Claude Code | **MP-2 worker preference columns v2 (PR #721).** SEVEN additive NULLABLE columns on canonical `workers` (pay_basis_preference gross/net CHECK, night_shifts_ok, weekend_shifts_ok, overtime_ok tri-states, driving_licence_categories ⊆ {B,BE,C,CE,D} CHECK, own_vehicle, own_tools) + NEW-name RPC `save_worker_availability_prefs_v2` (writes v1+v2 fields; the applied v1 RPC keeps its exact signature and callers — verified still present post-apply). NULL = "not stated" — matching treats NULL as missing data, never a "no". Verified post-apply: all 7 columns nullable, 0/20 existing worker rows changed, RPC ACL postgres+authenticated; rolled-back production simulation — v2 save wrote basis=net, licences {B,CE}, night=true AND the v1 relocate field, all reverted. Consumer #734 v2 preference fieldset (merged) lights up with v2→v1 save fallback. Rollback: paired down file (drops v2 function + 7 columns). |

| `20260711310000_worker_saved_opportunities_v1.sql` | `20260711204106` | 2026-07-11 | DI (explicit owner goal command: migration activation programme) + Claude Code | **MP-5 worker saved opportunities (PR #723).** New private-bookmark table `worker_saved_opportunities` — a row stores ONLY (worker_id, request_id, saved_at, optional ≤500-char note): no copied demand facts, so a stale save can never show stale truth (board re-reads the gated worker RPC; closed demand renders "no longer open"). RLS SELECT: saving worker or `is_admin()` ONLY — the demand owner NEVER sees who saved (bookmark ≠ interest signal; interest stays consent-gated `demand_interest_signals`). Writes RPC-only: `save_worker_opportunity_v1` (existence+non-draft/closed check on the request id, cap 200/worker, upsert note) / `unsave_worker_opportunity_v1`. Verified post-apply by rolled-back production simulation: save→id, visible to owner, arbitrary-uuid save blocked (P0002), unsave→true, 0 rows after. Ships empty. Consumer #735 save toggle + saved section (merged) appears. Rollback: paired down file (drops 2 functions + table). |

| `20260711290000_booking_lifecycle_v2.sql` | `20260711204354` | 2026-07-11 | DI (explicit owner goal command: migration activation programme) + Claude Code | **MP-4 booking lifecycle v2 (PR #722).** All ADDITIVE, v1 RPCs untouched: `booking_requests.response_deadline_date` date; `booking_request_events.reason_kind` (closed 8-kind CHECK) + `reason_note` (≤500); event-type CHECK widened +`rescheduled`,`deadline_set` (events table had 0 rows at apply — conflict-free named-constraint swap); 4 new authenticated RPCs — `respond_booking_request_v2` (v1 semantics + optional decline reason), `withdraw_booking_request_v2` (+ withdraw reason), `reschedule_booking_proposal_v1` (owner-only, PROPOSED-only — an accepted booking is never mutated), `set_booking_response_deadline_v1` (owner-only, proposed-only, >= current_date) — and `expire_stale_booking_requests_v1` (`is_admin()`-ONLY sweep, ≤500 rows/call; **no scheduler installed — wiring expiry to any scheduler stays a separate owner decision**). Verified post-apply by rolled-back production simulation: deadline set (+7d), reschedule moved dates, worker decline recorded reason_kind=dates_unsuitable, event history `deadline_set>rescheduled>declined`, non-admin expiry call rejected 42501. Consumer #733 (merged) switches from v1 fallback to full v2 behavior. Rollback: paired down file (drops 5 functions + 2 columns, restores original event CHECK). |

| `20260711210000_work_tasks_v1.sql` | `20260711204521` | 2026-07-11 | DI (explicit owner goal command: migration activation programme) + Claude Code | **Control-room PR D2 work tasks (PR #708).** New `work_tasks` table — bounded assignable task rows (title 3..160, description ≤2000, HONEST 5-state lifecycle todo/in_progress/blocked/done/cancelled, 3-value priority, optional project pointer, ids-only source pointer both-or-neither CHECK, resolved_at shape CHECK) + 3 RPC-only write paths `create_work_task_v1` / `set_work_task_status_v1` / `update_work_task_v1` (SECURITY DEFINER, server-side re-auth, self-assign-or-unassigned only, open-task cap 200/creator; direct DML revoked). RLS SELECT: creator/assignee/`is_admin()`/project manager via existing `can_manage_project()`; unauthorized callers get `not_found` — no existence leak. NO external sending by construction; NO scheduler/reminders. Verified post-apply by rolled-back production simulation: create→created, edit→updated, done stamped resolved_at, 2-char title rejected, unrelated worker sees 0 rows and edit→not_found. Consumer /dashboard/tasks + spine signal (#707, merged) switch from honest "preparing" (42P01) to live. Rollback: paired down file (drops 3 functions + table). |

| `20260711230000_finance_records_v1.sql` | `20260711204634` | 2026-07-11 | DI (explicit owner goal command: migration activation programme) + Claude Code | **Control-room PR I2 finance records (PR #714).** New `finance_records` table — manual operational rows only: type invoice_issued/invoice_received/expense, title 3..160, bounded counterparty text, **integer cents bigint 0..1e11 (digits-only string across the RPC boundary — no floats anywhere)**, EUR-only CHECK, HONEST stored lifecycle draft/issued/partially_paid/paid/cancelled (**overdue is DERIVED app-side, never stored**), paid_at shape CHECK, optional project/company pointers, note ≤1000 + 3 RPC-only write paths `create_finance_record_v1` / `update_finance_record_v1` / `set_finance_record_status_v1` (SECURITY DEFINER, server-side re-auth via `can_manage_project`/`owns_company`, cap 2000/creator; direct DML revoked). RLS SELECT: creator/`is_admin()`/linked-company owner. NO money movement, NO payment/bank/payroll/tax claims by construction. Verified post-apply by rolled-back production simulation: create→created with exact 1234567 cents, float string "12.50" rejected→invalid, paid stamped paid_at, unrelated worker sees 0 rows and edit→not_found. Consumer /dashboard/finance + CSV export (#713, merged) switch from honest "preparing"/503 to live. Rollback: paired down file (drops 3 functions + table). |

| `20260712120000_journal_entry_restore.sql` | `20260712092115` | 2026-07-12 | DI (explicit owner authorization: PR #743 unblock command) + Claude Code | **User-journey repair v1 restore RPC (PR #743).** ONE SECURITY DEFINER RPC `journal_entry_restore(uuid)` — the undo half of the honest delete contract: `owns_worker` ownership gate (the only gate; definer bypasses RLS), idempotent on non-deleted entries, REFUSES superseded entries (42P10 — restoring would show two competing versions), clears `deleted_at` only (never fabricates content), pinned `search_path=public`, all refs schema-qualified. Grants: EXECUTE to authenticated only (revoked from public). Verified post-apply by rolled-back production simulation on a real soft-deleted entry: unauthenticated→`not_owner`, wrong user→`not_owner`, owner→`deleted_at` cleared, idempotent re-call→no error. Rollback: paired down file (drops the function; restored entries keep their state). |

| `20260712130000_conversation_message_attachments.sql` | `20260712092332` | 2026-07-12 | DI (explicit owner authorization: PR #743 unblock command) + Claude Code | **User-journey repair v1 message attachments (PR #743).** Private `conversation-attachments` bucket (`public=false`, 10MB limit, 5-MIME allowlist pdf/jpeg/png/webp/txt) + append-only metadata table `conversation_message_attachments` (RLS SELECT: active participant via `is_conversation_participant` or `is_admin`; INSERT `with check (false)` — RPC-only; NO update/delete policies) + `register_conversation_message_attachment` RPC (author-only, active-participant, path MUST start `<conversation_id>/<uid>/`, MIME+size re-validated server-side, cap 5/message) + safe path helper `is_conversation_participant_path` (malformed path → false, never throws) + 4 participant-scoped `storage.objects` policies (read=participant, write/delete=own-uid folder only, admin read-only) + body CHECK relaxed 1..10000 → 0..10000 (attachment-only messages; app enforces text-OR-attachment). NO public URLs — reads via 5-min signed URLs from the user-scoped client. Verified post-apply by rolled-back production simulation: unauthenticated register→rejected, non-author→`Message not owned`, wrong path prefix→rejected, `.exe` MIME→rejected, valid author register→id returned, malformed-path helper→false without throwing; bucket private, 4 storage policies, RLS on, body CHECK 0..10000 confirmed by direct catalog reads. Rollback: paired down file (policies+bucket+functions+table; body CHECK restored 1..10000 only when no empty-body rows exist). |

| `20260712200000_canonical_invitations_v1.sql` | `20260712113216` | 2026-07-12 | DI (explicit owner delivery command: PR #744) + Claude Code | **Canonical invitations v1 (core-network area B, PR #744).** ONE typed invitation model (7 types) storing ONLY sha256(token) (64-hex CHECK, unique); single-use FOR-UPDATE acceptance with server-side expiry that creates the CANONICAL relationship — employee/collaborator `engagement_contexts` or `project_worker_assignments` (reactivate, never duplicate) — never a legacy link; server-side sender permission per context (org owner / manages_organization / can_manage_project); caps 100-open + 30-per-24h + duplicate-pending dedup; token-rotating resend (≤10); truthful delivery states via dedicated RPC; in-app acceptance strictly by the caller's own JWT email (no enumeration); RLS SELECT inviter-or-admin, RPC-only writes, authenticated-only grants, audit row per state change (no tokens/emails in payloads). **Pre-apply review fix:** partner slug corrected 'collaboration' → 'collaborator' (the live relationship_types registry value — the FK insert would have failed). Verified post-apply by a fully rolled-back production battery (20/20): unauthorized invite→not_authorized, create→created, duplicate→duplicate_pending, wrong token→not_found, accept→engagement_created (1 row), repeat→already_accepted (still 1 row), revoke→accept rejected, expired→rejected, resend→old token dead, accept_by_id wrong email→not_found, list_for_me scoped (1), partner accept→collaborator engagement, audit leak scan 0, RLS non-inviter sees 0 / inviter sees own 5. Table ships EMPTY (0 rows at apply). Rollback: paired down file (drops functions + table; never deletes memberships). |

| `20260714230000_market_intelligence_observations_v1.sql` | `20260715064810` | 2026-07-15 | DI (explicit owner authorization: intelligence-migration apply command) + Claude Code | **Labour Market Intelligence layer v1 (PR #755 file, arrived on main via #760).** THREE new tables forming one auditable read/analysis layer OVER existing truth: `market_intelligence_sources` (owner-allowlisted source registry; externals seeded `activation='off'`, CHECK makes `'on'` impossible without `owner_approved_at` + `legal_status='confirmed'`), `market_intelligence_observations` (versioned aggregate observation contract — never overwrites user/human-confirmed data; only `public_aggregate` rows readable by an authenticated session; corrections are NEW rows via `valid_to`), `market_intelligence_insight_queries` (APPEND-ONLY insight-query audit; update/delete revoked from every role incl. service_role). Writes server-only via service-role client. *This ledger row was added retroactively 2026-07-16 (doc-only gap found by the Wagon 1 investigation): the apply itself happened 2026-07-15 with preflight + post-apply verification recorded in the operator artifact store (agantai `runtime/audits/labourmarketai/migration-20260714230000-*`); eurostat activation later owner-approved via #762/#763.* Rollback: paired down file. |

| `20260713190000_company_need_intake_service_grants.sql` | `20260716063308` | 2026-07-16 | DI (explicit owner authorization: UX Recovery Train Wagon 0 execution command) + Claude Code | **Service-role grants for the public intake table (canonical journey P3; PRODUCTION DEFECT FIX; PR #748 file, applied post #764/#765 merge).** `grant select` + column-scoped `grant update (status)` on `company_need_public_intakes` to `service_role` ONLY — anon/authenticated keep NO grants and NO policies (deny-all unchanged), RLS stays enabled, the SECURITY DEFINER submit RPC stays the only public write path. Verified post-apply by catalog reads (service_role: SELECT + UPDATE(status) only; anon/authenticated: 0 grants; RLS `true`) AND a rolled-back `SET LOCAL ROLE service_role` functional read — the owner queue read path now returns rows (1 real intake was waiting, previously invisible behind "permission denied"). Rollback: paired down file (revokes both grants). |

| `20260714161000_self_declared_work_history_v1.sql` | `20260716063515` | 2026-07-16 | DI (explicit owner authorization: UX Recovery Train Wagon 0 execution command) + Claude Code | **Self-declared work-history write path into canonical `engagement_contexts` (Full CV System v1; PR #752 file, applied post #764/#765 merge).** TWO SECURITY DEFINER RPCs (`search_path=public` pinned), zero table/RLS/grant changes to existing objects: `save_self_declared_work_history_v1` (caller-only insert, `organization_id` ALWAYS NULL — no fabricated organizations; closed worker relationship set employee/freelancer/consultant/collaborator; bounded 3..200 title; idempotent on (profile, title, relationship, dates); 60 org-less rows cap) + `remove_self_declared_work_history_v1` (deletes ONLY the caller's own, org-less, NON-primary rows; journal-referenced rows return `in_use` via FK-restrict catch). EXECUTE granted to authenticated only (revoked from public). Preflight verified deps (pgcrypto in `extensions`, all 9 target columns, all 4 relationship slugs live). Verified post-apply: both functions exist with secdef + pinned search_path, grantees = authenticated+postgres only, and a no-auth behavioral test raised `Not authenticated` (42501) with `engagement_contexts` rowcount unchanged (37). Rollback: paired down file (drops the two functions; worker-entered rows stay). |

| `20260716120000_contact_disclosure_requests_v1.sql` | `20260716194948` | 2026-07-16 | DI (explicit owner directive: Commercial Pilot Readiness Train merged-green execution command) + Claude Code | **Contact disclosure requests v1 (Train PR #774, Wagon 1).** Employer→worker contact-detail ASK on the shared contact/consent contract: `contact_disclosure_requests` (statuses created→accepted/declined/withdrawn/expired; field NAMES only from the closed 7-field whitelist, never values; note ≤500) + APPEND-ONLY `contact_disclosure_request_events` (full 7-event vocabulary incl. delivered/viewed; UPDATE/DELETE trigger-blocked) + 5 SECURITY DEFINER RPCs (propose: demand-ownership + org-ownership + fail-closed `can_view_worker` + idempotent live-row dedupe + caps 10 open/30 per 24h; respond: subject-worker only; withdraw: requester only; expire: admin-only sweep; list: worker inbox, names only, reads disclosure state via `has_employer_data_disclosure`). ACCEPTING DISCLOSES NOTHING — the disclosure grant stays the separate applied `grant_employer_data_disclosure` ledger act. RLS SELECT requester/subject/admin; RPC-only writes; audit_logs row per state change. Post-apply verification: RLS enabled + policy counts, all RPCs secdef with pinned search_path, append-only trigger present (catalog read 2026-07-16). Rollback: paired down file. |

| `20260716121000_request_rate_limits_v3.sql` | `20260716195042` | 2026-07-16 | DI (same train directive) + Claude Code | **Booking rate limits v3 (Train PR #774, Wagon 1).** ONE defense-in-depth wrapper `propose_booking_request_v3` enforcing 10-open/30-per-24h inside the DB, then delegating to the UNCHANGED applied v1 booking RPC (auth context carries through; v1 re-runs its own checks). App calls v3 first with honest v1 fallback. Conversation-request cap remains app-layer only (no RPC seam exists) — stated honestly. Rollback: paired down file (drops the wrapper). |

| `20260705220000_team_brigade_org_spine.sql` | `20260705085611` | 2026-07-05 | DI (owner-gated MCP apply) + Claude Code | **Teams/brigades minimum on the org spine (product-tree branch 13, train §8.3).** ADDITIVE widening of `organizations_organization_type_check` → `('company','agency','team','other')` (every prior value stays valid) + ONE `SECURITY DEFINER` write RPC `create_team_v1(p_team_name)` inserting a single `organizations` row (`organization_type='team'`, owner via the existing 0035 `on_org_owner_engagement` trigger) + `get_team_capability_summary_v1`. NO new table, NO new org system. **LEDGER-DRIFT FIX (audit 2026-07-17, `docs/audit/team-spine-migration-audit-v1.md`):** applied to prod 2026-07-05 (Supabase `schema_migrations` version `20260705085611`) but the row was never recorded here, while its dependents (below) were. Prod verified 2026-07-17 by read-only SQL: org-type CHECK includes `'team'`; `create_team_v1`, `save_team_details_v1`, `team_details`, `team_enquiries` all present. The repo file keeps its `DO NOT APPLY automatically` human-gate header (required by `team-brigades-layer` guard; it means never-auto-apply/never-db-push, which is how the owner MCP-applied it). Rollback: paired down file. |
| `20260716130000_team_profile_details_v1.sql` | `20260716195121` | 2026-07-16 | DI (same train directive) + Claude Code | **Team profile details v1 (Train PR #775, Trust Connect).** 1:1 `team_details` on the team org id (availability status/from, deployable size 1..200 min≤max, ≤30 ISO-alpha-2 destination countries, accommodation, transport, trip days 1..365, manager-only note ≤500 — never projected to employers). RLS SELECT admin/team-owner/`manages_organization` only; single SECURITY DEFINER writer `save_team_details_v1` (team-type + role gated, server-validated closed vocabularies, audit row per save). Feeds the canonical TeamMatchInputV1 read model. Rollback: paired down file. | 1:1 `team_details` on the team org id (availability status/from, deployable size 1..200 min≤max, ≤30 ISO-alpha-2 destination countries, accommodation, transport, trip days 1..365, manager-only note ≤500 — never projected to employers). RLS SELECT admin/team-owner/`manages_organization` only; single SECURITY DEFINER writer `save_team_details_v1` (team-type + role gated, server-validated closed vocabularies, audit row per save). Feeds the canonical TeamMatchInputV1 read model. Rollback: paired down file. |

| `20260716131000_team_enquiries_v1.sql` | `20260716195230` | 2026-07-16 | DI (same train directive) + Claude Code | **Team enquiries v1 (Train PR #775, Trust Connect; shared contact/consent contract).** `team_enquiries` (created→accepted/declined/withdrawn/expired; message 1..500 with embedded-email/phone-run rejection; one open enquiry per (requester, team) partial-unique + duplicate create returns the EXISTING row; expires_at +14d) + APPEND-ONLY `team_enquiry_events` (7-event vocabulary; `viewed` written once on first authorised team-side inbox read; `delivered` reserved — no delivery channel exists, writing it would be fake) + 6 SECURITY DEFINER RPCs (propose with own-team block + caps 10 open/30 per 24h; respond: team owner/manager only, requester can NEVER self-accept; withdraw: requester only; admin-only capped sweep; employer list projecting ONLY the bounded team_details availability snapshot; team inbox with display names only). Acceptance changes enquiry state ONLY — no member contact disclosure. RLS default-closed; RPC-only writes; audit rows. Rollback: paired down file. |

| `20260716140000_pilots_cohort_v1.sql` | `20260716195326` | 2026-07-16 | DI (same train directive) + Claude Code | **Pilots cohort v1 (Train PR #777, Wagon 5).** `pilots` (name 2..120, organisation_kind = companies.company_type vocabulary + 'mixed', draft/active/closed, bounded window) + `pilot_participants` (unique (pilot, profile), left_at marks departure — never deleted, re-join reuses the row) + APPEND-ONLY `pilot_outcomes` (contact_made/enquiry_made/booking_accepted/hire_reported/no_outcome; noted_by; note ≤500 is the only free text; corrections are NEW rows — no updating RPC exists). RLS admin-only SELECT on all three; writes only via 5 SECURITY DEFINER RPCs each re-checking `is_admin()` + audit_logs row with from/to status. FKs to applied `profiles` only. Rollback: paired down file. |

| `20260714160000_worker_education_achievements_v1.sql` | `20260716195418` | 2026-07-16 | DI (explicit owner directive: train Phase 7 Wagon 3 activation) + Claude Code | **Worker education + achievements v1 (Full CV System slice; Wagon 3 production activation).** Moved up from the Deferred list below — applied after the train merges. TWO §10 slug registries (`education_types` 9 seeds, `achievement_types` 5 seeds incl. `declared_certificate` for certificates found in imported CV TEXT — no fabricated `worker_documents` rows) + TWO owner-only tables `worker_education` / `worker_achievements` (default-closed RLS `profile_id = auth.uid()` CRUD, bounded text CHECKs, year bounds 1900..2100). `confirmed_by_manager` defaults false and is EXCLUDED from authenticated insert/update COLUMN grants — the owner can never self-confirm. CV-import education/certificates/achievements confirm actions now have their production write path; AI structuring stays OFF (`AI_PROVIDER_MODE=disabled`, `20260714150000` ai_runs NOT applied — deterministic import fully operational without it). *[Updated 2026-08-03: `20260714150000` ai_runs IS now applied (prod ledger `20260803061937`) — but the statement this row actually depends on is unchanged, because `AI_PROVIDER_MODE` is still `disabled`, so AI structuring remains OFF and the deterministic import is still what does the work.]* Post-apply verification: RLS + 4 CRUD policies per worker table, registries readable, column grants exclude confirmed_by_manager. Rollback: paired down file. |

| `20260718140000_project_operations_stages.sql` | `20260718124203` | 2026-07-18 | DI (explicit owner standing authorization — real-user-launch + operations train v2) + Claude Code | **Wagon 6 Project Operations Core slice 1 — project_stages (PR #817).** NEW canonical `project_stages` (ordered sub-phases over `projects`; status planned/in_progress/blocked/done/cancelled; planned+actual dates; responsible engagement; completion criteria; blocked_reason CHECK; **no stored progress %**). Default-closed RLS: SELECT via `can_manage_project(project_id)` OR active `project_worker_assignments`; writes RPC-only. 3 manager-gated SECURITY DEFINER RPCs add/update/delete (`search_path=public` pinned, each re-checks `can_manage_project`). GRANT SELECT + EXECUTE to authenticated only, no anon. Post-apply verified: table + 1 SELECT-only policy + 3 secdef RPCs + grants (auth select yes / insert no), 0 rows; authenticated RPC/RLS proof (manager add+update OK, non-manager rejected) rolled back — 0 test rows. Rollback: paired down file. |

| `20260718150000_leave_absence.sql` | `20260718141602` | 2026-07-18 | DI (explicit owner standing authorization — real-user-launch + operations train v2) + Claude Code | **Wagon 7 Workforce — Leave & Absence (PR #819).** NEW `worker_absences` (type annual_leave/sickness/unpaid/training/other; dates; half_day; note ≤500; status **default 'requested'** — never auto-approved). Default-closed RLS: SELECT via own worker (`workers.profile_id=auth.uid()`) OR `caller_manages_worker` OR admin; writes RPC-only. 3 SECURITY DEFINER RPCs (`search_path=public`): request (own worker), review (**manager-only** via caller_manages_worker), cancel (own worker). GRANT SELECT + EXECUTE authenticated only, no anon. Post-apply verified: authenticated proof (worker request + manager approve OK; non-manager can't see; worker self-approve rejected) rolled back — 0 test rows. Rollback: paired down file. |

| `20260718160000_project_budgets.sql` | `20260718151052` | 2026-07-18 | DI (explicit owner standing authorization — real-user-launch + operations train v2) + Claude Code | **Wagon 8 Project Economics — project_budgets (PR #820).** NEW `project_budgets` (category incl. `total` override; `planned_amount_cents`; **EUR-only** CHECK; draft/approved; unique per project+category). Default-closed RLS **manager-only** (`can_manage_project` — financials never to workers). 3 SECURITY DEFINER RPCs (`search_path=public`): set-line upsert / set-status / delete. Actual cost derived through the canonical finance reader (no direct ledger read, no second cost ledger). Post-apply verified: authenticated proof (manager set+approve OK; non-manager rejected) rolled back — 0 test rows. Rollback: paired down file. |

| `20260718170000_assets_logistics.sql` | `20260718160954` | 2026-07-18 | DI (explicit owner standing authorization — real-user-launch + operations train v2) + Claude Code | **Wagon 9 Assets & Logistics (PR #821).** NEW `assets` (org-owned tools/equipment/vehicles/safety; type/condition/availability CHECKs) + `asset_assignments` (issue→acknowledge→transfer→return; condition at issue/return; target project and/or worker). Org-scoped default-closed RLS (`manages_organization`; assigned worker reads own). 6 SECURITY DEFINER RPCs: create/issue/transfer/return manager-gated (`caller_manages_asset`); acknowledge worker-only. GRANT SELECT + EXECUTE authenticated only. No location tracking. Post-apply verified: 2 tables RLS-on, 6 secdef RPCs, insert denied on both, 0 rows. **NOTE: the two SELECT policies as shipped here recursed (42P17) — fixed immediately by `20260718180000` below before any use.** Rollback: paired down file. |

| `20260718180000_assets_rls_recursion_fix.sql` | `20260718161235` | 2026-07-18 | DI (explicit owner standing authorization) + Claude Code | **Wagon 9 fix — assets RLS recursion.** The `assets` / `asset_assignments` SELECT policies referenced each other → infinite recursion (42P17). Routed each cross-table check through a SECURITY DEFINER helper (`asset_open_assignment_for_caller` + existing `caller_manages_asset`), same visibility, non-recursive. Post-apply verified with the full authenticated lifecycle proof: manager create+issue → worker acknowledge → manager return (ended status=returned, availability=available, condition=good); non-manager create rejected — all rolled back, 0 test rows. Rollback: paired down file (restores prior definitions). |

| `20260718190000_commercial_crm.sql` | `20260718181812` | 2026-07-18 | DI (explicit owner standing authorization — real-user-launch + operations train v2) + Claude Code | **Wagon 10 Commercial CRM (PR #823).** NEW owner-scoped `proposals` (draft/sent/accepted/rejected/withdrawn) + `contracts` (draft/active/completed/cancelled; document REFERENCE only, no e-signature). EUR-only; linked to `customer_requests`/`projects`. Default-closed RLS `owner_id = auth.uid()`; 6 SECURITY DEFINER RPCs (create/set-status/delete per table). Invoices + payments are NOT duplicated — they stay in the canonical finance ledger (read via lib/finance). Post-apply verified: authenticated proof (owner create→send→accept→contract OK; non-owner rejected) rolled back, 0 test rows. Rollback: paired down file. **⚠️ CORRECTION 2026-07-22 — the post-apply verification above was INCOMPLETE.** It tested a non-owner *authenticated* caller only. Four of these six RPCs (`delete_contract_v1`, `set_contract_status_v1`, `delete_proposal_v1`, `set_proposal_status_v1`) were left executable by `anon` (inherited `PUBLIC` grant) **and** used the NULL-unsafe check `v_owner <> auth.uid()`, which does not fire when `auth.uid()` is NULL. An unauthenticated caller could therefore delete or re-status any contract or proposal. Zero rows existed, so nothing was lost. Fixed by `20260722120000_secdef_anon_authz_bypass_fix_v1.sql` — **not yet applied to production**. See the CORRECTION block at the top of this file. |

| `20260718200000_delivery_quality.sql` | `20260718191614` | 2026-07-18 | DI (explicit owner standing authorization — real-user-launch + operations train v2) + Claude Code | **Wagon 11 Delivery & Quality — defects + corrections (PR #824).** NEW `defects` (over `projects`, optional `project_stages` link; category/severity; lifecycle reported→acknowledged→assigned→in_correction→ready_for_review→accepted/reopened/rejected/cancelled; reporter/assignee) + `defect_corrections` (a correction moves a defect to `in_correction` only — **never auto-accepts**; acceptance is a separate manager act). Project-scoped default-closed RLS (`can_manage_project` OR reporter); the corrections policy routes its cross-table check through the SECURITY DEFINER helper `caller_manages_defect` so it stays non-recursive (W9 42P17 lesson applied). No second photo store. Post-apply verified: authenticated proof (report→correct→accept OK; non-manager rejected) rolled back, 0 test rows. Rollback: paired down file. |

| `20260718210000_marketplace_listings.sql` | `20260718210411` | 2026-07-19 | DI (explicit owner approval of PR #826 under standing train authorization) + Claude Code | **Wagon 13 slice 1 — work-resource marketplace listings (PR #826).** NEW `marketplace_listings` (physical WORK resources: accommodation/premises/vehicle/tools/equipment/machinery/safety_equipment; sale/rent/wanted; optional org/project link validated in-RPC via `manages_organization`/`can_manage_project`; optional free-text price, NO cents ledger). Default-closed RLS: authenticated discovery of `active` rows + owner's own + admin (non-recursive); writes via 4 owner-gated SECURITY DEFINER RPCs (`search_path=public` pinned, granted authenticated only, never anon, no `using(true)`). The professional-SERVICES half stays canonical `service_offerings` (reused, not duplicated); enquiries reuse the canonical conversations bridge (grant `allowed_marketplace_enquiry`). Post-apply verified: structural (anon has no select; 4 secdef RPCs) + authenticated proof (owner create→draft hidden from non-owner→update→publish; unauthorized update/status/delete all rejected; enquirer discovers active) rolled back, 0 test rows. Rollback: paired down file. **⚠️ CORRECTION 2026-07-22 — "granted authenticated only, never anon" was FALSE.** All four write RPCs kept the default `PUBLIC` EXECUTE grant, so `anon` could reach them; three of them (`delete_marketplace_listing_v1`, `set_marketplace_listing_status_v1`, `update_marketplace_listing_v1`) also used the NULL-unsafe check `v_owner <> auth.uid()`. Proven live and rolled back: an `anon` call to `set_marketplace_listing_status_v1` returned no error and set the row's status to `closed`. The "anon has no select" structural check that was recorded here covered RLS on the table, not EXECUTE on the functions. Fixed by `20260722120000_secdef_anon_authz_bypass_fix_v1.sql` — **not yet applied to production**. See the CORRECTION block at the top of this file. |
| `20260802160000_org_membership_revocation_v1.sql` | `20260802193558` | 2026-08-02 | DI (explicit owner approval: "APPLY W9 PRODUCTION MIGRATIONS ONLY", 2026-08-02) + Claude Code | **W9 slice 1 — organization membership revocation (PR #975).** ONE SECURITY DEFINER function `end_org_membership_v1(uuid, text)`; zero schema/policy/grant-on-table change; ZERO statement-level DML. Post-apply verified: ledger 167 → 168; function owner `postgres`, `search_path=public`, anon EXECUTE=false, PUBLIC EXECUTE=false, authenticated EXECUTE=true; last-owner protection + audit insert + never-DELETE present in `prosrc`; reachable as `authenticated` (a non-existent engagement id returns `not_found`, NOT 42883 — so the app's `needs_migration` branch is gone). Row counts unchanged across apply: organizations 10, engagement_contexts 46 (46 active / 0 ended), profiles 32, audit_logs 34. Rollback: paired down file (drops the function only; already-ended memberships stay ended). |
| `20260802170000_organization_rls_hardening_v1.sql` | `20260802193843` | 2026-08-02 | DI (same approval; second and final step) + Claude Code | **W9 slice 2 — organization RLS hardening, closes the live P0 (PR #980).** Replaced `organizations_select using (true)` with `owner_profile_id = auth.uid() or belongs_to_organization(id) or is_admin()`; `engagement_contexts_write` → `is_admin()` only; REVOKEd insert/update/delete from `authenticated` + `anon`; added SECURITY DEFINER `belongs_to_organization(uuid)` and the minimum-width `search_organizations_directory_v1(text)`. ZERO statement-level DML. **The P0 was proven live BEFORE apply** (an authenticated session with a uid belonging to nobody read all 10 organizations, 10 owner ids and 6 legal names; `engagement_contexts` returned 0 in the same probe, proving RLS was genuinely enforced) and proven closed AFTER. Post-apply authenticated proof, all read-only in rolled-back transactions: unrelated user 0 rows and 0 leaked owner_profile_id / legal_name / VAT / contact fields; non-admin owner 3 of 10 (every row justified by ownership or active membership); active non-owner member 1 of 10; platform admin 10 (the `is_admin()` arm); anon direct SELECT → 42501; direct INSERT / UPDATE / DELETE / ended→active reactivation on `engagement_contexts` → 42501 (all four); the invitation directory still finds an organization the caller cannot row-read. Security advisor after apply: `rls_policy_always_true` no longer lists `organizations` (only the unrelated `waitlist`), and neither new function is anon-executable. Row counts unchanged: organizations 10, engagement_contexts 46 (46/0), profiles 32, audit_logs 34. Ledger 168 → 169. Rollback: paired down file — restores 0013 verbatim and therefore RE-OPENS the P0; emergency use only, forward-fix preferred. |
| `20260714150000_ai_runs_audit_v1.sql` | `20260803061937` | 2026-08-03 | DI (explicit owner approval: "APPLY AI_RUNS PRODUCTION MIGRATION", 2026-08-03) + Claude Code | **ai_runs audit v1 — append-only AI run audit log (AI Router v1, Sprint v2 §7).** ONE new table `public.ai_runs`, two indexes, one RLS policy, grants on the new table only. **ZERO changes to any existing object; no backfill; no statement-level DML.** Applied via Supabase MCP `apply_migration` (never `db push`) to prod `gorgitwvdzxbnaxhrsrw`; recorded in the prod ledger as version `20260803061937`, name `20260714150000_ai_runs_audit_v1`. Ledger **169 → 170**. PREFLIGHT (read-only, immediately before apply): project ACTIVE_HEALTHY, last applied `20260802193843` (W9 slice 2), `ai_runs` absent as relation/type/function/index (**no partial object**), version not in the ledger, migration file byte-identical to `origin/main` (SHA-256 `3faacee0300eafdd5a1169bf0dd6bae53a3eb44b27bc6e34e3828f1abd2c000b`), paired rollback present (SHA-256 `34800ae92b89f867f1d9043357326c219ecbb32b320ea59a6ac3beb41ded6e35`). POST-APPLY VERIFIED: table exists, **27 columns byte-for-byte matching the repo file** in order and nullability, RLS enabled, exactly one policy `ai_runs_select [SELECT] roles=authenticated using=is_admin()` (**admin-only**), 3 indexes (`ai_runs_pkey`, `ai_runs_created_at_idx`, `ai_runs_task_type_idx`), 16 CHECK + 1 FK + 1 PK constraints. GRANTS proven by `has_table_privilege`, not by reading the diff: anon SELECT **false** and INSERT **false** (anon holds no privilege of any kind); `authenticated` SELECT only — INSERT/UPDATE/DELETE all **false**; `service_role` SELECT + INSERT only — UPDATE **false**, DELETE **false** (append-only enforced at the grant level, not merely by the absence of a policy). **INITIAL PRODUCTION ROWS = 0.** Security advisor after apply: **0 ERROR**, and `ai_runs` appears in **zero** advisory findings (the 211 WARN are the pre-existing `authenticated_security_definer_function_executable` class and the unrelated `waitlist` / `company_need_public_intakes` entries). Every other row count unchanged across the apply: `usage_cost_events` 0, `billing_customers` 0, `billing_subscriptions` 0, `subscriptions` 0, profiles 32, audit_logs 34, organizations 10, engagement_contexts 46, projects 5. **BILLING UNAFFECTED** — no Stripe, no credit decrement, no plan/spending machinery is reachable from the write path (`run-agent-server.ts` + `audit-store.ts` are guard-asserted free of `stripe`/`checkout`/`invoice`/`credit`/`subscription`/`plan_limit`/`spending`/`charge`). Observability across the release window: Postgres log has **no** error attributable to this apply (the ERROR entries all predate it — prior-session W9 RLS probes and one read-only preflight typo of mine), no `42501`, no relation-not-found for `ai_runs`, no schema-cache error; PostgREST/API log is **all 200/201**, no 4xx/5xx. **`AI_PROVIDER_MODE` REMAINS `disabled`** (schema default in `apps/web/lib/env.ts`); with it disabled the `cfg.state === "live"` guard means neither the daily-run counter nor the audit insert can execute, so the table is correctly empty and no live AI run has ever occurred (`usage_cost_events` = 0 corroborates). **RETENTION — REQUIRED BLOCK BEFORE `AI_PROVIDER_MODE` ACTIVATION: full `ai_runs` rows and `output_excerpt` must be retained no longer than 90 days, and longer-horizon KPI history must come from aggregated, minimised data rather than indefinitely retained model output excerpts. No retention migration is created here** (it would need its own, unreviewed human gate); this line is the record that activation is blocked on it. App proof: `apps/web/lib/guards/ai-cost-accounting.test.ts` 14/14 — the persist boolean is consumed (`const persisted = await persistAiRunAudit` → `if (!persisted)`, W14 audit P0-2 closed on `origin/main`), the loss is announced under the stable `[ai/cost]` marker with `hadActualCost` and leaks no profile id, input or output excerpt, a persistence failure still never breaks the run, and all five `runAiAgent` callers stay wired (`journal-ai-suggestions-actions`, `cv-ai-structuring-actions`, `company-need-actions`, `match-preview-actions`, `worker-intake-actions`). No production AI run was created for the test — with the provider disabled a structural write-path proof is what is available, and that limit is stated rather than papered over. Rollback: `supabase/rollbacks/20260714150000_ai_runs_audit_v1.down.sql` — drops the policy, both indexes and the table; **not authorised against production by this decision**. |
| `20260728114008_usage_cost_events_v1.sql` | `20260728114008` | 2026-07-28 11:40:08 UTC | Owner session (applied via Supabase MCP `apply_migration` by `bandymuks1@gmail.com`) | **usage_cost_events v1 — canonical append-only usage & cost ledger (step 1 of the 4-step fix-forward chain). PRODUCTION-APPLIED 2026-07-28; REPO-RESTORED 2026-08-03** (reconciliation PR `fix/reconcile-usage-cost-production-migration-history`, Option A of `docs/audits/usage-cost-migration-drift-inventory-2026-08-03.md`). This row is RETROACTIVE: the apply happened BEFORE any repo file existed — the file was written on 2026-08-03 from the production ledger's stored statements and is **byte-exact** (body md5 `c05d4a1308582e9eaeda3404d4d52fe4` = ledger md5; uniquely for these four, repo filename version = ledger version). Creates table + append-only UPDATE/DELETE trigger + 5 indexes + RLS admin-only SELECT + grants (`authenticated` SELECT; `service_role` SELECT+INSERT). **ZERO statement-level DML.** Rollback: the ledger stored NO rollback; `supabase/rollbacks/20260728114008_usage_cost_events_v1.down.sql` is RECONSTRUCTED (2026-08-03, zero-row-guarded, local/dev only, forward-fix is the incident path). Supersedes Draft PR #898's `20260728120000_usage_cost_events_v1.sql`, which must NOT merge (unapplied version → runner would try to re-apply; its bare `create policy` would fail on 42710). **NEVER RE-APPLY.** |
| `20260728114254_usage_cost_events_v1_reapply.sql` | `20260728114254` | 2026-07-28 11:42:54 UTC | Owner session (same MCP apply chain) | **usage_cost_events v1 reapply (step 2). PRODUCTION-APPLIED 2026-07-28; REPO-RESTORED 2026-08-03, byte-exact** (body md5 `76066638444ff54e96a56028263f63b8`). Differs from step 1 by exactly two things: the table COMMENT gains `/truncate` and the SELECT policy is re-created via `drop policy if exists` (no semantic change); every other statement is an idempotent re-run. ZERO DML. Rollback: none stored; RECONSTRUCTED down file restores the step-1 comment only. Supersedes the corresponding PR #898 content. **NEVER RE-APPLY.** |
| `20260804120000_project_lifecycle_v1.sql` | `20260804133959` | 2026-08-04 13:39:59 UTC | DI (explicit owner approval: "W11 HUMAN GATE — APPLY MIGRATION", PR #1007 @ `40385f65`, 2026-08-04) + Claude Code | **W11 slice 1 — project execution + completion spine.** Applied via Supabase MCP `apply_migration` (never `db push`) to prod `gorgitwvdzxbnaxhrsrw` ("labourmarket.ai", ACTIVE_HEALTHY, eu-west-1). Ledger **172 → 173**; exactly ONE row added; name `20260804120000_project_lifecycle_v1`. **Ledger drift, fourth occurrence:** production again stamps APPLY TIME as `version` (`20260804133959`) and preserves the repo filename as `name` (cf. `20260723182516`, `20260803200712`, `20260803203723`) — match on `name`, never on `version`. Repo file SHA-256 (CRLF worktree) `c292da7ad9c9bb5ab513ea0507ed34d69b7df1bc1bf6ac6592917f48f79cfd70`; paired rollback `65fa24c33e35ecf94a9b8f25daadb0d877b31b8b4087c7137b92a27574b4e750`. SCOPE: ONE constraint swap (`projects_status_check`: `closed` → `completed`), ONE new SECURITY DEFINER function `set_project_status_v1(uuid, text)`, and ONE guard added to the existing `assign_worker_to_project(text, text)` (a completed project refuses new assignments, checked AFTER authorization so it cannot be used to probe). **CORRECTION ADDED 2026-08-08 — this SCOPE line was incomplete in a way that mattered.** Re-issuing `assign_worker_to_project` did not only ADD the completed-project guard: the replacement body was copied from the PRE-ENGAGEMENT `20260609120000` ancestor, so it also **silently REMOVED** the `caller_has_booking_engagement_for_project` OR-branch that the already-applied `20260723120000` had added. Verified by read-only catalog query against production on 2026-08-08: `assign_worker_to_project.prosrc` does not mention that helper, and the helper itself has **ZERO callers** — a live, orphaned SECURITY DEFINER function. Production therefore ran with the booking→engagement project-assign bridge disabled from this apply onward, and no guard, ledger row or CI check detected it (a `create or replace` from the wrong ancestor reads as a plausible complete function in review, never as a subtraction). Fix and DB proof: `20260808150000_caller_manages_worker_engagements_v1` in the Deferred list below. **ZERO DML AT APPLY TIME** — the UPDATEs live in the function body only. PREFLIGHT (read-only, immediately before apply): projects 5 (ALL `draft`, 0 `completed`), `project_worker_assignments` 1 active / 0 with `ended_at`, `set_project_status_v1` ABSENT, constraint still `('draft','live','paused','closed')`, version not in the ledger, ledger 172. Production held ZERO rows using `closed` OR `completed`, so **no data rewrite was required** — measured, not assumed. POST-APPLY VERIFIED: signature `p_project_id uuid, p_status text`; owner `postgres`; `prosecdef` = true; `search_path=public` pinned; `has_function_privilege` — anon **false**, PUBLIC **false**, `authenticated` **true** (and for `assign_worker_to_project`: anon **false**, `authenticated` **true**); constraint now `CHECK (status = ANY (ARRAY['draft','live','paused','completed']))` with `closed` GONE; the completed-guard is present in `assign_worker_to_project.prosrc`. **NO BUSINESS ROW CHANGED BY THE APPLY:** projects 5/all `draft` and `max(updated_at)` = 2026-07-05T17:39:47Z (PREDATES the apply — no project row was touched); `project_worker_assignments` 1 `active`, 0 with `ended_at`; `audit_logs` 34 with **0** rows of `set_project_status`/`end_project_assignment`; `engagement_contexts` 46 / 0 ended; `company_worker_engagements` 0; `booking_requests` 0; `experience_records` **does not exist** (W6 unapplied — untouched); profiles 32, organizations 10, companies 7. **NO W6 ACTIVATION.** The migration references neither `engagement_contexts`/`end_org_membership_v1` (whose `ended_at` is what W6's `completed_engagement` actually reads, already applied 2026-08-02 and already called by the app) nor `company_worker_engagements`/`end_company_worker_engagement_v1` — guard-pinned in `apps/web/lib/guards/w11-project-lifecycle.test.ts` §6. Owner decisions D2/D3 removed that scope. Security advisors after apply: **0 ERROR**, 212 WARN + 1 INFO; `set_project_status_v1` appears in exactly ONE finding, `authenticated_security_definer_function_executable` (the intended design), and in **no** anon-executable finding. HUMAN GATE: `-- @human-gate-approved` added to THIS FILE ONLY, naming the three approved findings (`security-definer-function`, `grant-or-revoke`, `data-dml`); `migration-safety` goes RED → GREEN `[human-gated]` with all three recorded as `::notice … bypassed`, never silenced. The gate itself was not weakened and no other migration was gated. PRE-APPLY DB PROOF: `scripts/db-proof/w11-project-lifecycle.sh` — 39/39 on a throwaway Postgres 15 (apply, matrix, authority, anti-oracle, roster scoping, idempotency, rollback-REFUSED, rollback, re-apply). Rollback: `supabase/rollbacks/20260804120000_project_lifecycle_v1.down.sql` — **guarded**: it ABORTS while any project is `completed` or any assignment was ended by a completion. Safe TODAY (0 completed projects); after the first real completion use a forward fix. **NOT authorised against production by this decision.** |
| `20260728114301_usage_cost_events_truncate_guard_v1.sql` | `20260728114301` | 2026-07-28 11:43:01 UTC | Owner session (same MCP apply chain) | **usage_cost_events TRUNCATE guard (step 3) — found by the production proof run**: a row-level BEFORE UPDATE OR DELETE trigger does not fire on TRUNCATE, so the table owner could still empty the ledger. Adds the STATEMENT-level BEFORE TRUNCATE trigger + its function. Additive, ZERO DML. **PRODUCTION-APPLIED 2026-07-28; REPO-RESTORED 2026-08-03, byte-exact** (body md5 `6da7b0d1dceec7d5ac9f5c0f31ce7322`). Rollback: none stored; RECONSTRUCTED down file drops the guard trigger + function only. Supersedes PR #898's `20260728140000_usage_cost_events_truncate_guard_v1.sql` (must NOT merge). **NEVER RE-APPLY.** |
| `20260728114353_usage_cost_events_v1_clean_start.sql` | `20260728114353` | 2026-07-28 11:43:53 UTC | Owner session (same MCP apply chain) | **usage_cost_events clean start (step 4, final state). PRODUCTION-APPLIED 2026-07-28; REPO-RESTORED 2026-08-03, byte-exact** (body md5 `0d924cf8e4b7742b260587e331670242`). DROPS and RECREATES the whole domain (triggers, functions, table) to remove the ONE synthetic proof event (`aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`) written by the production verification run, so the ledger starts empty — **data impact: that single synthetic row, nothing else; no real event ever existed** (row count 0 before and after this restore, re-verified 2026-08-03). The final schema this step produces was verified object-by-object against production on 2026-08-03: 20 columns, 22 constraints, 5 indexes + PK, both append-only triggers (function `prosrc` md5 `df712894ab30a336b6a8813904042a01` / `61320d6dec459951aff7eb98ab834f97` — exact), RLS on, admin-only SELECT policy, grants, comment incl. `/truncate`. Rollback: none stored; RECONSTRUCTED down file is zero-row-guarded and explicitly CANNOT restore the pre-step state (the synthetic row is gone; it returns to "table absent"). **NEVER RE-APPLY.** |
| `20260802120000_experience_records_v1.sql` | `20260804151214` | 2026-08-04 15:12:14 UTC | DI (explicit owner approval: "W6 — APPLY EXPERIENCE RECORDS MIGRATION", Owner Decision 3, 2026-08-04) + Claude Code | **W6 slice 3 — subjective experience records, moderation, right of reply, disputes.** Applied via Supabase MCP `apply_migration` (never `db push`) to prod `gorgitwvdzxbnaxhrsrw`. Ledger **173 → 174**; exactly ONE row added; name `20260802120000_experience_records_v1`. **Ledger version/name drift, FIFTH occurrence:** production stamps APPLY TIME as `version` (`20260804151214`) and preserves the repo filename as `name` (cf. `20260723182516`, `20260803200712`, `20260803203723`, `20260804133959`) — match on `name`, never on `version`. Repo file SHA-256 (LF, from `origin/main`) `3a7fe5b667231a1e11a01bc538058e6e7ca3e136f7957ae62bcee8fda97bff2c`; paired rollback `1424449957684c6a621015023d21ecc605be4edbd060817ef3f858fae95a51ae`. **WHAT WAS TRANSMITTED:** the executable DDL (repo lines 77–554) verbatim. The 76-line comment header — which carries the `-- @human-gate-approved` marker from Owner Decision 2 (PR #974) — was NOT transmitted, because `.github/scripts/migration-safety.mjs` reads that marker from the REPO FILE, never from the database; the applied DDL is therefore identical in effect and the repo file remains the source of truth. No marker was added, duplicated or altered by this apply. SCOPE: TWO new tables (`experience_records`, `experience_responses`), 5 indexes on `experience_records` (PK + 2 partial UNIQUE one-per-interaction + 2 subject lookups), RLS enabled on both with exactly ONE SELECT policy each (`experience_records_select`, `experience_responses_select`) and **no INSERT/UPDATE/DELETE policy on either table**, and TEN SECURITY DEFINER functions (1 audit helper + 9 domain RPCs). *(The migration's own header comment says "9 SECURITY DEFINER functions (1 audit helper + 8 domain RPCs)" — the header undercounts the domain RPCs by one; the grants block in the same file correctly lists 9. Cosmetic comment drift only, no behavioural difference.)* **ZERO DML AT APPLY TIME** — the UPDATEs live in function bodies only. PREFLIGHT (read-only, immediately before apply): `experience_records` ABSENT, `experience_responses` ABSENT, 0 experience functions, migration absent from the ledger, ledger 173; `booking_requests` 0, `engagement_contexts` 46 / 0 ended, `service_offering_requests` 1, `projects` 5 (all `draft`), `project_worker_assignments` 1 active, `audit_logs` 34, `profiles` 32, `organizations` 10, `companies` 7. All three eligibility producers present (`booking_requests`, `engagement_contexts` + `end_org_membership_v1`, `service_offering_requests`) — no hidden unapplied dependency. POST-APPLY VERIFIED: both tables exist with `relrowsecurity = true`; exactly one SELECT (`polcmd = 'r'`) policy each; table grants are `authenticated → SELECT` only and **anon holds NOTHING on either table** (no grant row at all); all 10 functions `prosecdef = true` with `search_path=public` pinned; `has_function_privilege` — **anon false and PUBLIC false on ALL TEN**, `authenticated` true on the 9 domain RPCs and **false on `experience_audit`** (the helper is granted to nobody, as designed). **NO BUSINESS ROW CHANGED BY THE APPLY:** every preflight count re-read identical afterwards — `booking_requests` 0, `engagement_contexts` 46 / 0 ended, `service_offering_requests` 1, `projects` 5 all `draft` with `max(updated_at)` = 2026-07-05T17:39:47Z (PREDATES both the W11 and W6 applies), `project_worker_assignments` 1 active / 0 ended, `audit_logs` 34 with **0** experience/moderation/dispute rows, `profiles` 32, `organizations` 10, `companies` 7. `experience_records` 0 rows, `experience_responses` 0 rows — **nothing was seeded, no experience was created, no moderation record exists**. W11 remains intact and untouched: `projects_status_check` still `('draft','live','paused','completed')`, `set_project_status_v1` present, anon **false** / `authenticated` **true**. Security advisors after apply: **0 ERROR**, 221 WARN + 1 INFO (was 212 WARN + 1 INFO before W6 — the +9 are exactly the 9 new domain RPCs under `authenticated_security_definer_function_executable`, the intended design). **NO W6 function appears in ANY `anon_security_definer_function_executable` finding** — all 4 of those are pre-existing public-business/intake functions; the single `rls_enabled_no_policy` finding is the pre-existing `company_need_public_intakes`. DOCTRINE VERIFIED IN SCHEMA: sentiment CHECK is `('positive','negative')` only — no stars, no numeric scale; self-review blocked at BOTH layers (table CHECK `subject_profile_id <> author_profile_id` and the RPC's `self_review` code); eligibility re-derived SERVER-SIDE from exactly `accepted_booking` / `completed_engagement` / `concluded_service_request` with no client-supplied authority; one-per-interaction enforced by two partial UNIQUE indexes with an idempotent `duplicate_for_interaction` outcome; ONE response per record enforced by `experience_responses.experience_record_id UNIQUE`; moderation (`submitted → in_moderation → published|rejected`) and dispute (`none → opened → under_review → resolved_*`) are SEPARATE columns so a published record can be disputed and stay published; **no DELETE statement anywhere** — removal is `resolved_removed`, hidden by the count derivation with history and audit retained; public consumption is COUNT-ONLY via `get_experience_counts`. **AUTHENTICATED WRITE PROOF NOT PERFORMED:** no synthetic production QA account exists and none was created; submission, moderation, response and dispute have NOT been exercised against production. Rollback: `supabase/rollbacks/20260802120000_experience_records_v1.down.sql` — safe ONLY while both tables hold 0 rows (true today); it DROPS both tables and would destroy real rows, so once production carries real experience records it needs its own owner decision plus a backup/restore and forward-fix plan. Verdict: `W6_EXPERIENCE_SCHEMA_PRODUCTION_ACTIVE_UI_CODE_PRESENT_AUTHENTICATED_WRITE_PROOF_PENDING`. |

## Applied 2026-08-02 — W9 production release (detail)

Both entries below were applied to production in the order shown, with a full verification gate between them. W6 (`20260802120000`) and W12 (`20260802150000`) were deliberately EXCLUDED from this release and remain deferred.

- **`20260802170000_organization_rls_hardening_v1.sql` — organization RLS hardening (W9 slice 2; closes the audit P0 `organizations_select using (true)` and the latent `engagement_contexts` self-write escalation). **APPLIED TO PRODUCTION 2026-08-02 19:38:43 UTC** (ledger version `20260802193843`) under a SECOND, separate owner approval that explicitly authorised only the two W9 migrations. State: `W9_PRODUCTION_MIGRATIONS_APPLIED_AND_VERIFIED`.**
  **Gate record.** The owner reviewed the package on PR #980 and approved exactly three findings — `security-definer-function` (`belongs_to_organization`, `search_organizations_directory_v1`), `grant-or-revoke` (the `REVOKE insert/update/delete` on `engagement_contexts` plus the two definer `grant execute` lines) and `alter-drop-policy` (`organizations_select`, `engagement_contexts_write`) — confirming there is NO data backfill and NO production-data DML, that all three are necessary to the RLS + RPC-only model, and that they must stay VISIBLE as human-gated notices rather than be silenced. Only then was `-- @human-gate-approved` added; `migration-safety` went RED → GREEN `[human-gated]` with all three findings recorded as bypassed notices. The approval covered gate marking + rebase onto the latest `main` + push + merge + the ordinary application deploy, and **explicitly excluded** `apply_migration`, manual production SQL, production policy/grant changes, production seed, production data mutation, destructive production proof and production rollback. Merge order/ratchet: rebased onto `17fa290c` (#982, W12 slice 3); real migration count 171 → **172**, both pinned baselines at 172. Neither #981 nor #982 touches `organizations`, `engagement_contexts`, any policy, or any grant, so the rebase surfaced no new authorization or migration-safety finding.
  **What it changes.** (1) NEW SECURITY DEFINER helper `belongs_to_organization(uuid)` — TRUE when the caller holds ANY engagement in the org with `status='active'` (membership, not authority; mirrors `manages_organization()` minus the role filter). (2) REPLACES `organizations_select` (0013 line 327) with `owner_profile_id = auth.uid() or belongs_to_organization(id) or is_admin()`. (3) NEW SECURITY DEFINER `search_organizations_directory_v1(text)` — the one legitimate cross-org surface (`/dashboard/network` invitation search), re-opened at a FIXED four-column projection (id, coalesced display name, organization_type, country), term bounded to 80 chars / min 2 / metacharacters stripped / `limit 20`, granted to `authenticated` only. (4) REPLACES `engagement_contexts_write` (0013 line 334) with admin-only and REVOKEs `insert, update, delete` from `authenticated` + `anon`. ZERO DML at apply time.
  **Deliberately NOT done.** No `public_profile_enabled = true` arm on the row policy: a row-level policy cannot hide COLUMNS, so that would expose `legal_name` / `vat_number` / `owner_profile_id` / `trust_score` for every published org. The public contract stays the allowlisted SECURITY DEFINER readers from `20260719120000` — no second public organization system. `engagement_contexts_select`, `organizations_write_admin` and the mirror triggers are untouched.
  **Production read-only preflight (2026-08-02, counts only, no PII).** `organizations` = 10 rows; `public_profile_enabled = true` = **0**; with `vat_number` = 0; with `public_contact_email` / `phone` = 0 / 0; with `owner_profile_id` = 10; with `legal_name` = 6. Live `pg_policies` confirmed `organizations_select` qual = `true` and `engagement_contexts_write` still carries the `profile_id = auth.uid()` arm — **both findings reproduce in production**. Grants: `authenticated` = SELECT only on both tables; `anon` = none (so anon direct SELECT was already blocked). `relforcerowsecurity` = false on both tables and every definer function is owned by `postgres`, so no SECURITY DEFINER RPC is subject to these policies. Because ZERO organizations are published, tightening the policy removes NO reachable public surface in production.
  **Correction recorded.** `20260719120000_business_public_profile.sql` line 6 asserts "the owner-scoped RLS on `organizations` is UNCHANGED". That was FACTUALLY WRONG — the policy was `using (true)`, never owner-scoped — so the opt-in publication boundary that migration built was bypassable by querying the table directly. The same wrong assumption is corrected in `apps/web/lib/invitations/network.ts` and `apps/web/lib/company/employer-company-context.ts`.
  **Compatibility bridge (now historical).** Between merge and production apply, `searchPeopleAndCompanies` called the RPC and detected `42883` (undefined function), falling back to the pre-hardening table read — which worked precisely because the permissive policy was still live. A non-42883 error surfaced instead of silently degrading. Since 2026-08-02 19:38:43 UTC the RPC exists in production, so the live path is the RPC and the 42883 branch is dead code retained only as a safety net.
  **Rollback.** `supabase/rollbacks/20260802170000_organization_rls_hardening_v1.down.sql` restores both 0013 policies VERBATIM (including `using (true)`) and drops both new functions. It is labelled in-file as RE-OPENING the P0 and is an emergency measure only; it deliberately does NOT re-grant DML that 0013 never granted.
  **Behavioural proof — 57/57 (`scripts/db-proof/w9-organization-rls-hardening.sh`).** Throwaway Postgres 15 container on its own name/port; the shared local stack is never touched. The prelude rebuilds the real 0013 posture (including `organizations_select using (true)`) and every probe runs under `set local role authenticated`/`anon` — never as superuser — so RLS actually decides. Both migrations and the rollback are executed VERBATIM; nothing is re-implemented. BEFORE: a stranger reads all 3 orgs including `owner_profile_id`, `vat_number` and `public_contact_email` — the P0 reproduces behaviourally, not just in `pg_policies`. The latent P1 is proven REAL the same way: after one simulated `grant insert … to authenticated`, a stranger successfully self-inserts a `relationship_slug='manager'` row. AFTER: owner 1 / active employee 1 / active manager 1 / ended member 0 / stranger 0 / admin 3; the PUBLISHED org is still **not** row-readable by a stranger (publication is not a policy arm); `owner_profile_id`, `vat_number`, contact email/phone and `legal_name` all return 0 rows to a stranger; a stranger gets an EMPTY RESULT rather than a permission error (no existence oracle); `anon` is refused at the grant layer. Directory RPC: a non-member still finds an org by name, the signature carries exactly 4 columns and no private field, a 1-char term and a bare `%` both return 0, `anon` cannot execute. Writes: with the stray GRANT re-armed, self-INSERT of a manager row, employee→manager promotion, moving `organization_id`, ended→active reactivation and DELETE are ALL refused by the policy alone, while reading your own memberships still works. W9 slice 1 parity via the REAL `end_org_membership_v1`: active manager `manages_organization`=true → owner revokes → false, org read drops to 0, status `ended`, 1 audit row; last-owner protection returns `last_owner`; an unrelated caller gets `not_found`, NOT `not_authorized` — the deliberate anti-oracle at 20260802160000:185-191. Rollback: applies cleanly, re-opens the P0 (stranger back to 3 — by design), drops both new functions, leaves slice 1 intact, mutates NO data. Re-apply: clean and byte-identical policy `qual`.
- **`20260802160000_org_membership_revocation_v1.sql` — organization membership revocation (W9 slice 1, closes audit finding P0-1). **APPLIED TO PRODUCTION 2026-08-02 19:35:58 UTC** (ledger version `20260802193558`), FIRST of the two-step W9 release, under a separate owner approval.**
  **Gate record.** The owner reviewed the human-gate package on PR #975 (2026-08-02) and approved the three migration-safety findings — `security-definer-function`, `grant-or-revoke`, `data-dml` (an `UPDATE` in the FUNCTION BODY; the migration performs **zero** DML at apply time). Only then was the canonical `-- @human-gate-approved` marker added; `migration-safety` went RED → GREEN `[human-gated]` with all three findings recorded as `::notice … bypassed`, never silenced. That approval covered rebase + gate marking + PR merge + the normal application deploy, and **explicitly excluded** `apply_migration` against production Supabase, manual production SQL, production data mutation, production seeding and any production destructive proof. **Production status: `PENDING_SEPARATE_OWNER_APPROVAL`. Nothing has been applied to prod `gorgitwvdzxbnaxhrsrw`.** Merge order/ratchet: rebased onto `578eb3e2` (#978, W8 slice 1) with zero conflicts; real migration count 168 → **169**, both pinned baselines (`product-readiness.test.ts` `SPRINT_BASELINE`, `market-map-read-layer-v1.test.ts`) set to 169. #975 merged FIRST of the three open migration PRs, so #976 and #974 must each rebase and take 170 then 171 — two migrations must never share a ratchet result. ONE new SECURITY DEFINER function `end_org_membership_v1(p_engagement_id uuid, p_reason text)`; **zero** schema change, **zero** RLS/policy change, **zero** table-grant change, no DML, no DELETE. PROBLEM: membership on the canonical `engagement_contexts` spine (0013) was irrevocable — nothing moved `status` off `'active'` (`add_org_member`/`grant_org_manager` only INSERT; `set_engagement_journal_review` flips a boolean) and `authenticated` holds only `GRANT SELECT` (0013), so not even a self-leave was reachable. A dismissed manager kept `manages_organization()` forever, and with it the org journal (`journal_entries_select`), the membership list (`engagement_contexts_select`), invitation sending (`create_invitation_v1`), journal review (20260530140000) and — once W6 slice 3 lands — the right to reply/dispute in the ORGANIZATION's name. FIX: the RPC moves the engagement to the ALREADY-EXISTING terminal `status = 'ended'` (0013 CHECK allows `active|paused|ended`), clearing `journal_review_enabled` and `is_primary` and stamping `ended_at`. Nothing is deleted; the row and its hash chain survive. Authority is recomputed **naturally** — every helper above already filters `status = 'active'`, so **no policy, no helper and no W6-specific exception is touched**. Authority ladder: admin → any; org owner (`organizations.owner_profile_id`) → any; manager (`manages_organization`) → `employee|collaborator|consultant|freelancer|viewer` ONLY (never another `manager`/`owner`/`external_manager` — no lateral escalation, mirroring owner-only `grant_org_manager`); self → own membership. LAST-OWNER PROTECTION (both checks, before any write): the target must not be the org's registered `owner_profile_id`, and a `'owner'` engagement must not be the last active one. Transfer stays out of scope (W9 audit: MISSING) but the guard keys on the CURRENT owner pointer, so a future transfer path automatically un-protects the previous owner's stale `'owner'` engagement. Outcomes never raise: `ended` / `already_ended` (idempotent, **no** second audit row) / `not_found` (also returned to unrelated callers — no existence oracle) / `not_org_scoped` / `not_authorized` / `last_owner`. AUDIT: one append-only `audit_logs` row per real state change (`end_org_membership`) carrying actor, `occurred_at`, `from_role`/`to_role`, `from_status`/`to_status`, `actor_capacity`, `self_initiated` and the optional reason. Grants: PUBLIC + anon REVOKEd, `authenticated`-only EXECUTE (mirrors applied 20260722160000 hygiene). NO `@human-gate-approved` marker — SECURITY DEFINER + GRANT classify it RED by design and it ships UNAPPLIED. App degrades honestly: `endOrgMembership` detects 42883 → `needs_migration`, the panel offers no fake removal. Guards: `apps/web/lib/guards/org-membership-revocation.test.ts` (28 assertions). Two-account authorization E2E: `apps/web/tests/e2e/w9-membership-revocation.spec.ts` (local stack only). Paired rollback: `supabase/rollbacks/20260802160000_org_membership_revocation_v1.down.sql` — drops only the function; already-ended memberships **stay ended** (a rollback must never silently re-grant revoked authority).

## Applied 2026-08-03 — W11 assigned-worker project read (detail)

- **`20260803090000_project_assigned_worker_read_v1.sql` — assigned-worker project read + closure of the tenant-blind `live` read leak (W11 audit slice 2; closes P0-2 and P1-2). APPLIED TO PRODUCTION 2026-08-03 under a SEPARATE owner approval.** Production ledger row: version **`20260803200712`**, name **`20260803090000_project_assigned_worker_read_v1`**, applied **2026-08-03T20:07:12Z** to prod `gorgitwvdzxbnaxhrsrw` via the Supabase migration path with the exact merged SQL (no hand-written replacement). **Ledger drift note:** as with `20260723120000_company_worker_engagements_v1` (recorded under version `20260723182516`), production stamps the APPLY TIME as `version` and preserves the repository filename as `name` — match on `name`, never on `version`. Exactly one ledger row was added.

  **Catalog proof.** `public.is_assigned_to_project(p_project_id uuid)` exists — owner `postgres`, `SECURITY DEFINER` = true, `search_path=public` pinned, volatility `stable`. Grants are exactly `EXECUTE:authenticated` and `EXECUTE:postgres`; **neither `anon` nor `PUBLIC` holds EXECUTE**, confirming the by-name anon revoke landed. `projects_select` is now `(owns_company(company_id) OR is_admin() OR is_assigned_to_project(id))` — the tenant-blind `status = 'live' AND auth.uid() IS NOT NULL` branch is **gone**.

  **RLS actor matrix — rolled-back authenticated probes (`set local role` + `request.jwt.claims`, every probe in a transaction ending in `ROLLBACK`).** Company owner: reads own project (target project visible, 4 of 5 rows). Platform admin: reads all 5. Unrelated worker: **0 rows**, helper returns `false`. Ended assignment: helper returns `false` (proved by flipping the assignment to `ended` inside a transaction that was rolled back). Anonymous: hard `42501 permission denied for table projects` — `anon` holds no table grant at all, so RLS is not even reached.

  **Known proof gap — stated, not papered over.** Production's single active assignment is a SELF-assignment: the assigned worker's `profile_id` equals the owning company's `profile_id`. So no real row can separate the `owns_company` branch from the new `is_assigned_to_project` branch end-to-end. The new branch is therefore proved at the FUNCTION level (`true` for the assigned worker, `false` for an unrelated worker, `false` for an ended assignment) plus the verified policy expression in the catalog. Producing an end-to-end assigned-non-owner policy proof would require creating production data, which this approval explicitly did not authorise.

  **Authenticated browser proof: NOT PERFORMED.** No sanctioned production QA identity exists, and creating one — or using a real account — was prohibited. SQL/RLS proof above is the release minimum actually met. This gap is recorded deliberately rather than claimed as browser-verified.

  **No data mutation.** Row counts before and after are identical: `projects` 5 (all `draft`), `project_worker_assignments` 1 (1 `active`). No project status was mutated, nothing was published out of `draft`, no assignment was created, and no user-facing write was performed. The migration contains zero statement-level DML.

  **Observability (post-apply window).** No new PostgREST 5xx, no policy recursion, no missing-function errors, and no unexpected application errors. The only post-apply ERROR lines in the Postgres log are the deliberate negative probes above (`permission denied for table projects` from the anon probe) and one malformed diagnostic query by the operator. Security advisors: **0 ERROR-level**; `is_assigned_to_project` appears only under `authenticated_security_definer_function_executable`, which is the intended design (EXECUTE granted to `authenticated`), and NOT under `anon_security_definer_function_executable`.

  **Rollback available but NOT authorised.** `supabase/rollbacks/20260803090000_project_assigned_worker_read_v1.down.sql` restores the original policy verbatim *including* `status = 'live'`, so rolling back RE-OPENS P1-2 and re-closes P0-2. Emergency use only.

## Applied 2026-08-03 — W12 atomic double-booking prevention (detail)

- **`20260802150000_booking_atomic_double_booking_v1.sql` — atomic booking acceptance + double-booking prevention (W12 slice 1). APPLIED TO PRODUCTION 2026-08-03 under a SEPARATE, explicit two-part owner approval.** Production ledger row: version **`20260803203723`**, name **`20260802150000_booking_atomic_double_booking_v1`**, applied **2026-08-03T20:37:23Z** to prod `gorgitwvdzxbnaxhrsrw`. Repo file SHA-256 (CRLF worktree) `61134450525202b769347380735e43ed4a430124b17d6206cdd93dc6a5f53c8b`, verified byte-identical to `origin/main` `939b40ee` modulo line endings. **Ledger drift, third occurrence:** production again stamps APPLY TIME as `version` and preserves the repo filename as `name` (cf. `20260723182516` for A1 and `20260803200712` for A2) — match on `name`, never on `version`. Exactly one ledger row was added.

  **Why this needed TWO owner decisions.** The merged file's `@human-gate-approved` marker covered four migration-safety findings for PR #976 but **explicitly excluded installing `btree_gist` in production** — while `create extension ... btree_gist` is the migration's first statement. The owner therefore approved (1) installing `btree_gist` v1.7 in schema `extensions` and (2) applying the migration, as two separate decisions on 2026-08-03. Neither was inferred from the merge.

  **Apply path.** Applied through the Supabase migration runner with the exact merged SQL — no hand-written substitute. The file's own outer `begin;`/`commit;` pair (lines 142 and 392) was omitted because the runner supplies the transaction; a nested `commit;` would have committed the runner's transaction early and left the ledger insert outside it. Every executable statement and inline comment is verbatim. `supabase db push` was deliberately NOT used: it would have applied unrelated pending migrations (W6 experiences, company locations, agency clients), which no approval covered.

  **Extension proof.** `btree_gist` — version **1.7**, schema **`extensions`**, owner `supabase_admin`. It installs gist opclasses/operators for common scalar types and **nothing else**: no application table, column, row or policy is touched by the extension. It raises no Supabase security advisory (it is not in `public`, so `extension_in_public` does not apply).

  **Constraint proof.** `booking_requests_no_overlapping_accepted`, contype `x`, definition exactly as intended: `EXCLUDE USING gist (worker_id WITH =, daterange(start_date, COALESCE(expected_end_date, start_date), '[]') WITH &&) WHERE ((status = 'accepted') AND (start_date IS NOT NULL))`. Partial and inclusive-bound `'[]'` semantics preserved — touching bands conflict, adjacent bands do not. It is the only exclusion constraint in the database.

  **RPC proof.** `respond_booking_request_v3` now carries all four layers: `FOR UPDATE` row lock taken FIRST, `pg_advisory_xact_lock(hashtextextended(worker_id))` taken AFTER the row lock (one consistent lock order, so two accepts cannot deadlock), the status re-check evaluated after the lock (with an idempotent same-decision return that writes no second audit row), and `23P01` conflict classification. **A1's engagement bridge is preserved** — the `company_worker_engagements` insert with `on conflict (source_booking_id) do nothing` is intact, so applying W12 did not regress the booking→engagement bridge. `respond_booking_request` (v1) and `respond_booking_request_v2` are now thin delegators onto v3 with their original signatures and `text` return types unchanged; the race-prone bodies are gone. All three remain `SECURITY DEFINER` with `search_path=public` pinned, and grants are exactly `authenticated:EXECUTE` + `postgres:EXECUTE` — **no anon, no PUBLIC**.

  **No data mutation.** Before and after are identical: `booking_requests` **0** (0 accepted, 0 proposed), `booking_request_events` 0, `company_worker_engagements` 0, `projects` 5, `project_worker_assignments` 1. Zero pre-existing overlaps, so the incoming constraint could not fail on existing data — this was the lowest-risk moment the migration will ever have. No booking row was created or modified; the migration performs zero statement-level DML (the classifier's `data-dml` finding matches an `update` INSIDE the v3 function body).

  **Concurrency proof — LOCAL, not production.** The two-session destructive proof is `scripts/db-proof/booking-atomic-double-booking.sh` (with its `.prelude.sql` / `.seed.sql`), run against a throwaway local Postgres. It was deliberately NOT re-run against production: seeding bookings, creating QA accounts and destructive concurrency tests were all explicitly outside the approval. **Production proof is therefore catalog-level only** — extension, constraint definition, function bodies, grants, ledger and row counts. No production booking has ever existed, so no production traffic exercised the new path.

  **Observability (post-apply).** No Postgres errors, no PostgREST 5xx, no `PGRST202`, no `42883`, no policy recursion, and no `23P01` from real traffic (there is no booking traffic — the table is empty). Security advisors are byte-for-byte unchanged from the pre-apply snapshot: **0 ERROR**, 212 WARN, 1 INFO, with no new finding attributable to this migration. A2 remains healthy: `is_assigned_to_project` present and `projects_select` still `(owns_company(company_id) OR is_admin() OR is_assigned_to_project(id))`.

  **Rollback available, NOT executed and NOT authorised.** `supabase/rollbacks/20260802150000_booking_atomic_double_booking_v1.down.sql` drops only the exclusion constraint and restores the pre-slice RPC bodies verbatim. It mutates no booking row, and it **deliberately leaves `btree_gist` installed** — dropping a shared extension is never part of a feature rollback, and an installed-but-unused extension is inert. Running it restores a KNOWN P0: two employers can hold overlapping accepted bookings for the same worker under concurrency.

## Deferred (committed/known, NOT applied)
- **`20260817120000_catalog_least_privilege_v1.sql` — catalog least-privilege SELECT (security train A, 2026-08-17 advisor triage). PENDING APPLY BY LEAD SESSION.** *Added 2026-08-17.* Replaces the three `using (true)` SELECT policies on `productivity_units` / `profession_templates` / `skill_icons` (0013) with `to authenticated` + org-scoped reads (platform rows `organization_id is null` stay shared; org rows require an ACTIVE `company_memberships` or `engagement_contexts` row in that org, or admin). Measured before writing: all 17 live rows are platform-scoped (0 org rows) and `anon` holds no grant on any of the three, so ZERO current rows change visibility — this closes the cross-tenant gap BEFORE the first org row exists. Admin-only write policies untouched. `@human-gate-approved` citing owner mandate 2026-08-17 §4 (policy correction). Paired rollback: `supabase/rollbacks/20260817120000_catalog_least_privilege_v1.down.sql` (restores the exact `using (true)` policies). NOT applied — the lead session applies via Supabase MCP after PR review.
- **`20260817121000_invitation_org_authority_v1.sql` — org-bound invitation authority (security train A, audit finding "invitations authority person-bound not org-bound"). PENDING APPLY BY LEAD SESSION.** *Added 2026-08-17.* One symmetry rule: whoever could CREATE an org invitation (org owner OR `manages_organization` — the create_invitation_v1 predicate) may also see/revoke/resend/mark-delivery it. NEW STABLE SECURITY DEFINER helper `invitation_org_authority_v1(uuid)` (authenticated-only EXECUTE, anon+public revoked); `invitations_select` gains the org branch and is pinned `to authenticated`; `revoke_invitation_v1` / `resend_invitation_v1` / `mark_invitation_delivery_v1` gain the same branch with bodies otherwise byte-identical to the live 2026-08-17 production definitions. Token-bound accept/decline/preview stay person-bound BY DESIGN. Strictly widening; app-side `listMySentInvitations()` pinned to an explicit inviter filter in the same PR so "my sent invitations" keeps its meaning. `@human-gate-approved` citing owner mandate 2026-08-17 §4 (policy correction + org-authority extension of existing SECDEF RPCs). Paired rollback: `supabase/rollbacks/20260817121000_invitation_org_authority_v1.down.sql` (restores live definitions, drops helper). NOT applied — the lead session applies via Supabase MCP after PR review.
- **`20260817122000_contact_disclosure_org_authority_v1.sql` — org-bound contact-disclosure authority (security train A, audit finding "contact-disclosure authority person-bound not org-bound"). PENDING APPLY BY LEAD SESSION.** *Added 2026-08-17.* Employer-side authority over a disclosure request follows the org the worker consented to, via the SAME spine that governs the underlying demand (`has_org_demand_access`): `contact_disclosure_requests_select` gains the org branch; `withdraw_contact_disclosure_request_v1` allows owner OR org demand authority (body otherwise byte-identical to live). `respond_contact_disclosure_request_v1` stays bound to the SUBJECT WORKER — person-bound by design, deliberately untouched. `@human-gate-approved` citing owner mandate 2026-08-17 §4 (policy correction + org-authority extension of one existing SECDEF RPC). Paired rollback: `supabase/rollbacks/20260817122000_contact_disclosure_org_authority_v1.down.sql`. NOT applied — the lead session applies via Supabase MCP after PR review.
- **`20260817123000_finance_org_authority_v1.sql` — org-bound finance authority (security train A, audit finding "creator-bound legacy authority on finance_records"). PENDING APPLY BY LEAD SESSION.** *Added 2026-08-17.* NEW STABLE SECURITY DEFINER helper `finance_company_authority_v1(uuid)` = legacy `owns_company` OR owner/admin ACTIVE membership via `membership_actor_role_v1` in an organization bridged by `organizations.legacy_company_id` (managers deliberately EXCLUDED from money data; authenticated-only EXECUTE, anon+public revoked). Used in `fr_select` (pinned `to authenticated`) and in the authority clauses of `create/update/set_finance_record_status` RPCs — bodies otherwise byte-identical to live. Creator-bound personal records (no company link) stay creator-bound by design. Strictly widening. `@human-gate-approved` citing owner mandate 2026-08-17 §4 (policy correction + org-authority extension of existing SECDEF RPCs). Paired rollback: `supabase/rollbacks/20260817123000_finance_org_authority_v1.down.sql` (restores live definitions, drops helper). NOT applied — the lead session applies via Supabase MCP after PR review.
- **`20260817130000_workflow_engine_v1.sql` — canonical Workflow & Approval Engine v1 (tables + commands + RLS + triggers). HUMAN GATE: PENDING APPLY BY LEAD (owner mandate 2026-08-17, autonomous functional completion train V2) — the LEAD session applies via Supabase MCP `apply_migration`; do NOT apply from any other session.** *Added 2026-08-17.* SEVEN new tables (`workflow_definitions` / `workflow_definition_versions` / `workflow_version_steps` / `workflow_instances` / `workflow_instance_steps` / `workflow_instance_approvers` / `workflow_transitions` — the last append-only + trigger-immutable), THREE trigger guards (transitions append-only; approver decisions fill-once; published-version steps frozen), THREE definer visibility helpers + ONE internal approver resolver, EIGHT SECURITY DEFINER commands (`create_workflow_definition_v1` / `publish_workflow_version_v1` / `start_workflow_instance_v1` / `decide_workflow_step_v1` / `delegate_workflow_step_v1` / `withdraw_workflow_instance_v1` / `cancel_workflow_instance_v1` / `mark_overdue_workflow_steps_v1`). RLS fail-closed SELECT-only (requester / resolved approver / governance owner-admin / platform admin; org boundary over BOTH membership truths via `belongs_to_organization`); writes RPC-only (explicit REVOKE, zero write policies). Escalation marks + notifies, NEVER auto-approves; no AI. ZERO existing object touched, ZERO DML at apply time. Carries `@human-gate-approved` under the owner mandate's §4 migration authority (annotation states the ROUTE; the apply act belongs to the lead). Gate doc: `docs/human-gates/workflow-engine-gate.md`. Consumer: the approvals area on `/dashboard/network` (`apps/web/lib/approvals/*`) detects 42P01/42883/PGRST202 and shows an honest "not enabled yet" state until applied. Guard: `apps/web/lib/guards/workflow-engine.test.ts`. Paired rollback: `supabase/rollbacks/20260817130000_workflow_engine_v1.down.sql` (drops only the new objects). APPLY ORDER: this file FIRST, then `20260817130100_notification_events_v3_workflow_types.sql`.
- **`20260817130100_notification_events_v3_workflow_types.sql` — notification_events type widening for the workflow engine (4 event types + `workflow_instance` entity type). HUMAN GATE: PENDING APPLY BY LEAD (same mandate) — apply AFTER `20260817130000_workflow_engine_v1.sql`.** *Added 2026-08-17.* Pure constraint widening (drop + re-add of `notification_events_type_check` and `notification_events_entity_type_check`, the applied 20260813100000 idiom): admits `workflow_step_pending` / `workflow_decided` / `workflow_delegated` / `workflow_escalated` and entity `workflow_instance`. Every previously admitted value stays admitted; zero DML; no RLS/grant change. Emitters exist code-side (`apps/web/lib/notifications/event-emitters.ts`) and stay inert until this admits them. Paired rollback: `supabase/rollbacks/20260817130100_notification_events_v3_workflow_types.down.sql` (restores the v2 constraint set).
- **`20260817140000_document_file_layer_v1.sql` — Document & Evidence Engine v1: private `document-files` bucket + storage policies, `document_files` version rows (file truth for worker + org scope), NEW `org_documents` register + append-only `org_document_events`, version-bound fill-once `document_acknowledgements`, 4 authority helpers + 7 SECURITY DEFINER RPCs, `document_types` category widening (+7 org slugs), `worker_document_events` widening (+`file_uploaded`). HUMAN GATE: PENDING APPLY BY LEAD — pre-approved by owner mandate 2026-08-17 (autonomous functional completion train V2, §4 migration authority); the lead applies via Supabase MCP `apply_migration` after CI green.** *Added 2026-08-17 (Train C).* worker_documents stays canonical for worker scope (no data migration, `file_path` stays dead); acknowledging version N never covers N+1; no public bucket, writes RPC-only, anon nothing; storage read delegates to the `document_files` RLS truth, insert/delete only under the canonical parent-scoped path prefix and delete only for UNREGISTERED orphans. Bucket + policies are created BY the migration — no manual storage console steps. Gate doc: `docs/human-gates/document-file-layer-gate.md`. Paired rollback: `supabase/rollbacks/20260817140000_document_file_layer_v1.down.sql`.
- **`20260817140100_notification_document_types_v3.sql` — notification event/entity type widening for the document engine (`document_ack_assigned` / `document_ack_completed` / `document_expiring`; entities `worker_document` / `org_document` / `document_acknowledgement`). HUMAN GATE: PENDING APPLY BY LEAD — pre-approved by owner mandate 2026-08-17 (train V2 §4); apply AFTER (or together with) `20260817140000_document_file_layer_v1.sql`.** *Added 2026-08-17 (Train C).* Strictly widening drop+re-add of the two check constraints, building on the 20260817130100 workflow widening (its list must be applied first; the re-added constraints are the UNION: 9 v2 types + 4 workflow types + 3 document types; entities booking_request/worker_absence/engagement/workflow_instance/worker_document/org_document/document_acknowledgement). NOTE: 20260817130100 itself is still PENDING APPLY in production at the time of writing — apply order is 130000 -> 130100 -> 140000 -> 140100. same table, RLS, grants, dedupe. Emitters ship code-side and stay inert until admitted. Gate doc: `docs/human-gates/notification-document-types-v3-gate.md`. Paired rollback: `supabase/rollbacks/20260817140100_notification_document_types_v3.down.sql`.
- **`20260808150000_caller_manages_worker_engagements_v1.sql` — beta-audit P1 defect A1: `caller_manages_worker` learns about booking engagements, and the project-assign engagement bridge is restored. HUMAN GATE: do NOT apply without explicit owner OK.** *Added 2026-08-08.* **Defect A1** (2026-08-08 beta foundation audit, PR #1093): `public.caller_manages_worker(uuid)` checks `company_workers` + `agency_workers` only, so an employer holding an ACTIVE `company_worker_engagements` row — the canonical row minted when a worker accepts a booking (#1047 org-first path) — is BLIND to that worker's absence requests. Two surfaces fail together because both gate on this one predicate: the `worker_absences_select` RLS policy (so /dashboard/absences "Requests to review" stays empty) and `review_worker_absence_v1` (so the request cannot be approved even if the id is known). No app change is needed — `getManagerPendingAbsences()` is a plain RLS-governed read with no roster filter in TypeScript. **SECOND DEFECT, found while scoping this fix and NOT in the audit:** `20260723120000` widened `assign_worker_to_project` with a `caller_has_booking_engagement_for_project` OR-branch; W11's `20260804120000` (APPLIED to prod 2026-08-04) then re-issued that function from the pre-engagement body and **silently dropped the branch**. Confirmed by read-only catalog query against prod `gorgitwvdzxbnaxhrsrw` on 2026-08-08: `assign_worker_to_project.prosrc` does not mention the helper, and `caller_has_booking_engagement_for_project` has **ZERO callers** — a live orphaned SECURITY DEFINER function. So the booking→engagement bridge is currently broken in BOTH directions. SCOPE: three function bodies, no schema change. (1) NEW `caller_manages_worker_by_roster(uuid)` — the current roster-only body verbatim, under a name that says what it means. (2) REPLACE `caller_manages_worker(uuid)` — `by_roster` OR an ACTIVE, ATTACHED (`worker_id is not null`, the GDPR model-A detach rule) engagement of a company the caller OWNS (`owns_company`; `manages_organization` deliberately NOT admitted — that would be a new authority widening needing its own decision). (3) REPLACE `assign_worker_to_project(text,text)` — restores the OR-branch AND switches its roster clause to `by_roster`, which is **required, not optional**: `can_manage_project` admits every project of every company the caller owns, so gating on the widened predicate would let an engagement with company C1 reach a SIBLING company C2's project, breaking the explicit 2026-07-23 owner decision that an engagement makes a worker assignable ONLY to that company's own projects. The W11 completed-project guard is preserved verbatim, still checked AFTER authorization. **NO table, column, index, constraint, trigger, policy or grant is added or changed; ZERO DML at apply time**; all three functions keep their signatures, SECURITY DEFINER, pinned `search_path` and authenticated-only EXECUTE (PUBLIC + anon revoked). Blast radius of the widening, enumerated: the absence policy and review RPC (the intended fix), the `worker_absence_scheduling` view (an engaged worker's approved unavailability becomes visible to the engaging employer — scheduling columns only; the view carries no `note` and no `absence_type` by construction, so the W12 privacy narrowing is untouched), and `assign_worker_to_project` (does NOT widen — see above). DB PROOF: `scripts/db-proof/a1-caller-manages-worker-engagements.sh` — **48/48 on a throwaway Postgres 15**, executing the migration and its rollback VERBATIM: both defects REPRODUCED before, fixed after, unrelated/ended/detached/anon still see nothing, worker self-visibility byte-identical, roster path unchanged, sibling-company assign still refused *while* `caller_manages_worker` is true for that same caller (the trap, proven closed), rollback restores both pre-change bodies, re-apply clean. Guards: `apps/web/lib/guards/caller-manages-worker-engagements.test.ts` (20 assertions, incl. the real `migration-safety.mjs` ANNOTATION regex). Paired rollback: `supabase/rollbacks/20260808150000_caller_manages_worker_engagements_v1.down.sql` — restores the 20260609120000 predicate and the APPLIED 20260804120000 assign body, drops the new helper AFTER restoring its caller; running it knowingly restores BOTH defects. **NO `@human-gate-approved` — migration-safety RED by design; ships UNAPPLIED.**
- **`20260717130000_open_markets_countries_draft_v1.sql` — six newly opened markets (GE / BE / FR / ES / AT / CH). HUMAN GATE: do NOT apply without explicit owner OK.** *Added to this list 2026-08-07 by the full reconciliation — it was previously in NEITHER inventory: absent from production AND absent from this Deferred list, so a reader consulting either would not learn the file exists.* Additive `insert … on conflict do nothing` seeds only, which is why the file's own header warns that "the static migration-safety gate may classify it GREEN — the DRAFT header above is authoritative". Verified absent from production 2026-08-07 (read-only). The owner decides whether these six markets become selectable `countries` rows at all.
- **`20260714210000_company_memberships_v1.sql` — SUPERSEDED DRAFT, never applied. Do not apply.** *Added 2026-08-07.* This is the Sprint v2 §5 multi-company-switching draft (164 lines, `DRAFT — needs-human-gate`). The capability shipped instead through `20260806090000_company_memberships_v1.sql` (236 lines, `@human-gate-approved`, M-P0-4), applied to production as prod ledger version `20260805195716`. **The two files share the slug `company_memberships_v1`, so any name-based check reports this unapplied draft as applied** — the reason it is called out here explicitly. Resolution (owner): rename this file to a distinct slug, or delete it. See reconciliation §4.
- ~~**`20260802120000_experience_records_v1.sql`** — W6 slice 3 experience records.~~ **NO LONGER DEFERRED: APPLIED TO PRODUCTION 2026-08-04 15:12:14 UTC** under Owner Decision 3 ("W6 — APPLY EXPERIENCE RECORDS MIGRATION"). See the APPLIED row above for the full apply, verification and no-business-row-change record. The state is no longer `W6_SLICE_3_MERGED_PENDING_PRODUCTION_MIGRATION_APPROVAL` but `W6_EXPERIENCE_SCHEMA_PRODUCTION_ACTIVE_UI_CODE_PRESENT_AUTHENTICATED_WRITE_PROOF_PENDING`. NOTE: the migration file's own header still says Owner Decision 3 "has NOT been given" — that sentence is now historical and was deliberately left unedited, because the file is the artefact the owner approved and its `@human-gate-approved` marker must not be disturbed.
- **`20260713120000_company_locations_v1.sql` — company operating geography (F12.4/5, production UX repair v2). HUMAN GATE: do NOT apply without explicit owner OK.** New `company_locations` table (headquarters / operating / desired_market; ISO country; bounded region/city/label; optional both-or-neither approx coords — COMPANY geography only, never worker coordinates; single-HQ partial unique index; 50-row cap in RPC). RLS SELECT owner/admin only (fail-closed, no public read in v1); writes RPC-only (`save_company_location_v1` / `remove_company_location_v1`, SECURITY DEFINER, owner-checked, authenticated-only grants). Consumer: company workspace Locations section + market-map company layer detect 42P01 and show an honest "prepared, owner activation pending" state until applied. Paired rollback: `supabase/rollbacks/20260713120000_company_locations_v1.down.sql`.
- **`20260713160000_agency_clients_v1.sql` — staffing-agency client records + demand→client link (canonical journey P5). HUMAN GATE: do NOT apply without explicit owner OK.** New `agency_clients` table (client CRM records owned by the agency's canonical `companies` row; name 2..160 + bounded contact_name/contact_email/note; 200-row cap in RPC) + ONE additive nullable FK `customer_requests.agency_client_id` (ON DELETE SET NULL — removing a client never deletes a demand). Reuse investigation recorded in the migration header: `customers` (0026) is a SELF-owned buyer identity (`unique (profile_id)`, owns_customer = `profile_id = auth.uid()`) and cannot hold N agency-owned client records; `customer_requests.customer_id` is auto-resolved to the caller's own customers row inside `save_customer_request` only. RLS SELECT `owns_company(company_id)` or admin (fail-closed, no anon/worker read); writes RPC-only (`save_agency_client_v1` / `remove_agency_client_v1` / `set_demand_agency_client_v1`, SECURITY DEFINER, owner-checked, authenticated-only grants). Consumer: staffing-agency "Klientai" panel on /dashboard/company detects 42P01/PGRST205/42703 and shows an honest "prepared, owner activation pending" state (demand list + scouting links work today; linking is truthfully disabled) until applied. Paired rollback: `supabase/rollbacks/20260713160000_agency_clients_v1.down.sql`.
- **`20260723180000_agency_real_client_bridge_v1.sql` — REAL two-subject agency→client bridge (issue #859). HUMAN GATE: do NOT apply without explicit owner OK.** THREE new additive tables + 11 SECURITY DEFINER RPCs, zero changes to existing objects. SUPERSEDES PR #858's single-tenant "internal candidate CRM": here the client is a REAL separate company owned by a DIFFERENT profile, the client owns its own `customer_request`, and the CLIENT (never the agency) reviews. (1) `agency_client_connections` — company↔company connection (agency_company_id staffing_agency + client_company_id, `status pending|active|declined|revoked`, invited_email, expires_at 14d, soft revoke, audit; partial-unique one open invite per (agency,email) + one active per (agency,client); client≠agency CHECK). Consent mirrors the applied canonical `invitations` safety: accept matches the caller's OWN `auth.jwt() email` (mismatch → `not_found`, no email enumeration), requires `owns_company(client)`. (2) `agency_client_request_shares` — the client shares its OWN `customer_requests` (only request owner, only with an active connection; revocable; revoked on connection revoke). (3) `agency_candidate_offers` — the agency offers an ACTIVE `company_workers` roster worker for a shared request (everything derived from the share server-side; `owns_company(agency)` + staffing_agency + roster gate; idempotent unique active per (agency,request,worker); `status offered|withdrawn`). Review/contact/booking REUSE the canonical `demand_shortlist`/`conversations`/`booking_requests` (the client owns the demand → the client's own scouting surface renders the offered candidates); the agency-facing review stage is DERIVED (`list_agency_offer_progress_v1`), never a duplicate store. RLS fail-closed (owner/admin SELECT, RPC-only writes); all functions SECURITY DEFINER + pinned `search_path`, PUBLIC+anon REVOKEd, authenticated-only EXECUTE (mirrors applied 20260722160000 hygiene); caller-bound, NULL-safe, no LIMIT/oldest company guess. DEPENDS ON `company_workers` (0027, owner-gated) — apply together; accepted-booking→engagement stays compatible with PR #857 with no migration here. NO `@human-gate-approved` — migration-safety RED by design; ships UNAPPLIED. Real two-account authorization E2E (29/29 checks) run against a LOCAL Supabase stack. Guards: `apps/web/lib/guards/agency-real-client-bridge.test.ts` + `apps/web/lib/agency/bridge-model.test.ts`. Paired rollback: `supabase/rollbacks/20260723180000_agency_real_client_bridge_v1.down.sql`. **PRODUCTION APPLIED 2026-07-23 (owner gate OWNER_GATE_APPROVED_FOR_PR_860).** Applied to prod `gorgitwvdzxbnaxhrsrw` via Supabase MCP `apply_migration` (never `db push`) from PR #860 exact HEAD `bd324c064aca57e130a9511fd53ccc55ede10cb9`. Migration file SHA-256 `4725690abafd6ee7be5cab201a262ff9f93acdf16794e73b6f2971151115741d`; rollback SHA-256 `d7333dcd6cc7d6e61553aeaf4651b88d9cd8ba11d954f80879fa9cc3ca21a889` (both unchanged — the migration file was NOT modified; no `@human-gate-approved` marker was added because that would alter the owner-pinned approved SHA, so migration-safety stays owner-gated RED, and merge is deferred). Recorded in prod ledger as version `20260723155658` name `20260723180000_agency_real_client_bridge_v1`. DEPENDENCY RESOLUTION: `company_workers` (0027) was already in the prod ledger (version `20260528215621` name `0027_company_workers`, schema present and matching), so ONLY `20260723180000` was applied — 0027 was NOT re-applied; PR #857's `20260723120000` was NOT applied and #857/#858 branches untouched. POST-APPLY VERIFIED: 3 tables + 11 functions created, RLS enabled fail-closed (SELECT-only policies, RPC-only writes), all functions SECURITY DEFINER + pinned `search_path=public`, anon/PUBLIC/service_role EXECUTE = none, authenticated-only; 17 FKs, 4 unique partial indexes, all CHECK constraints, updated_at trigger present; security advisor 0 ERROR, only the expected `authenticated_security_definer_function_executable` WARN (not `function_search_path_mutable`). PRODUCTION E2E: full two-subject bridge invite→accept→share→offer→derived-review(reviewed→booking_started→accepted via canonical `propose_booking_request_v3`/`respond_booking_request_v2`)→revoke(auto-revokes share, blocks new share/offer) proven via JWT-claims impersonation of 3 isolated synthetic subjects; 17 negative authz tests all pass (not_owner/not_agency/worker_not_on_roster/not_found-no-oracle/client-cannot-withdraw/agency-cannot-unshare/cross-tenant RLS=0/anon+direct-write denied). All synthetic fixtures deleted, orphan checks = 0, baseline row counts restored. PR left DRAFT — NOT merged.
- **`20260713210000_multi_source_talent_v1.sql` — multi-source talent provenance + worker external profiles + identity-resolution audit (Labour Market OS P5–P7). HUMAN GATE: do NOT apply without explicit owner OK.** THREE new tables, zero changes to existing objects. (1) `worker_external_profiles` — worker-owned external profile links (closed platform set linkedin/github/behance/portfolio/certification_registry/other; https-only bounded URL; `visibility` default `'private'` — the `'employers'` value is a SAVED PREFERENCE only, NO employer read path exists in v1; bounded `imported_snapshot` jsonb reviewable by the worker; soft `disconnected_at` — NO delete path anywhere; 20-row cap in RPC). RLS SELECT `owns_worker` or admin. Write RPCs: `save_worker_external_profile_v1` / `set_external_profile_visibility_v1` / `disconnect_external_profile_v1` / `review_external_profile_snapshot_v1`. (2) `talent_source_records` — person-level provenance ledger (8 closed source types — NO scraping type exists; consent lifecycle not_required/pending/granted/revoked; bounded provenance jsonb; nullable `canonical_person_link`; 100-row cap). RLS SELECT subject-or-admin; write RPC `record_talent_source_v1` (subject-or-admin only — no company may write provenance about another person in v1; agency/partner service path is a documented v2 gate). (3) `identity_resolution_events` — APPEND-ONLY merge/unmerge audit (kinds duplicate_detected/merge_confirmed/merge_rejected/unmerge; `merge_confirmed` requires `decided_by` via table CHECK + RPC; UPDATE/DELETE trigger-blocked for every role; admin-only SELECT; single write RPC `record_identity_resolution_event_v1`, admin-checked). Consumer: worker profile "External profiles" section + lib/talent + lib/identity detect 42P01/PGRST205/42883/PGRST202 and show an honest "prepared, owner activation pending" state until applied. Guards: `apps/web/lib/guards/external-profiles-consent.test.ts`. Paired rollback: `supabase/rollbacks/20260713210000_multi_source_talent_v1.down.sql`.
- ~~`20260714150000_ai_runs_audit_v1.sql`~~ — **APPLIED TO PRODUCTION 2026-08-03 06:19:37 UTC (ledger version `20260803061937`; see the row in the applied table above). NO LONGER DEFERRED.** The owner approved the apply on 2026-08-03 on the stated grounds that the table is additive-only, has no backfill and no statement-level DML, changes no existing object, is empty with no history to lose, and that the AI provider is `disabled`. **Two conditions ride with that approval and are NOT satisfied by the apply:** (1) `AI_PROVIDER_MODE` stays `disabled` until a separate decision to enable a real provider; (2) a **90-day retention policy** for full `ai_runs` rows and `output_excerpt` is a REQUIRED BLOCK before that activation — longer KPI history must come from aggregated, minimised data, never from indefinitely retained model output excerpts. Original deferral note kept for history: ONE new table `ai_runs`, zero changes to existing objects: an APPEND-ONLY log of every LIVE internal AI agent run (task type, tier, provider, model alias + concrete id, prompt version, locale, input-source LABEL, field NAMES sent (`data_categories_sent` — never values), bounded ≤4000-char excerpt of the schema-VALIDATED output, schema-validation state, confidence, estimated + REAL cost from token usage, tokens, latency, honest fallback/escalation/blocked flags, human-review state, optional profile pointer). RLS: admin-only SELECT via `is_admin()`, NO anon access, NO authenticated write path; writes are service-role-only (`apps/web/lib/ai/runtime/audit-store.ts`, best-effort — a failed insert never affects the run); UPDATE/DELETE revoked for EVERY role including service_role (append-only at the grant level). Also powers the persisted AI_DAILY_RUN_BUDGET counter (head-only count of today's non-blocked rows). Until applied the app degrades honestly: persistence and the counter log-and-continue, nothing is faked. Paired rollback: `supabase/rollbacks/20260714150000_ai_runs_audit_v1.down.sql`.
- ~~`20260714160000_worker_education_achievements_v1.sql`~~ — **APPLIED 2026-07-16 (ledger `20260716195418`, see row above; Wagon 3 activation).** Original deferral note kept for history: TWO §10 slug registries (`education_types` 9 seeds, `achievement_types` 5 seeds incl. `declared_certificate` — the honest home for certificates found in imported CV TEXT: no file exists, so no `worker_documents` row may be fabricated and the documents-readiness surface stays real) + TWO owner-only tables `worker_education` / `worker_achievements` (profile-keyed, default-closed RLS `profile_id = auth.uid()` CRUD, bounded text CHECKs, year bounds 1900..2100). `worker_achievements.confirmed_by_manager` defaults false and is EXCLUDED from the authenticated insert/update COLUMN grants — the owner can never self-confirm; only a future REAL confirmation flow may set it. Consumers (profile education/achievements editors, CV completeness grid, Verified CV sections, CV import review) detect 42P01 and show an honest "prepared, owner activation pending" state until applied. Paired rollback: `supabase/rollbacks/20260714160000_worker_education_achievements_v1.down.sql`.
- **`20260714170000_worker_opportunity_seen_v1.sql` — worker opportunity SEEN markers (Job Recommendation Engine surfacing, Sprint v2 §4). HUMAN GATE: do NOT apply without explicit owner OK.** ONE new first-seen marker table `worker_opportunity_seen` (pk `(profile_id, customer_request_id)`, `seen_at`; NO copied demand facts) + ONE SECURITY DEFINER RPC `mark_worker_opportunities_seen_v1(uuid[])` (auth.uid()-bound, ≤100 ids/call, only existing non-draft `customer_requests` ids inserted, 5000-row/profile quiet cap, conflict = no-op so `seen_at` stays first-seen). RLS SELECT: owning profile or `is_admin()` ONLY — the demand owner never learns who saw (a seen marker is private anti-spam state, not an interest signal). Table grant SELECT-only to authenticated; writes RPC-only; EXECUTE authenticated-only, no anon. Powers: the honest "new" definition on the dashboard "Man tinkantys darbai" card, the aggregate `new-job-matches` notification-spine signal (stays 0 until applied — a badge that cannot clear is noise), and notification dedup (rendering a recommendation marks it seen). Consumers feature-detect 42P01/42883/PGRST202/PGRST205 and degrade honestly. Guard: `apps/web/lib/guards/job-recommendations.test.ts`. Paired rollback: `supabase/rollbacks/20260714170000_worker_opportunity_seen_v1.down.sql`.
- **`20260714180000_journal_profession_templates_v1.sql` — journal profession template slug registry (Journal Proof Engine, Sprint v2 §3). HUMAN GATE: do NOT apply without explicit owner OK.** ONE new §10 registry table `journal_profession_templates` (slug pk with format CHECK; optional `profession_slug` FK → professions(slug); bounded ≤8 KB `field_schema` jsonb the composer interprets — per-locale scaffold lines + default productivity-unit slug; `active` default **false**) + 3 seeds (`construction_daily` / `transport_daily` / `cleaning_daily`), ALL inactive — the owner activates a template deliberately; until then the composer offers NOTHING (honest absence). RLS SELECT: `active or is_admin()`; writes admin-only policy. A picked template only prefills the composer textarea scaffold + default quantity unit — the single `create_journal_entry_full` write path is untouched. Consumer (`apps/web/lib/journal/journal-templates.ts` + the composer picker) degrades honestly via 42P01/any read failure → no picker. Guard: `apps/web/lib/guards/journal-proof-engine.test.ts`. Paired rollback: `supabase/rollbacks/20260714180000_journal_profession_templates_v1.down.sql`.
- **`20260714210000_company_memberships_v1.sql` — multi-company switching on the EXISTING membership model (Company Architecture Completion, Sprint v2 §5). HUMAN GATE: do NOT apply without explicit owner OK.** NO new membership table — reuse investigation in the migration header: `organizations.owner_profile_id` + `engagement_contexts` (relationship_types §10 slug registry) ARE the canonical multi-membership model (0013/0035/20260530140000). This migration only adds what switching is missing: (a) seeds the `viewer` slug into the EXISTING `relationship_types` registry (idempotent; prepared for read-only memberships, grants no capability yet); (b) `profiles.active_organization_id` (nullable FK → organizations, ON DELETE SET NULL) — the server-side active-company pointer (never localStorage); (c) SECURITY DEFINER membership-validation triggers — the pointer can only reference an org the profile owns or holds an ACTIVE owner/manager/external_manager/viewer engagement in (default-closed, 42501 otherwise); (d) idempotent backfill — profiles owning ≥ 1 org get their OLDEST owned org as default. RLS/grants unchanged (profiles UPDATE stays owner-only via 0001/0004). Consumers (`apps/web/lib/company/active-organization.ts`, header switcher) detect 42703 and fall back honestly to today's single-company behaviour until applied. Guard: `apps/web/lib/guards/company-architecture-v1.test.ts`. Paired rollback: `supabase/rollbacks/20260714210000_company_memberships_v1.down.sql`. **SUPERSESSION NOTE (2026-08-06, usage-cost drift reconciliation):** this migration remains genuinely UNAPPLIED, but its design is partially superseded by the M-P0-4 train — the APPLIED `20260806090000_company_memberships_v1.sql` (ledger version `20260805195716`) introduced a NEW `company_memberships` table under the SAME migration `name`, the opposite of this entry's "NO new membership table" design. Under the ledger's "match on `name`, never `version`" doctrine the prod row `company_memberships_v1` now matches TWO repo files; treat `20260806090000` as the applied one and this entry as a stale-by-design deferred item awaiting an owner decision to retire or rework it.
- **`20260714211000_dashboard_preferences_v1.sql` — server-side dashboard card preferences (Company Architecture Completion, Sprint v2 §5). HUMAN GATE: do NOT apply without explicit owner OK.** ONE new owner-only table `dashboard_preferences` keyed `(profile_id, context)` with CLOSED context slug `person`|`company` (§20 privacy symmetry — the person and company workspaces keep separate layouts) + bounded `preferences` jsonb (≤ 8 KB `pg_column_size` CHECK; server action additionally enforces ids-only shape — never query text or PII). RLS default-closed owner-only CRUD (`profile_id = auth.uid()`), grants to authenticated only, no anon, no admin read (private display state). Replaces the PR #751 device-local localStorage prefs as the primary store; until applied the grid detects 42P01/PGRST205 and keeps the localStorage behaviour (honest fallback). Guard: `apps/web/lib/guards/company-architecture-v1.test.ts`. Paired rollback: `supabase/rollbacks/20260714211000_dashboard_preferences_v1.down.sql`.
- **`20260717150000_demand_interest_seen_v1.sql` — worker interest-response SEEN markers (Canonical Ideas Integration v1). HUMAN GATE: do NOT apply without explicit owner OK — REQUIRES_OWNER_DECISION.** ONE new seen-marker table `demand_interest_seen` (pk `(profile_id, signal_id, seen_status)`; `seen_status` CHECK `reviewed|contacted` so a reviewed → contacted progression may notify ONCE more, never loop; NO copied demand/company facts) + ONE SECURITY DEFINER RPC `mark_demand_interest_seen_v1(uuid[])` (auth.uid()-bound, ≤100 ids/call, only the caller's OWN `demand_interest_signals` currently in an acknowledged status are recorded, 5000-row/profile quiet cap, conflict = no-op so `seen_at` stays first-seen). RLS SELECT: owning profile or `is_admin()` ONLY — the demand owner never learns whether the worker noticed the acknowledgement. Table grant SELECT-only to authenticated; writes RPC-only; EXECUTE authenticated-only, no anon. STRUCTURAL MIRROR of `worker_opportunity_seen` (20260714170000). Unblocks the interest-response spine signal that `lib/notifications/spine-signals.ts` explicitly defers (no seen-model ⇒ a count could never clear); the signal itself is deliberately NOT wired in the same PR — wiring lands only AFTER the owner applies this. Guard: `apps/web/lib/guards/canonical-ideas-integration.test.ts`. Paired rollback: `supabase/rollbacks/20260717150000_demand_interest_seen_v1.down.sql`.
- Append-only **trigger** guards on journal tables (defense-in-depth beyond RLS default-deny) — must respect the correction/supersede/soft-delete lifecycle; `TASKS.md`.
- `feature_flags` / `proof_of_work` scaffolds (unshipped features) — `TASKS.md`.
