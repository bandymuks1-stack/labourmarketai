-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20261003150800 — ai_runs retention CLASSES v2.
-- Supersedes the unmerged draft #1266 (20260824170000, "delink subject").
--
-- ── THE OWNER DIRECTION ────────────────────────────────────────────────────
-- ai_runs must stop being a permanent index of WHO, WITHOUT losing the audit
-- trail or the provenance that evidence relies on. Four kinds of data live in
-- the one table and get four different treatments:
--
--   1. ai_content          output_excerpt              AGES OUT  (null @ 90 d)
--   2. subject_linkage     profile_id                  DE-LINKS  (null @ 90 d)
--   3. security_audit      who/what/when/where/cost    KEPT
--   4. evidence_provenance prompt_version,
--                          schema_validation,
--                          confidence,
--                          human_review_state          KEPT
--
-- ── LIVE TRUTH THIS WAS WRITTEN AGAINST (production, read-only, 2026-10-04) ─
-- * Already applied and NOT redone here: ai_runs_audit_v1 (20260803061937),
--   ai_runs_retention_redaction_v1 (20260808162217 and 20260824114251),
--   ai_runs_retention_schedule_v1 (20260808180613; cron job
--   `ai-runs-retention-daily`, 17 3 * * *, active).
-- * Live redact_expired_ai_run_content() clears output_excerpt ONLY.
-- * 355 rows, 2026-08-28 .. 2026-10-02, none older than 90 days; 57 daily
--   sweeps have run and redacted 0 rows because nothing has aged out yet.
--   191 rows hold an output_excerpt; 0 rows hold a profile_id; all 355 hold a
--   request_context.
-- * request_context is a CLOSED surface vocabulary (7 distinct values:
--   translation_copy, conversation_intent, vacancy_translation,
--   worker_profile, market_explanation, company_need, matching_explanation).
--   It names a product surface, never a person. #1266 nulled it; this does
--   NOT, because it is security/audit metadata (which surface asked) and
--   carries no subject.
-- * No table references ai_runs (no FK, no ai_run_id column anywhere in
--   public). Evidence/journal/draft proposals therefore cannot be broken by
--   any redaction here; provenance that matters (was this a proposal, which
--   prompt version, schema-validated, human review state) is kept anyway.
--
-- ── WHAT THIS ADDS (nothing duplicates the applied work) ───────────────────
-- A. ai_runs_retention_policy()   the SINGLE declarative registry classifying
--    EVERY ai_runs column. Immutable SQL, no table, no write surface.
-- B. redact_expired_ai_run_content()  REPLACED in place (same name, same
--    signature, same grants, same 90-day floor): now also de-links
--    profile_id, each class on its own horizon read from the registry.
--    run_ai_runs_retention_sweep() and the cron job are untouched.
-- C. ai_runs_enforce_retention_classes()  BEFORE UPDATE trigger: the database
--    itself refuses any change to a retained column, and any change to the two
--    redactable columns other than setting them to NULL. Today the guarantee
--    "security metadata is preserved" rests on grants alone, which the table
--    owner and every SECURITY DEFINER function bypass.
-- D. ai_runs_delink_subject(uuid)  service_role-only erasure/objection path:
--    de-links and clears content for ONE subject immediately (no 90-day wait).
-- E. privacy_export_ai_runs_subject_v1()  subject-safe export read: the
--    caller's OWN still-linked runs, metadata only (never output_excerpt).
--
-- DELETE is deliberately NOT blocked by C (retention here is redact-not-delete;
-- blocking DELETE would be a separate decision). No grant on ai_runs changes.
--
-- RED CLASS: SECURITY DEFINER create/replace + GRANT + trigger. Intentional.
-- NOT annotated @human-gate-approved: no approval is recorded against this SQL.
--
-- ROLLBACK: supabase/rollbacks/20261003150800_ai_runs_retention_classes_v2.down.sql
-- (restores the live one-column function; a column already nulled cannot be
-- resurrected — retention is one-way by design.)
-- ============================================================================

begin;

-- A. The registry ------------------------------------------------------------
create or replace function public.ai_runs_retention_policy()
returns table (
  retention_class text,
  column_name     text,
  horizon_days    integer,
  action          text
)
language sql
immutable
set search_path = public
as $$
  select * from (values
    ('ai_content',          'output_excerpt',       public.ai_runs_retention_days(), 'null'),
    ('subject_linkage',     'profile_id',           public.ai_runs_retention_days(), 'null'),

    ('security_audit',      'id',                   null::integer, 'retain'),
    ('security_audit',      'created_at',           null::integer, 'retain'),
    ('security_audit',      'task_type',            null::integer, 'retain'),
    ('security_audit',      'provider',             null::integer, 'retain'),
    ('security_audit',      'model_alias',          null::integer, 'retain'),
    ('security_audit',      'model_id',             null::integer, 'retain'),
    ('security_audit',      'tier',                 null::integer, 'retain'),
    ('security_audit',      'route_reason',         null::integer, 'retain'),
    ('security_audit',      'locale',               null::integer, 'retain'),
    ('security_audit',      'input_source',         null::integer, 'retain'),
    ('security_audit',      'data_categories_sent', null::integer, 'retain'),
    ('security_audit',      'request_context',      null::integer, 'retain'),
    ('security_audit',      'blocked_reason',       null::integer, 'retain'),
    ('security_audit',      'fallback_applied',     null::integer, 'retain'),
    ('security_audit',      'fallback_reason',      null::integer, 'retain'),
    ('security_audit',      'escalation_applied',   null::integer, 'retain'),
    ('security_audit',      'estimated_cost_usd',   null::integer, 'retain'),
    ('security_audit',      'actual_cost_usd',      null::integer, 'retain'),
    ('security_audit',      'input_tokens',         null::integer, 'retain'),
    ('security_audit',      'output_tokens',        null::integer, 'retain'),
    ('security_audit',      'latency_ms',           null::integer, 'retain'),

    ('evidence_provenance', 'prompt_version',       null::integer, 'retain'),
    ('evidence_provenance', 'schema_validation',    null::integer, 'retain'),
    ('evidence_provenance', 'confidence',           null::integer, 'retain'),
    ('evidence_provenance', 'human_review_state',   null::integer, 'retain')
  ) as t(retention_class, column_name, horizon_days, action)
$$;

comment on function public.ai_runs_retention_policy() is
  'The single registry of ai_runs retention classes. Every ai_runs column appears exactly once. ai_content and subject_linkage age out (action null @ horizon_days); security_audit and evidence_provenance are retained. A column added to ai_runs MUST be classified here or ai_runs_enforce_retention_classes refuses updates that touch it.';

revoke all on function public.ai_runs_retention_policy() from public;
revoke all on function public.ai_runs_retention_policy() from anon;
grant execute on function public.ai_runs_retention_policy() to authenticated;
grant execute on function public.ai_runs_retention_policy() to service_role;

-- B. The canonical sweep, extended in place ----------------------------------
create or replace function public.redact_expired_ai_run_content(
  p_retention_days integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_floor integer;
  v_link_floor    integer;
  v_content       integer;
  v_link          integer;
  v_count         integer;
begin
  select p.horizon_days into v_content_floor
    from public.ai_runs_retention_policy() p
   where p.column_name = 'output_excerpt' and p.action = 'null';
  select p.horizon_days into v_link_floor
    from public.ai_runs_retention_policy() p
   where p.column_name = 'profile_id' and p.action = 'null';

  v_content := coalesce(p_retention_days, v_content_floor);
  v_link    := coalesce(p_retention_days, v_link_floor);

  if v_content < v_content_floor or v_link < v_link_floor then
    raise exception
      'retention window may not be shortened below the approved % days',
      public.ai_runs_retention_days()
      using errcode = '22023';
  end if;

  update public.ai_runs
     set output_excerpt = case
           when created_at < now() - make_interval(days => v_content) then null
           else output_excerpt end,
         profile_id = case
           when created_at < now() - make_interval(days => v_link) then null
           else profile_id end
   where (output_excerpt is not null
          and created_at < now() - make_interval(days => v_content))
      or (profile_id is not null
          and created_at < now() - make_interval(days => v_link));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.redact_expired_ai_run_content(integer) is
  'ai_runs retention classes v2: past each class horizon (ai_runs_retention_policy) nulls output_excerpt (AI content) and profile_id (subject linkage). Security/audit metadata and evidence provenance are never touched; no row is deleted. Idempotent. Returns rows changed.';

revoke all on function public.redact_expired_ai_run_content(integer) from public;
revoke all on function public.redact_expired_ai_run_content(integer) from anon;
revoke all on function public.redact_expired_ai_run_content(integer) from authenticated;
grant execute on function public.redact_expired_ai_run_content(integer) to service_role;

-- C. The table enforces its own classes --------------------------------------
create or replace function public.ai_runs_enforce_retention_classes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_col   text;
  v_class text;
begin
  if (to_jsonb(new) - 'output_excerpt' - 'profile_id')
     is distinct from (to_jsonb(old) - 'output_excerpt' - 'profile_id') then
    select p.column_name, p.retention_class
      into v_col, v_class
      from public.ai_runs_retention_policy() p
     where p.action = 'retain'
       and (to_jsonb(new) -> p.column_name) is distinct from (to_jsonb(old) -> p.column_name)
     limit 1;
    raise exception
      'ai_runs.% is retained (class %): only output_excerpt and profile_id may be redacted',
      coalesce(v_col, '(unclassified column)'), coalesce(v_class, 'unclassified')
      using errcode = '23514';
  end if;

  if new.output_excerpt is not null
     and new.output_excerpt is distinct from old.output_excerpt then
    raise exception 'ai_runs.output_excerpt may only be redacted to NULL, never rewritten'
      using errcode = '23514';
  end if;
  if new.profile_id is not null
     and new.profile_id is distinct from old.profile_id then
    raise exception 'ai_runs.profile_id may only be de-linked to NULL, never re-pointed'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.ai_runs_enforce_retention_classes() is
  'BEFORE UPDATE guard on ai_runs: retained classes (security_audit, evidence_provenance) are immutable; output_excerpt and profile_id may only move to NULL (which is also what the profiles FK ON DELETE SET NULL does).';

drop trigger if exists ai_runs_enforce_retention_classes on public.ai_runs;
create trigger ai_runs_enforce_retention_classes
  before update on public.ai_runs
  for each row execute function public.ai_runs_enforce_retention_classes();

-- D. Erasure / objection path -------------------------------------------------
create or replace function public.ai_runs_delink_subject(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_profile_id is null then
    raise exception 'p_profile_id is required' using errcode = '22004';
  end if;

  update public.ai_runs
     set profile_id = null,
         output_excerpt = null
   where profile_id = p_profile_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.ai_runs_delink_subject(uuid) is
  'Erasure/objection: immediately de-links ONE subject from ai_runs and clears the AI content of the runs that were linked to them. Retains every security/audit and provenance column; deletes no row. Idempotent. Returns rows changed. service_role only.';

revoke all on function public.ai_runs_delink_subject(uuid) from public;
revoke all on function public.ai_runs_delink_subject(uuid) from anon;
revoke all on function public.ai_runs_delink_subject(uuid) from authenticated;
grant execute on function public.ai_runs_delink_subject(uuid) to service_role;

-- E. Subject-safe export read -------------------------------------------------
create or replace function public.privacy_export_ai_runs_subject_v1()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'created_at', r.created_at,
    'task_type', r.task_type,
    'provider', r.provider,
    'model_alias', r.model_alias,
    'input_source', r.input_source,
    'data_categories_sent', r.data_categories_sent,
    'schema_validation', r.schema_validation,
    'human_review_state', r.human_review_state,
    'request_context', r.request_context
  )
  from public.ai_runs r
  where auth.uid() is not null
    and r.profile_id = auth.uid()
  order by r.created_at, r.id
$$;

comment on function public.privacy_export_ai_runs_subject_v1() is
  'Subject-access read of the caller''s OWN still-linked ai_runs: metadata only, never output_excerpt or free-text routing reasons. Subject derived from auth.uid(); no person argument.';

revoke all on function public.privacy_export_ai_runs_subject_v1() from public;
revoke all on function public.privacy_export_ai_runs_subject_v1() from anon;
grant execute on function public.privacy_export_ai_runs_subject_v1() to authenticated;

commit;
