-- ROLLBACK for 20260907220000_evidence_parties_recursion_fix_v1.sql
--
-- Restores `organization_evidence_parties_select` exactly as
-- 20260907114500_organization_evidence_import_v1 created it, and drops the
-- resolver.
--
-- WARNING, stated plainly: running this REINTRODUCES the 42P17 mutual
-- recursion and takes the organization evidence import back down — reads AND
-- writes on organization_evidence_records, _parties, _events and
-- _competency_signals. It exists because a migration must be reversible, not
-- because reversing it is a good idea. Prefer fixing forward.
--
-- No data is touched in either direction.

drop policy if exists organization_evidence_parties_select on public.organization_evidence_parties;

create policy organization_evidence_parties_select on public.organization_evidence_parties
  for select to authenticated
  using (
    public.manages_organization(organization_id)
    or (party_organization_id is not null and public.manages_organization(party_organization_id))
    or exists (
      select 1
        from public.organization_evidence_records r
        join public.organization_people op on op.id = r.organization_person_id
       where r.id = organization_evidence_parties.record_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'
    )
    or public.is_admin()
  );

drop function if exists public.is_evidence_record_subject(uuid);
