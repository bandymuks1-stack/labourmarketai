-- @human-gate-approved  (acknowledgement only: RED class — new tables, SECURITY DEFINER functions, REVOKE/GRANT, function-body DML; draft + needs-human-gate, OWNER APPLIES — NOT applied by the agent)
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET. Draft PR #3353 + needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration,
-- AFTER 20261114235900_agency_placement_terms_v1 (this file replaces its respond_agency_candidate_offer_v2).
-- ============================================================================
-- 20261118100000_agency_partnerships_commissions_v1
--
-- SAFETY CLASS: RED (new tables, SECURITY DEFINER functions, grants, a commercial split recorded
-- between two agencies).
-- Rollback: supabase/rollbacks/20261118100000_agency_partnerships_commissions_v1.down.sql
--
-- REGISTER 4.30 (owner decision 2026-11-18): AGENCY COMMISSIONS AND AGENCY-TO-AGENCY COOPERATION.
-- General for every staffing agency; no agency, amount, share or text is named here.
--
-- THE CHAIN STAYS THE EXISTING ONE. A client shares its own need with ITS agency (the LEAD) over
-- agency_client_connections → agency_client_request_shares. The client reviews candidates on its own
-- scouting page and decides with respond_agency_candidate_offer_v2; the booking, the worker's accept
-- and the engagement are unchanged. This migration adds one step in the middle:
--
-- 1. agency_partnerships. The lead agency invites another agency by e-mail (the same pattern as a
--    client connection) and states the PARTNER'S SHARE of the lead's placement fee, in percent. The
--    invited agency's owner accepts it for one of the agencies they govern, or declines. Either side
--    may end it. The share is fixed on the row: a different share is a new partnership, never an
--    edit, so the share a placement was made under stays readable.
--
-- 2. agency_partner_request_shares. While a partnership is active, the lead may pass ONE of the
--    client needs shared with it to the partner. The partner reads only what the lead's own list
--    reads of that need (title, role, country, status) — never the client's identity. Revoking it,
--    ending the partnership, or the client unsharing / ending its connection stops it, and open
--    offers made through it are withdrawn.
--
-- 3. submit_partner_candidate_offer_v1. The partner offers a worker from ITS OWN active roster on a
--    need passed to it. The offer is an ordinary agency_candidate_offers row on the CLIENT'S share and
--    connection (so the client sees it, decides it and books it exactly as today, and every existing
--    withdrawal applies), with agency_company_id = the partner (whose roster the worker is on, as every
--    existing reader assumes) and partner_share_id naming the step it came through.
--
-- 4. respond_agency_candidate_offer_v2 (replaced). For an offer that came through a partner, the
--    term the client must accept is the LEAD's current placement term — the client's agreement is
--    with the agency it chose. A partner offer whose partnership or partner share is no longer active
--    cannot be accepted. Everything else is the 20261114235900 v2, unchanged.
--
-- 5. list_agency_commissions_v1. COMMISSION LOGIC, READ-ONLY. For each accepted offer carrying an
--    accepted placement term, the caller's agency sees its own role and part:
--      direct  — its own candidate on its own client: 100 % of its term;
--      lead    — a partner's candidate on its client: (100 − partner share) % of its term;
--      partner — its candidate on the lead's client: partner share % of the lead's term.
--    The amount is DUE only on an actual placement: the worker accepted the booking and an engagement
--    started (the chain list_agency_placements_v1 reads). Before that it is pending; after a declined
--    or withdrawn booking it is not due. Nothing is charged, invoiced or paid by this migration.
--
-- 6. Reads for each side: list_agency_partnerships_v1 (both sides and invitations addressed to the
--    caller), list_partner_shared_requests_v1 (the partner), list_partner_offers_for_lead_v1 (the lead
--    sees its partners' offers and their status, without the worker's identity — no more than the
--    client sees before a booking is accepted).
--
-- WHAT IS NOT DONE. No APPLIED table, policy, trigger or function is altered or dropped.
-- agency_candidate_offers gains one nullable column. Replaced here are only this PR's own, unapplied
-- objects from 20261114235900: respond_agency_candidate_offer_v2, and agency_placement_terms_select
-- (which gains one arm: the offering agency may read a term accepted on its own offer, so a partner
-- can read the lead's term its placement was made under). No row is written by the migration
-- itself. No money moves.
--
-- @plan-cache-proof: n/a — the indexes are uniqueness rules (one open partnership per pair, one active pass per need and partnership) and lookups by their own foreign keys; no existing RPC filters by them
-- ============================================================================

-- ── 1. The partnership ─────────────────────────────────────────────────────
create table if not exists public.agency_partnerships (
  id                    uuid primary key default gen_random_uuid(),
  lead_company_id       uuid not null references public.companies(id) on delete cascade,
  partner_company_id    uuid references public.companies(id) on delete cascade,
  invited_email         text not null check (
                          char_length(invited_email) <= 254
                          and invited_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  partner_share_percent numeric(5, 2) not null check (partner_share_percent > 0 and partner_share_percent < 100),
  status                text not null default 'pending'
                          check (status in ('pending', 'active', 'declined', 'ended')),
  invited_by            uuid references public.profiles(id) on delete set null,
  decided_by            uuid references public.profiles(id) on delete set null,
  ended_by              uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  decided_at            timestamptz,
  ended_at              timestamptz,
  expires_at            timestamptz not null default (now() + interval '14 days'),
  check (partner_company_id is null or partner_company_id <> lead_company_id),
  check (status = 'pending' or status = 'declined' or partner_company_id is not null)
);

comment on table public.agency_partnerships is
  'Agency-to-agency cooperation (register 4.30): the lead agency passes client needs to a partner agency, which offers its own roster workers; the partner''s share of the lead''s placement fee is fixed on the row. Written only through the *_agency_partnership_v1 functions.';

create unique index if not exists agency_partnerships_one_open_invite
  on public.agency_partnerships (lead_company_id, lower(invited_email)) where status = 'pending';
create unique index if not exists agency_partnerships_one_active_pair
  on public.agency_partnerships (lead_company_id, partner_company_id) where status = 'active';
create index if not exists agency_partnerships_partner on public.agency_partnerships (partner_company_id);

alter table public.agency_partnerships enable row level security;
alter table public.agency_partnerships force row level security;

drop policy if exists agency_partnerships_select on public.agency_partnerships;
create policy agency_partnerships_select on public.agency_partnerships
  for select to authenticated
  using (
    public.owns_company(lead_company_id)
    or (partner_company_id is not null and public.owns_company(partner_company_id))
    or public.is_admin()
  );

revoke all on public.agency_partnerships from public;
revoke all on public.agency_partnerships from anon;
revoke all on public.agency_partnerships from authenticated;
grant select on public.agency_partnerships to authenticated;

-- ── 2. A client need passed to the partner ─────────────────────────────────
create table if not exists public.agency_partner_request_shares (
  id               uuid primary key default gen_random_uuid(),
  partnership_id   uuid not null references public.agency_partnerships(id) on delete cascade,
  client_share_id  uuid not null references public.agency_client_request_shares(id) on delete cascade,
  status           text not null default 'active' check (status in ('active', 'revoked')),
  shared_by        uuid references public.profiles(id) on delete set null,
  revoked_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz
);

comment on table public.agency_partner_request_shares is
  'A client need (an active agency_client_request_shares row of the lead) passed by the lead agency to an active partner (register 4.30). Written only through share/unshare_request_with_partner_v1.';

create unique index if not exists agency_partner_request_shares_one_active
  on public.agency_partner_request_shares (partnership_id, client_share_id) where status = 'active';
create index if not exists agency_partner_request_shares_client_share
  on public.agency_partner_request_shares (client_share_id);

alter table public.agency_partner_request_shares enable row level security;
alter table public.agency_partner_request_shares force row level security;

drop policy if exists agency_partner_request_shares_select on public.agency_partner_request_shares;
create policy agency_partner_request_shares_select on public.agency_partner_request_shares
  for select to authenticated
  using (
    exists (
      select 1 from public.agency_partnerships p
       where p.id = agency_partner_request_shares.partnership_id
         and (public.owns_company(p.lead_company_id)
              or (p.partner_company_id is not null and public.owns_company(p.partner_company_id)))
    )
    or public.is_admin()
  );

revoke all on public.agency_partner_request_shares from public;
revoke all on public.agency_partner_request_shares from anon;
revoke all on public.agency_partner_request_shares from authenticated;
grant select on public.agency_partner_request_shares to authenticated;

-- ── 3. The offer remembers the step it came through ────────────────────────
alter table public.agency_candidate_offers
  add column if not exists partner_share_id uuid
    references public.agency_partner_request_shares(id) on delete set null;

comment on column public.agency_candidate_offers.partner_share_id is
  'Set when a partner agency offered this candidate on a need the lead agency passed to it (submit_partner_candidate_offer_v1). agency_company_id is then the partner; the client''s agreement is the lead''s placement term.';

create index if not exists agency_candidate_offers_partner_share
  on public.agency_candidate_offers (partner_share_id) where partner_share_id is not null;

-- ── 4. Partnership: invite, accept, decline, end ───────────────────────────
create or replace function public.invite_agency_partner_v1(
  p_lead_company_id       uuid,
  p_invited_email         text,
  p_partner_share_percent numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce(p_invited_email, '')));
  v_id    uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not public.owns_company(p_lead_company_id) then raise exception 'not_owner' using errcode = '42501'; end if;
  if not public.company_acts_as_agency(p_lead_company_id) then raise exception 'not_agency' using errcode = '42501'; end if;
  if v_email = '' or char_length(v_email) > 254
     or v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if p_partner_share_percent is null or p_partner_share_percent <= 0 or p_partner_share_percent >= 100
     or p_partner_share_percent <> round(p_partner_share_percent, 2) then
    raise exception 'invalid_share' using errcode = '22023';
  end if;
  if exists (select 1 from public.agency_partnerships p
              where p.lead_company_id = p_lead_company_id and lower(p.invited_email) = v_email
                and p.status = 'pending' and p.expires_at > now()) then
    raise exception 'already_invited' using errcode = '23505';
  end if;
  -- A lapsed invitation no longer blocks a new one.
  update public.agency_partnerships
     set status = 'declined', decided_at = now()
   where lead_company_id = p_lead_company_id and lower(invited_email) = v_email
     and status = 'pending' and expires_at <= now();

  insert into public.agency_partnerships (lead_company_id, invited_email, partner_share_percent, invited_by)
  values (p_lead_company_id, v_email, p_partner_share_percent, v_uid)
  returning id into v_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'agency_partnership_invited', 'agency_partnerships', v_id,
          jsonb_build_object('lead_company_id', p_lead_company_id, 'partner_share_percent', p_partner_share_percent));
  return v_id;
end;
$$;

create or replace function public.accept_agency_partnership_v1(
  p_partnership_id     uuid,
  p_partner_company_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v_row   public.agency_partnerships%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into v_row from public.agency_partnerships where id = p_partnership_id for update;
  -- Only the addressee of a live invitation; anyone else learns nothing.
  if v_row.id is null or v_row.status <> 'pending' or v_row.expires_at <= now()
     or v_email = '' or lower(v_row.invited_email) <> v_email then
    raise exception 'invitation_not_found' using errcode = '42501';
  end if;
  if not public.owns_company(p_partner_company_id) then raise exception 'not_owner' using errcode = '42501'; end if;
  if not public.company_acts_as_agency(p_partner_company_id) then raise exception 'not_agency' using errcode = '42501'; end if;
  if p_partner_company_id = v_row.lead_company_id then raise exception 'same_agency' using errcode = '22023'; end if;
  if exists (select 1 from public.agency_partnerships p
              where p.lead_company_id = v_row.lead_company_id and p.partner_company_id = p_partner_company_id
                and p.status = 'active') then
    raise exception 'already_partners' using errcode = '23505';
  end if;

  update public.agency_partnerships
     set status = 'active', partner_company_id = p_partner_company_id, decided_by = v_uid, decided_at = now()
   where id = p_partnership_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'agency_partnership_accepted', 'agency_partnerships', p_partnership_id,
          jsonb_build_object('lead_company_id', v_row.lead_company_id, 'partner_company_id', p_partner_company_id,
                             'partner_share_percent', v_row.partner_share_percent));
  return p_partnership_id;
end;
$$;

create or replace function public.decline_agency_partnership_v1(p_partnership_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v_row   public.agency_partnerships%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into v_row from public.agency_partnerships where id = p_partnership_id for update;
  if v_row.id is null or v_row.status <> 'pending'
     or v_email = '' or lower(v_row.invited_email) <> v_email then
    raise exception 'invitation_not_found' using errcode = '42501';
  end if;
  update public.agency_partnerships
     set status = 'declined', decided_by = v_uid, decided_at = now()
   where id = p_partnership_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'agency_partnership_declined', 'agency_partnerships', p_partnership_id,
          jsonb_build_object('lead_company_id', v_row.lead_company_id));
  return p_partnership_id;
end;
$$;

-- Either side ends it (the lead may also withdraw a pending invitation). Ending revokes every need
-- passed through it and withdraws the open offers made on them; accepted offers and their
-- placements are history and stay.
create or replace function public.end_agency_partnership_v1(p_partnership_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.agency_partnerships%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into v_row from public.agency_partnerships where id = p_partnership_id for update;
  if v_row.id is null
     or not (public.owns_company(v_row.lead_company_id)
             or (v_row.partner_company_id is not null and public.owns_company(v_row.partner_company_id))) then
    raise exception 'partnership_not_found' using errcode = '42501';
  end if;
  if v_row.status not in ('pending', 'active') then raise exception 'partnership_not_open' using errcode = '22023'; end if;

  update public.agency_partnerships
     set status = 'ended', ended_by = v_uid, ended_at = now()
   where id = p_partnership_id;

  update public.agency_candidate_offers o
     set status = 'withdrawn', withdrawn_by = v_uid, withdrawn_at = now()
   where o.status = 'offered'
     and o.partner_share_id in (select s.id from public.agency_partner_request_shares s
                                 where s.partnership_id = p_partnership_id);
  update public.agency_partner_request_shares
     set status = 'revoked', revoked_by = v_uid, revoked_at = now()
   where partnership_id = p_partnership_id and status = 'active';

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'agency_partnership_ended', 'agency_partnerships', p_partnership_id,
          jsonb_build_object('lead_company_id', v_row.lead_company_id, 'partner_company_id', v_row.partner_company_id));
  return p_partnership_id;
end;
$$;

-- ── 5. The lead passes a client need to the partner, or takes it back ──────
create or replace function public.share_request_with_partner_v1(
  p_partnership_id  uuid,
  p_client_share_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_lead uuid;
  v_id   uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select p.lead_company_id into v_lead
    from public.agency_partnerships p
   where p.id = p_partnership_id and p.status = 'active';
  if v_lead is null or not public.owns_company(v_lead) then
    raise exception 'partnership_not_active' using errcode = '42501';
  end if;
  -- The need must be shared with THIS lead, live, by its client.
  if not exists (
    select 1 from public.agency_client_request_shares s
      join public.agency_client_connections c on c.id = s.connection_id
     where s.id = p_client_share_id and s.status = 'active'
       and c.status = 'active' and c.agency_company_id = v_lead
  ) then
    raise exception 'share_not_active' using errcode = '42501';
  end if;

  insert into public.agency_partner_request_shares (partnership_id, client_share_id, shared_by)
  values (p_partnership_id, p_client_share_id, v_uid)
  on conflict (partnership_id, client_share_id) where (status = 'active') do nothing
  returning id into v_id;
  if v_id is null then
    select s.id into v_id from public.agency_partner_request_shares s
     where s.partnership_id = p_partnership_id and s.client_share_id = p_client_share_id and s.status = 'active';
  end if;
  return v_id;
end;
$$;

create or replace function public.unshare_request_with_partner_v1(p_partner_share_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_lead uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select p.lead_company_id into v_lead
    from public.agency_partner_request_shares s
    join public.agency_partnerships p on p.id = s.partnership_id
   where s.id = p_partner_share_id and s.status = 'active';
  if v_lead is null or not public.owns_company(v_lead) then
    raise exception 'partner_share_not_found' using errcode = '42501';
  end if;
  update public.agency_candidate_offers
     set status = 'withdrawn', withdrawn_by = v_uid, withdrawn_at = now()
   where partner_share_id = p_partner_share_id and status = 'offered';
  update public.agency_partner_request_shares
     set status = 'revoked', revoked_by = v_uid, revoked_at = now()
   where id = p_partner_share_id;
  return p_partner_share_id;
end;
$$;

-- ── 6. The partner offers its own roster worker ────────────────────────────
create or replace function public.submit_partner_candidate_offer_v1(
  p_partner_share_id uuid,
  p_worker_id        uuid,
  p_note             text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_partner uuid;
  v_share   uuid;
  v_conn    uuid;
  v_client  uuid;
  v_request uuid;
  v_id      uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'invalid_note' using errcode = '22023'; end if;

  -- Everything must be live: the pass, the partnership, the client's share and its connection.
  select p.partner_company_id, s.id, c.id, c.client_company_id, s.request_id
    into v_partner, v_share, v_conn, v_client, v_request
    from public.agency_partner_request_shares ps
    join public.agency_partnerships p on p.id = ps.partnership_id
    join public.agency_client_request_shares s on s.id = ps.client_share_id
    join public.agency_client_connections c on c.id = s.connection_id
   where ps.id = p_partner_share_id and ps.status = 'active'
     and p.status = 'active' and s.status = 'active' and c.status = 'active'
     and c.agency_company_id = p.lead_company_id;
  if v_partner is null then raise exception 'share_not_active' using errcode = '42501'; end if;
  if not public.owns_company(v_partner) then raise exception 'not_owner' using errcode = '42501'; end if;
  if not public.company_acts_as_agency(v_partner) then raise exception 'not_agency' using errcode = '42501'; end if;

  -- The worker must be an ACTIVE member of the PARTNER's own roster.
  if not exists (select 1 from public.company_workers cw
                  where cw.company_id = v_partner and cw.worker_id = p_worker_id and cw.status = 'active') then
    raise exception 'worker_not_on_roster' using errcode = '42501';
  end if;

  insert into public.agency_candidate_offers
    (connection_id, request_share_id, agency_company_id, client_company_id,
     request_id, worker_id, status, note, created_by, partner_share_id)
  values
    (v_conn, v_share, v_partner, v_client, v_request, p_worker_id, 'offered', v_note, v_uid, p_partner_share_id)
  on conflict (agency_company_id, request_id, worker_id) where (status = 'offered')
  do update set connection_id     = excluded.connection_id,
                request_share_id  = excluded.request_share_id,
                client_company_id = excluded.client_company_id,
                partner_share_id  = excluded.partner_share_id,
                note              = coalesce(excluded.note, public.agency_candidate_offers.note),
                updated_at        = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- ── 7. The employer's decision: a partner's candidate carries the LEAD's term ─
create or replace function public.respond_agency_candidate_offer_v2(
  p_offer_id         uuid,
  p_decision         text,
  p_note             text default null,
  p_accepted_term_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_offer     public.agency_candidate_offers%rowtype;
  v_term_from uuid;
  v_term      uuid;
  v_result    uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select * into v_offer from public.agency_candidate_offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer_not_found' using errcode = '42501'; end if;
  if not public.owns_company(v_offer.client_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  -- Whose term: the offering agency's, or — for a partner's candidate — the lead's.
  v_term_from := v_offer.agency_company_id;
  if v_offer.partner_share_id is not null then
    select p.lead_company_id into v_term_from
      from public.agency_partner_request_shares ps
      join public.agency_partnerships p on p.id = ps.partnership_id
     where ps.id = v_offer.partner_share_id
       and (p_decision <> 'accepted' or (ps.status = 'active' and p.status = 'active'));
    if v_term_from is null then raise exception 'partnership_not_active' using errcode = 'P0004'; end if;
  end if;

  if p_decision = 'accepted' then
    select t.id into v_term
      from public.agency_placement_terms t
     where t.company_id = v_term_from and t.retired_at is null;
    -- The employer must accept the term they were shown, and only that one:
    -- a term changed since the page was read is refused, never assumed.
    if v_term is not null and p_accepted_term_id is distinct from v_term then
      raise exception 'placement_term_not_accepted' using errcode = 'P0004';
    end if;
  end if;

  -- The decision and the booking are v1's, unchanged.
  v_result := public.respond_agency_candidate_offer_v1(p_offer_id, p_decision, p_note);

  if p_decision = 'accepted' and v_term is not null then
    update public.agency_candidate_offers
       set accepted_placement_term_id = v_term,
           placement_term_accepted_at = now()
     where id = p_offer_id;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (v_uid, 'agency_placement_term_accepted', 'agency_candidate_offers', p_offer_id,
      jsonb_build_object('term_id', v_term,
                         'term_company_id', v_term_from,
                         'agency_company_id', v_offer.agency_company_id,
                         'client_company_id', v_offer.client_company_id,
                         'partner_share_id', v_offer.partner_share_id));
  end if;

  return v_result;
end;
$$;

-- The accepted term must stay readable to the partner whose candidate it was accepted on, and the
-- lead's current term must be readable on the client's page (it already is: current terms are).
drop policy if exists agency_placement_terms_select on public.agency_placement_terms;
create policy agency_placement_terms_select on public.agency_placement_terms
  for select to authenticated
  using (
    retired_at is null
    or public.owns_company(company_id)
    or exists (
      select 1 from public.agency_candidate_offers o
       where o.accepted_placement_term_id = agency_placement_terms.id
         and (public.owns_company(o.client_company_id) or public.owns_company(o.agency_company_id))
    )
    or public.is_admin()
  );

-- ── 8. Reads ───────────────────────────────────────────────────────────────
-- Both sides of the caller's partnerships, and live invitations addressed to the caller's e-mail.
create or replace function public.list_agency_partnerships_v1()
returns table (
  partnership_id        uuid,
  side                  text,
  lead_company_id       uuid,
  lead_name             text,
  partner_company_id    uuid,
  partner_name          text,
  invited_email         text,
  partner_share_percent numeric,
  status                text,
  created_at            timestamptz,
  decided_at            timestamptz,
  ended_at              timestamptz,
  expires_at            timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         case when public.owns_company(p.lead_company_id) then 'lead'
              when p.partner_company_id is not null and public.owns_company(p.partner_company_id) then 'partner'
              else 'invited' end,
         p.lead_company_id, coalesce(lc.display_name, lc.legal_name),
         p.partner_company_id, coalesce(pc.display_name, pc.legal_name),
         case when public.owns_company(p.lead_company_id) then p.invited_email end,
         p.partner_share_percent, p.status, p.created_at, p.decided_at, p.ended_at, p.expires_at
    from public.agency_partnerships p
    join public.companies lc on lc.id = p.lead_company_id
    left join public.companies pc on pc.id = p.partner_company_id
   where public.owns_company(p.lead_company_id)
      or (p.partner_company_id is not null and public.owns_company(p.partner_company_id))
      or (p.status = 'pending' and p.expires_at > now()
          and lower(p.invited_email) = lower(coalesce((select auth.jwt()) ->> 'email', '')))
   order by p.created_at desc
   limit 200;
$$;

-- The partner's view of the needs passed to it: what the lead's own list reads, no client identity.
create or replace function public.list_partner_shared_requests_v1()
returns table (
  partner_share_id      uuid,
  partnership_id        uuid,
  lead_name             text,
  request_id            uuid,
  title                 text,
  role_text             text,
  country               text,
  status                text,
  partner_share_percent numeric,
  shared_at             timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select ps.id, p.id, coalesce(lc.display_name, lc.legal_name), s.request_id,
         r.title, r.role_or_work_type, r.country, r.status, p.partner_share_percent, ps.created_at
    from public.agency_partner_request_shares ps
    join public.agency_partnerships p on p.id = ps.partnership_id
    join public.companies lc on lc.id = p.lead_company_id
    join public.agency_client_request_shares s on s.id = ps.client_share_id
    join public.agency_client_connections c on c.id = s.connection_id
    join public.customer_requests r on r.id = s.request_id
   where ps.status = 'active' and p.status = 'active' and s.status = 'active' and c.status = 'active'
     and c.agency_company_id = p.lead_company_id
     and public.owns_company(p.partner_company_id)
   order by ps.created_at desc
   limit 200;
$$;

-- The lead's view of its partners' candidates on its clients' needs: status only, no worker identity.
create or replace function public.list_partner_offers_for_lead_v1()
returns table (
  offer_id         uuid,
  partner_share_id uuid,
  request_id       uuid,
  partner_name     text,
  status           text,
  offered_at       timestamptz,
  decided_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.partner_share_id, o.request_id, coalesce(pc.display_name, pc.legal_name),
         o.status, o.created_at, o.decided_at
    from public.agency_candidate_offers o
    join public.agency_partner_request_shares ps on ps.id = o.partner_share_id
    join public.agency_partnerships p on p.id = ps.partnership_id
    join public.companies pc on pc.id = o.agency_company_id
   where public.owns_company(p.lead_company_id)
   order by o.created_at desc
   limit 200;
$$;

-- COMMISSIONS. Every accepted offer with an accepted term that involves the caller's agency, with the
-- caller's role, its share of the term, and whether the placement that makes it due has happened.
create or replace function public.list_agency_commissions_v1()
returns table (
  offer_id          uuid,
  agency_company_id uuid,
  role              text,
  counterpart_name  text,
  request_id        uuid,
  term_id           uuid,
  fee_amount        numeric,
  currency          text,
  share_percent     numeric,
  amount            numeric,
  placement_status  text,
  accepted_at       timestamptz,
  placed_at         timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select o.id, o.agency_company_id as offering, p.lead_company_id as lead, p.partner_share_percent as pct,
           o.request_id, o.booking_id, o.client_company_id, o.placement_term_accepted_at,
           t.id as term_id, t.fee_amount, t.currency
      from public.agency_candidate_offers o
      join public.agency_placement_terms t on t.id = o.accepted_placement_term_id
      left join public.agency_partner_request_shares ps on ps.id = o.partner_share_id
      left join public.agency_partnerships p on p.id = ps.partnership_id
     where o.status = 'accepted'
  ),
  roles as (
    -- direct: the agency's own candidate on its own client
    select b.*, b.offering as me, 'direct'::text as role, null::uuid as counterpart, 100::numeric as share
      from base b where b.lead is null
    union all
    -- lead: a partner's candidate on the lead's client
    select b.*, b.lead, 'lead', b.offering, 100 - b.pct from base b where b.lead is not null
    union all
    -- partner: its candidate on the lead's client
    select b.*, b.offering, 'partner', b.lead, b.pct from base b where b.lead is not null
  )
  select r.id, r.me, r.role,
         coalesce(cc.display_name, cc.legal_name),
         r.request_id, r.term_id, r.fee_amount, r.currency, r.share,
         case when g.started_at is not null then round(r.fee_amount * r.share / 100, 2) end,
         case when g.started_at is not null then 'placed'
              when bk.status in ('declined', 'withdrawn', 'expired') then 'not_placed'
              else 'pending' end,
         r.placement_term_accepted_at, g.started_at
    from roles r
    left join public.companies cc on cc.id = r.counterpart
    left join public.booking_requests bk on bk.id = r.booking_id
    left join lateral (
      select ce.started_at
        from public.company_worker_engagements ce
       where ce.source_booking_id = r.booking_id and ce.started_at is not null
       order by ce.started_at limit 1) g on true
   where public.owns_company(r.me)
   order by r.placement_term_accepted_at desc nulls last
   limit 500;
$$;

-- ── 9. GDPR: who invited, decided, ended or passed ─────────────────────────
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'agency_partnerships', 'invited_by', 'profiles', 'set null', 'set_null', 'engineering', false,
   'Art. 17(3)(e): the share two agencies agreed is part of both companies'' record; without the id it names nobody',
   'the lead agency owner who sent the invitation'),
  ('public', 'agency_partnerships', 'decided_by', 'profiles', 'set null', 'set_null', 'engineering', false,
   'Art. 17(3)(e): as above', 'the invited agency owner who accepted or declined'),
  ('public', 'agency_partnerships', 'ended_by', 'profiles', 'set null', 'set_null', 'engineering', false,
   'Art. 17(3)(e): as above', 'the agency owner who ended the partnership'),
  ('public', 'agency_partner_request_shares', 'shared_by', 'profiles', 'set null', 'set_null', 'engineering', false,
   'Art. 17(3)(e): which need was passed to whom is part of both companies'' record; without the id it names nobody',
   'the lead agency owner who passed the need'),
  ('public', 'agency_partner_request_shares', 'revoked_by', 'profiles', 'set null', 'set_null', 'engineering', false,
   'Art. 17(3)(e): as above', 'the agency owner who took the need back')
  on conflict (schema_name, table_name, column_name) do nothing;
  if to_regclass('public.privacy_erasure_value_rules_v3') is not null then
    -- The partnership invitation is addressed to a person: on their erasure the address is replaced
    -- by the sentinel, as for agency_client_connections.invited_email; the agencies keep the fact.
    insert into public.privacy_erasure_value_rules_v3
      (schema_name, table_name, column_name, match, treatment, decided_by, legal_review, scrub_columns, note) values
      ('public', 'agency_partnerships', 'invited_email', 'email_exact', 'pseudonymise_value', 'engineering', false, null,
       'B2B partnership invitation addressed to the person')
    on conflict do nothing;
  end if;
end $$;
-- ─────────────────────────────────────────────────────────────────────────

-- A SECURITY DEFINER function never inherits a default EXECUTE grant: state each.
revoke all on function public.invite_agency_partner_v1(uuid, text, numeric) from public;
revoke all on function public.invite_agency_partner_v1(uuid, text, numeric) from anon;
grant execute on function public.invite_agency_partner_v1(uuid, text, numeric) to authenticated;
revoke all on function public.accept_agency_partnership_v1(uuid, uuid) from public;
revoke all on function public.accept_agency_partnership_v1(uuid, uuid) from anon;
grant execute on function public.accept_agency_partnership_v1(uuid, uuid) to authenticated;
revoke all on function public.decline_agency_partnership_v1(uuid) from public;
revoke all on function public.decline_agency_partnership_v1(uuid) from anon;
grant execute on function public.decline_agency_partnership_v1(uuid) to authenticated;
revoke all on function public.end_agency_partnership_v1(uuid) from public;
revoke all on function public.end_agency_partnership_v1(uuid) from anon;
grant execute on function public.end_agency_partnership_v1(uuid) to authenticated;
revoke all on function public.share_request_with_partner_v1(uuid, uuid) from public;
revoke all on function public.share_request_with_partner_v1(uuid, uuid) from anon;
grant execute on function public.share_request_with_partner_v1(uuid, uuid) to authenticated;
revoke all on function public.unshare_request_with_partner_v1(uuid) from public;
revoke all on function public.unshare_request_with_partner_v1(uuid) from anon;
grant execute on function public.unshare_request_with_partner_v1(uuid) to authenticated;
revoke all on function public.submit_partner_candidate_offer_v1(uuid, uuid, text) from public;
revoke all on function public.submit_partner_candidate_offer_v1(uuid, uuid, text) from anon;
grant execute on function public.submit_partner_candidate_offer_v1(uuid, uuid, text) to authenticated;
revoke all on function public.respond_agency_candidate_offer_v2(uuid, text, text, uuid) from public;
revoke all on function public.respond_agency_candidate_offer_v2(uuid, text, text, uuid) from anon;
grant execute on function public.respond_agency_candidate_offer_v2(uuid, text, text, uuid) to authenticated;
revoke all on function public.list_agency_partnerships_v1() from public;
revoke all on function public.list_agency_partnerships_v1() from anon;
grant execute on function public.list_agency_partnerships_v1() to authenticated;
revoke all on function public.list_partner_shared_requests_v1() from public;
revoke all on function public.list_partner_shared_requests_v1() from anon;
grant execute on function public.list_partner_shared_requests_v1() to authenticated;
revoke all on function public.list_partner_offers_for_lead_v1() from public;
revoke all on function public.list_partner_offers_for_lead_v1() from anon;
grant execute on function public.list_partner_offers_for_lead_v1() to authenticated;
revoke all on function public.list_agency_commissions_v1() from public;
revoke all on function public.list_agency_commissions_v1() from anon;
grant execute on function public.list_agency_commissions_v1() to authenticated;
