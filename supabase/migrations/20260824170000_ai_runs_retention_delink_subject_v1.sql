-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260824170000 — ai_runs retention: de-link the subject after 90 days.
--
-- ── THE OWNER DIRECTION THIS IMPLEMENTS ────────────────────────────────────
--
-- "AI technical telemetry must not become a second permanent copy of a
-- person's professional history."
--
-- The Work Journal is the evidence spine and stays persistent — that is
-- product doctrine and nothing here touches it. AI telemetry is a different
-- thing wearing similar data. `ai_runs` exists to answer operational and cost
-- questions: which task ran, on which provider, how many tokens, how much it
-- cost, did it fail. It does not exist to record, indefinitely, WHICH PERSON
-- each of those runs was about.
--
-- After 90 days it currently still does. `redact_expired_ai_run_content`
-- clears `output_excerpt` and stops. `profile_id` — a live foreign key into
-- `profiles` — and `request_context` survive forever, so the table remains a
-- permanent, per-person, timestamped index of every AI interaction someone was
-- the subject of. That is a shadow history, and it is one the product never
-- promised to keep.
--
-- ── WHY THIS EXTENDS THE CANONICAL FUNCTION RATHER THAN ADDING ONE ─────────
--
-- 20260808130000 already owns this rule and says so in its own header:
-- "`profile_id` is deliberately NOT touched here: it is structured, not
-- free-form, and removing it is a separate decision nobody has taken."
--
-- That decision has now been taken, so the same function is where it belongs.
-- A second retention function, a second horizon or a second scheduled job
-- would give the platform two answers to one question and let them drift —
-- and this repo already paid for that once: #1259 introduced a duplicate
-- `ai_runs_apply_retention` doing very nearly this, was closed, and its orphan
-- production function was reverted. The capability it wanted was right; the
-- second home was not. This migration replaces the ONE canonical body.
--
-- ── COPIED FROM THE LIVE BODY, NOT FROM AN ANCESTOR FILE ──────────────────
--
-- The repo convention is to restate a whole function per migration, which
-- makes "copied from the wrong ancestor" invisible in review — the diff shows
-- a plausible complete function rather than a subtraction. So the body below
-- was diffed against the definition CURRENTLY IN PRODUCTION
-- (`pg_get_functiondef`, checked 2026-08-24): production and
-- 20260808130000 are byte-identical in their executable bodies, and this file
-- changes exactly three things against that body:
--
--   1. the `update` sets two more columns to null;
--   2. the idempotency predicate widens to "any of the three is still set";
--   3. the comment says so.
--
-- The 90-day floor, the `22023` guard, the SECURITY DEFINER posture, the
-- search_path pin, the grants and the return-a-real-count contract are
-- CARRIED OVER UNCHANGED. No grant is added or widened by this migration.
--
-- ── WHAT IS CLEARED, AND WHY EACH IS SAFE TO CLEAR ────────────────────────
--
-- `profile_id`  uuid, nullable, FK -> profiles(id) ON DELETE SET NULL.
--               Nulling it is exactly what the FK already does when a profile
--               is deleted, so the column's own contract anticipates the null.
--               No NOT NULL, no CHECK requires a value.
--
-- `request_context`  text, nullable, CHECK permits NULL explicitly. It holds
--               the agent key (e.g. which assistant surface asked), sliced to
--               120 chars. Bounded and written by our own code — so it is not
--               free-form AI content, and D1's original scope did not reach
--               it. It is cleared here for a different reason: combined with
--               `task_type` and a timestamp it narrates what a named person
--               was doing, which is the shadow history this change exists to
--               end. On its own, past the horizon, it answers no operational
--               question the retained columns do not already answer better.
--
-- Both are cleared ONLY past the same 90-day horizon, and only by the same
-- narrowly-constrained mechanism.
--
-- ── WHAT IS DELIBERATELY NOT TOUCHED ──────────────────────────────────────
--
-- Still REDACT-NOT-DELETE: no row is deleted, and owner decision D2 —
-- aggregated AI cost history may be kept long-term — is preserved intact.
-- Every column that answers a cost or operational question survives forever:
-- `created_at`, `task_type`, `provider`, `model_id`, `model_alias`, `tier`,
-- `input_tokens`, `output_tokens`, `estimated_cost_usd`, `actual_cost_usd`,
-- `latency_ms`, `route_reason`, `blocked_reason`, `fallback_*`, `schema_
-- validation`. What is lost after 90 days is only the ability to say WHOSE
-- run it was.
--
-- Verified before writing this: nothing reads either column. `ai_runs` has
-- three call sites in the whole repo — the audit INSERT
-- (`lib/ai/runtime/audit-store.ts`), a same-day count for the daily budget
-- guard, and the activation report, which selects `created_at, task_type,
-- provider, actual_cost_usd` and nothing else. No legal, security or
-- accounting path depends on 90-day-old subject attribution.
--
-- If such an obligation is later identified, the correct response is to name
-- it and narrow this function — not to keep the linkage by default because
-- nobody checked.
--
-- TIER: owner-gated (RED class: SECURITY DEFINER replace). The RED content is
-- intentional and is the mechanism itself.
--
-- NOT ANNOTATED @human-gate-approved, and that absence is the point. The
-- 20260808130000 header carries that marker because the owner had given the
-- D1 decision in writing first. Here the direction exists but no approval has
-- been recorded against THIS SQL, so writing the marker would be the agent
-- approving its own privacy change. Ships as a DRAFT carrying the exact SQL;
-- the marker is the owner's to add, and the production apply stays manual via
-- Supabase MCP after that.
--
-- Gate document: docs/human-gates/ai-runs-subject-delinking-gate.md
--
-- SAFE TO SHIP UNAPPLIED: production `ai_runs` holds 0 rows (AI_PROVIDER_MODE
-- is disabled and both write paths are gated on `cfg.state === "live"`), and
-- the daily sweep has redacted 0 rows across 16 consecutive runs. Applying
-- this narrows a capability; it takes no action on any existing row.
--
-- ROLLBACK: supabase/rollbacks/20260824170000_ai_runs_retention_delink_subject_v1.down.sql
-- ============================================================================

begin;

/**
 * Redact expired AI telemetry.
 *
 * Past the retention horizon a run keeps every operational and cost fact and
 * loses the two things that make it a record ABOUT A PERSON: the free-form
 * model output, and the link to the subject.
 *
 * IDEMPOTENT: the predicate matches only rows where at least one of the three
 * columns is still set, so a second sweep over the same rows returns 0.
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
     set output_excerpt  = null,
         profile_id      = null,
         request_context = null
   where created_at < now() - make_interval(days => v_days)
     and (
          output_excerpt  is not null
       or profile_id      is not null
       or request_context is not null
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.redact_expired_ai_run_content(integer) is
  'W14 item 6 (owner decision D1, REDACT-NOT-DELETE) + 2026-08-24 subject de-linking: past the retention horizon nulls ai_runs.output_excerpt, profile_id and request_context. Deletes no row and touches no cost or operational column, so aggregated cost history (D2) is preserved. Idempotent. Returns rows changed.';

-- Grants are UNCHANGED and restated only so this file is self-contained. No
-- role gains any capability here; `ai_runs` stays append-only at the grant
-- level and this function remains the single path to the approved mutation.
revoke all on function public.redact_expired_ai_run_content(integer) from public;
revoke all on function public.redact_expired_ai_run_content(integer) from anon;
revoke all on function public.redact_expired_ai_run_content(integer) from authenticated;
grant execute on function public.redact_expired_ai_run_content(integer) to service_role;

-- NOT granted, deliberately: no UPDATE or DELETE on public.ai_runs is added
-- for any role, and `run_ai_runs_retention_sweep()` is not modified — it still
-- calls this function with no argument, so the horizon stays uncontrollable
-- from the scheduler.

commit;
