-- ============================================================================
-- 20261026080400 — oauth_product_grants_v1  (OAuth security programme B3)
--
--   Acknowledged RED by route, NOT an approval to auto-merge: a new table with
--   RLS, GRANT/REVOKE, four SECURITY DEFINER functions, and definer reads of
--   GoTrue's auth.oauth_* tables. Draft + needs-human-gate; applied ONLY
--   through Supabase MCP apply_migration after explicit owner approval —
--   never `supabase db push`. DRAFT: not yet owner-approved.
--
-- ----------------------------------------------------------------------------
-- WHY
-- ----------------------------------------------------------------------------
-- Supabase's OAuth 2.1 server issues only OIDC scopes (openid email profile
-- phone offline_access). Its consent record, auth.oauth_consents, holds only
-- those, and the app cannot write it. So "which LabourMarket.ai permissions
-- did this person give this app" has nowhere to live. Without it, every
-- connected app can use every assistant action the person can (PR #2707
-- review, finding B3).
--
-- ----------------------------------------------------------------------------
-- CANONICAL CHECK (doctrine §2)
-- ----------------------------------------------------------------------------
--   auth.oauth_consents        GoTrue's consent (user, client, OIDC scopes,
--                              revoked_at). REUSED as the precondition: a
--                              product grant can be written only while a
--                              GoTrue consent or a live authorization exists.
--                              Not extended: GoTrue owns that schema.
--   platform_capability_grants admin-granted platform capabilities for a
--                              profile (granted_by = an admin). Different
--                              subject: it has no OAuth client and is not the
--                              person's own choice. Not reused.
--   audit_logs                 REUSED for receipts (append-only, immutable
--                              since 20261023132610).
--   NEW: oauth_product_grants — one row per (person, OAuth client): the
--   product scopes that person chose for that client. The companion record
--   to the GoTrue consent, keyed the same way.
--
-- ----------------------------------------------------------------------------
-- AUTHORITY
-- ----------------------------------------------------------------------------
--   authenticated, own session: SELECT own rows (RLS). No INSERT, UPDATE or
--     DELETE on the table. Writes only through grant_/revoke_ functions.
--   authenticated, OAuth client token (JWT carries client_id): NOTHING on the
--     table (the policy excludes it, even for the person's own rows), and the
--     grant, revoke and read functions refuse it. It can call only
--     oauth_door_product_grant_v1(), which returns the grant for THAT client
--     and THAT person, derived from the verified JWT and nothing else.
--   service_role: SELECT (operations counts). anon: nothing.
--
-- Every function: SECURITY DEFINER, search_path pinned, EXECUTE revoked from
-- PUBLIC and anon, granted to authenticated only. None is anon-reachable, so
-- the anon SECDEF allowlist is unchanged.
--
-- A JWT that carries a client_id key at all (valid or not, empty or not) is
-- treated as an OAuth client. Same fail-closed rule as B1a (#2806).
--
-- ----------------------------------------------------------------------------
-- STATES THE DOOR READS (lib/mcp/product-grant.ts)
-- ----------------------------------------------------------------------------
--   no row               legacy consent made before B3 → unscoped; governed by
--                        MCP_SCOPE_ENFORCEMENT (off/log allow, enforce refuses)
--   row, revoked_at null granted → scoped to `scopes`, ALWAYS enforced (B2)
--   row, revoked_at set  revoked → scoped to nothing, ALWAYS enforced
--
-- GDPR: the person's own rows, deleted with the account (ON DELETE CASCADE),
-- registered in the erasure registry; exported in the subject-access bundle
-- (lib/privacy/personal-relations.ts, same PR).
--
-- ROLLBACK: supabase/rollbacks/20261026080400_oauth_product_grants_v1.down.sql
--   (guarded: refuses while active grants exist, because removing them would
--   turn scoped clients back into unscoped ones — a widening).
-- ============================================================================

-- 1. The record.
create table if not exists public.oauth_product_grants (
  user_id               uuid not null references public.profiles(id) on delete cascade,
  client_id             uuid not null,
  scopes                text[] not null default '{}'::text[],
  consent_copy_version  text not null
                        check (consent_copy_version ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  granted_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  revoked_at            timestamptz,
  primary key (user_id, client_id),
  constraint oauth_product_grants_scopes_known check (
    scopes <@ array[
      'read:profile', 'write:profile',
      'read:journal', 'write:journal',
      'read:demand', 'write:demand',
      'read:organization', 'write:organization',
      'messages', 'marketplace'
    ]::text[]
  ),
  constraint oauth_product_grants_scopes_bounded check (cardinality(scopes) <= 10),
  constraint oauth_product_grants_revoked_after_granted check (revoked_at is null or revoked_at >= granted_at)
);

create index if not exists oauth_product_grants_client_idx
  on public.oauth_product_grants (client_id);

alter table public.oauth_product_grants enable row level security;

drop policy if exists oauth_product_grants_select_own on public.oauth_product_grants;
create policy oauth_product_grants_select_own
  on public.oauth_product_grants for select
  to authenticated
  using (
    user_id = auth.uid()
    and not (coalesce(auth.jwt(), '{}'::jsonb) ? 'client_id')
  );

revoke all on public.oauth_product_grants from public;
revoke all on public.oauth_product_grants from anon;
revoke all on public.oauth_product_grants from authenticated;
revoke all on public.oauth_product_grants from service_role;
grant select on public.oauth_product_grants to authenticated;
grant select on public.oauth_product_grants to service_role;

comment on table public.oauth_product_grants is
  'B3: the LabourMarket.ai permissions (product scopes) a person chose for one OAuth client. Companion to auth.oauth_consents. Own rows readable by the person''s own session only (never by an OAuth client token). Written only by grant_oauth_product_scopes_v1 / revoke_oauth_product_grant_v1. Read per request by the MCP door through oauth_door_product_grant_v1.';

-- 2. Grant or change: the consent screen and Connected apps → "Change permissions".
create or replace function public.grant_oauth_product_scopes_v1(
  p_client_id        uuid,
  p_scopes           text[],
  p_copy_version     text,
  p_authorization_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_product constant text[] := array[
    'read:profile', 'write:profile',
    'read:journal', 'write:journal',
    'read:demand', 'write:demand',
    'read:organization', 'write:organization',
    'messages', 'marketplace'
  ];
  v_uid    uuid  := auth.uid();
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_scopes text[];
  v_prev   public.oauth_product_grants%rowtype;
  v_had    boolean;
  v_change text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  -- An OAuth client can never write a grant, not even its own.
  if v_claims ? 'client_id' then
    raise exception 'oauth_client_caller_refused' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'client_required' using errcode = '22023';
  end if;
  if p_copy_version is null or p_copy_version !~ '^[a-z0-9][a-z0-9._-]{0,39}$' then
    raise exception 'invalid_copy_version' using errcode = '22023';
  end if;
  if p_scopes is null or cardinality(p_scopes) > 20 then
    raise exception 'invalid_scopes' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_scopes) s where s is null or not (s = any (c_product))) then
    raise exception 'unknown_scope' using errcode = '22023';
  end if;
  -- Canonical order, duplicates removed.
  v_scopes := array(
    select t.s from unnest(c_product) with ordinality as t(s, ord)
     where t.s = any (p_scopes)
     order by t.ord
  );

  if not exists (
    select 1 from auth.oauth_clients c where c.id = p_client_id and c.deleted_at is null
  ) then
    raise exception 'unknown_client' using errcode = 'P0002';
  end if;

  -- The person must be in a real consent context for THIS client:
  --   from the consent screen: a live authorization GoTrue bound to them;
  --   from Connected apps:     an active (not revoked) GoTrue consent.
  if p_authorization_id is not null then
    if length(p_authorization_id) > 256 or not exists (
      select 1 from auth.oauth_authorizations a
       where a.authorization_id = p_authorization_id
         and a.client_id = p_client_id
         and a.user_id = v_uid
         and a.status in ('pending', 'approved')
         and a.expires_at > now()
    ) then
      raise exception 'no_consent_context' using errcode = '42501';
    end if;
  elsif not exists (
    select 1 from auth.oauth_consents c
     where c.user_id = v_uid and c.client_id = p_client_id and c.revoked_at is null
  ) then
    raise exception 'no_consent_context' using errcode = '42501';
  end if;

  select * into v_prev
    from public.oauth_product_grants g
   where g.user_id = v_uid and g.client_id = p_client_id
   for update;
  v_had := found;

  v_change := case
    when not v_had then 'granted'
    when v_prev.revoked_at is not null then 'regranted'
    when v_prev.scopes = v_scopes then 'confirmed'
    else 'changed'
  end;

  insert into public.oauth_product_grants as g
    (user_id, client_id, scopes, consent_copy_version, granted_at, updated_at, revoked_at)
  values (v_uid, p_client_id, v_scopes, p_copy_version, now(), now(), null)
  on conflict (user_id, client_id) do update
     set scopes               = excluded.scopes,
         consent_copy_version = excluded.consent_copy_version,
         granted_at           = case when g.revoked_at is not null then now() else g.granted_at end,
         updated_at           = now(),
         revoked_at           = null;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (
    v_uid,
    'oauth_product_grant',
    'oauth_client',
    p_client_id,
    jsonb_build_object(
      'channel', 'web',
      'via', case when p_authorization_id is null then 'connected_apps' else 'consent' end,
      'change', v_change,
      'scopes', to_jsonb(v_scopes),
      'previous_scopes', case when v_had and v_prev.revoked_at is null then to_jsonb(v_prev.scopes) else null end,
      'copy_version', p_copy_version
    ),
    now()
  );

  return jsonb_build_object('client_id', p_client_id, 'scopes', to_jsonb(v_scopes), 'change', v_change);
end;
$$;

revoke all on function public.grant_oauth_product_scopes_v1(uuid, text[], text, text) from public;
revoke all on function public.grant_oauth_product_scopes_v1(uuid, text[], text, text) from anon;
grant execute on function public.grant_oauth_product_scopes_v1(uuid, text[], text, text) to authenticated;

comment on function public.grant_oauth_product_scopes_v1(uuid, text[], text, text) is
  'B3: record the product scopes auth.uid() chose for one OAuth client (insert, change or re-grant). Refuses any caller whose JWT carries client_id. Needs a live GoTrue authorization bound to the caller (consent screen) or an active GoTrue consent (Connected apps). Writes an audit_logs receipt.';

-- 3. Revoke: Connected apps → "Disconnect". Runs BEFORE GoTrue's revokeGrant,
--    so the door refuses the client even if the GoTrue call then fails.
create or replace function public.revoke_oauth_product_grant_v1(
  p_client_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid  := auth.uid();
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_prev   public.oauth_product_grants%rowtype;
  v_change text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_claims ? 'client_id' then
    raise exception 'oauth_client_caller_refused' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'client_required' using errcode = '22023';
  end if;

  select * into v_prev
    from public.oauth_product_grants g
   where g.user_id = v_uid and g.client_id = p_client_id
   for update;

  if found then
    if v_prev.revoked_at is not null then
      return jsonb_build_object('client_id', p_client_id, 'change', 'already_revoked');
    end if;
    update public.oauth_product_grants g
       set revoked_at = now(), updated_at = now()
     where g.user_id = v_uid and g.client_id = p_client_id;
    v_change := 'revoked';
  elsif exists (
    select 1 from auth.oauth_consents c where c.user_id = v_uid and c.client_id = p_client_id
  ) then
    -- A legacy consent (made before B3) has no row. Leave a revoked marker so
    -- the client is "scoped to nothing" from now on, never "legacy unscoped".
    insert into public.oauth_product_grants
      (user_id, client_id, scopes, consent_copy_version, granted_at, updated_at, revoked_at)
    values (v_uid, p_client_id, '{}'::text[], 'revoked-without-grant', now(), now(), now());
    v_change := 'revoked_legacy';
  else
    raise exception 'no_such_grant' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (
    v_uid,
    'oauth_product_grant',
    'oauth_client',
    p_client_id,
    jsonb_build_object(
      'channel', 'web',
      'via', 'connected_apps',
      'change', v_change,
      'scopes', '[]'::jsonb,
      'previous_scopes', case when v_change = 'revoked' then to_jsonb(v_prev.scopes) else null end
    ),
    now()
  );

  return jsonb_build_object('client_id', p_client_id, 'change', v_change);
end;
$$;

revoke all on function public.revoke_oauth_product_grant_v1(uuid) from public;
revoke all on function public.revoke_oauth_product_grant_v1(uuid) from anon;
grant execute on function public.revoke_oauth_product_grant_v1(uuid) to authenticated;

comment on function public.revoke_oauth_product_grant_v1(uuid) is
  'B3: mark auth.uid()''s product grant for one OAuth client revoked (idempotent). For a legacy consent with no row, writes a revoked marker. Refuses any caller whose JWT carries client_id. Writes an audit_logs receipt. The caller then revokes the GoTrue grant (sessions + refresh tokens).';

-- 4. Read for the person's own screens (consent page, Connected apps).
--    p_authorization_id: resolve the client of a pending or auto-approved
--    authorization bound to the caller (GoTrue's auto-skip answer carries only
--    a redirect URL, not the client). p_client_id: one client. Neither: every
--    own row.
create or replace function public.read_oauth_product_grant_v1(
  p_client_id        uuid default null,
  p_authorization_id text default null
) returns table (
  client_id            uuid,
  scopes               text[],
  consent_copy_version text,
  granted_at           timestamptz,
  updated_at           timestamptz,
  revoked_at           timestamptz,
  has_grant            boolean,
  has_active_consent   boolean,
  requested_scope      text,
  client_name          text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid    uuid  := auth.uid();
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_client uuid  := p_client_id;
  v_req    text  := null;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_claims ? 'client_id' then
    raise exception 'oauth_client_caller_refused' using errcode = '42501';
  end if;

  if p_authorization_id is not null then
    if length(p_authorization_id) > 256 then
      raise exception 'invalid_authorization' using errcode = '22023';
    end if;
    select a.client_id, a.scope into v_client, v_req
      from auth.oauth_authorizations a
     where a.authorization_id = p_authorization_id
       and a.user_id = v_uid
       and a.status in ('pending', 'approved')
       and a.expires_at > now();
    if not found then
      return;  -- no oracle: foreign, expired and unknown all read as nothing
    end if;
    if p_client_id is not null and p_client_id <> v_client then
      return;
    end if;
  end if;

  if v_client is not null then
    return query
      select v_client,
             coalesce(g.scopes, '{}'::text[]),
             g.consent_copy_version,
             g.granted_at,
             g.updated_at,
             g.revoked_at,
             (g.user_id is not null and g.revoked_at is null),
             exists (select 1 from auth.oauth_consents c
                      where c.user_id = v_uid and c.client_id = v_client and c.revoked_at is null),
             v_req,
             (select k.client_name from auth.oauth_clients k where k.id = v_client)
        from (select 1) one
        left join public.oauth_product_grants g
          on g.user_id = v_uid and g.client_id = v_client;
    return;
  end if;

  return query
    select g.client_id,
           g.scopes,
           g.consent_copy_version,
           g.granted_at,
           g.updated_at,
           g.revoked_at,
           (g.revoked_at is null),
           exists (select 1 from auth.oauth_consents c
                    where c.user_id = v_uid and c.client_id = g.client_id and c.revoked_at is null),
           null::text,
           (select k.client_name from auth.oauth_clients k where k.id = g.client_id)
      from public.oauth_product_grants g
     where g.user_id = v_uid
     order by g.updated_at desc;
end;
$$;

revoke all on function public.read_oauth_product_grant_v1(uuid, text) from public;
revoke all on function public.read_oauth_product_grant_v1(uuid, text) from anon;
grant execute on function public.read_oauth_product_grant_v1(uuid, text) to authenticated;

comment on function public.read_oauth_product_grant_v1(uuid, text) is
  'B3: the caller''s own product grants, for the consent screen and Connected apps; can resolve the client (id, registered name, requested scope) of an authorization bound to the caller. Refuses any caller whose JWT carries client_id.';

-- 5. The MCP door's per-request read. Callable ONLY with an OAuth client
--    token; returns the grant for (auth.uid(), that token's client_id) and
--    nothing else. Takes no argument, so it cannot be pointed at another
--    client or person.
create or replace function public.oauth_door_product_grant_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid  := auth.uid();
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_raw    text  := v_claims->>'client_id';
  v_row    public.oauth_product_grants%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_raw is null
     or v_raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'not_an_oauth_caller' using errcode = '22023';
  end if;

  select * into v_row
    from public.oauth_product_grants g
   where g.user_id = v_uid and g.client_id = v_raw::uuid;

  if not found then
    return jsonb_build_object('state', 'none');
  end if;
  if v_row.revoked_at is not null then
    return jsonb_build_object('state', 'revoked', 'scopes', '[]'::jsonb);
  end if;
  return jsonb_build_object('state', 'granted', 'scopes', to_jsonb(v_row.scopes));
end;
$$;

revoke all on function public.oauth_door_product_grant_v1() from public;
revoke all on function public.oauth_door_product_grant_v1() from anon;
grant execute on function public.oauth_door_product_grant_v1() to authenticated;

comment on function public.oauth_door_product_grant_v1() is
  'B3: for an OAuth client token only — the product grant of (auth.uid(), the token''s client_id): state none (legacy) | granted (scopes) | revoked. Read by /api/mcp once per request. Reveals nothing beyond what that client may do.';

-- 6. GDPR erasure v3 registry: the person's own rows, deleted with the account.
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'oauth_product_grants', 'user_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false,
   'Art. 17(1)(a)/(b): the person''s own permission choices for connected apps; deleted with the account',
   'permission choices only; receipts stay in audit_logs')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;
-- ─────────────────────────────────────────────────────────────────────────

-- ROLLBACK
--   supabase/rollbacks/20261026080400_oauth_product_grants_v1.down.sql:
--   refuses while any active grant exists unless the operator sets
--   lm.b3_rollback_ack = 'widening-accepted' in the same session;
--   then deletes the registry row and drops the four functions and the table.
--   Receipts already in audit_logs stay (immutable).
