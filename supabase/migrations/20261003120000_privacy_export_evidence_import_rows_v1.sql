-- @human-gate-approved
-- ============================================================================
-- DRAFT -- needs-human-gate -- DO NOT APPLY automatically.
-- RED class: new SECURITY DEFINER disclosure function. Prod apply stays MANUAL
-- via Supabase MCP `apply_migration` after owner approval. Never `db push`.
-- ============================================================================
--
-- PER-12 (GDPR subject access): evidence_import_rows holds the staged lines a
-- supplying organization imported ABOUT its people (158 rows). Table policy
-- `evidence_import_rows_select` admits only manages_organization(...) and is
-- deliberately NOT widened: source_fact / fact_fields / derived can carry
-- other people and the organization's customers.
--
-- This function is the smallest subject-safe projection. It takes NO person
-- argument: the subject is auth.uid(), resolved through the linked roster
-- row (organization_people.linked_profile_id, link_state = 'linked'). It
-- returns only that person's lines and only these columns; it OMITS
-- source_fact, fact_fields, derived, customer_label/code/key, session_id,
-- person_match_*, duplicate_*, record_fingerprint, problem, context_match_*.
-- Read-only (STABLE); no data is written. Authenticated only, never anon.
--
-- Rollback: supabase/rollbacks/20261003120000_privacy_export_evidence_import_rows_v1.down.sql

create or replace function public.privacy_export_evidence_import_rows_v1()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'organization_id', r.organization_id,
    'organization_person_id', r.organization_person_id,
    'row_index', r.row_index,
    'person_label', r.person_label,
    'context_label', r.context_label,
    'activity_kind', r.activity_kind,
    'outcome_kind', r.outcome_kind,
    'activity_date', r.activity_date,
    'period_start', r.period_start,
    'period_end', r.period_end,
    'hours', r.hours,
    'activity_text', r.activity_text,
    'status', r.status,
    'row_origin', r.row_origin,
    'work_object_id', r.work_object_id,
    'project_id', r.project_id,
    'created_at', r.created_at
  )
  from public.evidence_import_rows r
  where auth.uid() is not null
    and r.organization_person_id in (
      select op.id
        from public.organization_people op
       where op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'
    )
  order by r.created_at, r.id
$$;

revoke all on function public.privacy_export_evidence_import_rows_v1() from public;
revoke all on function public.privacy_export_evidence_import_rows_v1() from anon;
grant execute on function public.privacy_export_evidence_import_rows_v1() to authenticated;
