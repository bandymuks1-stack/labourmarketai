-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY
--
-- NO `@human-gate-approved` annotation is present ON PURPOSE: the owner has NOT
-- approved this migration. Migration-safety CI is RED by design until the owner
-- reviews it. Application to production happens ONLY after explicit owner OK,
-- via Supabase MCP `apply_migration`. Never `db push`.
--
-- DEPENDS ON `public.company_workers` (migration 0027, itself owner-gated /
-- deferred). Apply 0027 (and, for accepted-booking→engagement, PR #857's
-- 20260723120000) in the same owner-gated batch.
-- ============================================================================
--
-- agency_real_client_bridge v1 — the REAL two-subject agency→client bridge
-- (issue #859). Supersedes PR #858's single-tenant "internal candidate CRM":
-- here the client is a REAL separate company owned by a DIFFERENT profile, the
-- client owns its own customer_request, and the client (not the agency) is the
-- reviewer. The agency can never be proposer + need-owner + reviewer at once.
--
-- TWO REAL SUBJECTS:
--   * Agency A  = companies row, company_type='staffing_agency', owned by A's profile.
--   * Client  B = a DIFFERENT companies row, owned by B's profile.
--
-- FLOW (each step server-authorized, caller-bound):
--   A invites B by email  → B accepts (own JWT email) → active connection
--   → B shares one of ITS OWN customer_requests with the connection
--   → A offers one of ITS OWN active company_workers roster workers for that
--     shared request → B reviews the candidate on B's OWN scouting surface
--     (shortlist / contact / booking are already gated on B owning the demand)
--   → accepted booking stays compatible with PR #857 with no migration here.
--
-- REUSE, NOT PARALLEL: review/contact/booking use the canonical
-- demand_shortlist + conversations + booking_requests (all keyed on the demand
-- B owns). Client review STATE is DERIVED from those (list_agency_offer_progress_v1),
-- never a duplicate review store. No new conversation/booking/project model.
--
-- SECURITY (fail-closed, mirrors applied 20260722160000 grant hygiene):
--   RLS on every table; RPC-only writes; SECURITY DEFINER + pinned search_path;
--   PUBLIC + anon REVOKEd; authenticated-only EXECUTE; caller-bound
--   (auth.uid()); NULL-safe; company/worker ids always ownership-verified
--   server-side (never trusted from client input, never guessed by LIMIT/oldest);
--   curated cross-tenant reads (WHERE = authorization, no existence oracle).
--
-- Rollback: supabase/rollbacks/20260723180000_agency_real_client_bridge_v1.down.sql
-- ════════════════════════════════════════════════════════════════════════

-- ══ 1. CONNECTION: agency_client_connections ════════════════════════════════
create table if not exists public.agency_client_connections (
  id                uuid primary key default gen_random_uuid(),
  agency_company_id uuid not null references public.companies(id) on delete cascade,
  -- NULL until the client accepts and names which of ITS OWN companies joins.
  client_company_id uuid references public.companies(id) on delete cascade,
  invited_email     text not null check (
                      char_length(invited_email) <= 254
                      and invited_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  status            text not null default 'pending'
                      check (status in ('pending', 'active', 'declined', 'revoked')),
  invited_by        uuid not null references public.profiles(id) on delete set null,
  accepted_by       uuid references public.profiles(id) on delete set null,
  revoked_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  accepted_at       timestamptz,
  revoked_at        timestamptz,
  expires_at        timestamptz not null default (now() + interval '14 days'),
  check (client_company_id is null or client_company_id <> agency_company_id)
);

-- At most ONE non-terminal (pending/active) invite per (agency, email).
create unique index if not exists uq_acc_open_invite
  on public.agency_client_connections (agency_company_id, lower(invited_email))
  where status in ('pending', 'active');
-- At most ONE active connection per (agency, client) pair.
create unique index if not exists uq_acc_active_pair
  on public.agency_client_connections (agency_company_id, client_company_id)
  where status = 'active' and client_company_id is not null;
create index if not exists idx_acc_agency  on public.agency_client_connections (agency_company_id);
create index if not exists idx_acc_client  on public.agency_client_connections (client_company_id);
create index if not exists idx_acc_email   on public.agency_client_connections (lower(invited_email));

alter table public.agency_client_connections enable row level security;

-- SELECT: the agency owner, OR the client owner (once linked), OR the invited
-- profile (own JWT email, so a pending invite is visible to its recipient), OR admin.
drop policy if exists agency_client_connections_select on public.agency_client_connections;
create policy agency_client_connections_select on public.agency_client_connections for select
  using (
    public.owns_company(agency_company_id)
    or (client_company_id is not null and public.owns_company(client_company_id))
    or lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_admin()
  );
-- No insert/update/delete policies — writes via the RPCs below only.
grant select on public.agency_client_connections to authenticated;

-- ══ 2. SHARE: agency_client_request_shares ═════════════════════════════════
create table if not exists public.agency_client_request_shares (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.agency_client_connections(id) on delete cascade,
  request_id    uuid not null references public.customer_requests(id) on delete cascade,
  status        text not null default 'active' check (status in ('active', 'revoked')),
  shared_by     uuid not null references public.profiles(id) on delete set null,
  revoked_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
-- One active share per (connection, request).
create unique index if not exists uq_share_active
  on public.agency_client_request_shares (connection_id, request_id)
  where status = 'active';
create index if not exists idx_share_connection on public.agency_client_request_shares (connection_id);
create index if not exists idx_share_request    on public.agency_client_request_shares (request_id);

alter table public.agency_client_request_shares enable row level security;

-- SELECT: the client owner of the connection, OR the agency owner of the
-- connection (so the agency sees what was shared with it), OR admin.
drop policy if exists agency_client_request_shares_select on public.agency_client_request_shares;
create policy agency_client_request_shares_select on public.agency_client_request_shares for select
  using (
    exists (
      select 1 from public.agency_client_connections c
      where c.id = connection_id
        and (public.owns_company(c.agency_company_id)
             or (c.client_company_id is not null and public.owns_company(c.client_company_id)))
    )
    or public.is_admin()
  );
grant select on public.agency_client_request_shares to authenticated;

-- ══ 3. OFFER: agency_candidate_offers (two-subject) ════════════════════════
create table if not exists public.agency_candidate_offers (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references public.agency_client_connections(id) on delete cascade,
  request_share_id  uuid not null references public.agency_client_request_shares(id) on delete cascade,
  agency_company_id uuid not null references public.companies(id) on delete cascade,
  client_company_id uuid not null references public.companies(id) on delete cascade,
  request_id        uuid not null references public.customer_requests(id) on delete cascade,
  worker_id         uuid not null references public.workers(id) on delete cascade,
  status            text not null default 'offered' check (status in ('offered', 'withdrawn')),
  note              text check (note is null or char_length(note) <= 500),
  created_by        uuid references public.profiles(id) on delete set null,
  withdrawn_by      uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  withdrawn_at      timestamptz,
  updated_at        timestamptz not null default now()
);
-- One active offer per (agency, request, worker).
create unique index if not exists uq_offer_active
  on public.agency_candidate_offers (agency_company_id, request_id, worker_id)
  where status = 'offered';
create index if not exists idx_offer_agency  on public.agency_candidate_offers (agency_company_id);
create index if not exists idx_offer_client  on public.agency_candidate_offers (client_company_id);
create index if not exists idx_offer_request on public.agency_candidate_offers (request_id);

drop trigger if exists trg_agency_candidate_offers_updated_at on public.agency_candidate_offers;
create trigger trg_agency_candidate_offers_updated_at
  before update on public.agency_candidate_offers
  for each row execute function public.set_updated_at();

alter table public.agency_candidate_offers enable row level security;

-- SELECT: the offering agency owner, OR the client owner (the request owner),
-- OR admin. A worker never reads the offer row; the client contacts the worker
-- through the canonical anonymized scouting/conversation path.
drop policy if exists agency_candidate_offers_select on public.agency_candidate_offers;
create policy agency_candidate_offers_select on public.agency_candidate_offers for select
  using (
    public.owns_company(agency_company_id)
    or public.owns_company(client_company_id)
    or public.is_admin()
  );
grant select on public.agency_candidate_offers to authenticated;

-- ══ 4. CONNECTION RPCs ═════════════════════════════════════════════════════
create or replace function public.create_agency_client_connection_v1(
  p_agency_company_id uuid,
  p_invited_email     text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_invited_email, '')));
  v_id    uuid;
  v_ctype text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- Caller must OWN the agency company, and it must be a staffing_agency.
  select c.company_type into v_ctype from public.companies c
   where c.id = p_agency_company_id and c.profile_id = v_uid;
  if v_ctype is null then raise exception 'not_owner' using errcode = '42501'; end if;
  if v_ctype <> 'staffing_agency' then raise exception 'not_agency' using errcode = '42501'; end if;
  if v_email = '' or v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  -- Idempotent: reuse an existing non-terminal invite for this (agency, email).
  select id into v_id from public.agency_client_connections
   where agency_company_id = p_agency_company_id
     and lower(invited_email) = v_email
     and status in ('pending', 'active');
  if v_id is not null then return v_id; end if;

  insert into public.agency_client_connections (agency_company_id, invited_email, invited_by)
  values (p_agency_company_id, v_email, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.accept_agency_client_connection_v1(
  p_connection_id     uuid,
  p_client_company_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_agency uuid;
  v_status text;
  v_exp    timestamptz;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- The caller must OWN the client company they are joining as.
  if not public.owns_company(p_client_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  -- The invite must be addressed to the caller's OWN verified JWT email.
  -- A caller whose email does not match gets 'not_found' — identical to a
  -- non-existent invite, so no one can probe another's invitation.
  select agency_company_id, status, expires_at
    into v_agency, v_status, v_exp
    from public.agency_client_connections
   where id = p_connection_id
     and lower(invited_email) = v_email
   for update;
  if not found then return 'not_found'; end if;
  if v_agency = p_client_company_id then raise exception 'same_company' using errcode = '22023'; end if;
  if v_status = 'active' then return 'already_active'; end if;
  if v_status <> 'pending' then return 'not_pending'; end if;
  if v_exp < now() then
    update public.agency_client_connections set status = 'declined' where id = p_connection_id;
    return 'expired';
  end if;

  update public.agency_client_connections
     set status = 'active', client_company_id = p_client_company_id,
         accepted_by = v_uid, accepted_at = now()
   where id = p_connection_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'agency_client_connection_accepted', 'agency_client_connections',
          p_connection_id, jsonb_build_object('client_company_id', p_client_company_id));
  return 'accepted';
end;
$$;

create or replace function public.decline_agency_client_connection_v1(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_upd   int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  update public.agency_client_connections
     set status = 'declined', revoked_by = v_uid, revoked_at = now()
   where id = p_connection_id
     and lower(invited_email) = v_email
     and status = 'pending';
  get diagnostics v_upd = row_count;
  return case when v_upd > 0 then 'declined' else 'not_found' end;
end;
$$;

create or replace function public.revoke_agency_client_connection_v1(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_upd int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- Either side (agency owner or client owner) may revoke a pending/active link.
  -- Soft revoke: history is kept; shares/offers stay in the audit but the
  -- revoked connection grants no new rights (share/offer RPCs re-check 'active').
  update public.agency_client_connections c
     set status = 'revoked', revoked_by = v_uid, revoked_at = now()
   where c.id = p_connection_id
     and c.status in ('pending', 'active')
     and (public.owns_company(c.agency_company_id)
          or (c.client_company_id is not null and public.owns_company(c.client_company_id)));
  get diagnostics v_upd = row_count;
  if v_upd = 0 then return 'not_found'; end if;
  -- Revoking also revokes the client's active shares on this connection
  -- (no new candidate can be offered once the link is gone).
  update public.agency_client_request_shares
     set status = 'revoked', revoked_by = v_uid, revoked_at = now()
   where connection_id = p_connection_id and status = 'active';
  return 'revoked';
end;
$$;

-- ══ 5. SHARE RPCs ══════════════════════════════════════════════════════════
create or replace function public.share_request_with_agency_v1(
  p_connection_id uuid,
  p_request_id    uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_client uuid;
  v_status text;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- The connection must be ACTIVE and the caller must own its client company.
  select client_company_id, status into v_client, v_status
    from public.agency_client_connections where id = p_connection_id;
  if v_client is null or v_status <> 'active' then
    raise exception 'connection_not_active' using errcode = '42501';
  end if;
  if not public.owns_company(v_client) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  -- The request must be the CALLER'S OWN row (only own rows are probed —
  -- no foreign-request-by-uuid access, no existence oracle).
  if not exists (
    select 1 from public.customer_requests r
    where r.id = p_request_id and r.profile_id = v_uid
  ) then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  -- Idempotent: reuse an existing active share.
  select id into v_id from public.agency_client_request_shares
   where connection_id = p_connection_id and request_id = p_request_id and status = 'active';
  if v_id is not null then return v_id; end if;

  insert into public.agency_client_request_shares (connection_id, request_id, shared_by)
  values (p_connection_id, p_request_id, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.unshare_request_v1(p_share_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_upd int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- Only the client owner of the share's connection may revoke it.
  update public.agency_client_request_shares s
     set status = 'revoked', revoked_by = v_uid, revoked_at = now()
    from public.agency_client_connections c
   where s.id = p_share_id
     and c.id = s.connection_id
     and s.status = 'active'
     and c.client_company_id is not null
     and public.owns_company(c.client_company_id);
  get diagnostics v_upd = row_count;
  return case when v_upd > 0 then 'unshared' else 'not_found' end;
end;
$$;

-- ══ 6. OFFER RPCs ══════════════════════════════════════════════════════════
create or replace function public.submit_agency_candidate_offer_v1(
  p_request_share_id uuid,
  p_worker_id        uuid,
  p_note             text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_conn      uuid;
  v_agency    uuid;
  v_client    uuid;
  v_request   uuid;
  v_id        uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  -- Resolve the connection + request from the SHARE (client cannot forge these).
  -- Everything must be live at submit time.
  select c.id, c.agency_company_id, c.client_company_id, s.request_id
    into v_conn, v_agency, v_client, v_request
    from public.agency_client_request_shares s
    join public.agency_client_connections c on c.id = s.connection_id
   where s.id = p_request_share_id
     and s.status = 'active'
     and c.status = 'active';
  if v_conn is null then raise exception 'share_not_active' using errcode = '42501'; end if;

  -- The caller must OWN the agency company, and it must be a staffing_agency.
  if not public.owns_company(v_agency) then raise exception 'not_owner' using errcode = '42501'; end if;
  if not exists (select 1 from public.companies c where c.id = v_agency and c.company_type = 'staffing_agency') then
    raise exception 'not_agency' using errcode = '42501';
  end if;

  -- The worker must be an ACTIVE roster member of THAT agency company.
  if not exists (
    select 1 from public.company_workers cw
    where cw.company_id = v_agency and cw.worker_id = p_worker_id and cw.status = 'active'
  ) then
    raise exception 'worker_not_on_roster' using errcode = '42501';
  end if;

  -- Idempotent: re-affirm an existing active offer, never duplicate.
  insert into public.agency_candidate_offers
    (connection_id, request_share_id, agency_company_id, client_company_id,
     request_id, worker_id, status, note, created_by)
  values
    (v_conn, p_request_share_id, v_agency, v_client, v_request, p_worker_id, 'offered', v_note, v_uid)
  on conflict (agency_company_id, request_id, worker_id) where (status = 'offered')
  do update set note = coalesce(excluded.note, public.agency_candidate_offers.note), updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.withdraw_agency_candidate_offer_v1(p_offer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_upd int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- Only the offering agency owner may withdraw. The client never withdraws an
  -- agency offer (it rejects via its own demand_shortlist not_fit instead).
  update public.agency_candidate_offers o
     set status = 'withdrawn', withdrawn_by = v_uid, withdrawn_at = now(), updated_at = now()
   where o.id = p_offer_id
     and o.status = 'offered'
     and public.owns_company(o.agency_company_id);
  get diagnostics v_upd = row_count;
  return v_upd > 0;
end;
$$;

-- ══ 7. CURATED CROSS-TENANT READS (projection = the privacy boundary) ══════

-- Agency-facing: the requests a connected CLIENT has explicitly shared with the
-- caller's agency. Curated columns only — never the client's contact/PII.
create or replace function public.list_shared_requests_for_agency_v1()
returns table (
  share_id      uuid,
  connection_id uuid,
  request_id    uuid,
  title         text,
  role_text     text,
  country       text,
  status        text,
  shared_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.connection_id, s.request_id,
         r.title, r.role_or_work_type, r.country, r.status, s.created_at
    from public.agency_client_request_shares s
    join public.agency_client_connections c on c.id = s.connection_id
    join public.customer_requests r on r.id = s.request_id
   where s.status = 'active'
     and c.status = 'active'
     and public.owns_company(c.agency_company_id)  -- caller = agency owner
   order by s.created_at desc
   limit 200;
$$;

-- Agency-facing: the caller-agency's own offers + the DERIVED client review
-- stage (computed from the canonical demand_shortlist / conversations /
-- booking_requests owned by the client — never a duplicate review store, never
-- client PII). Stages: offered | reviewed | contacted | rejected |
-- booking_started | accepted.
create or replace function public.list_agency_offer_progress_v1()
returns table (
  offer_id     uuid,
  request_id   uuid,
  worker_id    uuid,
  offer_status text,
  review_stage text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.request_id, o.worker_id, o.status,
    case
      when exists (select 1 from public.booking_requests b
                    where b.request_id = o.request_id and b.worker_id = o.worker_id
                      and b.status = 'accepted') then 'accepted'
      when exists (select 1 from public.booking_requests b
                    where b.request_id = o.request_id and b.worker_id = o.worker_id
                      and b.status = 'proposed') then 'booking_started'
      when exists (select 1 from public.demand_shortlist d
                    where d.request_id = o.request_id and d.worker_id = o.worker_id
                      and d.owner_id = (select r.profile_id from public.customer_requests r where r.id = o.request_id)
                      and d.status = 'not_fit') then 'rejected'
      when exists (select 1 from public.conversations cv
                    join public.workers w on w.id = o.worker_id
                    join public.conversation_participants cp
                      on cp.conversation_id = cv.id and cp.profile_id = w.profile_id
                    where cv.source_type = 'scouting' and cv.source_id = o.request_id) then 'contacted'
      when exists (select 1 from public.demand_shortlist d
                    where d.request_id = o.request_id and d.worker_id = o.worker_id
                      and d.owner_id = (select r.profile_id from public.customer_requests r where r.id = o.request_id)) then 'reviewed'
      else 'offered'
    end as review_stage,
    o.created_at
    from public.agency_candidate_offers o
   where public.owns_company(o.agency_company_id)  -- caller = agency owner
   order by o.created_at desc
   limit 200;
$$;

-- Client-facing: for one of the CALLER'S OWN requests, the worker ids an agency
-- has actively offered — so the client's OWN scouting surface can render them as
-- candidates (the client then uses the canonical anonymized shortlist / contact
-- / booking controls it already owns). Returns only ids + the agency label.
create or replace function public.list_agency_offered_candidates_for_request_v1(p_request_id uuid)
returns table (
  offer_id     uuid,
  worker_id    uuid,
  agency_name  text,
  note         text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.worker_id, coalesce(ac.display_name, ac.legal_name), o.note, o.created_at
    from public.agency_candidate_offers o
    join public.companies ac on ac.id = o.agency_company_id
   where o.request_id = p_request_id
     and o.status = 'offered'
     and exists (select 1 from public.customer_requests r
                  where r.id = o.request_id and r.profile_id = auth.uid())  -- caller owns the demand
   order by o.created_at desc
   limit 100;
$$;

-- ══ 8. GRANT HYGIENE (mirror applied 20260722160000: revoke public+anon) ═══
do $$
declare fn text;
begin
  for fn in
    select unnest(array[
      'create_agency_client_connection_v1(uuid, text)',
      'accept_agency_client_connection_v1(uuid, uuid)',
      'decline_agency_client_connection_v1(uuid)',
      'revoke_agency_client_connection_v1(uuid)',
      'share_request_with_agency_v1(uuid, uuid)',
      'unshare_request_v1(uuid)',
      'submit_agency_candidate_offer_v1(uuid, uuid, text)',
      'withdraw_agency_candidate_offer_v1(uuid)',
      'list_shared_requests_for_agency_v1()',
      'list_agency_offer_progress_v1()',
      'list_agency_offered_candidates_for_request_v1(uuid)'
    ])
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('revoke all on function public.%s from anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;

-- ROLLBACK: supabase/rollbacks/20260723180000_agency_real_client_bridge_v1.down.sql
