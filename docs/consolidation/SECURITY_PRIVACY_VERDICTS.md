# Security / privacy verdicts - 2026-10-03 (origin/main df5caa089)

Read-only review. EVIDENCE LEVEL: repository only (migrations, ledger, `gh pr`). The Supabase MCP server failed to connect (CONNECT_TIMEOUT), so NO production read-back was performed; every "prod" statement below is quoted from PR bodies or `docs/APPLIED_LEDGER.md`, not re-measured.
Public repo: ids and policy names only, no personal identifiers.

## 1. EVID-6 - PR #2131 (experience_responses_select)

Verdict: **GO for owner approval of the SQL; NOT yet GO to apply** (human-gate sentence and prod read-back outstanding).

Verified against main:
- Root cause is real. `20260802120000_experience_records_v1.sql` L165-175: `moderation_status = 'published'` sits inside `exists(select 1 from experience_records r ...)`. Both `r` and `experience_responses` have `moderation_status`; the innermost scope wins, so it binds to the RECORD. The reply status is never tested.
- Only two migrations touch policies on `experience_responses`: the original and #2131. `20260806230000_experience_author_subject_v1` mentions the policy only in a comment. Nothing on main redefines it, so #2131's body preserves every earlier change (there are none).
- Fix: `ALTER POLICY ... USING` keeps name, command (SELECT) and roles (`{public}`) as live. Reply-author branch and `is_admin()` unchanged. Third branch is now `reply.moderation_status='published' AND exists(record authored by caller AND record published)`. Strictly narrowing, no new reader.
- Case matrix (reasoned from the SQL; the PR claims 95/0 on scratch PG16, not re-run here):
  - record author, reply published, record published: visible.
  - record author, reply submitted / in_moderation / rejected: denied (was visible).
  - record author, reply published, record not published: denied.
  - reply author: visible in every state. Admin: visible.
  - unrelated user, same or other org: denied (no org branch exists, so cross-org is closed by absence). Anon: no grant.
- NULL / fail-closed: `moderation_status` and `author_profile_id` are NOT NULL (CHECK-constrained); NULL `auth.uid()` makes every branch NULL, which RLS treats as not visible. Writes remain RPC-only (SELECT-only grant to authenticated, no write policy).
- Filename `20261002143000_..._v1.sql` follows the 14-digit convention. No collision on main (latest is `20261002141500`). Not in `APPLIED_LEDGER.md`, so NOT applied. Rollback exists and states plainly it reintroduces the defect (fix forward preferred).
- PR CI: `migration-safety` SUCCESS, `mobile` SUCCESS, `quality` / `e2e-smoke` / `Analyze` no conclusion yet, `Supabase Preview` CANCELLED. Draft + `needs-human-gate`, mergeable.
- Rebase hazard: it bumps count guards to 336, same as #2079 (also #2123/#2124/#2086). The second to merge needs a trivial guard rebase.
- Exposure now (per PR, owner read 2026-10-03): 1 'submitted' reply under a published record = 1 row exposed.
- Residual unchanged by this fix: a record later dispute-removed (`resolved_removed`) is not consulted; a published reply stays visible to the author.
- Stale #1641 ("EVID-6 and EVID-2", 20260908120000 + 20260908130000): DO NOT merge wholesale. Its EVID-6 file is drop-and-create (policy-absent window, can reset roles), predates ~1000 migrations, and is superseded by #2131. EVID-2 (`journal_confirmation_self_marker`) is a separate defect #2131 does not cover; re-triage separately (status not verified here).

Apply-ready SQL status: the single `alter policy` statement in `supabase/migrations/20261002143000_experience_responses_select_reply_status_v1.sql` (comment header may be stripped per ledger precedent) is apply-ready via MCP `apply_migration` after the owner's explicit approval sentence. The file is not on main (PR is draft). Never `db push`.

Proof still owed after apply (prod read-back):
1. `pg_policies` row: roles `{public}`, cmd r, qual has the outer-relation `moderation_status = 'published'` AND the record exists-subquery.
2. `schema_migrations` row, matched by name (version is apply-time drift).
3. Behavioural proof under a record-author JWT for the one 'submitted' row: 0 rows. No synthetic QA account exists; use a rolled-back transaction (`set local role authenticated` + `request.jwt.claim.sub`), do not create accounts.
4. Positive controls: record author still sees a published reply; reply author still sees own reply.
5. Row counts unchanged (experience_responses 1, experience_records 2).

## 2. PER-12 - GDPR export (PARTIAL, confirmed)

Code: `apps/web/lib/privacy/export-data.ts` (per-relation `select("*")`, RLS-scoped, `unavailable` list) and `apps/web/lib/privacy/personal-relations.ts` (EXPORTED_RELATIONS about 107, WITHHELD_RELATIONS, ACTOR_ONLY_RELATIONS, NON_PRODUCT_RELATIONS). Guard: `lib/guards/privacy-export-completeness.test.ts`.

Why PARTIAL: the guard finds person-keyed tables only through columns referencing `profiles` / `workers` / `auth.users` (or e-mail/phone). Child and event tables keyed only through a parent id are invisible to it by construction, while the bundle's `excluded` framing implies coverage. No open or recent PER-12 fix PR exists (searches: PER-12, export, GDPR export returned only merged #1650, #1885, #620, #645).

| Table | In registry today | Needed |
|---|---|---|
| journal_entry_metrics | NO | export via parent journal_entries (hours truth) |
| evidence_import_rows | NO | withhold-with-reason or export via organization_evidence_record_id (org-side data about the person) |
| market_intelligence_observations | NO | verify for a person column; else NON_PRODUCT / aggregate |
| organization_evidence_competency_signals | NO | export via evidence-record key |
| workflow_instance_steps | NO | export via workflow_instances (requester); redact other approvers |
| journal_entry_extractions (0 rows) | NO | export via parent entry |
| lmc_lots, lmc_lot_consumptions (0 rows) | NO | export via lmc_accounts |
| journal_entry_tasks (0 rows) | NON_PRODUCT list | reclassify, export via parent |
| booking_request_events, timesheet_events, work_task_events, worker_document_events, agreement_events, contact_disclosure_request_events, training_assignment_events | NON_PRODUCT list | audit trails of the person's own records: export via parent with actor redaction, or move to WITHHELD with a reason. "Non-product" is the wrong label |
| projects.responsible_profile_id (ALTER-added) | NO (`projects` on no list; guard reads CREATE TABLE only) | add `{table:"projects", key:"profile_id", column:"responsible_profile_id"}` and make the guard scan ALTER TABLE ADD COLUMN |

Other findings:
- Storage: the bundle says file contents are never included ("metadata only"). Avatar files, journal photo objects and document files are neither delivered nor named in a withheld entry. Undocumented, not wrong: add a named offered-on-request entry.
- `select *` leakage: `worker_absences` is exported by worker_id and carries `requested_by` and `reviewed_by` (`20260718150000_leave_absence.sql` L26-27); `reviewed_by` is the manager's profile id, a third-party identifier delivered to the worker. Same shape in any exported table with `*_by` columns. Mitigation: per-relation column allowlist, or replace non-subject ids with a role label.

## 3. Current verdicts (repo + ledger; prod not re-read)

| PR | Verdict | Evidence |
|---|---|---|
| #1430 company contact fields | **SUPERSEDED** | `20260924120000_companies_contact_minimization_v2` APPLIED 2026-09-24 (ledger `20260924083740`); ledger says v1 must never be applied. Close #1430. |
| #1815 ARCH-4 agency disclosure revocation | **CURRENTLY_VULNERABLE** (P1) | Only `20260903101000` defines `list_agency_offered_candidates_for_request_v2`, with no connection/share-status join; v1's gate (`20260901052300`) is absent from v2, and the app prefers v2 (`bridge-read.ts`). After revoke/unshare the severed client still reads accepted/declined offers (agency note + candidate worker_id). PR unmerged, unapplied. |
| #1436 invitation org binding | **PARTIALLY_SUPERSEDED** | PR superseded by merged port #1658; `20260902230000_accept_invitation_binds_org_membership_v1` is on main but not in the ledger, so not applied. Integrity gap (accepted worker has no engagement_context), not a leak. Still required as a functional fix; apply is an owner decision. Close the PR. |
| #1440 worker-board org attribution | **STILL_REQUIRED** | Latest definition (`20260906140000`) still `join companies c on c.profile_id = cr.profile_id`; fan-out/mis-attribution remains. `20260902233000...` not on main or in ledger. Attribution integrity, low confidentiality risk. |
| #1045 admin grant repair | **STILL_REQUIRED** (operational, P2) | No later migration grants service_role on profiles/profile_roles; founder scripts (`admin:promote`, `admin:grant-superadmin`) still depend on it. Narrow column grants; a broken path, not a vulnerability. |
| #1266 ai_runs retention | **STILL_REQUIRED** (P1 privacy) | `20260808130000` nulls only `output_excerpt`; `profile_id` and `request_context` persist forever, a per-person timestamped index of AI use. No ledger row for the retention migrations. `ai_runs` is also WITHHELD from export. |

Other open needs-human-gate PRs with a privacy angle:
- #2052 applicant_identity_v1: SECURITY DEFINER returns name + photo path to the demand owner only while the application is interested/reviewed/contacted. Scoped, reversible; consent copy added but NOT rendered. Owner must decide consent display before apply. New disclosure, not a vulnerability.
- #1646 EVID-7: subject right of reply on organization-written evidence (no actor can cause DISPUTED); RED RLS, review separately.
- #1421: retention functions + unused index drops + ESCO prune; privacy-positive, additive; index drop is the risk.
- #1816, #1475: not privacy-critical. #1806: never apply (ledger).

## 4. ORG-2 - hard actor-type gates

Classes: VALID_DOMAIN_RULE = encodes a real domain fact or only presentation; LEGACY_ROLE_LOCK = denies a capability to an organization holding the equivalent `organization_roles` role.

Already unified (owner decision 2026-09-28, `20260928180000_agency_capability_one_rule_v1`: `company_acts_as_agency` + TS `actsAsAgency` = type OR role workforce_provider / talent_provider / recruitment_partner), all VALID_DOMAIN_RULE:
- create_agency_client_connection_v1, submit_agency_candidate_offer_v1, the delegated-demand RPC (`20260928190000` L90), `agency-capability.ts`, `agency-capability-read.ts`, `starter-signals.ts` union, partners page via `readActsAsAgency`. Authorization still via `owns_company`.

Residual hard gates:
| Location | Gate | Class |
|---|---|---|
| `20260723180000_agency_real_client_bridge_v1.sql` L195, L428-429 | `company_type <> 'staffing_agency'` -> not_agency | LEGACY_ROLE_LOCK, but both RPC bodies replaced by 20260928180000; confirm no third function still carries it |
| `20260904060000_owns_company_governance_membership_v1.sql` L98 | same check in create_agency_client_connection_v1 | LEGACY, superseded by 20260928180000 |
| `20260611150000_s5_agency_demand_visibility.sql` L108-111 | caller must have a row in legacy `agencies` table, else not_agency | LEGACY_ROLE_LOCK (legacy table, ignores organization_roles) |
| `dashboard/company/page.tsx` L118, L148-149 | `isStaffingAgency` picks agency client list and hides connection invites for agencies | LEGACY_ROLE_LOCK (type-only) |
| `dashboard/company/needs/page.tsx` L86-122, L237 | type-only copy set, `partner` vs `hire_workers` intent, PublicDemandSection audience | copy = VALID (presentation); intent and audience = LEGACY_ROLE_LOCK |
| `dashboard/company/people/page.tsx` L106, L343, L357 | roster empty-state variant, add-people copy | VALID presentation unless L357 hides a capability (verify) |
| `dashboard/company/partners/page.tsx` L111-115 | agency branch uses capability rule (VALID); `alsoClient = type !== staffing_agency` | VALID / LEGACY respectively |
| `organization-switch.ts` L212, L235 | workspace kind from `organizationType==='agency'` or type | VALID (display routing) but diverges from `actsAsAgency` |
| `company-profile-shared.ts`, `company-setup-form`, `first-run-intent.ts` L104-116 | company_type enum; agency intent preselects type | VALID_DOMAIN_RULE |
| `company-ingest-capabilities.ts` L193, `company-ingest-model.ts` L26-38 | type -> workforce_provider class map | VALID_DOMAIN_RULE |
| `20260806180000_membership_authority_widening_v1.sql` L144 | allow-list of types | VALID (includes agency) |
| `admin/pilots.ts` L38 | pilot cohort type list | VALID |

No blind replace: `company_type` is also the discovery/industry axis (starters.ts: `staffing_agency` and `workforce_provider` counts differ in production). Move only capability checks to `actsAsAgency`; keep copy and onboarding presets on the type. This table is a grep-based inventory of `staffing_agency`, not a proof of completeness for other actor-type gates (e.g. `training_provider`).

## P0 / P1
- P0: EVID-6 (#2131), launch blocker, 1 row exposed; fix sound; needs owner approval, apply, read-back proof.
- P1: #1815 ARCH-4 disclosure survives agency revocation via v2 (CURRENTLY_VULNERABLE).
- P1: #1266 `ai_runs.profile_id` retained forever.
- P1: PER-12: 17 unclassified or mislabeled relations, `projects.responsible_profile_id`, third-party `*_by` ids in `select *`, storage objects unnamed.
- P2: #1440, #1436 (unapplied; port #1658 on main), #1045, #2052 consent display, ORG-2 residual `agencies`-table and type-only dashboard gates, EVID-2 untriaged.
