# Human gate — Training & Certification v1 (`20260817230000`)

Status: **PENDING APPLY BY LEAD**
Route pre-approved by the owner mandate 2026-08-17 (autonomous functional
completion train V2, §4 migration authority). The annotation states the
ROUTE; the apply act belongs to the lead session.

## What is being asked for

Apply `supabase/migrations/20260817230000_training_certification_v1.sql` to
production via Supabase MCP `apply_migration`, **after**
`20260817140000_document_file_layer_v1.sql` (hard dependency, asserted in the
migration body — it aborts rather than half-applying).

## Why it is migration-safety RED

Structurally unavoidable for a row-level-secured register: 4 new RLS-bearing
tables, SELECT policies, GRANT/REVOKE, 8 SECURITY DEFINER functions and 2
trigger guards. Every object is a NEW name. Zero existing table, column,
constraint, policy, grant, trigger or function is modified or recreated;
zero DML runs at apply time.

## Blast radius

Nothing existing changes. Reads and writes of `worker_documents`,
`worker_skills`, `journal_entry_skills`, `org_documents`, `document_files`
and `document_acknowledgements` are unaffected: the module only *points at*
those rows.

## The two decisions worth an owner's attention

1. **Subject key = `assignee_profile_id`, not `worker_id`.** The training
   material acknowledgement is the document engine's
   `document_acknowledgements`, whose subject key is the profile. Keying on
   `worker_id` would make the assignment and its own acknowledgement
   unjoinable, and would exclude every org member without a `workers` row
   (office staff, managers, external managers) — exactly the people an
   organization assigns policy and safety training to.

2. **The skill seam was investigated and deliberately NOT crossed.**
   `worker_skills.source` has a closed CHECK
   (`self_declared` / `work_journal` / `manager_confirmed`) and
   `journal_entry_skills` requires a real `journal_entry_id`. Recording
   training evidence in either would require widening the canonical
   constraint or minting a fake journal entry. Both were refused. The
   linkage lives in this module's own `training_skill_links` with one fixed
   provenance and no level, score or verified flag. **Admitting a training
   provenance into the canonical skill ladder is a later train and an owner
   decision.**

## Proof

`scripts/db-proof/training-development-v1.sh` — 127/127 on a throwaway
Postgres 15, executing this migration and its rollback verbatim: the
authority matrix (anon / owner / admin / manager / member / assignee /
revoked / wrong-org / attacker / platform admin), assignee-only fill-once
completion at both the RPC and trigger layer, cross-org certificate refusal,
append-only enforcement against the superuser, zero writes to the canonical
skill model, and rollback → re-apply at 0 rows plus rollback refusal once
rows exist.

## Rollback

`supabase/rollbacks/20260817230000_training_certification_v1.down.sql`.
It **refuses** while real rows exist — a rollback must be a no-loss
operation or not run at all. Emptying the module first is a separate,
deliberate operator act.
