-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260808130000 — ai_runs retention redaction v1 (W14 item 6).
--
-- OWNER DECISION D1: REDACT-NOT-DELETE. After 90 days, free-form AI content
-- such as `output_excerpt` must no longer remain readable; only the minimum
-- structured audit/cost information is preserved. The append-only audit record
-- itself must NOT be deleted merely to satisfy retention.
--
-- OWNER DECISION D2: aggregated AI cost history may be retained long-term as
-- business cost data provided it holds no unnecessary free-form AI content or
-- personal data. Nothing here deletes cost columns — they are exactly the
-- structured data D2 preserves.
--
-- ── WHY A FUNCTION AND NOT A GRANT ─────────────────────────────────────────
--
-- `ai_runs` is append-only AT THE GRANT LEVEL, proven post-apply by
-- has_table_privilege: `service_role` holds SELECT + INSERT and nothing else;
-- UPDATE and DELETE are revoked from EVERY role. That is the guarantee the
-- table exists to provide and this migration does not weaken it.
--
-- Granting `UPDATE (output_excerpt)` to service_role would hand every ordinary
-- application path a mutation capability over historical audit rows, for the
-- sake of one scheduled job. Instead the capability lives in ONE
-- SECURITY DEFINER function that can express the whole rule — one column, one
-- predicate, one threshold — and service_role is granted EXECUTE on that and
-- still holds NO table-level UPDATE.
--
-- Net property, which is the one the retention design asked for:
--   * ordinary application / service paths CANNOT mutate historical ai_runs;
--   * a narrowly constrained retention mechanism CAN redact only the approved
--     field, only past the threshold, without touching any other audit fact.
--
-- ── WHY ONLY output_excerpt ────────────────────────────────────────────────
--
-- It is the ONLY column that carries model output. Every other text column is
-- a bounded value written by our own routing code, not by a model:
--   route_reason <= 600, input_source <= 120, confidence <= 16,
--   fallback_reason <= 120, blocked_reason <= 64, request_context <= 120,
--   schema_validation IN ('passed','failed','skipped'),
--   data_categories_sent = field NAMES only, never values.
-- The owner decision is not broadened beyond the free-form AI content it names.
-- `profile_id` is deliberately NOT touched here: it is structured, not
-- free-form, and removing it is a separate decision nobody has taken.
--
-- @human-gate-approved — TIER: owner-gated (RED class: new SECURITY DEFINER
-- function + a GRANT). The RED content is INTENTIONAL and is the mechanism
-- itself; it ships as a needs-human-gate DRAFT carrying the exact SQL, and the
-- production apply stays manual via Supabase MCP after explicit owner
-- approval. Same posture as 20260714150000_ai_runs_audit_v1.
--
-- SAFE TO SHIP UNAPPLIED: nothing calls this function today. There is no
-- scheduler entry and no application code path; production `ai_runs` holds 0
-- rows because AI_PROVIDER_MODE is `disabled` and both write paths are gated
-- on `cfg.state === "live"`. Applying it grants a capability, not an action.
--
-- ROLLBACK: supabase/rollbacks/20260808130000_ai_runs_retention_redaction_v1.down.sql
-- ============================================================================

begin;

-- The approved retention horizon. Named so the policy is readable in the
-- database rather than only in a document.
create or replace function public.ai_runs_retention_days()
returns integer
language sql
immutable
set search_path = public
as $$ select 90 $$;

comment on function public.ai_runs_retention_days() is
  'W14 item 6 (owner decision D1): days after which free-form AI content in ai_runs must no longer be readable.';

/**
 * Redact expired free-form AI content.
 *
 * Touches EXACTLY ONE column on rows strictly older than the retention
 * horizon. Returns how many rows were redacted, so a caller can log a real
 * number instead of assuming success.
 *
 * IDEMPOTENT: `output_excerpt is not null` means a second run over the same
 * rows matches nothing and returns 0.
 *
 * The horizon may be LENGTHENED by a caller but never shortened below the
 * approved 90 days — a retention job is not a place to quietly delete more
 * history than the decision allows.
 */
create or replace function public.redact_expired_ai_run_content(
  p_retention_days integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days  integer := coalesce(p_retention_days, public.ai_runs_retention_days());
  v_count integer;
begin
  if v_days < public.ai_runs_retention_days() then
    raise exception
      'retention window may not be shortened below the approved % days',
      public.ai_runs_retention_days()
      using errcode = '22023';
  end if;

  update public.ai_runs
     set output_excerpt = null
   where created_at < now() - make_interval(days => v_days)
     and output_excerpt is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.redact_expired_ai_run_content(integer) is
  'W14 item 6 (owner decision D1, REDACT-NOT-DELETE): nulls ai_runs.output_excerpt on rows older than the retention horizon. Touches no other column and deletes no row. Idempotent. Returns rows redacted.';

-- Default-closed: nobody may call it except the server-side role that runs
-- scheduled maintenance. `authenticated` and `anon` are explicitly revoked
-- rather than merely unmentioned.
revoke all on function public.redact_expired_ai_run_content(integer) from public;
revoke all on function public.redact_expired_ai_run_content(integer) from anon;
revoke all on function public.redact_expired_ai_run_content(integer) from authenticated;
grant execute on function public.redact_expired_ai_run_content(integer) to service_role;

revoke all on function public.ai_runs_retention_days() from public;
revoke all on function public.ai_runs_retention_days() from anon;
grant execute on function public.ai_runs_retention_days() to authenticated;
grant execute on function public.ai_runs_retention_days() to service_role;

-- NOT granted and deliberately so: no UPDATE or DELETE on public.ai_runs is
-- added for any role. The table stays append-only; the function is the only
-- path to the one approved mutation.

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — also in supabase/rollbacks/)
--
--   begin;
--   drop function if exists public.redact_expired_ai_run_content(integer);
--   drop function if exists public.ai_runs_retention_days();
--   commit;
--
-- Dropping the function removes the capability. Rows already redacted stay
-- redacted — a rollback cannot resurrect content that was deliberately
-- destroyed, and pretending otherwise would be the dishonest part.
-- ════════════════════════════════════════════════════════════════════════════
