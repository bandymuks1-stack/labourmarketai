begin;
set local role anon;
do $$
declare
  r record; blocked int := 0; reachable int := 0; names text := '';
begin
  for r in
    select p.oid, p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as sig
      from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
     order by 2
  loop
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      reachable := reachable + 1; names := names || E'\n    REACHABLE: ' || r.sig;
    else
      blocked := blocked + 1;
    end if;
  end loop;
  raise notice 'ANON as role=anon: % blocked, % reachable%', blocked, reachable, names;
end $$;

-- Real execution: anon must be DENIED on a non-allowlisted secdef function ...
do $$
begin
  perform public.is_admin();
  raise notice 'ANON_EXEC is_admin() -> UNEXPECTEDLY ALLOWED';
exception when others then
  raise notice 'ANON_EXEC is_admin() -> DENIED (% / %)', sqlstate, left(sqlerrm,60);
end $$;
do $$
begin
  perform public.respond_booking_request_v3(gen_random_uuid(),'accepted',null,null);
  raise notice 'ANON_EXEC respond_booking_request_v3 -> UNEXPECTEDLY ALLOWED';
exception when others then
  raise notice 'ANON_EXEC respond_booking_request_v3 -> DENIED (% / %)', sqlstate, left(sqlerrm,60);
end $$;
do $$
begin
  perform public.contact_demand_owner_v1(gen_random_uuid());
  raise notice 'ANON_EXEC contact_demand_owner_v1 -> UNEXPECTEDLY ALLOWED';
exception when others then
  raise notice 'ANON_EXEC contact_demand_owner_v1 -> DENIED (% / %)', sqlstate, left(sqlerrm,60);
end $$;
-- ... and ALLOWED on an allowlisted public RPC.
do $$
begin
  perform * from public.get_public_business_profile_v1('no-such-slug');
  raise notice 'ANON_EXEC get_public_business_profile_v1 -> ALLOWED (correct)';
exception when others then
  raise notice 'ANON_EXEC get_public_business_profile_v1 -> % / %', sqlstate, left(sqlerrm,60);
end $$;
rollback;
