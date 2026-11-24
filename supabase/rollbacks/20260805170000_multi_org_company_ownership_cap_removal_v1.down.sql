-- ROLLBACK for 20260805170000 — restore the one-person-one-company cap.
--
-- WARNING: restoring UNIQUE (profile_id) is only possible while NO profile
-- owns two companies. The moment a second company legitimately exists this
-- rollback's window is CLOSED — it fails loudly below rather than deleting
-- or merging anybody's company. Counts only are raised; no ids, no names.
--
-- Rolling back re-imposes the pre-doctrine cap; it does not delete data.

do $$
declare
  multi_owner_profiles bigint;
begin
  select count(*) into multi_owner_profiles from (
    select profile_id from public.companies
     group by profile_id having count(*) > 1
  ) t;

  if multi_owner_profiles > 0 then
    raise exception
      'ROLLBACK WINDOW CLOSED: % profile(s) now own more than one company. '
      'Restoring UNIQUE (profile_id) would require destroying or reassigning '
      'real companies — refusing. Resolve ownership deliberately first.',
      multi_owner_profiles;
  end if;
end $$;

drop index if exists public.companies_creator_canonical_name_key;

alter table public.companies
  add constraint companies_profile_id_key unique (profile_id);

comment on column public.companies.profile_id is null;
