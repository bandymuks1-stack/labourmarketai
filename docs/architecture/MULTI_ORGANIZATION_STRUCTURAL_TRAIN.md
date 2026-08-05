# MULTI-ORGANIZATION STRUCTURAL TRAIN

Owner directive: 2026-08-05 ("LABOURMARKET.AI — OWNER DECISIONS AND
MULTI-ORGANIZATION STRUCTURAL TRAIN"). Started from main `5e2a5458`.

Product doctrine: a person may own, manage, join, work for and collaborate
with several organizations simultaneously. An active workspace is the
explicitly selected context for an action — never inferred from the first,
oldest or only company row.

Sequencing rule: sequential slices, isolated worktrees, Draft PRs, owner-gated
migrations. Not one giant PR.

| Slice | Scope | Target state | Status |
|---|---|---|---|
| M-P0-1 | Remove `companies_profile_id_key UNIQUE` one-person-one-company cap | `MULTI_ORG_COMPANY_OWNERSHIP_CAP_REMOVED_SCHEMA_ACTIVE` | **APPLIED to prod 2026-08-05** (ledger `20260805171825`, owner directive §3); accounting in `docs/APPLIED_LEDGER.md` |
| M-P0-2 | Real create-second-organization path (`save_company_setup` de-singleton) | `MULTI_ORG_CREATE_SECOND_ORGANIZATION_SCHEMA_ACTIVE_LOCAL_BROWSER_PROVEN` | **APPLIED to prod 2026-08-05** (ledger `20260805180836`, name `save_company_setup_v3_multi_org`; accounting in `docs/APPLIED_LEDGER.md`; zero company rows changed). Code complete + local browser-proven: `save_company_setup_v3(p_company_id, …)` (insert-only create / creator-guarded explicit edit), v1+v2 hardened with the `multiple_companies` fail-closed guard, setup page targets the ACTIVE WORKSPACE or `?new=1` with a fail-closed chooser. Local proof (evidence `docs/audits/evidence/multi-org-m-p0-2/`): one actor created A then B via the real UI — A was not renamed; editing A changed only A; switching the workspace to B made the page target B; editing B changed only B. **OWNER APPROVAL recorded 2026-08-05** ("OWNER DECISION — APPLY AND MERGE M-P0-2" §1): apply migration `20260805190000` exactly as reviewed at HEAD `15ff08a5`, merge PR #1021 after production verification, allow normal Vercel deploy. Named migration-safety findings covered by the gate: security-definer-function (v3 created, v1/v2 redefined), grant-or-revoke (EXECUTE to authenticated only, anon/public revoked), data-dml (statement text inside plpgsql bodies only — apply time mutates zero rows). The approval does NOT cover: a second real production company, production QA accounts, PR #1016, Stripe Live, charging money, contacting real people |
| M-P0-3 | Remove `getOwnCompany()` authority → active-workspace resolver | `ACTIVE_WORKSPACE_AUTHORITY_REPLACES_SINGLETON_COMPANY_LOOKUP` | **Write paths migrated** (this branch): all 5 authoritative call sites (invite, role assignment, engagement provisioning, journal review — `lib/company/actions.ts`; project creation — `lib/company/project-context-actions.ts`) now derive their company from `requireEmployerCompany()` (membership-validated active workspace), fail closed on personal/stale/no-org context, and map infra failures to `error` (never "no organization"). Behaviour + static pins in `lib/company/actions-workspace-authority.test.ts`. The company dashboard's two singleton render reads were ALSO workspace-scoped (they errored to null at 2 owned rows, blanking the dashboard for multi-org owners — the surfaces hosting the migrated writes must show the same workspace the writes target). **§13 browser proof: 7/7 PASSED** (`tests/e2e/m-p0-3-workspace-authority.spec.ts`, fixtures `supabase/dev-fixtures-mp03.sql`, evidence `docs/audits/evidence/multi-org-m-p0-3/`): invites bind A then B via the SAME form (service-role verified `company_worker_invitations.company_id`), roster workspace-scoped, projects bind A/B (`projects.company_id`), Personal + managed-not-owned + REVOKED workspaces fail closed, unrelated org never offered, keyboard chip access, 375px no-overflow, hydration gate (one pre-existing caret-color mismatch excluded and filed as its own defect). Remaining read/render `getOwnCompany` uses (dashboard layout, market-map) = follow-up scope |
| M-P0-4 | `company_memberships` v1 (governance ≠ employment) | `COMPANY_MEMBERSHIPS_V1_CODE_COMPLETE_PENDING_HUMAN_GATE` | **Schema package complete** (this branch): design doc `docs/architecture/COMPANY_MEMBERSHIPS_V1.md`, migration `20260806090000` (table + live-key uniqueness + last-owner-survival trigger + read-only RLS/grants + classified backfill: org owners and manager-class engagements in, `employee` engagements NEVER) + loud-fail rollback + 10-pin guard. Ships RED/UNAPPLIED — separate owner decision required; local in-transaction dry-run applied clean (7 backfilled, then rolled back). Membership-mutating RPCs and consumer migration are slice 2 |
| M-P0-5 | Durable active-workspace pointer (server-validated) | `DURABLE_ACTIVE_WORKSPACE_AUTHORITY_PROVEN` | Not started |
| M-P0-6 | Organization demand stamping v2 (supersedes #1016) | `ORGANIZATION_DEMAND_SPINE_V2_MULTI_ORG_CODE_COMPLETE_PENDING_HUMAN_GATE` | Not started |
| M-P0-7 | Billing subject model (`profile \| organization`) | `STRIPE_MULTI_SUBJECT_TEST_MODE_MODEL_CODE_COMPLETE_PENDING_OWNER_GATES` | Not started |
| M-P0-8 | Organization-aware analytics attribution | `MULTI_ORG_ANALYTICS_ATTRIBUTION_PROVEN` | Not started |

Integration proof (§12 of the directive): after all slices, a 16-assertion
local integration proof (P owns A+B, manages C, D invisible, worker W engaged
by A and B, independent subscriptions, context-scoped analytics) must pass →
`MULTI_ORGANIZATION_STRUCTURAL_SPINE_LOCAL_INTEGRATION_PROVEN`.

PR #1016 stays Draft as an architectural reference until M-P0-6 supersedes
it. Production QA accounts: forbidden until the train is merged + deployed
and the owner approves the §13 package.

## M-P0-3 — `getOwnCompany()` authority inventory (2026-08-05)

Two implementations exist, both `companies WHERE profile_id = uid
.maybeSingle()` (ERRORS once a profile owns 2 rows):
`lib/company/company-setup.ts:getOwnCompany` and
`lib/company/company-workers.ts:getOwnCompany`.

The canonical replacement ALREADY EXISTS: `resolveEmployerCompanyContext` /
`requireEmployerCompany` (`lib/company/employer-company-context.ts`, W8
slice 1) — active-workspace chain (httpOnly cookie → membership-validated →
`organizations.legacy_company_id` → company), fail-closed, no first-company
fallback. M-P0-3 = migrating call sites onto it, not building a resolver.

**AUTHORITATIVE (writes — replace first):**
- `lib/company/actions.ts` — 4 roster writes: `inviteCompanyWorkerAction`,
  `assignCompanyWorkerRoleAction`,
  `provisionCompanyWorkerEngagementContextAction`,
  `setCompanyWorkerJournalReviewAction` (invite / role assignment /
  engagement provisioning / journal review authority).
- `lib/company/project-context-actions.ts:51` — PROJECT CREATION authority.
- `lib/company/company-setup.ts:saveCompanySetup` legacy branch — solved by
  M-P0-2 (explicit target + `multiple_companies` fail-closed guard in SQL).

**READ/RENDER (classify, replace second):**
- `app/[locale]/dashboard/layout.tsx:140` (workspace display context),
- `app/[locale]/dashboard/company/page.tsx:181`,
- `app/[locale]/dashboard/market-map/page.tsx:89`,
- `app/[locale]/dashboard/start/company/page.tsx` — DONE in M-P0-2 (now
  workspace-resolved via `resolveEmployerCompanyContext`).

Booking / demand / contact-disclosure / billing paths do not call
`getOwnCompany()` — they authorize SQL-side (`owns_company`) or are not yet
organization-scoped (M-P0-6/M-P0-7 scope).

## M-P0-1 — production audit (2026-08-05, read-only)

- The cap: `companies_profile_id_key :: UNIQUE (profile_id)` on
  `public.companies` (from migration 0006).
- Production: 7 companies, 7 distinct `profile_id`s — no duplicates, so
  removal has zero existing-row risk and the rollback window is open.
- `organizations` (10 rows) already models multi-org: `owner_profile_id` has
  NO unique constraint; `legacy_company_id` / `legacy_agency_id` bridge to
  the legacy tables and keep traceability.
- `owns_company(c)` = `exists(select 1 from companies x where x.id = c and
  x.profile_id = auth.uid())` — a PER-ROW creator check. It stays factually
  correct after the cap is removed (each company still has exactly one
  creator); what it cannot express is delegated management — that is
  M-P0-4's membership job, not M-P0-1's.
- Singleton WRITERS that assume one-company-per-profile (all M-P0-2/M-P0-3
  scope, untouched by M-P0-1): `save_company_setup` (upsert-by-profile),
  `complete_onboarding` company branch (`if not exists … where profile_id =
  uid`), `getOwnCompany()` in apps/web.

## M-P0-1 — design

Migration `20260805170000_multi_org_company_ownership_cap_removal_v1.sql`
(RED, owner-gated, ships with NO `@human-gate-approved` marker):

1. DROP CONSTRAINT `companies_profile_id_key`.
2. Truthful duplicate key replacement: UNIQUE INDEX
   `companies_creator_canonical_name_key` on
   `(profile_id, lower(btrim(legal_name))) WHERE legal_name IS NOT NULL` —
   the same creator cannot create the same canonical company twice; two
   different people may legitimately register distinctly-owned companies.
3. `comment on column companies.profile_id` — demoted to legacy creator
   metadata; authorization truth must move to organization
   ownership/membership (M-P0-4); no code may infer "the" company from it.
4. No row is created, deleted or updated. RLS untouched. Grants untouched.

Rollback `supabase/rollbacks/…down.sql`: recreates `UNIQUE (profile_id)`
after failing loudly (with the offending profile ids REDACTED to counts) if
any profile meanwhile owns two companies — the rollback window closes the
moment a second company legitimately exists, and the file says so.

Actor matrix (unchanged by this migration): anon — no access to `companies`
writes; authenticated — RLS as before (`owns_company` per-row);
service_role — as before. The dropped object is a constraint, not a
privilege.

Compatibility: every existing read path keys on `companies.id` or
`owns_company(id)`; nothing reads "the unique company of profile X" at the
SQL level — the singleton assumptions live in the two RPC writers and
`getOwnCompany()`, which keep functioning unchanged while the cap is gone
(they just keep acting on the row they already act on). M-P0-2/3 replace
them.
