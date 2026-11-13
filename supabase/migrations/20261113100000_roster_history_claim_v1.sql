-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. The owner approved a DESIGN and a
-- DRAFT PR only (2026-11-13). NO OWNER APPROVAL OF THIS SQL EXISTS YET. Draft PR + needs-human-gate.
-- NOT applied. Apply only via Supabase MCP apply_migration.
-- ============================================================================
-- 20261113100000_roster_history_claim_v1
--
-- SAFETY CLASS: RED (new table, SECURITY DEFINER functions, grants; a new road to a roster link).
-- Rollback: supabase/rollbacks/20261113100000_roster_history_claim_v1.down.sql
--
-- FORMER WORKER <-> ORGANIZATION HISTORY LINK. A general function for every
-- person an organization holds history for, in any sector.
--
-- THE GAP. An organization's roster row (organization_people) can be offered
-- to a person only when that person already holds an ACTIVE relationship with
-- the organization (policy organization_people_manager_update), and the roster
-- invitation refuses kinds that are not a present relationship. A FORMER
-- worker therefore can never be offered their own history: they join and see
-- an empty CV. Inviting them as an employee would be wrong twice: it needs
-- the invited e-mail to equal the sign-in e-mail, and it creates an ACTIVE
-- engagement, which the CV would show as a current job.
--
-- THE ROAD ADDED HERE (four acts by two parties, nothing automatic):
--   1. OFFER    a manager of the organization creates a ONE-TIME claim bound to
--               ONE unlinked roster row and hands its link to the person.
--   2. REDEEM   a signed-in person with a proven e-mail presents the link. The
--               claim now names WHO came. Nothing is linked, nothing is shown.
--   3. CHECK    a manager of the organization sees the redeemer's name and
--               e-mail and approves or rejects. Approval puts the roster row
--               into the EXISTING offer state (link_proposed / manager_offer)
--               for exactly that person.
--   4. CONFIRM  the person accepts or refuses through the EXISTING, unchanged
--               door (policy organization_people_subject_decides /
--               respond_to_roster_link_v1). Only linked + worker_confirmed
--               makes the organization's records readable to them.
--
-- WHAT IS NOT DONE. No engagement_contexts row, no company_memberships row,
-- no worker row is created or changed: no work relationship arises. No
-- organization_evidence_* row is inserted, updated or deleted: the history,
-- its provenance and its state are exactly what they were. No name or e-mail
-- is ever compared to decide a link. No existing policy, trigger or function
-- is altered or dropped.
--
-- REVERSAL. The person: the existing respond_to_roster_link_v1 (refuse /
-- withdraw). The organization: unlink_roster_person_v1 below (audited, with a
-- reason). Either way the row returns to unlinked and the records are
-- unreadable to that profile again; claims and audit rows are never deleted.
--
-- @plan-cache-proof: n/a — the two indexes are a uniqueness rule (one live claim per roster row) and the token lookup by equality on a unique 64-character digest; no existing RPC filters by them
-- ============================================================================

create table if not exists public.organization_person_history_claims (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null,
  organization_person_id uuid not null,
  token_hash             text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status                 text not null default 'open'
                           check (status in ('open','redeemed','approved','rejected','revoked','expired')),
  created_by             uuid not null references public.profiles(id) on delete cascade,
  created_at             timestamptz not null default now(),
  expires_at             timestamptz not null default now() + interval '7 days',
  redeemed_by_profile_id uuid references public.profiles(id) on delete set null,
  redeemed_worker_id     uuid references public.workers(id) on delete set null,
  redeemed_at            timestamptz,
  decided_by             uuid references public.profiles(id) on delete set null,
  decided_at             timestamptz,
  decision_note          text check (decision_note is null or char_length(decision_note) <= 500),
  revoked_at             timestamptz,
  constraint organization_person_history_claims_person_fk
    foreign key (organization_person_id, organization_id)
    references public.organization_people (id, organization_id) on delete cascade
);

comment on table public.organization_person_history_claims is
  'One-time claims a manager creates for ONE roster row so a person without an active relationship (a former worker) can be offered their history. Written only by the *_roster_history_claim_v1 functions. A claim never links anything by itself.';

-- One LIVE claim per roster row: a second offer replaces the first, never runs beside it.
create unique index if not exists organization_person_history_claims_one_live_uq
  on public.organization_person_history_claims (organization_person_id)
  where status in ('open', 'redeemed');

alter table public.organization_person_history_claims enable row level security;
alter table public.organization_person_history_claims force row level security;

-- Read: the organization's managers, the person who redeemed, an admin. The
-- token digest is NOT readable by anyone (column grant below).
create policy organization_person_history_claims_select
  on public.organization_person_history_claims
  for select to authenticated
  using (
    public.manages_organization(organization_id)
    or redeemed_by_profile_id = auth.uid()
    or public.is_admin()
  );

revoke all on public.organization_person_history_claims from public;
revoke all on public.organization_person_history_claims from anon;
revoke all on public.organization_person_history_claims from authenticated;
grant select (id, organization_id, organization_person_id, status, created_by, created_at, expires_at,
              redeemed_by_profile_id, redeemed_at, decided_by, decided_at, revoked_at)
  on public.organization_person_history_claims to authenticated;

-- ── 1. OFFER ────────────────────────────────────────────────────────────────
-- The caller's app makes a random 256-bit token, keeps it for the link and
-- sends only its SHA-256 digest here. The raw token is never stored.
create or replace function public.create_roster_history_claim_v1(
  p_person_id  uuid,
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid     uuid := auth.uid();
  v_org   uuid;
  v_state text;
  v_id    uuid;
  v_exp   timestamptz;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_person_id is null or coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  select op.organization_id, op.link_state into v_org, v_state
    from public.organization_people op
   where op.id = p_person_id
     for update;
  -- A row the caller may not manage answers exactly like a row that does not exist.
  if not found or not public.manages_organization(v_org) then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_state <> 'unlinked' then
    return jsonb_build_object('outcome', 'already_linked');
  end if;
  -- Someone already came with the previous link and waits for an answer:
  -- answer them first, never discard them silently.
  if exists (select 1 from public.organization_person_history_claims c
              where c.organization_person_id = p_person_id and c.status = 'redeemed') then
    return jsonb_build_object('outcome', 'awaiting_decision');
  end if;
  if (select count(*) from public.organization_person_history_claims c
       where c.created_by = uid and c.created_at > now() - interval '24 hours') >= 30 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  -- A new offer ends the previous unused one: at most one working link per row.
  update public.organization_person_history_claims
     set status = 'revoked', revoked_at = now()
   where organization_person_id = p_person_id and status = 'open';

  insert into public.organization_person_history_claims
    (organization_id, organization_person_id, token_hash, created_by)
  values (v_org, p_person_id, p_token_hash, uid)
  returning id, expires_at into v_id, v_exp;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'roster_history_claim_created', 'organization_person_history_claims', v_id,
    jsonb_build_object('organization_id', v_org, 'organization_person_id', p_person_id));

  return jsonb_build_object('outcome', 'created', 'claim_id', v_id, 'expires_at', v_exp);
end $function$;

-- ── Preview: what a signed-in holder of the link is told BEFORE acting ──────
-- Only the organization's name, and only while the claim is usable. Never the
-- roster name, never any record: a forwarded link tells a stranger nothing
-- about the person it was meant for.
create or replace function public.get_roster_history_claim_preview_v1(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  uid   uuid := auth.uid();
  v_c   record;
  v_name text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select c.id, c.status, c.expires_at, c.organization_id, c.redeemed_by_profile_id
    into v_c
    from public.organization_person_history_claims c
   where c.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if not found then
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  -- The person who redeemed may come back to the same link and see where it stands.
  if v_c.redeemed_by_profile_id = uid and v_c.status in ('redeemed', 'approved', 'rejected') then
    select coalesce(nullif(btrim(o.display_name), ''), nullif(btrim(o.legal_name), '')) into v_name
      from public.organizations o where o.id = v_c.organization_id;
    return jsonb_build_object('outcome', v_c.status, 'organization_name', v_name);
  end if;
  if v_c.status <> 'open' or v_c.expires_at <= now() then
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  select coalesce(nullif(btrim(o.display_name), ''), nullif(btrim(o.legal_name), '')) into v_name
    from public.organizations o where o.id = v_c.organization_id;
  return jsonb_build_object('outcome', 'open', 'organization_name', v_name);
end $function$;

-- ── 2. REDEEM ───────────────────────────────────────────────────────────────
-- "It is me." Single use: the first signed-in person with a proven e-mail who
-- presents the token becomes the claim's redeemer; nobody can redeem it again.
-- It links NOTHING and shows NOTHING: the organization checks who came (3).
create or replace function public.redeem_roster_history_claim_v1(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid      uuid := auth.uid();
  v_c      record;
  v_state  text;
  v_worker uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.session_email_verified_v1() then
    return jsonb_build_object('outcome', 'email_not_verified');
  end if;
  -- A person may try a handful of links a day, not thousands.
  if (select count(*) from public.organization_person_history_claims c
       where c.redeemed_by_profile_id = uid and c.redeemed_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  select c.* into v_c
    from public.organization_person_history_claims c
   where c.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     for update;
  if not found then
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  if v_c.status = 'open' and v_c.expires_at <= now() then
    update public.organization_person_history_claims set status = 'expired' where id = v_c.id;
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  if v_c.status <> 'open' then
    -- Used, revoked, expired, decided: one answer, so the link is no oracle.
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  -- The manager who made the link cannot be the person it is for.
  if v_c.created_by = uid then
    return jsonb_build_object('outcome', 'creator_cannot_redeem');
  end if;

  select op.link_state into v_state
    from public.organization_people op
   where op.id = v_c.organization_person_id
     for update;
  if not found or v_state <> 'unlinked' then
    return jsonb_build_object('outcome', 'unavailable');
  end if;

  select w.id into v_worker from public.workers w where w.profile_id = uid limit 1;
  if v_worker is null then
    return jsonb_build_object('outcome', 'no_worker_profile');
  end if;
  -- One person, one roster row per organization: never two histories merged.
  if exists (select 1 from public.organization_people op
              where op.organization_id = v_c.organization_id and op.linked_profile_id = uid) then
    return jsonb_build_object('outcome', 'already_on_roster');
  end if;

  update public.organization_person_history_claims
     set status = 'redeemed', redeemed_by_profile_id = uid, redeemed_worker_id = v_worker, redeemed_at = now()
   where id = v_c.id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'roster_history_claim_redeemed', 'organization_person_history_claims', v_c.id,
    jsonb_build_object('organization_id', v_c.organization_id,
                       'organization_person_id', v_c.organization_person_id));

  return jsonb_build_object('outcome', 'redeemed');
end $function$;

-- ── 3. CHECK ────────────────────────────────────────────────────────────────
-- What the organization's manager reads to decide: the claim, the roster name
-- it is bound to, and WHO redeemed it (name and e-mail, which the redeemer was
-- told the organization would see). Managers of that organization only.
create or replace function public.list_roster_history_claims_v1(p_organization_id uuid)
returns table (
  claim_id               uuid,
  organization_person_id uuid,
  roster_name            text,
  status                 text,
  created_at             timestamptz,
  expires_at             timestamptz,
  redeemed_at            timestamptz,
  redeemer_name          text,
  redeemer_email         text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_organization_id is null or not public.manages_organization(p_organization_id) then
    return;
  end if;
  return query
    select c.id, c.organization_person_id, op.display_name,
           case when c.status = 'open' and c.expires_at <= now() then 'expired' else c.status end,
           c.created_at, c.expires_at, c.redeemed_at,
           case when c.status = 'redeemed' then p.full_name end,
           case when c.status = 'redeemed' then p.email end
      from public.organization_person_history_claims c
      join public.organization_people op on op.id = c.organization_person_id
      left join public.profiles p on p.id = c.redeemed_by_profile_id
     where c.organization_id = p_organization_id
       and c.status in ('open', 'redeemed')
     order by c.created_at desc
     limit 200;
end $function$;

-- Approve: the roster row enters the EXISTING offer state for exactly the
-- person who redeemed. Reject: nothing changes on the roster row. Either way
-- the person still has the last word (4): approval alone shows them nothing.
create or replace function public.decide_roster_history_claim_v1(
  p_claim_id uuid,
  p_decision text,
  p_note     text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid     uuid := auth.uid();
  v_c     record;
  v_state text;
  v_note  text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  select c.* into v_c
    from public.organization_person_history_claims c
   where c.id = p_claim_id
     for update;
  if not found or not public.manages_organization(v_c.organization_id) then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_c.status <> 'redeemed' then
    return jsonb_build_object('outcome', 'not_awaiting_decision');
  end if;
  -- A manager cannot approve a link to themselves.
  if v_c.redeemed_by_profile_id = uid then
    return jsonb_build_object('outcome', 'cannot_decide_own');
  end if;

  if p_decision = 'reject' then
    update public.organization_person_history_claims
       set status = 'rejected', decided_by = uid, decided_at = now(), decision_note = v_note
     where id = v_c.id;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'roster_history_claim_rejected', 'organization_person_history_claims', v_c.id,
      jsonb_build_object('organization_person_id', v_c.organization_person_id));
    return jsonb_build_object('outcome', 'rejected');
  end if;

  select op.link_state into v_state
    from public.organization_people op
   where op.id = v_c.organization_person_id
     for update;
  if not found or v_state <> 'unlinked'
     or v_c.redeemed_by_profile_id is null or v_c.redeemed_worker_id is null
     or not exists (select 1 from public.workers w
                     where w.id = v_c.redeemed_worker_id and w.profile_id = v_c.redeemed_by_profile_id) then
    return jsonb_build_object('outcome', 'no_longer_possible');
  end if;
  if exists (select 1 from public.organization_people op
              where op.organization_id = v_c.organization_id
                and op.linked_profile_id = v_c.redeemed_by_profile_id) then
    return jsonb_build_object('outcome', 'already_on_roster');
  end if;

  -- The existing OFFER state, nothing more: not linked, no record readable.
  update public.organization_people
     set link_state = 'link_proposed',
         link_method = 'manager_offer',
         linked_profile_id = v_c.redeemed_by_profile_id,
         linked_worker_id = v_c.redeemed_worker_id,
         linked_by = uid,
         updated_at = now()
   where id = v_c.organization_person_id;

  update public.organization_person_history_claims
     set status = 'approved', decided_by = uid, decided_at = now(), decision_note = v_note
   where id = v_c.id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'roster_history_claim_approved', 'organization_person_history_claims', v_c.id,
    jsonb_build_object('organization_person_id', v_c.organization_person_id,
                       'offered_to_profile_id', v_c.redeemed_by_profile_id));

  return jsonb_build_object('outcome', 'approved', 'offered_to_profile_id', v_c.redeemed_by_profile_id);
end $function$;

-- The organization takes an unused or undecided claim back.
create or replace function public.revoke_roster_history_claim_v1(p_claim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_c record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select c.* into v_c
    from public.organization_person_history_claims c
   where c.id = p_claim_id
     for update;
  if not found or not public.manages_organization(v_c.organization_id) then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_c.status not in ('open', 'redeemed') then
    return jsonb_build_object('outcome', 'not_live');
  end if;
  update public.organization_person_history_claims
     set status = 'revoked', revoked_at = now()
   where id = v_c.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'roster_history_claim_revoked', 'organization_person_history_claims', v_c.id,
    jsonb_build_object('organization_person_id', v_c.organization_person_id, 'was', v_c.status));
  return jsonb_build_object('outcome', 'revoked');
end $function$;

-- ── REVERSAL BY THE ORGANIZATION ────────────────────────────────────────────
-- A wrong link (or a wrong pending offer) is taken back by a manager of the
-- organization, with a reason, on the audit trail. The row returns to
-- unlinked, so the organization's records are unreadable to that profile
-- again. Nothing is deleted: the roster row, every record and every earlier
-- audit row stay. (The person's own reversal is the existing
-- respond_to_roster_link_v1.)
create or replace function public.unlink_roster_person_v1(
  p_person_id uuid,
  p_reason    text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid      uuid := auth.uid();
  v_org    uuid;
  v_state  text;
  v_method text;
  v_profile uuid;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_reason is null then
    return jsonb_build_object('outcome', 'reason_required');
  end if;
  select op.organization_id, op.link_state, op.link_method, op.linked_profile_id
    into v_org, v_state, v_method, v_profile
    from public.organization_people op
   where op.id = p_person_id
     for update;
  if not found or not public.manages_organization(v_org) then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_state = 'unlinked' then
    return jsonb_build_object('outcome', 'not_linked');
  end if;

  update public.organization_people
     set link_state = 'unlinked', link_method = null,
         linked_profile_id = null, linked_worker_id = null, linked_at = null,
         updated_at = now()
   where id = p_person_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'roster_link_unlinked_by_organization', 'organization_people', p_person_id,
    jsonb_build_object('organization_id', v_org, 'was_state', v_state, 'was_method', v_method,
                       'profile_id', v_profile, 'reason', v_reason));

  return jsonb_build_object('outcome', 'unlinked');
end $function$;

-- ── GDPR erasure (registry v3): what happens to a claim when a person's
-- account is erased. The redeemer's and the deciders' columns are set null —
-- the claim is the record that a link was offered, came and was decided, and
-- it is part of the organization's audit trail; without the person's id it
-- names nobody. `created_by` cascades: a claim its maker's account no longer
-- backs is nobody's offer.
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'organization_person_history_claims', 'created_by', 'profiles', 'cascade', 'allow_cascade', 'engineering', false,
   'Art. 17(1)(a): an offer its maker''s account no longer backs is deleted with that account',
   'the manager who made the one-time link'),
  ('public', 'organization_person_history_claims', 'redeemed_by_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false,
   'Art. 17(3)(e): the organization keeps the trail that a link was offered and answered; without the id it names nobody',
   'the person who opened the link'),
  ('public', 'organization_person_history_claims', 'redeemed_worker_id', 'workers', 'set null', 'set_null', 'engineering', false,
   'Art. 17(3)(e): same trail, the worker side of the same act',
   'the worker record of the person who opened the link'),
  ('public', 'organization_person_history_claims', 'decided_by', 'profiles', 'set null', 'set_null', 'engineering', false,
   'Art. 17(3)(e): who answered is part of the organization''s own audit trail',
   'the manager who approved or rejected')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;
-- ─────────────────────────────────────────────────────────────────────────

-- A SECURITY DEFINER function never inherits a default EXECUTE grant: state each.
revoke all on function public.create_roster_history_claim_v1(uuid, text) from public;
revoke all on function public.create_roster_history_claim_v1(uuid, text) from anon;
grant execute on function public.create_roster_history_claim_v1(uuid, text) to authenticated;
revoke all on function public.get_roster_history_claim_preview_v1(text) from public;
revoke all on function public.get_roster_history_claim_preview_v1(text) from anon;
grant execute on function public.get_roster_history_claim_preview_v1(text) to authenticated;
revoke all on function public.redeem_roster_history_claim_v1(text) from public;
revoke all on function public.redeem_roster_history_claim_v1(text) from anon;
grant execute on function public.redeem_roster_history_claim_v1(text) to authenticated;
revoke all on function public.list_roster_history_claims_v1(uuid) from public;
revoke all on function public.list_roster_history_claims_v1(uuid) from anon;
grant execute on function public.list_roster_history_claims_v1(uuid) to authenticated;
revoke all on function public.decide_roster_history_claim_v1(uuid, text, text) from public;
revoke all on function public.decide_roster_history_claim_v1(uuid, text, text) from anon;
grant execute on function public.decide_roster_history_claim_v1(uuid, text, text) to authenticated;
revoke all on function public.revoke_roster_history_claim_v1(uuid) from public;
revoke all on function public.revoke_roster_history_claim_v1(uuid) from anon;
grant execute on function public.revoke_roster_history_claim_v1(uuid) to authenticated;
revoke all on function public.unlink_roster_person_v1(uuid, text) from public;
revoke all on function public.unlink_roster_person_v1(uuid, text) from anon;
grant execute on function public.unlink_roster_person_v1(uuid, text) to authenticated;
