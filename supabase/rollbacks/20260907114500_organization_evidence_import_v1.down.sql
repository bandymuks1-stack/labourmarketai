-- Rollback for 20260907114500_organization_evidence_import_v1
--
-- GUARDED: refuses while any organization evidence record, import session or
-- roster person exists. Historical evidence about real people is never dropped
-- to undo a schema change - export it first, or withdraw it through the
-- append-only lifecycle (organization_evidence_events), which keeps both the
-- evidence and the reason readable.

do $$
begin
  if exists (select 1 from public.organization_evidence_records)
     or exists (select 1 from public.evidence_import_sessions)
     or exists (select 1 from public.organization_people) then
    raise exception 'rollback refused: organization evidence import rows exist (records/sessions/people). Export them first.'
      using errcode = 'P0004';
  end if;
end;
$$;

drop table if exists public.organization_evidence_competency_signals;
drop table if exists public.evidence_import_events;
drop table if exists public.organization_evidence_events;
drop table if exists public.organization_evidence_parties;

alter table if exists public.evidence_import_rows
  drop constraint if exists evidence_import_rows_duplicate_fk;

drop table if exists public.organization_evidence_records;
drop table if exists public.evidence_import_rows;
drop table if exists public.evidence_import_sessions;
drop table if exists public.organization_people;
