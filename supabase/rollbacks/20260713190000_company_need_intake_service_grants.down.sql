-- Rollback for 20260713190000_company_need_intake_service_grants.sql
-- Restores the (defective) pre-fix state: service_role loses direct access;
-- the owner queue and the claim bridge return to their honest empty states.
revoke update (status) on public.company_need_public_intakes from service_role;
revoke select on public.company_need_public_intakes from service_role;
