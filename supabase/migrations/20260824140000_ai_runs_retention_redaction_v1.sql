-- @human-gate-approved
-- ─────────────────────────────────────────────────────────────────────────────
-- AI_RUNS RETENTION REDACTION v1 — RED (SECURITY DEFINER + data UPDATE + grants).
--
-- This is the REQUIRED BLOCK recorded in docs/APPLIED_LEDGER.md against the
-- applied `ai_runs` table: "full ai_runs rows and output_excerpt must be
-- retained no longer than 90 days, and longer-horizon KPI history must come
-- from aggregated, minimised data rather than indefinitely retained model
-- output excerpts." No retention mechanism existed; this creates the smallest
-- one. It ships UNAPPLIED behind needs-human-gate.
--
-- WHY REDACT, NOT DELETE. `ai_runs` is AI-operations telemetry, not
-- author-content legal evidence (the append-only legal spine is the journal /
-- chat / experiences tables, untouched here). Deleting whole rows would also
-- destroy the minimised KPI aggregate (task_type, provider, model, cost,
-- tokens, latency, flags, date) the ledger explicitly wants kept for long-
-- horizon analysis. So after 90 days we NULL only the fields that can carry
-- personal or model-generated content — `output_excerpt` (≤4000-char model
-- output), `profile_id` (the user pointer, de-linked), `request_context`
-- (free-text context) — and keep the rest as a minimised, non-identifying
-- aggregate row. `data_categories_sent` is field NAMES only (never values) and
-- is left intact.
--
-- WHY SECURITY DEFINER. `ai_runs` is append-only at the grant level — UPDATE and
-- DELETE are revoked from every role including service_role (only the table
-- owner `postgres` holds UPDATE). A redaction pass therefore cannot run as
-- service_role directly; it must run as the table owner via SECURITY DEFINER.
-- That makes this RED (SECURITY DEFINER + a data UPDATE + a GRANT). It is not a
-- loosening of the append-only contract for callers: the EXECUTE grant is
-- service_role-only (revoked from public/anon/authenticated), and the ONLY
-- mutation it can perform is nulling the three sensitive columns on rows past
-- the retention horizon — it can neither insert, delete, nor edit any other
-- field, so tamper-evidence of live rows is preserved.
--
-- CURRENT BEHAVIOUR without this: `ai_runs` is empty in production (0 rows,
-- AI_PROVIDER_MODE=disabled), so nothing needs redacting yet — which is exactly
-- why this can be prepared and gated now, ahead of activation, with zero data
-- effect at apply time. Activation cadence (a daily pg_cron job — pg_cron IS
-- installed on this project — or a scheduled edge function calling the RPC with
-- the service-role key) is a separate, deliberately un-scheduled owner decision:
-- the function existing and being ready is what unblocks the gate; auto-running
-- it is not needed until a real provider is enabled and rows begin to accrue.
--
-- Rollback: supabase/rollbacks/20260824140000_ai_runs_retention_redaction_v1.down.sql
-- drops the function (there is nothing to "undo" data-wise — redaction is
-- irreversible by design, but at apply time there are no rows to redact).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ai_runs_apply_retention(
  p_older_than interval default interval '90 days'
)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  -- Service-role maintenance operation only. The EXECUTE grant below is the
  -- primary gate (revoked from public/anon/authenticated); this check is
  -- defense in depth so an interactive end-user JWT can never trigger a mass
  -- redaction even if a future grant slipped.
  if not (coalesce(auth.role(), '') = 'service_role' or public.is_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Guard against a pathological call that would redact everything.
  if p_older_than is null or p_older_than < interval '1 day' then
    raise exception 'retention window must be at least 1 day' using errcode = '22023';
  end if;

  update public.ai_runs
     set output_excerpt  = null,
         profile_id      = null,
         request_context = null
   where created_at < now() - p_older_than
     and (output_excerpt is not null
          or profile_id is not null
          or request_context is not null);
  get diagnostics v_count = row_count;

  return v_count;
end
$function$;

-- Append-only telemetry: only the service role (server/cron) may run retention.
revoke execute on function public.ai_runs_apply_retention(interval) from public, anon, authenticated;
grant execute on function public.ai_runs_apply_retention(interval) to service_role;
