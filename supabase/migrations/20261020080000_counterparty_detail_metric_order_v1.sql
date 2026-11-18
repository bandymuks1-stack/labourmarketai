-- @human-gate-approved — owner approved this exact SECURITY DEFINER body change
-- (PR #2558, 2026-10-20) after the security assessment: diff, EXECUTE ACL before/after,
-- search_path, authorization, organization isolation, history, rollback md5. Scope: this SQL only.
-- ============================================================================
-- counterparty_review_entry_detail_v1 — metrics carry their own order (v1)
--
-- The canonical work-time rule (apps/web/lib/journal/work-time.ts) lets the
-- LATEST usable entry-level `quantity` row win, ordered by created_at, then
-- id. This detail RPC returned metrics ordered by created_at ONLY and without
-- either field, so rows sharing a timestamp came back in an unspecified
-- order and the client could not apply the tie-breaker: a counterparty could
-- be shown — and accept — an older figure.
--
-- Change: each metric object additionally carries `created_at` and `id`, and
-- the aggregate orders by (created_at, id). NOTHING ELSE CHANGES: same
-- signature, same authority gate (journal_entry_review_authority_v1 basis
-- 'counterparty'), same fields, same photos/history blocks. `create or
-- replace` keeps the existing grants (EXECUTE: authenticated).
--
-- Additive, read-only function body change. No table, policy or data touched.
-- Rollback: supabase/rollbacks/20261020080000_counterparty_detail_metric_order_v1.down.sql
-- (restores the exact previous body, md5 7bdccbfa026e709bdb4436cf51d1c2a0).
-- ============================================================================

create or replace function public.counterparty_review_entry_detail_v1(p_entry_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid(); v_auth jsonb; v_out jsonb;
begin
  if uid is null then return null; end if;
  v_auth := public.journal_entry_review_authority_v1(p_entry_id, uid);
  if v_auth is null or (v_auth ->> 'basis') is distinct from 'counterparty' then return null; end if;
  select jsonb_build_object(
      'entry_id', je.id,
      'subject_display_name', w.display_name,
      'project_id', je.project_id,
      'project_name', pr.title,
      'party_organization_id', v_auth ->> 'party_organization_id',
      'party_role', v_auth ->> 'party_role',
      'original_text', je.original_text,
      'original_language', je.original_language::text,
      'created_at', je.created_at,
      'submitted_at', s.submitted_at,
      'resubmission_of_entry_id', s.resubmission_of_entry_id,
      'superseded', je.superseded_by is not null,
      'metrics', coalesce((select jsonb_agg(jsonb_build_object(
            'metric_slug', m.metric_slug, 'value_numeric', m.value_numeric,
            'value_text', m.value_text, 'unit_slug', m.unit_slug,
            'created_at', m.created_at, 'id', m.id) order by m.created_at, m.id)
          from public.journal_entry_metrics m where m.entry_id = je.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(jsonb_build_object(
            'id', ph.id, 'file_name', ph.file_name, 'storage_path', ph.storage_path) order by ph.created_at)
          from public.journal_entry_photos ph
         where ph.entry_id = je.id and ph.upload_status = 'uploaded'), '[]'::jsonb),
      'history', coalesce((
          with recursive chain(eid, depth) as (
            select je.id, 0
            union all
            select e2.correction_of, c.depth + 1
              from chain c join public.journal_entries e2 on e2.id = c.eid
             where e2.correction_of is not null and c.depth < 10)
          select jsonb_agg(jsonb_build_object(
                   'entry_id', cf.entry_id,
                   'action', cf.confirmation_scope ->> 'action',
                   'decision', cf.confirmation_scope ->> 'decision',
                   'note', cf.confirmation_scope ->> 'note',
                   'at', cf.created_at) order by cf.created_at, cf.id)
            from public.journal_entry_confirmations cf
           where cf.entry_id in (select eid from chain)
             and cf.confirmation_scope #>> '{authority,basis}' = 'counterparty'), '[]'::jsonb))
    into v_out
    from public.journal_entries je
    join public.journal_entry_review_submissions s on s.entry_id = je.id
    left join public.workers w on w.id = je.worker_id
    left join public.projects pr on pr.id = je.project_id
   where je.id = p_entry_id and je.deleted_at is null;
  return v_out;
end $function$;

-- Explicit privileges (secdef rule: a definer function created after the
-- 20260722160000 closure states them itself). Production already grants
-- EXECUTE to authenticated only; this restates it, it widens nothing.
revoke all on function public.counterparty_review_entry_detail_v1(uuid) from public, anon;
grant execute on function public.counterparty_review_entry_detail_v1(uuid) to authenticated;
