# Agency legacy residual — Path B plan (owner-gated, 2026-07-05)

Lock: AGENCY LEGACY RESIDUAL LOCK. Path A failed (rows exist); Path B applies.

## Read-only production facts (verified via MCP)
- legacy `agencies` rows: 3 · `agency_workers` rows: **0** (no membership at stake)
- distinct agency owners: 3; owners with multiple agencies: 0; ownerless: 0
- EVERY owner already has EXACTLY ONE canonical `companies` row (0 without, 0 with
  multiple) — no identity invention needed, no stranded users
- companies to retype: 3 (none currently 'staffing_agency')
- 3 mirror `organizations` rows exist (0013 trigger) — owner engagements intact

## Smallest safe migration (STOPPED AT APPLY GATE — not applied)
One data UPDATE, exactly 3 rows, no deletion, no schema change:

    update public.companies c
       set company_type = 'staffing_agency'
     where c.profile_id in (select a.profile_id from public.agencies a
                             where a.profile_id is not null)
       and c.company_type is distinct from 'staffing_agency';

- Ownership/membership: nothing to move — companies already owned by the same
  profiles; 0 agency_workers rows; org mirrors + engagements untouched.
- Legacy data: `agencies` + mirror orgs are NOT deleted — they remain as the
  archive (no archive step needed beyond leaving them in place).
- Rollback/archive plan: immediately before apply, capture the 3 (company id,
  company_type) tuples read-only into the apply audit note; rollback = restore
  those exact values. Guarded: the UPDATE's WHERE targets only the 3 mapped rows.
- Effect when applied: the Direction-A staffing-agency mode (merged #616) lights
  up for exactly these 3 owners in their canonical company workspace.

## Branch 21 status under the lock
GREEN app-side (Direction A merged, #616) + **legacy residual CLOSED (20260705240000 applied + verified)**:
one 3-row retype apply awaiting owner approval. Non-blocking for users (no dead
ends, no data loss — the 3 owners simply don't see agency mode until retyped),
but per the lock, final closure may NOT use claim-wording #3 until this apply is
approved+verified or the owner explicitly rules it non-blocking.

Approval phrase for the apply: "APPROVED — apply agency legacy retype (3 rows)".

## RESIDUAL CLOSED (2026-07-05, owner-approved apply)

Applied as ledger entry `20260705240000_agency_legacy_retype` via MCP
apply_migration (no db push, nothing unrelated, zero code changes, no deletion).
Rollback tuples (captured pre-apply, restore-exact):
  048aa7e1-0c77-4484-ad7d-00eb1288d7e3 -> 'construction'
  39b75887-3bdd-495a-8e47-7c9401086a47 -> 'other'
  788225e9-035b-4ed3-9bce-bf19aab61b14 -> 'other'
Verified read-only: exactly the 3 planned companies retyped (staffing total = 3,
unexpected retypes = 0); same 3 owners covered; agencies archive 3 rows intact;
agency_workers 0 unchanged; stranded owners 0; Direction-A mode condition
(#616, companyType==='staffing_agency') now true for all 3 owners.
BRANCH 21 LEGACY RESIDUAL: CLOSED.
