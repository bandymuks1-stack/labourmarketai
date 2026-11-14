-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET. Draft PR + needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration.
-- ============================================================================
-- 20261114120000_agency_placement_terms_v1
--
-- SAFETY CLASS: RED (new tables, SECURITY DEFINER functions, grants, a commercial term recorded
-- with a hire decision).
-- Rollback: supabase/rollbacks/20261114120000_agency_placement_terms_v1.down.sql
--
-- AN AGENCY'S PLACEMENT TERM, AND A WORKER'S OWN CHOICE TO JOIN AN AGENCY.
-- General for every staffing agency; no agency, amount or text is named here.
--
-- 1. agency_placement_terms. An agency (a company that acts as an agency,
--    public.company_acts_as_agency) may state ONE current placement term:
--    an amount, a currency, the condition under which it applies (the
--    agency's own words, kept with their language) and an optional link to
--    its full terms. A new term retires the previous one; nothing is
--    updated in place or deleted, so the term an employer accepted stays
--    readable for as long as the decision does. The term is the agency's
--    offer to the employer, not platform pricing.
--
-- 2. Employer acceptance at the hire decision. respond_agency_candidate_offer_v2
--    is the v1 decision with one rule added: when the offering agency has a
--    current term, ACCEPTING the candidate requires the employer to name that
--    exact term (the one shown to them). The accepted term and the time are
--    recorded on the offer. Declining records nothing. Viewing, contacting
--    or receiving an offer records nothing. v1 is unchanged and is what v2
--    calls to make the decision and the booking.
--    The fee is due only on an actual placement: an accepted offer whose
--    booking the worker accepted and whose engagement is active
--    (list_agency_placements_v1 already reads exactly that chain). No amount
--    is computed or charged by this migration.
--
-- 3. platform_suggested_agencies. An ADMIN-kept list of agencies the product
--    may suggest to workers, by id: no agency is named in code. A worker sees
--    a suggestion only when they hold no active place on any agency's roster,
--    were never on THIS agency's roster (a withdrawal is respected), and the
--    list row is active (list_agency_suggestions_for_me_v1).
--
-- 4. join_suggested_agency_v1. The worker's own act: it puts them on the
--    agency's EXISTING roster (company_workers, status active) — the same
--    row an accepted roster invitation creates, so the existing offer gate,
--    the profile's "who represents me" list and the existing withdrawal
--    (end_roster_link_v1) all apply unchanged. The consent text version the
--    worker saw is recorded in audit_logs. It creates NO engagement: a
--    candidate base is not a job. It refuses a worker already on another
--    agency's active roster (existing representation is never reassigned).
--
-- WHAT IS NOT DONE. No existing table, policy, trigger or function is
-- altered or dropped; agency_candidate_offers only gains two nullable
-- columns. No row is written by the migration itself.
--
-- @plan-cache-proof: n/a — the indexes are a uniqueness rule (one current term per company) and a lookup by company id; no existing RPC filters by them
-- ============================================================================

-- ── 1. The agency's placement term ─────────────────────────────────────────
create table if not exists public.agency_placement_terms (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  fee_amount          numeric(12, 2) not null check (fee_amount > 0 and fee_amount < 1000000),
  currency            text not null check (currency ~ '^[A-Z]{3}$'),
  condition_text      text not null check (char_length(btrim(condition_text)) between 1 and 1000),
  condition_language  text not null check (condition_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  terms_url           text check (terms_url is null or (terms_url ~ '^https://' and char_length(terms_url) <= 500)),
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  retired_at          timestamptz
);

comment on table public.agency_placement_terms is
  'An agency''s own placement term shown to employers on its candidates. One current row per company (retired_at is null); a new term retires the old; rows are never updated in place or deleted.';

create unique index if not exists agency_placement_terms_one_current
  on public.agency_placement_terms (company_id) where retired_at is null;

alter table public.agency_placement_terms enable row level security;
alter table public.agency_placement_terms force row level security;

-- ── 2. The term an employer accepted, on the decision itself ───────────────
alter table public.agency_candidate_offers
  add column if not exists accepted_placement_term_id uuid references public.agency_placement_terms(id) on delete restrict,
  add column if not exists placement_term_accepted_at timestamptz;

comment on column public.agency_candidate_offers.accepted_placement_term_id is
  'The agency placement term the employer accepted when accepting this candidate (respond_agency_candidate_offer_v2). Null when the agency stated no term or the offer was not accepted.';

-- Readable: every CURRENT term (an employer must see it before deciding);
-- every term of the caller's own agency; a retired term the caller's own
-- company accepted on an offer.
drop policy if exists agency_placement_terms_select on public.agency_placement_terms;
create policy agency_placement_terms_select on public.agency_placement_terms
  for select to authenticated
  using (
    retired_at is null
    or public.owns_company(company_id)
    or exists (
      select 1 from public.agency_candidate_offers o
       where o.accepted_placement_term_id = agency_placement_terms.id
         and public.owns_company(o.client_company_id)
    )
    or public.is_admin()
  );

revoke all on public.agency_placement_terms from public;
revoke all on public.agency_placement_terms from anon;
revoke all on public.agency_placement_terms from authenticated;
grant select on public.agency_placement_terms to authenticated;

-- ── 3. Agencies the product may suggest to workers (admin-kept) ────────────
create table if not exists public.platform_suggested_agencies (
  company_id            uuid primary key references public.companies(id) on delete cascade,
  active                boolean not null default true,
  consent_text_version  text not null check (char_length(consent_text_version) between 1 and 40),
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now()
);

comment on table public.platform_suggested_agencies is
  'Admin-kept list of agencies the product may suggest to workers who have no agency. Read only through list_agency_suggestions_for_me_v1; written by an admin only.';

alter table public.platform_suggested_agencies enable row level security;
alter table public.platform_suggested_agencies force row level security;

drop policy if exists platform_suggested_agencies_admin on public.platform_suggested_agencies;
create policy platform_suggested_agencies_admin on public.platform_suggested_agencies
  for select to authenticated
  using (public.is_admin());

revoke all on public.platform_suggested_agencies from public;
revoke all on public.platform_suggested_agencies from anon;
revoke all on public.platform_suggested_agencies from authenticated;
grant select on public.platform_suggested_agencies to authenticated;

-- ── 4. The agency states (or retires) its term ─────────────────────────────
create or replace function public.set_agency_placement_term_v1(
  p_company_id         uuid,
  p_fee_amount         numeric,
  p_currency           text,
  p_condition_text     text,
  p_condition_language text,
  p_terms_url          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := (select auth.uid());
  v_id  uuid;
  v_cur text := upper(btrim(coalesce(p_currency, '')));
  v_txt text := btrim(coalesce(p_condition_text, ''));
  v_lng text := btrim(coalesce(p_condition_language, ''));
  v_url text := nullif(btrim(coalesce(p_terms_url, '')), '');
begin
  if uid is null then return jsonb_build_object('outcome', 'auth'); end if;
  if p_company_id is null or not public.owns_company(p_company_id) then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if not public.company_acts_as_agency(p_company_id) then
    return jsonb_build_object('outcome', 'not_agency');
  end if;
  if p_fee_amount is null or p_fee_amount <= 0 or p_fee_amount >= 1000000
     or v_cur !~ '^[A-Z]{3}$'
     or char_length(v_txt) not between 1 and 1000
     or v_lng !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'
     or (v_url is not null and (v_url !~ '^https://' or char_length(v_url) > 500)) then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  update public.agency_placement_terms
     set retired_at = now()
   where company_id = p_company_id and retired_at is null;

  insert into public.agency_placement_terms
    (company_id, fee_amount, currency, condition_text, condition_language, terms_url, created_by)
  values (p_company_id, round(p_fee_amount, 2), v_cur, v_txt, v_lng, v_url, uid)
  returning id into v_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'agency_placement_term_set', 'agency_placement_terms', v_id,
    jsonb_build_object('company_id', p_company_id, 'currency', v_cur));

  return jsonb_build_object('outcome', 'set', 'term_id', v_id);
end;
$$;

create or replace function public.retire_agency_placement_term_v1(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := (select auth.uid());
  v_id uuid;
begin
  if uid is null then return jsonb_build_object('outcome', 'auth'); end if;
  if p_company_id is null or not public.owns_company(p_company_id) then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  update public.agency_placement_terms
     set retired_at = now()
   where company_id = p_company_id and retired_at is null
  returning id into v_id;
  if v_id is null then return jsonb_build_object('outcome', 'none'); end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'agency_placement_term_retired', 'agency_placement_terms', v_id,
    jsonb_build_object('company_id', p_company_id));
  return jsonb_build_object('outcome', 'retired');
end;
$$;

-- ── 5. The employer's decision, with the term accepted on it ───────────────
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
  v_uid    uuid := (select auth.uid());
  v_offer  public.agency_candidate_offers%rowtype;
  v_term   uuid;
  v_result uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select * into v_offer from public.agency_candidate_offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer_not_found' using errcode = '42501'; end if;
  if not public.owns_company(v_offer.client_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if p_decision = 'accepted' then
    select t.id into v_term
      from public.agency_placement_terms t
     where t.company_id = v_offer.agency_company_id and t.retired_at is null;
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
                         'agency_company_id', v_offer.agency_company_id,
                         'client_company_id', v_offer.client_company_id));
  end if;

  return v_result;
end;
$$;

-- ── 6. The suggestion a worker may see, and their own choice ───────────────
create or replace function public.list_agency_suggestions_for_me_v1()
returns table (company_id uuid, agency_name text, consent_text_version text)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select w.id as worker_id
      from public.workers w
     where w.profile_id = (select auth.uid())
     limit 1
  )
  select s.company_id,
         coalesce(nullif(btrim(c.display_name), ''), nullif(btrim(c.legal_name), '')),
         s.consent_text_version
    from public.platform_suggested_agencies s
    join public.companies c on c.id = s.company_id
    join me on true
   where s.active
     and public.company_acts_as_agency(s.company_id)
     -- Never offered to someone an agency already represents.
     and not exists (
       select 1 from public.company_workers cw
        where cw.worker_id = me.worker_id and cw.status = 'active'
          and public.company_acts_as_agency(cw.company_id)
     )
     -- Never offered again to someone who was ever on this roster
     -- (a withdrawal is an answer).
     and not exists (
       select 1 from public.company_workers cw
        where cw.worker_id = me.worker_id and cw.company_id = s.company_id
     );
$$;

create or replace function public.join_suggested_agency_v1(p_company_id uuid, p_consent_text_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := (select auth.uid());
  v_worker uuid;
  v_s      public.platform_suggested_agencies%rowtype;
begin
  if uid is null then return jsonb_build_object('outcome', 'auth'); end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid limit 1;
  if v_worker is null then return jsonb_build_object('outcome', 'no_worker_profile'); end if;

  select * into v_s from public.platform_suggested_agencies s
   where s.company_id = p_company_id and s.active;
  if v_s.company_id is null or not public.company_acts_as_agency(p_company_id) then
    return jsonb_build_object('outcome', 'not_available');
  end if;
  -- The worker consents to the text they were shown, in that version only.
  if p_consent_text_version is distinct from v_s.consent_text_version then
    return jsonb_build_object('outcome', 'consent_text_changed');
  end if;
  if exists (select 1 from public.company_workers cw
              where cw.worker_id = v_worker and cw.company_id = p_company_id) then
    return jsonb_build_object('outcome', 'already_known');
  end if;
  -- Existing representation is never reassigned by this road.
  if exists (select 1 from public.company_workers cw
              where cw.worker_id = v_worker and cw.status = 'active'
                and cw.company_id <> p_company_id
                and public.company_acts_as_agency(cw.company_id)) then
    return jsonb_build_object('outcome', 'represented_elsewhere');
  end if;

  insert into public.company_workers (company_id, worker_id, status)
  values (p_company_id, v_worker, 'active');

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'suggested_agency_joined', 'company_workers', v_worker,
    jsonb_build_object('company_id', p_company_id,
                       'consent_text_version', v_s.consent_text_version));

  return jsonb_build_object('outcome', 'joined');
end;
$$;

-- ── 7. GDPR: who wrote a term or a list row ────────────────────────────────
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'agency_placement_terms', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false,
   'Art. 17(3)(e): the term an employer accepted is part of both companies'' record; without the id it names nobody',
   'the agency owner who stated the term'),
  ('public', 'platform_suggested_agencies', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false,
   'Art. 17(3)(e): an admin configuration row; without the id it names nobody',
   'the admin who added the agency to the list')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;
-- ─────────────────────────────────────────────────────────────────────────

-- A SECURITY DEFINER function never inherits a default EXECUTE grant: state each.
revoke all on function public.set_agency_placement_term_v1(uuid, numeric, text, text, text, text) from public;
revoke all on function public.set_agency_placement_term_v1(uuid, numeric, text, text, text, text) from anon;
grant execute on function public.set_agency_placement_term_v1(uuid, numeric, text, text, text, text) to authenticated;
revoke all on function public.retire_agency_placement_term_v1(uuid) from public;
revoke all on function public.retire_agency_placement_term_v1(uuid) from anon;
grant execute on function public.retire_agency_placement_term_v1(uuid) to authenticated;
revoke all on function public.respond_agency_candidate_offer_v2(uuid, text, text, uuid) from public;
revoke all on function public.respond_agency_candidate_offer_v2(uuid, text, text, uuid) from anon;
grant execute on function public.respond_agency_candidate_offer_v2(uuid, text, text, uuid) to authenticated;
revoke all on function public.list_agency_suggestions_for_me_v1() from public;
revoke all on function public.list_agency_suggestions_for_me_v1() from anon;
grant execute on function public.list_agency_suggestions_for_me_v1() to authenticated;
revoke all on function public.join_suggested_agency_v1(uuid, text) from public;
revoke all on function public.join_suggested_agency_v1(uuid, text) from anon;
grant execute on function public.join_suggested_agency_v1(uuid, text) to authenticated;
