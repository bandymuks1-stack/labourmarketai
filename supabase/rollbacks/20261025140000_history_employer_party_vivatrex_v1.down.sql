-- ROLLBACK 20261025140000 — history_employer_party_vivatrex_v1
-- Removes only the employer party labels this migration inserted.
begin;
delete from public.organization_evidence_parties p
where p.party_role = 'employer'
  and p.party_organization_id is null
  and p.party_label = 'Vivat Rex PL'
  and exists (
    select 1 from public.organization_evidence_records r
    where r.id = p.record_id
      and r.supplied_by_organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
      and (r.source_fact->>'source_sheet') = 'Vivat Rex PL'
  );
commit;
