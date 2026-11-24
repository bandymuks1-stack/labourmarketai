-- Rollback for 20260802170000_organization_rls_hardening_v1 (W9 slice 2).
--
-- ⚠️  READ THIS BEFORE RUNNING IT.
--
-- This rollback RE-OPENS the P0 it was written to close. Restoring
-- `organizations_select ... using (true)` verbatim means every authenticated
-- user can once again read every organization row in full — owner_profile_id,
-- legal_name, vat_number, public_contact_email, public_contact_phone,
-- description, trust_score — regardless of `public_profile_enabled`.
-- Restoring the 0013 `engagement_contexts_write` policy likewise re-arms the
-- latent self-write escalation described in the migration header.
--
-- It is written verbatim anyway, because a rollback must restore the EXACT
-- prior state rather than a safer guess: a partial restore would leave the
-- database in a shape no migration describes. Run it only as an emergency
-- measure, and treat re-applying 20260802170000 as urgent afterwards.
--
-- Ordering note: the policies are restored BEFORE the helper is dropped, so
-- `organizations_select` never references a function that no longer exists.

-- 1. Restore 0013 line 327 verbatim.
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select using (true);

-- 2. Restore 0013 line 334 verbatim.
drop policy if exists engagement_contexts_write on public.engagement_contexts;
create policy engagement_contexts_write on public.engagement_contexts for all
  using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

-- 3. Restore the 0013 line 416 grant posture: SELECT only for authenticated.
--    The forward migration REVOKEd insert/update/delete, which 0013 never
--    granted in the first place — so there is nothing to re-grant here, and
--    deliberately nothing is. Re-granting DML would be strictly worse than the
--    state that existed before this migration.

-- 4. Drop the objects this migration created. Nothing else referenced them:
--    `belongs_to_organization` was introduced by 20260802170000 and used only
--    by the policy restored in step 1, and the directory RPC was introduced by
--    the same migration.
--
--    CALLER IMPACT: `searchPeopleAndCompanies` (apps/web/lib/invitations/
--    network.ts) calls search_organizations_directory_v1 and detects 42883
--    (undefined function), falling back to the direct table read — which works
--    again precisely because step 1 restored `using (true)`.
drop function if exists public.search_organizations_directory_v1(text);
drop function if exists public.belongs_to_organization(uuid);
