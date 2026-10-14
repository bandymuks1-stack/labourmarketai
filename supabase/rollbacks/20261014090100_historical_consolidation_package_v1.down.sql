-- ROLLBACK of 20261014090100_historical_consolidation_package_v1.sql
--
-- Undoes the WHOLE package: every row the package marked (and that still
-- points at the canonical it was given) returns to active; its ledger row is
-- stamped reverted (kept — the history of the decision is itself a fact);
-- one audit_logs row per undone merge. Records are never touched in either
-- direction, so the record checksum must be identical before and after.
-- Per-row undo without this file: revert_historical_consolidation_v1.

begin;

do $undo$
declare
  v_org  constant uuid := '19f47e78-7bd1-4120-9937-603dba769f8a';
  v_rule constant text := 'historical-consolidation/v1 2026-10-14';
  b_fp text; a_fp text; n int;
begin
  if to_regclass('public.historical_consolidation_decisions') is null then
    raise notice 'ledger absent — nothing to undo';
    return;
  end if;
  select md5(string_agg(coalesce(record_fingerprint, id::text), ',' order by id)) into b_fp
    from public.organization_evidence_records where organization_id = v_org;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  select null, 'historical_consolidation_package_v1_rollback', 'project', d.project_id,
         jsonb_build_object('decision_id', d.id,
                            'before', jsonb_build_object('record_state', 'duplicate', 'canonical_project_id', d.canonical_project_id),
                            'after', jsonb_build_object('record_state', 'active'), 'rule_version', v_rule),
         now()
    from public.historical_consolidation_decisions d
   where d.organization_id = v_org and d.rule_version = v_rule and d.decision = 'merged' and d.reverted_at is null;

  update public.projects p
     set record_state = 'active', canonical_project_id = null, updated_at = now()
    from public.historical_consolidation_decisions d
   where d.organization_id = v_org and d.rule_version = v_rule and d.decision = 'merged' and d.reverted_at is null
     and p.id = d.project_id and p.record_state = 'duplicate' and p.canonical_project_id = d.canonical_project_id;
  get diagnostics n = row_count;

  update public.historical_consolidation_decisions
     set reverted_at = now(), revert_reason = 'package rollback (20261014090100 down)'
   where organization_id = v_org and rule_version = v_rule and decision = 'merged' and reverted_at is null;

  select md5(string_agg(coalesce(record_fingerprint, id::text), ',' order by id)) into a_fp
    from public.organization_evidence_records where organization_id = v_org;
  if a_fp is distinct from b_fp then raise exception 'rollback aborted: record checksum changed'; end if;
  raise notice 'consolidation package v1 rolled back: % rows returned to active', n;
end
$undo$;

commit;
