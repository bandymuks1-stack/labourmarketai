# Owner gate — roster-link subject consent guard (RED, 2026-09-18)

**Packet:** `supabase/migrations/20260918070000_roster_link_subject_consent_guard_v1.sql`
(+ `supabase/rollbacks/…down.sql`). Applied: **NO**. Apply via Supabase MCP
`apply_migration` after the owner says **"Apply roster consent guard 2026-09-18"**.

## The defect (found on the first real human walk, #1770)

`organization_people_manager_update` WITH CHECK constrains *who* may be linked
(active engagement / membership) but not the `link_state` / `link_method` a
manager writes. Proven live 2026-09-18 in a rolled-back transaction: the
organization owner's session set another person's roster row straight to
`(linked, worker_confirmed)` — the value that means the person said
"Taip, tai aš" — **ADMITTED, rows=1**. The app never writes this (its manager
writes are `link_proposed/manager_offer` and `unlinked/null`); the exposure is
a direct authenticated PostgREST write by any manager of that organization.

## Exactly which paths it affects

| Path | Affected | Why |
|---|---|---|
| Manager forges subject confirmation (`linked`+`worker_confirmed`) | **YES** | this packet |
| Manager offers a link (`link_proposed`) | no | designed |
| Manager withdraws an offer / edits a row | no | designed |
| Subject accepts / refuses an offer | no | `organization_people_subject_decides` is sound (probe: outsider 0, own-row-only, retarget 42501) |
| Evidence records, events, sessions | no | untouched |
| Every other role's journey (employer demand, agency, institution) | **no** | no table but `organization_people` |

## The correction (one trigger, one function; no policy dropped or widened)

BEFORE UPDATE trigger: refuses the **transition into** `(linked, worker_confirmed)`
unless `auth.uid() = linked_profile_id`, and stamps `linked_by = subject`. A
policy cannot do this — WITH CHECK sees only the NEW row, so it cannot tell a
manager's name edit on an already-confirmed row from a forged confirmation.

## Rolled-back production dry run (2026-09-18)

| Step | Result |
|---|---|
| 0 today, manager forges confirmation | ADMITTED rows=1 (the defect) |
| A with trigger, same forgery | **42501** roster link confirmation is the subject's alone |
| A2 with trigger, manager offers (`link_proposed`) | rows=1 |
| B with trigger, manager edits already-confirmed row | rows=1 |
| C with trigger, subject accepts | rows=1, `linked_by = subject`, `linked_at` set |
| D subject un-links a confirmed row | 42501 **with and without** the trigger — pre-existing "subject refusal write path" RED item, not this packet |

Rollback: drop the trigger and the function (`supabase/rollbacks/…`). No data touched.
