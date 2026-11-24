# HUMAN GATE — fresh-organization owner membership v1 (Finding-2)

Migration: `supabase/migrations/20260807090000_org_owner_membership_seed_v1.sql`
Rollback:  `supabase/rollbacks/20260807090000_org_owner_membership_seed_v1.down.sql`

State: `FRESH_ORGANIZATION_OWNER_MEMBERSHIP_APPROVED_APPLY_IN_PROGRESS`

## OWNER DECISION — GIVEN 2026-08-06 (Finding-2 apply approval)

The owner approved, against reviewed PR #1043 HEAD
`61b444bde41cb8b5988cc03b35e3c9042e0685b2` and binding executable sha256
`e4aebfb657122c663e1ee46a4d319988a0b77176d851cf7adc402dcd90e51668`:

1. applying `20260807090000_org_owner_membership_seed_v1` to production via
   Supabase MCP `apply_migration`;
2. exactly: atomic owner membership seeding for every new organization;
   fail-closed refusal of ownerless organization creation; the guarded
   orphan backfill (exactly three expected QA owner memberships); the
   reviewed trigger/function/grant model;
3. the four migration-safety findings (`security-definer-function`,
   `grant-or-revoke`, `create-trigger`, `data-dml`) as acknowledged notices;
4. merging PR #1043 after production verification and normal Vercel
   deployment.

Final production preflight re-run immediately before apply (2026-08-06,
post-#1040-merge): total 13, canonical 10, backfill-eligible EXACTLY 3
(QA-SYNTHETIC Alfa `9e4f4467`, Gama `3a2732d1`, Beta `d95280ac`), ambiguous
0, no-owner-evidence 0, active owner memberships 10, migration absent from
ledger, trigger absent, executable hash exact, no unrelated migration in
the branch (branch delta vs main = exactly this package).

The `@human-gate-approved` marker was added scoped to the four findings; the
comment-stripped executable sha256 is UNCHANGED by the annotation.

## Checksums the approval binds to

- migration sha256
  `f4e793460dad49d8fcfa5ab1a988e7a46b3cb4924ec318be6dc287b2fcb0605c`
  (pre-annotation — adding the marker later changes this file hash but MUST
  NOT change the executable hash below);
- rollback sha256
  `d6e3bec56f761f0942ad0fbc5a74a771a322bf141d84636efc248c111edec81c`;
- comment-stripped EXECUTABLE sha256
  `e4aebfb657122c663e1ee46a4d319988a0b77176d851cf7adc402dcd90e51668`
  (every line starting with `--` removed — the invariant the approval binds
  to; recompute with
  `grep -v "^\s*--" supabase/migrations/20260807090000_org_owner_membership_seed_v1.sql | sha256sum`).

## The production finding (Finding-2, 2026-08-06 PROD_QA journey)

Organizations created AFTER the M-P0-4 backfill (`20260806090000`) are born
with NO `company_memberships` row for their owner. Root cause, traced on the
LIVE production definitions:

`save_company_setup_v3` → INSERT `companies` → trigger `on_company_mirror_org`
→ INSERT `organizations` → trigger `on_org_owner_engagement` (owner
engagement only). **No step writes `company_memberships`.** The handoff was
explicitly deferred in `20260805190000` ("when M-P0-4 lands") and never
completed; the M-P0-4 backfill ran once, covering only orgs existing at apply
time. Because the membership commands derive ALL governance authority from
active membership rows by design, every fresh org's owner cannot invite
anyone and the member directory never renders — journey steps 5–16 are
unreachable.

Creation paths audited in production (all three stamp the creator, all three
funnel through an INSERT on `public.organizations`, so ONE trigger covers
every path):

1. `mirror_company_to_org` (companies mirror — the reviewed product path);
2. `mirror_agency_to_org` (agencies mirror);
3. `create_team_v1` (team organizations, owner = `auth.uid()`).

No path creates an ownerless organization today (production count: 0), and
`companies.profile_id` is always `auth.uid()` in the RPC — the client cannot
designate another profile as owner.

## What the migration does

1. **AFTER INSERT trigger** `on_org_owner_membership_seed` on
   `public.organizations` → `company_memberships_seed_org_owner()`: every new
   org gets ONE membership — role `owner`, status `active`,
   `accepted_at now()`, source `org-create` — in the SAME transaction as the
   creation. Idempotent (live-tuple NOT EXISTS + `ON CONFLICT DO NOTHING`
   against `company_memberships_live_key`).
2. **§4 fail-closed**: an org INSERT with NULL `owner_profile_id` is REFUSED
   (`org_without_owner`, 23514) — a creation that cannot establish its owner
   membership must not succeed. No reviewed writer is affected.
3. **Guarded one-time backfill** for already-orphaned orgs
   (`organizations.owner_profile_id` → owner/active, source
   `backfill:organizations.owner_profile_id:v2`).
4. **§5 ambiguity guard**: an org where a DIFFERENT profile already holds an
   active owner membership is never written — reported via NOTICE, excluded
   from the post-condition. Production count today: 0.
5. **Post-condition**: raises unless zero unambiguous owner-orphaned orgs
   remain.

Doctrine preserved: governance ≠ employment (no write outside
`company_memberships`, no `engagement_contexts` touch, `employee` never
appears, owner-only role); definer function pins `search_path`, EXECUTE
revoked from public, anon AND authenticated (§7 exactness).

## Production orphan classification (recorded 2026-08-06, main `dbad6b75`)

| class | count | rows |
|---|---|---|
| canonical (owner membership present) | 10 | all pre-backfill orgs |
| backfill-eligible (unambiguous) | 3 | QA-SYNTHETIC Alfa `9e4f4467`, Gama `3a2732d1`, Beta `d95280ac` |
| ambiguous (do-not-write) | 0 | — |
| no owner evidence (`owner_profile_id` null) | 0 | — |

Expected backfill count: **exactly 3** (all QA-SYNTHETIC; QA backfill count
= 3 of 3). Expected post-apply fingerprint: active owner memberships 10 → 13.

Fingerprint at classification (2026-08-06 16:39 UTC): organizations 13,
active memberships 10, active owner memberships 10, engagement_contexts 52.

Re-run `scripts/db-proof/org-owner-membership-prod-preflight.sql` (read-only)
immediately before the apply — any org created in between changes the
expected count.

## Migration-safety findings the owner is asked to accept

1. **security-definer-function** — `company_memberships_seed_org_owner()`
   (SECURITY DEFINER, pinned `search_path`; required because authenticated
   has no write grant on `company_memberships` — writes stay RPC/trigger-only).
2. **grant-or-revoke** — the three EXECUTE revokes on that function.
3. **create-trigger** — `on_org_owner_membership_seed` on
   `public.organizations`.
4. **data-dml** — the guarded backfill INSERT (expected: exactly 3 rows).

Zero structural findings: paired rollback present, filename/version clean,
no timestamp collision with main, migration count 188 → 189 (both ratchet
pins bumped with documented comments).

## Proof on record (local disposable stack, exact main + this migration)

- **DB proof** `scripts/db-proof/org-owner-membership-seed.sh` — §8
  assertions 1–15 plus §7 security probes, all PASS (0 FAIL):
  create→membership atomically, second org isolated, exact replay refused,
  live-key backstop, edit mints nothing, unrelated actor refused (RLS +
  anti-oracle), manager cannot become owner, employee engagement mints no
  governance row, ownerless org refused, orphan backfilled with v2
  provenance, ambiguous org untouched, correct orgs unchanged, last-owner
  protection intact, revocation isolation, rollback → defect honestly
  re-opens → re-apply heals, and the migration run moved NO row in
  demand/project/booking/engagement/experience/billing tables.
  Verdict: `FRESH_ORGANIZATION_OWNER_MEMBERSHIP_DATABASE_MODEL_PROVEN`.
- **Browser proof** `apps/web/tests/e2e/fresh-org-owner-membership.spec.ts`
  — 5/5 PASS through the REAL UI with a disposable actor: org A created via
  the setup form renders its member directory IMMEDIATELY (the defect
  surface), invite reachable + keyboard-focusable, org B isolated, A↔B
  switch, org write surface reachable, Personal context free of governance
  controls, 1440 + 375 no overflow, zero console errors, zero hydration
  warnings (strict — screenshots use `caret: "initial"`). Evidence:
  `docs/audits/evidence/fresh-org-owner-membership/`.
  Verdict: `FRESH_ORGANIZATION_OWNER_MEMBERSHIP_UI_PROVEN`.
- Guard test `apps/web/lib/guards/org-owner-membership-seed.test.ts` pins the
  RED state, the seed tuple, idempotency, §4 fail-closed, §5 ambiguity
  guard, §6/§7 definer + revoke pattern, and the rollback shape.

## Rollback semantics

The paired rollback drops the trigger + function ONLY. Seeded rows stay:
they are derived truth (`owner_profile_id` intact), deleting an org's only
active owner membership is blocked by `protect_last_owner` by design, and
deleting them would recreate the defect. Proven in DB proof 14a–14d.

## Observed during proofing (out of scope, recorded honestly)

- Local-stack `authenticated` still holds default-privilege WRITE grants on
  `company_memberships` (`20260806090000` revoked `public`/`anon` but never
  `authenticated`); only RLS blocks writes there. Production is SELECT-only
  (grant layer also tightened). Defense-in-depth divergence worth a separate
  hygiene pass — not widened or touched by this migration.

## THE APPLY QUESTION (owner decision requested)

> Approve applying `20260807090000_org_owner_membership_seed_v1`
> (executable sha256 `e4aebfb657122c663e1ee46a4d319988a0b77176d851cf7adc402dcd90e51668`)
> to production `gorgitwvdzxbnaxhrsrw` via Supabase MCP `apply_migration`?
> It (a) makes every future organization creation atomically seed its
> owner's governance membership and refuse ownerless creations, and
> (b) backfills exactly 3 memberships for QA-SYNTHETIC Alfa/Beta/Gama —
> nothing else. On approval the `@human-gate-approved` marker is added
> scoped to the four findings above, the APPLIED_LEDGER entry is recorded,
> and PROD_QA resumes at step 5.

Until that decision: the migration stays unapplied, the PR stays Draft/RED,
and no membership is bootstrapped by hand (§16: direct manual SQL
bootstrapping is forbidden).
