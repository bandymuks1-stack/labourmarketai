-- Per-call cost of door_gate.pre_request() on the local PG16 proof cluster.
-- Run AFTER oauth-door-gate.sh (migration applied). psql -f, as postgres.
-- Each case sets the request GUCs once, then calls the function N times in a
-- PL/pgSQL loop as role `authenticated`; the empty-loop cost is subtracted.
\set QUIET on
\pset tuples_only on
insert into door_gate_private.keys(kid, secret)
  values ('k1', decode('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f','hex'))
  on conflict (kid) do nothing;
-- comparison variant only (NOT part of the migration): the same fast path in a
-- single SECURITY DEFINER function with SET search_path
create or replace function door_gate.bench_secdef_variant() returns void
language plpgsql security definer set search_path = '' as $f$
begin
  if pg_catalog.strpos(coalesce(pg_catalog.current_setting('request.jwt.claims', true), ''), '"client_id"') = 0 then
    return;
  end if;
end $f$;
grant execute on function door_gate.bench_secdef_variant() to authenticated;
create or replace function door_gate.bench_noop() returns void language plpgsql as $f$ begin end $f$;
grant execute on function door_gate.bench_noop() to authenticated;

create or replace function public.bench(p_label text, p_claims text, p_headers text, p_fn text, p_n int, p_catch boolean default false)
returns text language plpgsql as $f$
declare t0 timestamptz; t1 timestamptz; base double precision; tot double precision; i int;
begin
  perform set_config('request.jwt.claims', p_claims, false);
  perform set_config('request.headers', p_headers, false);
  perform set_config('request.method', 'GET', false);
  perform set_config('request.path', '/workers', false);
  -- empty loop (same shape) for subtraction
  t0 := clock_timestamp();
  for i in 1..p_n loop
    if p_catch then begin perform 1; exception when others then null; end; else perform 1; end if;
  end loop;
  base := extract(epoch from clock_timestamp() - t0);
  t0 := clock_timestamp();
  if p_fn = 'gate' then
    for i in 1..p_n loop
      if p_catch then begin perform door_gate.pre_request(); exception when others then null; end;
      else perform door_gate.pre_request(); end if;
    end loop;
  elsif p_fn = 'secdef' then
    for i in 1..p_n loop perform door_gate.bench_secdef_variant(); end loop;
  else
    for i in 1..p_n loop perform door_gate.bench_noop(); end loop;
  end if;
  tot := extract(epoch from clock_timestamp() - t0);
  return rpad(p_label, 58) || lpad(to_char((tot - base) / p_n * 1e6, 'FM990.00'), 8) || ' us/call';
end $f$;
grant execute on function public.bench(text,text,text,text,int,boolean) to authenticated;
