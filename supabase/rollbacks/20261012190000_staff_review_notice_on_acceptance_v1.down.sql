-- ROLLBACK for 20261012190000_staff_review_notice_on_acceptance_v1.
-- The function goes unconditionally (the app treats a missing function as
-- "not enabled" and accepts as before). The columns go ONLY while no acceptance
-- carries a stamp: once a person's acceptance fact exists, dropping it would
-- destroy audit evidence — keep the columns and drop the function only.
-- Review switched on by the automation is NOT switched off here: that state is
-- the organization's now, audited (auto_enable_engagement_journal_review), and
-- the manager's existing door can turn it off.
begin;

drop function if exists public.record_staff_review_notice_v1(uuid, text, text, boolean);

do $$
begin
  if exists (select 1 from public.invitation_acceptances where review_notice_version is not null) then
    raise notice 'rollback: acceptance facts exist; columns kept (function dropped)';
  else
    alter table public.invitation_acceptances
      drop column if exists review_notice_at,
      drop column if exists review_notice_surface,
      drop column if exists review_notice_version;
  end if;
end $$;

commit;
