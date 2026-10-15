-- ROLLBACK of 20261014150000_historical_date_correction_v1.sql
--
-- Removes exactly the 165 correcting records this rule wrote and the
-- `corrected` events that point at them; the originals (never edited) become
-- effective again with their imported dates. One audit_logs row per undone
-- correction.
--
-- REFUSES (raises, nothing changes) when anything builds on a correction: a
-- later correction of it, or any event on it (attestation, dispute,
-- withdrawal). Then a correction must be corrected again instead (A -> B -> C).
-- Effective records, hours and people must be identical before and after.
-- Roll this back BEFORE the 20261014090100 package rollback (its record
-- checksum covers raw rows).

begin;

do $undo$
declare
  v_org  constant uuid := '19f47e78-7bd1-4120-9937-603dba769f8a';
  v_rule constant text := 'historical-date-reconstruction/v1 2026-10-14';
  b_n bigint; b_h numeric; b_p bigint;
  a_n bigint; a_h numeric; a_p bigint;
  n int;
begin
  create temp table undo_pairs on commit drop as
  select e.id as event_id, e.record_id as original_id, e.replacement_record_id as correction_id
    from public.organization_evidence_events e
   where e.organization_id = v_org and e.event_type = 'corrected' and e.note like v_rule || '%';
  select count(*) into n from undo_pairs;
  if n = 0 then raise notice 'date correction v1 rollback: nothing to undo'; return; end if;
  if n <> 165 then raise exception 'date correction v1 rollback: found % corrections of this rule, expected 165', n; end if;

  select count(*) into n from public.organization_evidence_records r join undo_pairs u on r.correction_of = u.correction_id;
  if n <> 0 then raise exception 'date correction v1 rollback: % corrections were corrected again — correct them instead', n; end if;
  select count(*) into n from public.organization_evidence_events e join undo_pairs u on e.record_id = u.correction_id;
  if n <> 0 then raise exception 'date correction v1 rollback: % events sit on the corrections — correct them instead', n; end if;

  select count(*), coalesce(sum(r.hours), 0), count(distinct r.organization_person_id) into b_n, b_h, b_p
    from public.organization_evidence_records r
   where r.organization_id = v_org
     and not exists (select 1 from public.organization_evidence_events e where e.record_id = r.id and e.event_type = 'corrected');

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  select null, 'historical_date_correction_v1_rollback', 'organization_evidence_record', u.original_id,
         jsonb_build_object('removed_correction_id', u.correction_id, 'rule_version', v_rule), now()
    from undo_pairs u;

  delete from public.organization_evidence_events e using undo_pairs u where e.id = u.event_id;
  get diagnostics n = row_count; if n <> 165 then raise exception 'date correction v1 rollback: removed % events, expected 165', n; end if;
  delete from public.organization_evidence_records r using undo_pairs u where r.id = u.correction_id and r.correction_of = u.original_id;
  get diagnostics n = row_count; if n <> 165 then raise exception 'date correction v1 rollback: removed % corrections, expected 165', n; end if;

  select count(*), coalesce(sum(r.hours), 0), count(distinct r.organization_person_id) into a_n, a_h, a_p
    from public.organization_evidence_records r
   where r.organization_id = v_org
     and not exists (select 1 from public.organization_evidence_events e where e.record_id = r.id and e.event_type = 'corrected');
  if (a_n, a_h, a_p) is distinct from (b_n, b_h, b_p) then
    raise exception 'date correction v1 rollback: effective totals changed (records %/% hours %/% people %/%)', b_n, a_n, b_h, a_h, b_p, a_p;
  end if;
end
$undo$;

commit;
