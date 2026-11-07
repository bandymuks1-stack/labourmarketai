-- Rollback of 20261024100000 (listing closed outcome + discarded-draft guard).
-- Refuses while listing outcomes are recorded: erasing why a listing closed is
-- not a rollback step. Restores the demand trigger body of 20260705150000
-- (with the search_path pin of 20260727120000).
begin;
do $$
begin
  if exists (select 1 from public.marketplace_listings where closed_outcome is not null) then
    raise exception 'rollback refused: a listing closed_outcome has been recorded';
  end if;
end $$;

drop function if exists public.set_marketplace_listing_status_v3(uuid, text, text);

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_closed_outcome_check;
alter table public.marketplace_listings
  drop column if exists closed_outcome;

create or replace function public.customer_requests_status_transition_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;
    if (old.status = 'draft' and new.status in ('submitted', 'closed'))
       or (old.status = 'submitted' and new.status = 'closed')
       or (old.status = 'closed' and new.status = 'submitted') then
      return new;
    end if;
    raise exception 'invalid demand status transition: % -> %',
      old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

commit;
