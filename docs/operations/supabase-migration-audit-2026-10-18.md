# Supabase migration history and schema audit — 2026-10-18

**Read-only.** Production project `gorgitwvdzxbnaxhrsrw` (Free plan) compared with `supabase/migrations` on `main`
(`cc994cfee`, 401 files). Nothing was changed in production: no `migration repair`, `db push`, `reset`,
`rollback`, `DROP`, rename or apply. The row-by-row mapping is
[`supabase-migration-audit-2026-10-18.mapping.json`](supabase-migration-audit-2026-10-18.mapping.json).

Method: `supabase_migrations.schema_migrations.statements` vs each repo file, both normalised (comments,
whitespace, `;` and a `BEGIN`/`COMMIT` wrapper removed), matched by version, then by name / filename suffix.
Every claim about the live schema below comes from a catalog query, not from a migration file.

## 1. History vs repo

| Class | Count | Meaning |
|---|---|---|
| A | 17 | Same version, same SQL |
| B | 358 | Identical SQL, only the version differs |
| A2 | 3 | Same version, SQL differs |
| C | 16 | Version and SQL differ |
| D | 11 | In production history, no repo file |
| E | 9 | Repo file, never in production history |

**Why versions differ (B):** Supabase MCP `apply_migration` records the APPLY timestamp as the version; the
repo file keeps its own name. This is why the `Supabase Preview` check fails on every PR with
"Remote migration versions not found in local migrations directory." It has been so since May 2026.

## 2. The 19 SQL differences (A2 + C) — security and integrity

Statement-level comparison: every repo statement that is NOT in the production history text was listed and then
checked against the live catalog.

| Missing from history | Count | Live state (catalog query) |
|---|---|---|
| `REVOKE` / `GRANT` on functions and tables | 31 | All effective. `anon` cannot execute any function the repo revokes from it; `redact_expired_ai_run_content` executable only by `service_role`; the three public vacancy reads `anon`+`authenticated`, PUBLIC revoked; assistant tables `authenticated` only. |
| `CREATE` index / function / trigger | 11 | All present: `idx_profiles_active_organization`, `validate_active_organization` + both `profiles_active_org_validate_*` triggers, `timesheet_compute_lines_v1`, `lmc_flag_policy_v1`, `lmc_compensate_spend_v1`, `resend_invitation_v1`, `list_agency_drafted_needs_v1`, `ai_runs_retention_days`, `redact_expired_ai_run_content`. |
| Data `UPDATE` / `INSERT` | 3 | Effective: `projects.organization_id` NULL in 0 of 196 rows; `relationship_types` has `viewer`; `profiles.active_organization_id` exists. |
| `DO` guard / data blocks | 6 | Guards (refuse-to-run checks) have no lasting effect; data effects verified: ESCO skills carry `esco_uri`; Nonstop consolidation archive markers present. |
| `COMMENT ON` | 4 | Documentation only. |

**Conclusion:** no security or data-integrity consequence. The differences are in how the changes were
recorded (split across later entries, trimmed variants), not in what the database holds.

## 3. The 11 production-only entries (D)

| Version | Name | Effect | Assessment |
|---|---|---|---|
| 20260610204215 | conversation_message_language_check | adds a CHECK constraint | tightening |
| 20260612072652/072736/075300 | journal_entry_photos_table / _rpc / _storage | the repo's `20260612091000_journal_entry_photos.sql` split in three | same change |
| 20260805200417 | company_memberships_v1_trigger_fn_revoke | REVOKE on a trigger function | tightening |
| 20260817172306 | notification_types_union_workflow_document_v3 | CHECK widening, union of two repo files | same change |
| 20260818044005 | invitation_org_authority_v1_resend_completion | org-authority branch of `resend_invitation_v1` | completes the repo file |
| 20260818063919 | public_vacancy_preview_v1_revoke_public | REVOKE PUBLIC, explicit anon/auth grants | tightening |
| 20260928182413 | agency_drafted_needs_output_column_v1 | redefines a SECURITY DEFINER read, revoke public/anon | equivalent to the repo function |
| 20261007155339 | …conversation_participants_service_role_insert_grant_v1 | `GRANT INSERT … TO service_role` | server role only |
| 20261015193211 | 20261015120000_esco_label_search_v1 | `search_esco_labels_v1` (SECURITY DEFINER, `search_path=''`, authenticated only) | **repo drift:** file lives only in open PR #2410; no runtime code on `main` calls it |

No production-only entry widens anonymous or public access.

## 4. Is the product incomplete because of missing database structure?

Definitive cross-check: every `.rpc("…")` (237) and `.from("…")` (186) call in runtime code on `main`
(`apps/web`, `apps/mobile`, `packages`, `scripts`; tests excluded) was compared with the live catalog.
**Exactly two are missing:**

| Object | Created by | Code that calls it | Production evidence | User consequence | Required fix |
|---|---|---|---|---|---|
| `set_external_profile_visibility_v1` (function) | draft `20260713210000_multi_source_talent_v1.sql` (never applied); `external_profiles_v1` created only save/disconnect | `lib/worker/external-profiles-actions.ts:123`, button rendered by `components/app/external-profiles-section.tsx` on `/dashboard/profile` | function absent; error classified `needs_migration` → the row shows the "not enabled" text | The visibility toggle never saves. 1 external profile exists (1 worker), stored `private`. No exposure: RLS lets only the owner/admin read the table, so `employers` has no reader yet. | Either apply only this function (RED, owner OK; SQL in §6) or hide the toggle until an employer read path exists (GREEN UI change). |
| `workspace_pins` (table) | open RED draft PR #1475 (never merged/applied) | `lib/workspace/pins.ts`, `pins-actions.ts`; dashboard + chat | 51 `GET /rest/v1/workspace_pins` → **404** in the last 24 h (edge logs) | "My Space" pins never appear: `conversation-chat.tsx:5363` offers pinning only when the read succeeded. No error shown, nothing typed is lost. One wasted request per dashboard load. | Owner decision on #1475 (apply), or stop reading until it lands. |

## 5. The five never-applied drafts

All five carry `DRAFT — needs-human-gate — DO NOT APPLY` headers; they were merged as files but never approved.

| Migration | Creates | Runtime code use (main) | Live state | Consequence | Needed? |
|---|---|---|---|---|---|
| `20260713120000_company_locations_v1` | `company_locations`, `save_/remove_company_location_v1`, RLS, HQ unique index | none: not in any `.from`/`.rpc`; names appear only in the RPC registry and the privacy relation list; `spatial-read.ts` says the map was rewired to `work_objects` | absent | none | No — superseded by `work_objects` |
| `20260713210000_multi_source_talent_v1` | `talent_source_records`, `identity_resolution_events`, `worker_external_profiles`, 6 functions | only `set_external_profile_visibility_v1` (see §4); `worker_external_profiles` + save/disconnect came later from `external_profiles_v1` | 2 tables + 4 functions absent | visibility toggle (§4) | Only the visibility function, if employer visibility is wanted |
| `20260714211000_dashboard_preferences_v1` | `dashboard_preferences` + RLS | none; the configurable card grid it served (`lm.dashboard.moduleCards.v1`) no longer exists in code | absent | none | No — feature retired |
| `20260717130000_open_markets_countries_draft_v1` | marks AT, BE, CH, ES, FR, GE `is_target_market = true` | `is_target_market` is read nowhere at runtime (types only) | rows exist with `false` | none | No |
| `20260717150000_demand_interest_seen_v1` | `demand_interest_seen`, `mark_demand_interest_seen_v1` | none; the worker "company answered" signal ships through `notification_events` (`event-emitters.ts:820-845`) | absent | none | No — need covered |

**User data:** none of the five had a write path in shipped code, so no user input was dropped. The GDPR export
treats a relation that does not exist as empty (`lib/privacy/export-data.ts:225`), which is correct because no
row can exist in it.

## 6. Proposed SQL for the one function code needs (NOT applied)

From the draft, unchanged in substance; owner check through `workers.profile_id = auth.uid()`; table and CHECK
(`private`,`employers`) already live.

```sql
create or replace function public.set_external_profile_visibility_v1(p_profile_id uuid, p_visibility text)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); updated int;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_visibility is null or p_visibility not in ('private','employers') then
    raise exception 'Invalid visibility' using errcode = '22023'; end if;
  update public.worker_external_profiles ep set visibility = p_visibility, updated_at = now()
    from public.workers w
   where ep.id = p_profile_id and ep.worker_id = w.id and w.profile_id = uid and ep.disconnected_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'External profile not found' using errcode = 'P0002'; end if;
  return true;
end; $$;
revoke all on function public.set_external_profile_visibility_v1(uuid, text) from public, anon;
grant execute on function public.set_external_profile_visibility_v1(uuid, text) to authenticated;
```

## 7. Supabase GitHub integration — critical risk and safe configuration

`list_branches`: the integration's default branch `main` is the **production project**
(`is_default: true`, `project_ref = gorgitwvdzxbnaxhrsrw`), status `MIGRATIONS_FAILED`. Supabase documents a
separate **Deploy to production** option that applies new migrations when `main` changes. The version mismatch is
what stops it today. Reconciling the history while that option is on would make Supabase apply merged-but-unapplied
files (including RED drafts) to production automatically, bypassing the owner gate and the `apply_migration`-only
rule.

Owner steps (dashboard), before any history change:
1. Supabase Dashboard → project `labourmarket.ai` → **Project Settings → Integrations → GitHub Integration**.
2. Turn **Deploy to production** OFF. Leave the repository connection, **Automatic branching** and **Supabase
   changes only** as they are.
3. Save. Evidence to collect: a screenshot of the toggle, and on the next merge to `main` no production deployment
   entry under **Branches → main**.

Plan limits: preview branches (PR environments) require the **Pro** plan per Supabase docs; the org is on **Free**.
So `Supabase Preview` may not become green without a paid plan even after the history is reconciled. Two stale
preview branches exist (PR #2203, PR #1813).

## 8. Lowest-risk order (each step needs its own owner approval)

1. Deploy to production OFF (§7).
2. Decide the two live gaps (§4).
3. Back up `supabase_migrations.schema_migrations` (405 rows) to the VPS archive.
4. History-only reconciliation with `supabase migration repair` semantics (writes the history table, never the
   schema), one transaction, reversible from the backup.
5. Replay on an empty database for previews (data migrations need guards; base: draft #2150).
6. Verify: production schema-only dump hash unchanged; no automatic production apply on merge.

Not to do: rename repo migration files, `db push` / `reset` / `rollback` on production, archive the drafts before
the owner decides, disable the `Supabase Preview` check.
