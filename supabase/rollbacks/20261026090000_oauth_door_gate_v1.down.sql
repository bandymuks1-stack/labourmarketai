-- ============================================================================
-- DOWN for 20261026090000_oauth_door_gate_v1 (B1b door gate). RED, owner-applied.
--
-- Fastest reversal needs no rollback at all:
--     select door_gate_private.set_mode('off');
-- (instant; OAuth requests then return after one PK read, nobody is refused).
--
-- Full removal runs in TWO SEPARATE executions, because `notify pgrst` is
-- delivered only at COMMIT: if the functions were dropped in the same
-- transaction that unwires PostgREST, requests arriving between that commit
-- and PostgREST's config reload (milliseconds) would call a function that no
-- longer exists and fail with 500. Run PART A, wait ~10 seconds (or confirm
-- one /rest/v1 request succeeds), then run PART B.
--
-- Data loss: PART B drops door_gate_private.oauth_direct_hits (diagnostic
-- evidence only, 30-day retention) and the HMAC keys (the app's
-- LM_DOOR_SECRET becomes meaningless; remove it from the server env).
-- Export the evidence first if it is still needed:
--     select * from door_gate_private.oauth_direct_hits order by bucket;
-- ============================================================================

-- ─── PART A (own execution) ────────────────────────────────────────────────
do $a$
begin
  -- Reset only if the setting is ours; never touch a foreign pre-request.
  if exists (
    select 1
      from pg_catalog.pg_db_role_setting s
      join pg_catalog.pg_roles r on r.oid = s.setrole
      cross join lateral unnest(s.setconfig) c
     where r.rolname = 'authenticator' and s.setdatabase = 0
       and c = 'pgrst.db_pre_request=door_gate.pre_request') then
    execute 'alter role authenticator reset pgrst.db_pre_request';
  end if;
end
$a$;
update door_gate_private.settings set mode = 'off', updated_at = now() where id;
notify pgrst, 'reload config';

-- ─── PART B (own execution, after PART A has committed and PostgREST reloaded)
do $b$
begin
  if exists (
    select 1
      from pg_catalog.pg_db_role_setting s
      join pg_catalog.pg_roles r on r.oid = s.setrole
      cross join lateral unnest(s.setconfig) c
     where r.rolname = 'authenticator' and c like 'pgrst.db_pre_request=door_gate.%') then
    raise exception 'PART A has not run: PostgREST still calls door_gate.pre_request';
  end if;
end
$b$;
drop schema door_gate cascade;
drop schema door_gate_private cascade;
