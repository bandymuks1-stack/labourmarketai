-- Rollback 20260930100000: the classification table did not exist before.
-- Refuses when rows exist — a classification is an evidenced decision and is
-- not dropped silently; export it first, then delete the rows deliberately.
do $$
begin
  if exists (select 1 from public.account_classifications) then
    raise exception 'account_classifications has rows — export and clear them deliberately before rolling back';
  end if;
end $$;
drop table if exists public.account_classifications;
