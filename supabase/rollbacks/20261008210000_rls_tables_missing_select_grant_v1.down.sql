-- Rollback for 20261008210000_rls_tables_missing_select_grant_v1.
-- Pure privilege revoke; no data touched. Restores the pre-fix state in which
-- these reads fail with 42501 (the app reports them as unavailable).
begin;
revoke select on public.account_classifications    from authenticated;
revoke select on public.organization_identifiers   from authenticated;
revoke select on public.organization_facts         from authenticated;
revoke select on public.organization_claims        from authenticated;
revoke select on public.platform_capability_grants from authenticated;
commit;
