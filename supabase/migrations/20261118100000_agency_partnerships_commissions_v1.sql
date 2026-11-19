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
--    withdrawal applies), with agency_company_id = the LEAD and partner_share_id naming the step it
--    came through. OWNER PRINCIPLE 2026-11-19: the employer sees ONLY its own (lead) agency. The
--    lead is the client's agency of record on the row, so every client-side reader (the candidate
--    list, its agency name, the term, counts, chat/MCP, exports) shows the lead by construction. The
--    partner is derived from partner_share_id → agency_partnerships.partner_company_id, only inside
--    definer reads for the lead and the partner; the actor columns that would name the partner's
--    staff (created_by, withdrawn_by) and partner_share_id itself are not readable by signed-in
--    callers at all (column grant, §3b). The partner still never sees the client's identity.
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
-- WHAT IS NOT DONE. No APPLIED table or trigger is altered or dropped. agency_candidate_offers gains
-- one nullable column, its read policy's agency arm narrows (R2 P2-3), and its signed-in read grant
-- narrows to the columns any reader uses (§3b). Four APPLIED functions are replaced so a partner's
-- offer keeps behaving as the partner's own on the agency side (list_agency_offer_progress_v1,
-- list_agency_placements_v1, withdraw_agency_candidate_offer_v1) and a direct offer cannot take over
-- a partner's (submit_agency_candidate_offer_v1); each is main's body with one condition changed,
-- and the rollback restores main's body verbatim. Replaced here are only this PR's own, unapplied
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
  'Set when a partner agency offered this candidate on a need the lead agency passed to it (submit_partner_candidate_offer_v1). agency_company_id is then the LEAD (the client''s agency of record; the client never sees the partner); the partner is agency_partnerships.partner_company_id of this share.';

create index if not exists agency_candidate_offers_partner_share
  on public.agency_candidate_offers (partner_share_id) where partner_share_id is not null;

-- R2 P2-3: a partner offer row carries the CLIENT's ids (client_company_id, connection_id,
-- request_share_id). Its agency_company_id is the lead (owner principle, §3b), and a lead reads its
-- partners' offers only through list_partner_offers_for_lead_v1 (no worker identity), so partner
-- offers leave the agency arm's DIRECT read; the partner, not being agency_company_id, has no direct
-- read of them at all and follows them through definer reads without a client column
-- (list_agency_offer_progress_v1, list_agency_placements_v1). The client arm and the admin arm are
-- unchanged; the agency arm narrows. Pure narrowing.
drop policy if exists agency_candidate_offers_select on public.agency_candidate_offers;
create policy agency_candidate_offers_select on public.agency_candidate_offers for select
  using (
    (public.owns_company(agency_company_id) and partner_share_id is null)
    or (public.owns_company(client_company_id)
        and exists (select 1 from public.agency_client_connections c
                     where c.id = connection_id and c.status = 'active'))
    or public.is_admin()
  );

-- ── 3b. The client sees only its own agency (owner principle 2026-11-19) ────
-- Signed-in callers read only the columns any reader uses. Not readable: created_by and withdrawn_by
-- (on a partner offer they would name the partner's staff) and partner_share_id (the step a partner
-- offer came through). Definer functions and the service role are unaffected. The four app readers
-- (scouting counts, the term on an offer, the marketplace count, the conversation's offer pair) select
-- only granted columns.
revoke select on public.agency_candidate_offers from authenticated;
grant select (id, connection_id, request_share_id, agency_company_id, client_company_id, request_id,
              worker_id, status, note, created_at, withdrawn_at, updated_at, booking_id, decision_note,
              decided_by, decided_at, accepted_placement_term_id, placement_term_accepted_at)
  on public.agency_candidate_offers to authenticated;

-- The agency that OFFERED a candidate: the partner for a partner's offer, else agency_company_id.
-- Internal to the definer functions below; not callable by signed-in users.
create or replace function public.agency_offer_owner_v1(p_agency_company_id uuid, p_partner_share_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_partner_share_id is null then p_agency_company_id
              else (select p.partner_company_id
                      from public.agency_partner_request_shares ps
                      join public.agency_partnerships p on p.id = ps.partnership_id
                     where ps.id = p_partner_share_id) end;
$$;
revoke all on function public.agency_offer_owner_v1(uuid, uuid) from public, anon, authenticated;

-- The offering agency's own reads and its withdrawal follow the OFFERER (main's bodies, one
-- condition changed: owns_company(o.agency_company_id) → owns_company(agency_offer_owner_v1(...))).
-- For every direct offer the two are the same company, so nothing changes for them.
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
    join public.agency_client_request_shares s on s.id = o.request_share_id
    join public.agency_client_connections c on c.id = o.connection_id
   where public.owns_company(public.agency_offer_owner_v1(o.agency_company_id, o.partner_share_id))  -- caller = the offering agency (a partner for its partner offers)
     and c.status = 'active'
     and s.status = 'active'
   order by o.created_at desc
   limit 200;
$$;

create or replace function public.list_agency_placements_v1()
returns table(
  offer_id uuid,
  request_id uuid,
  worker_id uuid,
  offered_at timestamptz,
  client_decided_at timestamptz,
  booking_status text,
  start_date date,
  expected_end_date date,
  worker_decided_at timestamptz,
  engagement_status text,
  engagement_started_at timestamptz,
  engagement_ended_at timestamptz,
  assignment_status text,
  assigned_at timestamptz,
  assignment_ended_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select o.id, o.request_id, o.worker_id, o.created_at, o.decided_at,
         b.status, b.start_date, b.expected_end_date,
         (select max(e.created_at) from public.booking_request_events e
           where e.booking_request_id = b.id and e.event_type in ('accepted', 'declined')),
         g.status, g.started_at, g.ended_at,
         a.status, a.assigned_at, a.ended_at
    from public.agency_candidate_offers o
    left join public.booking_requests b on b.id = o.booking_id
    left join lateral (
      select ce.status, ce.started_at, ce.ended_at
        from public.company_worker_engagements ce
       where ce.source_booking_id = b.id
       order by ce.created_at desc limit 1) g on true
    left join lateral (
      select pa.status, pa.assigned_at, pa.ended_at
        from public.project_worker_assignments pa
        join public.projects p on p.id = pa.project_id
        left join public.organizations org on org.id = p.organization_id
       where pa.worker_id = o.worker_id
         and (org.legacy_company_id = o.client_company_id
              or (p.organization_id is null and p.company_id = o.client_company_id))
         and pa.assigned_at >= coalesce(o.decided_at, o.created_at)
       order by pa.assigned_at desc limit 1) a on true
   where public.owns_company(public.agency_offer_owner_v1(o.agency_company_id, o.partner_share_id))
     and o.status = 'accepted'
   order by o.decided_at desc nulls last
   limit 100;
$function$;

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
     and public.owns_company(public.agency_offer_owner_v1(o.agency_company_id, o.partner_share_id));
  get diagnostics v_upd = row_count;
  return v_upd > 0;
end;
$$;

-- A direct offer never takes over a partner's open offer of the same worker on the same need.
create or replace function public.submit_agency_candidate_offer_v1(p_request_share_id uuid, p_worker_id uuid, p_note text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- The caller must OWN the agency company, and it must act as an agency.
  if not public.owns_company(v_agency) then raise exception 'not_owner' using errcode = '42501'; end if;
  if not public.company_acts_as_agency(v_agency) then
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
  -- A re-offer re-binds to the CURRENT active share/connection (a stale row
  -- from a previously revoked connection must never keep the old provenance).
  on conflict (agency_company_id, request_id, worker_id) where (status = 'offered')
  do update set connection_id     = excluded.connection_id,
                request_share_id  = excluded.request_share_id,
                client_company_id = excluded.client_company_id,
                note              = coalesce(excluded.note, public.agency_candidate_offers.note),
                updated_at        = now()
   -- 20261118100000: never re-affirm (and so never take over) a PARTNER's open offer of the same
   -- worker on the same need; the client sees one candidate, offered once.
   where public.agency_candidate_offers.partner_share_id is null
  returning id into v_id;
  if v_id is null then raise exception 'already_offered' using errcode = 'P0004'; end if;
  return v_id;
end;
$function$;

-- Grants as main has them, re-asserted for the four replaced functions (create or replace keeps them).
revoke all on function public.list_agency_offer_progress_v1() from public, anon;
grant execute on function public.list_agency_offer_progress_v1() to authenticated;
revoke all on function public.list_agency_placements_v1() from public, anon;
grant execute on function public.list_agency_placements_v1() to authenticated;
revoke all on function public.withdraw_agency_candidate_offer_v1(uuid) from public, anon;
grant execute on function public.withdraw_agency_candidate_offer_v1(uuid) to authenticated;
revoke all on function public.submit_agency_candidate_offer_v1(uuid, uuid, text) from public, anon;
grant execute on function public.submit_agency_candidate_offer_v1(uuid, uuid, text) to authenticated;

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
  -- R2 P2-2: the address must be PROVEN (20261003151000_email_verified_boundary_v1),
  -- as on every other e-mail-addressed accept/decline/list.
  if v_row.id is null or v_row.status <> 'pending' or v_row.expires_at <= now()
     or v_email = '' or lower(v_row.invited_email) <> v_email
     or not public.session_email_verified_v1() then
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
     or v_email = '' or lower(v_row.invited_email) <> v_email
     or not public.session_email_verified_v1() then
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
  with revoked as (
    update public.agency_partner_request_shares
       set status = 'revoked', revoked_by = v_uid, revoked_at = now()
     where partnership_id = p_partnership_id and status = 'active'
    returning id)
  -- Decision 0033 traceability (R2 P3-b): the passes the end took back are named in its audit row.
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  select v_uid, 'agency_partnership_ended', 'agency_partnerships', p_partnership_id,
         jsonb_build_object('lead_company_id', v_row.lead_company_id, 'partner_company_id', v_row.partner_company_id,
                            'revoked_partner_share_ids', coalesce((select jsonb_agg(r.id) from revoked r), '[]'::jsonb));
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
  v_uid     uuid := (select auth.uid());
  v_lead    uuid;
  v_partner uuid;
  v_client  uuid;
  v_request uuid;
  v_id      uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select p.lead_company_id, p.partner_company_id into v_lead, v_partner
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
  if v_id is not null then
    -- Decision 0033 traceability (R2 P3-b): passing a client's need along the chain is audited
    -- (admin-only read). A repeated pass of the same need returns the same row and logs nothing.
    select c.client_company_id, s.request_id into v_client, v_request
      from public.agency_client_request_shares s
      join public.agency_client_connections c on c.id = s.connection_id
     where s.id = p_client_share_id;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (v_uid, 'agency_partner_need_passed', 'agency_partner_request_shares', v_id,
      jsonb_build_object('rule', 'decision 0033',
                         'partnership_id', p_partnership_id,
                         'lead_company_id', v_lead,
                         'partner_company_id', v_partner,
                         'client_share_id', p_client_share_id,
                         'client_company_id', v_client,
                         'request_id', v_request));
  end if;
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
  v_uid       uuid := (select auth.uid());
  v_lead      uuid;
  v_partner   uuid;
  v_pship     uuid;
  v_client_sh uuid;
  v_withdrawn int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select p.lead_company_id, p.partner_company_id, p.id, s.client_share_id
    into v_lead, v_partner, v_pship, v_client_sh
    from public.agency_partner_request_shares s
    join public.agency_partnerships p on p.id = s.partnership_id
   where s.id = p_partner_share_id and s.status = 'active';
  if v_lead is null or not public.owns_company(v_lead) then
    raise exception 'partner_share_not_found' using errcode = '42501';
  end if;
  update public.agency_candidate_offers
     set status = 'withdrawn', withdrawn_by = v_uid, withdrawn_at = now()
   where partner_share_id = p_partner_share_id and status = 'offered';
  get diagnostics v_withdrawn = row_count;
  update public.agency_partner_request_shares
     set status = 'revoked', revoked_by = v_uid, revoked_at = now()
   where id = p_partner_share_id;
  -- Decision 0033 traceability (R2 P3-b): taking a need back is audited (admin-only read).
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'agency_partner_need_revoked', 'agency_partner_request_shares', p_partner_share_id,
    jsonb_build_object('rule', 'decision 0033',
                       'partnership_id', v_pship,
                       'lead_company_id', v_lead,
                       'partner_company_id', v_partner,
                       'client_share_id', v_client_sh,
                       'withdrawn_offers', v_withdrawn));
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
  v_lead    uuid;
  v_pship   uuid;
  v_share   uuid;
  v_conn    uuid;
  v_client  uuid;
  v_request uuid;
  v_id      uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'invalid_note' using errcode = '22023'; end if;

  -- Everything must be live: the pass, the partnership, the client's share and its connection.
  select p.partner_company_id, p.lead_company_id, p.id, s.id, c.id, c.client_company_id, s.request_id
    into v_partner, v_lead, v_pship, v_share, v_conn, v_client, v_request
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

  -- agency_company_id is the LEAD: the client's agency of record (owner principle 2026-11-19).
  insert into public.agency_candidate_offers
    (connection_id, request_share_id, agency_company_id, client_company_id,
     request_id, worker_id, status, note, created_by, partner_share_id)
  values
    (v_conn, v_share, v_lead, v_client, v_request, p_worker_id, 'offered', v_note, v_uid, p_partner_share_id)
  on conflict (agency_company_id, request_id, worker_id) where (status = 'offered')
  do update set connection_id     = excluded.connection_id,
                request_share_id  = excluded.request_share_id,
                client_company_id = excluded.client_company_id,
                note              = coalesce(excluded.note, public.agency_candidate_offers.note),
                updated_at        = now()
   -- Re-affirm only this partner share's own open offer; never take over the lead's direct offer
   -- or another partner's offer of the same worker on the same need.
   where public.agency_candidate_offers.partner_share_id = excluded.partner_share_id
  returning id into v_id;
  if v_id is null then raise exception 'already_offered' using errcode = 'P0004'; end if;

  -- Decision 0033: the client deals only with its direct partner (the lead), and the WHOLE chain is
  -- kept for internal audit (audit_logs: admin-only read). Roles as the platform knows them: the
  -- partner is the candidate's source (its roster) and the submitter; the lead presents the
  -- candidate to the client and answers to it. v1 has no intermediary (a partner cannot pass a need
  -- on), and no agency-level verification is recorded in the platform (document checks are the
  -- platform's own, worker_documents.verified_by), so the chain says so instead of guessing.
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'agency_partner_candidate_offered', 'agency_candidate_offers', v_id,
    jsonb_build_object(
      'rule', 'decision 0033',
      'chain', jsonb_build_array(
        jsonb_build_object('role', 'source',              'company_id', v_partner),
        -- the submitting person is this row's actor_id (erasure handles that column; no copy in the payload)
        jsonb_build_object('role', 'submitter',           'company_id', v_partner),
        jsonb_build_object('role', 'presenter_to_client', 'company_id', v_lead)),
      'intermediaries', jsonb_build_array(),
      'agency_verification', 'not_recorded',
      'partnership_id', v_pship,
      'partner_share_id', p_partner_share_id,
      'client_share_id', v_share,
      'client_company_id', v_client,
      'worker_id', p_worker_id));
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

  -- Whose term: always agency_company_id's, the client's agency of record (for a partner's candidate
  -- that is the lead); a partner's candidate also needs its partnership and share live to be accepted.
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
-- The offer lookup runs as the definer: the partner can no longer read its own partner-offer rows
-- directly (R2 P2-3 below), and must still read the term accepted on them. It answers one yes/no
-- for the CALLER's own companies only; it returns no offer data.
create or replace function public.placement_term_accepted_for_caller_v1(p_term_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.agency_candidate_offers o
     where o.accepted_placement_term_id = p_term_id
       and (public.owns_company(o.client_company_id)
            or public.owns_company(public.agency_offer_owner_v1(o.agency_company_id, o.partner_share_id)))
  );
$$;
revoke all on function public.placement_term_accepted_for_caller_v1(uuid) from public, anon;
grant execute on function public.placement_term_accepted_for_caller_v1(uuid) to authenticated;

drop policy if exists agency_placement_terms_select on public.agency_placement_terms;
create policy agency_placement_terms_select on public.agency_placement_terms
  for select to authenticated
  using (
    retired_at is null
    or public.owns_company(company_id)
    or public.placement_term_accepted_for_caller_v1(id)
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
          and lower(p.invited_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
          and public.session_email_verified_v1())
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
    join public.companies pc on pc.id = p.partner_company_id
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
    select o.id, coalesce(p.partner_company_id, o.agency_company_id) as offering, p.lead_company_id as lead, p.partner_share_percent as pct,
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
-- R2 P2-1: v1 decides the same offers WITHOUT the term and live-partnership
-- rules, so a signed-in caller could skip them. Only v2 (definer, which still
-- calls v1 as its owner) remains callable. ORDER (R2 P2-5): apply 20261114235900, then this file,
-- then deploy the app that calls v2 only AT ONCE. Short window between the apply and the deploy:
-- the app on main (which calls v1) gets permission denied on a client's accept/decline of an agency
-- candidate, and nothing is written (the call is refused before any change); every other path works.
revoke all on function public.respond_agency_candidate_offer_v1(uuid, text, text) from public, anon, authenticated;
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
