-- ============================================================================
-- 20261026090000_oauth_door_gate_v1 — B1b: PostgREST "door gate" for
-- third-party OAuth tokens.
--
-- *** RED — OWNER-APPLIED ONLY. ***
--   * Wires `pgrst.db_pre_request` on role `authenticator`: from the moment
--     this commits, EVERY Data API request (anon, authenticated, service_role)
--     calls door_gate.pre_request() first.
--   * Creates SECURITY DEFINER functions, grants, and a new non-exposed
--     schema holding an HMAC key table.
--   * The `-- @human-gate-approved` marker is deliberately ABSENT. The owner
--     adds it only when approving this migration.
--   * Ships in mode 'off'. 'log' and 'enforce' are separate owner steps
--     (one UPDATE each, see "OPERATIONS" below). Nothing here blocks a request
--     until the owner sets 'enforce'.
--
-- WHAT IT DOES
--   A token issued by Supabase Auth's OAuth 2.1 server to a THIRD-PARTY
--   client carries a top-level `client_id` claim. Such a token may reach the
--   Data API only through our own server (the MCP door, /api/mcp). The door
--   proves that by adding the header
--       x-lm-door: v1.<kid>.<hex HMAC-SHA256(key[kid], message)>
--       message = 'lm-door/v1|' || client_id || '|' || sub || '|' ||
--                 session_id || '|' || iat || '|' || exp
--   i.e. the proof is bound to ONE access token (session + issue/expiry
--   time). The key exists only in this database and in the server's env
--   (LM_DOOR_KEY_ID / LM_DOOR_SECRET). A third-party client calling
--   /rest/v1 directly with its token has no proof.
--
--   Decision per request (door_gate.pre_request):
--     no top-level client_id in request.jwt.claims  -> return at once
--       (cookie sessions, first-party bearer/mobile, anon key, service role)
--     client_id present, mode 'off'                 -> return
--     valid proof                                   -> return
--     missing / malformed / unknown key / mismatch:
--       mode 'log'     -> RAISE LOG line + bounded evidence row, return
--       mode 'enforce' -> RAISE LOG line, then HTTP 403 (SQLSTATE PGRST)
--
-- PERFORMANCE: the pre-request runs on every Data API request. The fast path
--   (no "client_id" substring in the claims text) is one current_setting()
--   and one strpos() in a SECURITY INVOKER function with no SET clause, no
--   table access, no JSON parse. Only OAuth-client requests enter the
--   SECURITY DEFINER function (one PK read of the settings row, and in
--   log/enforce one PK read of the key row + one HMAC). Measured in
--   b1b-draft/DESIGN.md §7.
--
-- PRIVACY: evidence stores client_id (an OAuth CLIENT, not a person), the
--   outcome, the HTTP method, request.path (table or rpc name; never the
--   query string, body, token, sub, session_id, IP or headers), hourly
--   bucket and a count. Retention 30 days, at most 1000 rows per hour.
--
-- Not covered (documented residual risk, DESIGN.md §9): Storage, Realtime,
--   Auth (GoTrue) endpoints, Edge Functions. pg_graphql is not installed;
--   if it ever is, /graphql/v1 runs through PostgREST and IS covered.
--
-- OPERATIONS (owner, SQL editor, after approval):
--   1. Key: select door_gate_private.generate_key('k1');  -- returns the hex
--      secret ONCE; put it in the server env as LM_DOOR_SECRET with
--      LM_DOOR_KEY_ID=k1, deploy the app PR. Never paste a key into SQL text.
--   2. Log: select door_gate_private.set_mode('log');
--   3. Enforce (separate approval): select door_gate_private.set_mode('enforce');
--   Instant kill switch, no deploy: select door_gate_private.set_mode('off');
-- ============================================================================

-- Refuse to clobber an existing pre-request function. Today none is set
-- (production metadata 2026-10-26: authenticator has only
-- session_preload_libraries, statement_timeout, lock_timeout).
do $guard$
declare
  v_existing text;
begin
  select split_part(c, '=', 2) into v_existing
    from pg_catalog.pg_db_role_setting s
    join pg_catalog.pg_roles r on r.oid = s.setrole
    cross join lateral unnest(s.setconfig) c
   where r.rolname = 'authenticator' and s.setdatabase = 0
     and c like 'pgrst.db_pre_request=%';
  if v_existing is not null and v_existing <> 'door_gate.pre_request' then
    raise exception 'pgrst.db_pre_request is already set to %; refusing to replace it', v_existing;
  end if;
end
$guard$;

-- ── Schemas ────────────────────────────────────────────────────────────────
-- door_gate: ONLY the two gate functions. Not in PostgREST's exposed schemas
--   (db_schemas stays public, graphql_public), so not callable over /rest/v1.
-- door_gate_private: key, mode and evidence. No USAGE for any API role.
create schema door_gate;
create schema door_gate_private;
revoke all on schema door_gate from public;
revoke all on schema door_gate_private from public;
grant usage on schema door_gate to anon, authenticated, service_role;

-- ── Mode (single row) ──────────────────────────────────────────────────────
create table door_gate_private.settings (
  id          boolean primary key default true check (id),
  mode        text not null default 'off' check (mode in ('off', 'log', 'enforce')),
  updated_at  timestamptz not null default now()
);
insert into door_gate_private.settings (id, mode) values (true, 'off');

-- ── HMAC keys (rotation: at most two active at once) ───────────────────────
create table door_gate_private.keys (
  kid         text primary key check (kid ~ '^[a-z0-9]{1,16}$'),
  secret      bytea not null check (octet_length(secret) >= 32),
  status      text not null default 'active' check (status in ('active', 'retired')),
  created_at  timestamptz not null default now(),
  retired_at  timestamptz
);

-- ── Evidence (bounded) ─────────────────────────────────────────────────────
create table door_gate_private.oauth_direct_hits (
  bucket      timestamptz not null,          -- date_trunc('hour', now())
  client_id   text not null check (client_id ~ '^[A-Za-z0-9._:-]+$' and char_length(client_id) <= 200),
  outcome     text not null check (outcome in (
                'proof_ok', 'proof_missing', 'proof_malformed',
                'proof_unknown_key', 'proof_mismatch', 'claims_incomplete',
                'claims_malformed')),
  method      text not null check (char_length(method) <= 10),
  target      text not null check (char_length(target) <= 120),
  mode        text not null check (mode in ('log', 'enforce')),
  hits        integer not null default 1 check (hits >= 1),
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (bucket, client_id, outcome, method, target)
);

alter table door_gate_private.settings enable row level security;
alter table door_gate_private.keys enable row level security;
alter table door_gate_private.oauth_direct_hits enable row level security;
revoke all on door_gate_private.settings, door_gate_private.keys,
              door_gate_private.oauth_direct_hits
  from public, anon, authenticated, service_role;

-- ── Evidence writer ────────────────────────────────────────────────────────
-- Called only from door_gate.oauth_gate() (which runs as the owner).
-- GET/HEAD (and STABLE rpc) requests run in READ ONLY transactions, where an
-- INSERT is impossible; those are covered by the RAISE LOG line only. In a
-- read-write request the row is written in a subtransaction with a 50 ms lock
-- timeout and any failure is swallowed: evidence must never fail a request.
-- In 'enforce' the request transaction is rolled back by the 403, so only
-- the RAISE LOG line survives; this writer is therefore not called there.
create function door_gate_private.record_hit(
  p_client_id text, p_outcome text, p_mode text)
returns void
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '50ms'
as $fn$
declare
  v_bucket timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
  v_method text := pg_catalog.left(coalesce(pg_catalog.current_setting('request.method', true), ''), 10);
  v_target text := pg_catalog.left(coalesce(pg_catalog.current_setting('request.path', true), ''), 120);
begin
  if pg_catalog.current_setting('transaction_read_only') = 'on' then
    return;
  end if;
  begin
    -- Per-hour cap: at most 1000 distinct rows per bucket.
    if (select count(*) from (select 1 from door_gate_private.oauth_direct_hits h
                               where h.bucket = v_bucket limit 1000) c) >= 1000
       and not exists (select 1 from door_gate_private.oauth_direct_hits h
                        where h.bucket = v_bucket and h.client_id = p_client_id
                          and h.outcome = p_outcome and h.method = v_method
                          and h.target = v_target) then
      return;
    end if;
    insert into door_gate_private.oauth_direct_hits as h
      (bucket, client_id, outcome, method, target, mode)
    values (v_bucket, p_client_id, p_outcome, v_method, v_target, p_mode)
    on conflict (bucket, client_id, outcome, method, target)
    do update set hits = h.hits + 1, last_seen = pg_catalog.now(), mode = excluded.mode;
    -- Retention: opportunistic, ~1 in 100 writes; index range on bucket.
    if pg_catalog.random() < 0.01 then
      delete from door_gate_private.oauth_direct_hits h
       where h.bucket < pg_catalog.now() - interval '30 days';
    end if;
  exception when others then
    null;  -- evidence is best effort; the request must not fail because of it
  end;
end
$fn$;
revoke all on function door_gate_private.record_hit(text, text, text) from public;

-- ── The decision (SECURITY DEFINER: reads key + mode as owner) ─────────────
create function door_gate.oauth_gate()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_claims_txt  text := pg_catalog.current_setting('request.jwt.claims', true);
  v_claims      jsonb;
  v_headers_txt text;
  v_client_id   text;
  v_sub         text;
  v_session     text;
  v_iat         text;
  v_exp         text;
  v_mode        text;
  v_proof       text;
  v_parts       text[];
  v_secret      bytea;
  v_expected    text;
  v_outcome     text;
begin
  -- Authoritative claim check (the caller's strpos was only a pre-filter:
  -- "client_id" may also appear inside user_metadata).
  if v_claims_txt is null or not pg_catalog.pg_input_is_valid(v_claims_txt, 'jsonb') then
    return;  -- PostgREST always sets valid JSON; nothing to judge otherwise
  end if;
  v_claims := v_claims_txt::jsonb;
  if pg_catalog.jsonb_typeof(v_claims) <> 'object' or not (v_claims ? 'client_id') then
    return;  -- first-party token (the substring was elsewhere)
  end if;

  select s.mode into v_mode from door_gate_private.settings s where s.id;
  if v_mode is null or v_mode = 'off' then
    return;
  end if;

  -- Fail closed on a client_id that is not a plain string id (mirrors B1a's
  -- tokenClientOf at the door).
  -- NOTE: no bounded repetitions ({n,m}) in any regex on this path: PG's
  -- regex engine expands them (measured ~30-65 us per match vs <1 us for
  -- '+' plus a length test).
  if pg_catalog.jsonb_typeof(v_claims -> 'client_id') <> 'string'
     or (v_claims ->> 'client_id') !~ '^[A-Za-z0-9._:-]+$'
     or pg_catalog.char_length(v_claims ->> 'client_id') > 200 then
    v_client_id := 'malformed';
    v_outcome := 'claims_malformed';
  else
    v_client_id := v_claims ->> 'client_id';
    v_sub     := v_claims ->> 'sub';
    v_session := v_claims ->> 'session_id';
    v_iat     := v_claims ->> 'iat';
    v_exp     := v_claims ->> 'exp';
    if coalesce(v_sub, '') !~ '^[0-9A-Fa-f-]+$' or pg_catalog.char_length(v_sub) <> 36
       or coalesce(v_session, '') !~ '^[0-9A-Fa-f-]+$' or pg_catalog.char_length(v_session) <> 36
       or coalesce(v_iat, '') !~ '^[0-9]+$' or pg_catalog.char_length(v_iat) > 12
       or coalesce(v_exp, '') !~ '^[0-9]+$' or pg_catalog.char_length(v_exp) > 12 then
      v_outcome := 'claims_incomplete';
    else
      v_headers_txt := pg_catalog.current_setting('request.headers', true);
      if v_headers_txt is not null and pg_catalog.pg_input_is_valid(v_headers_txt, 'jsonb') then
        v_proof := v_headers_txt::jsonb ->> 'x-lm-door';
      end if;
      if v_proof is null then
        v_outcome := 'proof_missing';
      else
        v_parts := pg_catalog.string_to_array(v_proof, '.');
        if pg_catalog.cardinality(v_parts) <> 3 or v_parts[1] <> 'v1'
           or v_parts[2] !~ '^[a-z0-9]+$' or pg_catalog.char_length(v_parts[2]) > 16
           or v_parts[3] !~ '^[0-9a-f]+$' or pg_catalog.char_length(v_parts[3]) <> 64 then
          v_outcome := 'proof_malformed';
        else
          select k.secret into v_secret
            from door_gate_private.keys k
           where k.kid = v_parts[2] and k.status = 'active';
          if v_secret is null then
            v_outcome := 'proof_unknown_key';
          else
            v_expected := pg_catalog.encode(
              extensions.hmac(
                pg_catalog.convert_to(
                  'lm-door/v1|' || v_client_id || '|' || v_sub || '|' || v_session
                    || '|' || v_iat || '|' || v_exp, 'UTF8'),
                v_secret, 'sha256'),
              'hex');
            v_outcome := case when v_expected = v_parts[3] then 'proof_ok' else 'proof_mismatch' end;
          end if;
        end if;
      end if;
    end if;
  end if;

  if v_outcome = 'proof_ok' then
    if v_mode = 'log' then
      -- Positive control during the log week: proves the header reaches
      -- Postgres and the keys agree. Not logged in 'enforce'.
      raise log 'lm_door_gate outcome=% mode=% client=% method=% target=%',
        v_outcome, v_mode, v_client_id,
        pg_catalog.left(coalesce(pg_catalog.current_setting('request.method', true), ''), 10),
        pg_catalog.left(coalesce(pg_catalog.current_setting('request.path', true), ''), 120);
      perform door_gate_private.record_hit(v_client_id, v_outcome, v_mode);
    end if;
    return;
  end if;

  raise log 'lm_door_gate outcome=% mode=% client=% method=% target=%',
    v_outcome, v_mode, v_client_id,
    pg_catalog.left(coalesce(pg_catalog.current_setting('request.method', true), ''), 10),
    pg_catalog.left(coalesce(pg_catalog.current_setting('request.path', true), ''), 120);

  if v_mode = 'log' then
    perform door_gate_private.record_hit(v_client_id, v_outcome, v_mode);
    return;
  end if;

  -- v_mode = 'enforce'
  raise sqlstate 'PGRST' using
    message = '{"code":"LM_OAUTH_DOOR","message":"This token can be used only through the LabourMarket.ai connector endpoint.","details":null,"hint":"Connect through /api/mcp."}',
    detail  = '{"status":403,"headers":{}}';
end
$fn$;
revoke all on function door_gate.oauth_gate() from public;
-- Only `authenticated`: every token Supabase Auth issues to an OAuth client
-- has role=authenticated. A client_id token under any other role would get a
-- permission error here, i.e. fail closed.
grant execute on function door_gate.oauth_gate() to authenticated;

-- ── The pre-request entry point (SECURITY INVOKER, no SET clause) ──────────
-- Kept free of SECURITY DEFINER / proconfig so the fast path pays no role or
-- GUC switch. Every name is schema-qualified; the operator is qualified too,
-- so the caller's search_path cannot change what runs.
create function door_gate.pre_request()
returns void
language plpgsql
security invoker
as $fn$
begin
  if pg_catalog.strpos(
       coalesce(pg_catalog.current_setting('request.jwt.claims', true), ''),
       '"client_id"') operator(pg_catalog.=) 0 then
    return;
  end if;
  perform door_gate.oauth_gate();
end
$fn$;
revoke all on function door_gate.pre_request() from public;
grant execute on function door_gate.pre_request() to anon, authenticated, service_role;

-- ── Owner operations (no API role can call these) ──────────────────────────
create function door_gate_private.set_mode(p_mode text)
returns text
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  if p_mode is null or p_mode not in ('off', 'log', 'enforce') then
    raise exception 'mode must be off, log or enforce';
  end if;
  if p_mode = 'enforce' and not exists (
       select 1 from door_gate_private.keys where status = 'active') then
    raise exception 'refusing enforce: no active key (the MCP door would be refused)';
  end if;
  update door_gate_private.settings
     set mode = p_mode, updated_at = pg_catalog.now()
   where id;
  raise log 'lm_door_gate mode_set=%', p_mode;
  return p_mode;
end
$fn$;
revoke all on function door_gate_private.set_mode(text) from public;

-- Generates the key INSIDE the database and returns it once, so the secret
-- never appears in SQL text, pg_stat_statements or editor history.
create function door_gate_private.generate_key(p_kid text)
returns text
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_secret bytea := extensions.gen_random_bytes(32);
begin
  if (select count(*) from door_gate_private.keys where status = 'active') >= 2 then
    raise exception 'two keys are already active; retire one first';
  end if;
  insert into door_gate_private.keys (kid, secret) values (p_kid, v_secret);
  return pg_catalog.encode(v_secret, 'hex');
end
$fn$;
revoke all on function door_gate_private.generate_key(text) from public;

create function door_gate_private.retire_key(p_kid text)
returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  update door_gate_private.keys
     set status = 'retired', retired_at = pg_catalog.now(),
         secret = extensions.gen_random_bytes(32)  -- overwrite the old material
   where kid = p_kid and status = 'active';
  if not found then
    raise exception 'no active key %', p_kid;
  end if;
end
$fn$;
revoke all on function door_gate_private.retire_key(text) from public;

-- Optional manual/cron retention (not scheduled by this migration).
create function door_gate_private.prune_hits()
returns integer
language sql
security invoker
set search_path = ''
as $fn$
  with d as (
    delete from door_gate_private.oauth_direct_hits
     where bucket < pg_catalog.now() - interval '30 days'
    returning 1)
  select count(*)::integer from d;
$fn$;
revoke all on function door_gate_private.prune_hits() from public;

-- ── Self-check before wiring: every role PostgREST can switch to must be
--    able to run the entry point, or the whole Data API would error. ───────
do $check$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
      from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles r on r.oid = m.roleid
      join pg_catalog.pg_roles a on a.oid = m.member
     where a.rolname = 'authenticator'
  loop
    if not pg_catalog.has_schema_privilege(v_role, 'door_gate', 'USAGE')
       or not pg_catalog.has_function_privilege(v_role, 'door_gate.pre_request()', 'EXECUTE') then
      raise exception 'role % (switchable by authenticator) cannot run door_gate.pre_request()', v_role;
    end if;
  end loop;
end
$check$;

-- ── PostgREST wiring ───────────────────────────────────────────────────────
-- NOTIFY is delivered at COMMIT, i.e. after the functions above exist.
alter role authenticator set pgrst.db_pre_request = 'door_gate.pre_request';
notify pgrst, 'reload config';

-- ROLLBACK
-- Fast, no deploy:   select door_gate_private.set_mode('off');
-- Full reversal:     supabase/rollbacks/20261026090000_oauth_door_gate_v1.down.sql
--   (two parts, run separately: A unwires PostgREST, B drops the schemas)
-- alter role authenticator reset pgrst.db_pre_request;
-- notify pgrst, 'reload config';
-- drop schema door_gate cascade;
-- drop schema door_gate_private cascade;
