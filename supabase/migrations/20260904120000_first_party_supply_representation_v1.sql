-- @human-gate-approved
-- Owner authorization: "P0 — IMPLEMENT AGENTAI OS <-> LABOURMARKET.AI
-- FIRST-PARTY SUPPLY BRIDGE. OWNER DECISION: APPROVED." (2026-09-04), §2-§5
-- and §11 ("The owner AUTHORIZES building the cross-project transport required
-- for this specific first-party supply contract").
--
-- first_party_supply_representation_v1
-- ===================================================================
-- The LabourMarket.ai half of the `FIRST_PARTY_SUPPLY_FEED` contract
-- (Agentai OS #634, docs/handoff/labourmarket-first-party-supply-feed-v1.md,
-- Agentai SHA 4cdb30c). Agentai built the consumer; nothing here emitted.
--
-- WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT
-- -------------------------------------------------------------------
-- It adds exactly the facts that do not exist anywhere in this schema today:
--
--   * a CURRENT work-seeking intent in the five-state vocabulary the contract
--     speaks (`workers.availability_status` is available/busy/unavailable — an
--     operational status that cannot distinguish "open to offers" from
--     "looking for work", and cannot say when the answer stops being true);
--   * the countries a person may LEGALLY work in, and — a separate question —
--     the countries they AGREE to be offered work in;
--   * the three authorities beyond matching (contact, publication, identity
--     disclosure), each independently answerable.
--
-- It reuses everything that already exists: `workers`, `worker_professions`,
-- `professions`, `worker_skills`, `profession_skills`, `organizations`, and —
-- critically — the append-only `privacy_consent_events` ledger. No second
-- worker model, no second consent ledger, no second matching engine.
--
-- WHY A NEW CONSENT PURPOSE AND NOT `profile_discoverability`
-- -------------------------------------------------------------------
-- `profile_discoverability` names its recipients as "registered and signed-in
-- companies and staffing agencies on LabourMarket.ai". Representing the same
-- person as supply inside a partner network that searches employers OUTSIDE
-- this product is a different recipient category, so it is a different
-- purpose under Art. 5(1)(b). Reusing the discoverability grant would extend a
-- consent past the sentence the person read, and an emitter cannot repair that
-- afterwards. The version+hash pinned below is produced by
-- `consentTextHash(PARTNER_SUPPLY_REPRESENTATION_V1)` in
-- apps/web/lib/privacy/consent-definitions.ts — a stale hash is rejected by the
-- grant RPC (fail closed), exactly as the two existing purposes are.
--
-- DEFAULT DENY IS STRUCTURAL, NOT A CONVENTION
-- -------------------------------------------------------------------
-- MATCH authority is the newest `partner_supply_representation` ledger event
-- being `granted` AT THE CURRENT TEXT VERSION. Absent ledger row => denied.
-- Stale version => denied. Withdrawn => denied. The other three authorities
-- default to `false` columns, so a declaration written by a client that never
-- heard of them grants nothing. Registration, a CV upload, an application, or
-- a previous grant for another purpose all remain worth exactly zero here.
--
-- Rollback: supabase/rollbacks/20260904120000_first_party_supply_representation_v1.down.sql

-- ---------------------------------------------------------------------------
-- 1. The consent purpose (pinned text version + hash)
-- ---------------------------------------------------------------------------

insert into public.privacy_consent_purposes (purpose, current_version, current_text_hash)
values (
  'partner_supply_representation',
  '2026-09-04.v1',
  'c1b888b72022dab4ca4c31aa89dceb85e3a2d0ca4e0b3e33500349e9e71c5791'
)
on conflict (purpose) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The declaration: current intent, geography, markets, authorities
-- ---------------------------------------------------------------------------

create table if not exists public.first_party_supply_declarations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,

  -- The contract's vocabulary, verbatim. Only AVAILABLE_NOW / AVAILABLE_FROM
  -- reach the consumer's LIKELY tier; "looking for work" is a profile, not an
  -- availability window, and the consumer maps it accordingly.
  intent_state text not null check (intent_state in (
    'AVAILABLE_NOW', 'AVAILABLE_FROM', 'OPEN_TO_OFFERS',
    'LOOKING_FOR_WORK', 'LOOKING_FOR_PROJECTS'
  )),
  available_from date,

  -- Where they may LEGALLY work. Not a preference — `workers.preferred_countries`
  -- already holds the preference and is a different question with a different
  -- consequence.
  work_authorised_countries text[] not null,
  -- Where they AGREE to be offered work. A person legally able to work in
  -- Germany who did not agree to be offered there is not supply for a German
  -- employer, and merging the two is a disclosure error wearing a legal
  -- justification.
  allowed_markets text[] not null default '{}'::text[],
  -- Channels the person agreed a published aggregate may reach. Empty means
  -- NONE, never "all" — the consumer reads it the same way.
  allowed_channels text[] not null default '{}'::text[],

  -- The three authorities beyond MATCH. MATCH itself lives in the consent
  -- ledger, because it is the act of consenting; these are its scope.
  contact_authority boolean not null default false,
  publication_authority boolean not null default false,
  identity_disclosure_authority boolean not null default false,

  -- PERSON today, TEAM/CREW when the canonical structures carry one. Kept open
  -- so "need 8 scaffolders" can later meet a crew without a contract change.
  actor_type text not null default 'WORKER' check (actor_type in ('WORKER', 'TEAM')),
  team_organization_id uuid references public.organizations(id),
  headcount integer check (headcount is null or (headcount >= 1 and headcount <= 200)),

  declared_at timestamptz not null default now(),
  -- The last time the PERSON confirmed the answer is still true. Freshness
  -- decays from this, never from `updated_at` — a background recompute must
  -- not be able to make a stale answer look fresh.
  reconfirmed_at timestamptz not null default now(),
  -- How long the answer stays true. The stalled-emitter safety net: a feed that
  -- stops being rebuilt degrades to nothing rather than to stale claims.
  valid_until timestamptz not null,
  withdrawn_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fpsd_available_from_required check (
    intent_state <> 'AVAILABLE_FROM' or available_from is not null
  ),
  constraint fpsd_geography_stated check (
    cardinality(work_authorised_countries) between 1 and 30
  ),
  constraint fpsd_markets_bounded check (
    cardinality(allowed_markets) <= 30
  ),
  constraint fpsd_channels_bounded check (
    cardinality(allowed_channels) <= 20
  ),
  -- A market they agreed to be offered in but may not legally work in is a
  -- legal error, so the subset relation is enforced rather than trusted.
  constraint fpsd_markets_subset_of_geography check (
    allowed_markets <@ work_authorised_countries
  ),
  constraint fpsd_team_shape check (
    (actor_type = 'TEAM' and team_organization_id is not null)
    or (actor_type = 'WORKER' and team_organization_id is null and headcount is null)
  ),
  constraint fpsd_validity_window check (valid_until > declared_at)
);

comment on table public.first_party_supply_declarations is
  'CURRENT explicit work-seeking intent + the geography/market/authority scope for representing a person (or team) as first-party supply in the partner opportunity network. One row per profile, owner-written. MATCH authority is NOT here — it is the newest granted partner_supply_representation event in privacy_consent_events. Emitted only through first_party_supply_feed_v1(), which is service_role-only.';

comment on column public.first_party_supply_declarations.work_authorised_countries is
  'Countries the person may LEGALLY work in. Distinct from workers.preferred_countries (a preference).';
comment on column public.first_party_supply_declarations.allowed_markets is
  'Countries the person AGREED to be offered work in. Must be a subset of work_authorised_countries.';
comment on column public.first_party_supply_declarations.reconfirmed_at is
  'Last human reconfirmation. Freshness decays from this, never from updated_at.';

create index if not exists first_party_supply_declarations_live_idx
  on public.first_party_supply_declarations (valid_until desc)
  where withdrawn_at is null;

alter table public.first_party_supply_declarations enable row level security;

-- Owner-only, in every direction. Employers and agencies get NOTHING here:
-- this table is consent scope, and the product surfaces that need supply
-- already read `workers` under `can_view_worker`.
drop policy if exists first_party_supply_declarations_select_own
  on public.first_party_supply_declarations;
create policy first_party_supply_declarations_select_own
  on public.first_party_supply_declarations for select
  using (profile_id = auth.uid());

drop policy if exists first_party_supply_declarations_insert_own
  on public.first_party_supply_declarations;
create policy first_party_supply_declarations_insert_own
  on public.first_party_supply_declarations for insert
  with check (profile_id = auth.uid());

drop policy if exists first_party_supply_declarations_update_own
  on public.first_party_supply_declarations;
create policy first_party_supply_declarations_update_own
  on public.first_party_supply_declarations for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- No DELETE policy: withdrawal is a stamp, so a person can prove what they
-- withdrew and when. Deleting the row would erase that.

revoke all on public.first_party_supply_declarations from public;
revoke all on public.first_party_supply_declarations from anon;
grant select, insert, update on public.first_party_supply_declarations to authenticated;

-- ---------------------------------------------------------------------------
-- 3. MATCH authority: the consent predicate
-- ---------------------------------------------------------------------------

create or replace function public.partner_supply_representation_authorised(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Mirrors worker_profile_discoverable/1 exactly: TRUE only when the NEWEST
  -- partner_supply_representation event is 'granted' AND carries the CURRENT
  -- consent-text version. A version bump therefore never silently extends an
  -- old consent to a wider purpose; it makes the person answer again.
  select coalesce((
    select e.action = 'granted' and e.consent_text_version = p.current_version
    from public.privacy_consent_events e
    join public.privacy_consent_purposes p on p.purpose = e.purpose
    where e.user_id = p_profile
      and e.purpose = 'partner_supply_representation'
    order by e.created_at desc, e.id desc
    limit 1
  ), false)
$$;

revoke all on function public.partner_supply_representation_authorised(uuid) from public;
revoke all on function public.partner_supply_representation_authorised(uuid) from anon;
grant execute on function public.partner_supply_representation_authorised(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Freshness: a lifecycle state, computed in ONE place
-- ---------------------------------------------------------------------------

create or replace function public.first_party_supply_freshness(
  p_reconfirmed_at timestamptz,
  p_valid_until timestamptz,
  p_withdrawn_at timestamptz
)
returns text
language sql
immutable
set search_path = public
as $$
  -- WITHDRAWN is a person saying stop; it outranks every other state.
  -- AGEING is "still declared, old enough to want reconfirmation" — the
  -- consumer already decays it (x0.7) rather than dropping it, so the honest
  -- answer is to say AGEING rather than to keep calling it CURRENT.
  select case
    when p_withdrawn_at is not null then 'WITHDRAWN'
    when p_valid_until <= now() then 'EXPIRED'
    when p_reconfirmed_at <= now() - interval '30 days' then 'AGEING'
    else 'CURRENT'
  end
$$;

revoke all on function public.first_party_supply_freshness(timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.first_party_supply_freshness(timestamptz, timestamptz, timestamptz) from anon;
grant execute on function public.first_party_supply_freshness(timestamptz, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Grant / withdraw the consent (mirrors the two existing purposes)
-- ---------------------------------------------------------------------------

create or replace function public.grant_partner_supply_representation_consent(
  p_version text,
  p_hash text,
  p_locale text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cur public.privacy_consent_purposes;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_cur from public.privacy_consent_purposes
    where purpose = 'partner_supply_representation';
  if v_cur is null
    or v_cur.current_version is distinct from p_version
    or v_cur.current_text_hash is distinct from p_hash
  then
    return jsonb_build_object('ok', false, 'error', 'stale_consent_version');
  end if;
  if p_locale not in ('lt', 'en', 'ru', 'nl', 'de') then
    return jsonb_build_object('ok', false, 'error', 'unsupported_locale');
  end if;
  if coalesce(char_length(btrim(p_source)), 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source)
  values
    (v_uid, 'partner_supply_representation', 'granted', p_version, p_hash, p_locale, p_source);
  return jsonb_build_object('ok', true, 'status', 'granted');
end;
$$;

create or replace function public.withdraw_partner_supply_representation_consent(
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cur public.privacy_consent_purposes;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if coalesce(char_length(btrim(p_source)), 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;
  -- Withdrawal is ALWAYS accepted, whatever version the grant used.
  select * into v_cur from public.privacy_consent_purposes
    where purpose = 'partner_supply_representation';
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source)
  values
    (v_uid, 'partner_supply_representation', 'withdrawn',
     coalesce(v_cur.current_version, 'unknown'),
     coalesce(v_cur.current_text_hash, 'unknown'),
     'lt', p_source);
  -- Withdrawing the consent also stops the declaration being emitted. Leaving
  -- the declaration "live" while the consent is gone would mean the next
  -- rebuild depended on the emitter remembering to check both.
  update public.first_party_supply_declarations
    set withdrawn_at = now(), updated_at = now()
    where profile_id = v_uid and withdrawn_at is null;
  return jsonb_build_object('ok', true, 'status', 'withdrawn');
end;
$$;

create or replace function public.current_partner_supply_representation_consent()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'status', case
        when e.action = 'withdrawn' then 'withdrawn'
        when e.consent_text_version = p.current_version then 'granted'
        else 'granted_stale_version'
      end,
      'decidedAt', to_char(e.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'version', e.consent_text_version
    )
    from public.privacy_consent_events e
    join public.privacy_consent_purposes p on p.purpose = e.purpose
    where e.user_id = auth.uid()
      and e.purpose = 'partner_supply_representation'
    order by e.created_at desc, e.id desc
    limit 1
  ), jsonb_build_object('status', 'not_set', 'decidedAt', null, 'version', null))
$$;

revoke all on function public.grant_partner_supply_representation_consent(text, text, text, text) from public;
revoke all on function public.grant_partner_supply_representation_consent(text, text, text, text) from anon;
grant execute on function public.grant_partner_supply_representation_consent(text, text, text, text) to authenticated;

revoke all on function public.withdraw_partner_supply_representation_consent(text) from public;
revoke all on function public.withdraw_partner_supply_representation_consent(text) from anon;
grant execute on function public.withdraw_partner_supply_representation_consent(text) to authenticated;

revoke all on function public.current_partner_supply_representation_consent() from public;
revoke all on function public.current_partner_supply_representation_consent() from anon;
grant execute on function public.current_partner_supply_representation_consent() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Write / read / withdraw the declaration itself
-- ---------------------------------------------------------------------------

create or replace function public.upsert_my_first_party_supply_declaration(
  p_intent_state text,
  p_available_from date,
  p_work_authorised_countries text[],
  p_allowed_markets text[],
  p_allowed_channels text[],
  p_contact_authority boolean,
  p_publication_authority boolean,
  p_identity_disclosure_authority boolean,
  p_valid_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_geo text[];
  v_markets text[];
  v_channels text[];
  v_days integer := coalesce(p_valid_days, 60);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_intent_state is null or p_intent_state not in (
    'AVAILABLE_NOW', 'AVAILABLE_FROM', 'OPEN_TO_OFFERS',
    'LOOKING_FOR_WORK', 'LOOKING_FOR_PROJECTS'
  ) then
    return jsonb_build_object('ok', false, 'error', 'unknown_intent_state');
  end if;
  if p_intent_state = 'AVAILABLE_FROM' and p_available_from is null then
    return jsonb_build_object('ok', false, 'error', 'available_from_required');
  end if;
  if v_days < 1 or v_days > 365 then
    return jsonb_build_object('ok', false, 'error', 'invalid_validity_window');
  end if;

  -- Normalise to upper-case ISO-3166-1 alpha-2. Anything that is not two
  -- letters is REJECTED rather than dropped: silently discarding a country a
  -- person typed would narrow their reach without telling them.
  select coalesce(array_agg(distinct upper(btrim(c))), '{}'::text[])
    into v_geo
    from unnest(coalesce(p_work_authorised_countries, '{}'::text[])) as c
    where btrim(c) <> '';
  select coalesce(array_agg(distinct upper(btrim(c))), '{}'::text[])
    into v_markets
    from unnest(coalesce(p_allowed_markets, '{}'::text[])) as c
    where btrim(c) <> '';
  select coalesce(array_agg(distinct btrim(c)), '{}'::text[])
    into v_channels
    from unnest(coalesce(p_allowed_channels, '{}'::text[])) as c
    where btrim(c) <> '';

  if cardinality(v_geo) = 0 then
    return jsonb_build_object('ok', false, 'error', 'work_authorised_countries_required');
  end if;
  if exists (select 1 from unnest(v_geo) as c where c !~ '^[A-Z]{2}$')
     or exists (select 1 from unnest(v_markets) as c where c !~ '^[A-Z]{2}$') then
    return jsonb_build_object('ok', false, 'error', 'country_code_not_iso2');
  end if;
  if not (v_markets <@ v_geo) then
    return jsonb_build_object('ok', false, 'error', 'market_outside_work_authorisation');
  end if;

  insert into public.first_party_supply_declarations as d (
    profile_id, intent_state, available_from,
    work_authorised_countries, allowed_markets, allowed_channels,
    contact_authority, publication_authority, identity_disclosure_authority,
    declared_at, reconfirmed_at, valid_until, withdrawn_at, updated_at
  ) values (
    v_uid, p_intent_state,
    p_available_from,
    v_geo, v_markets, v_channels,
    coalesce(p_contact_authority, false),
    coalesce(p_publication_authority, false),
    coalesce(p_identity_disclosure_authority, false),
    now(), now(), now() + make_interval(days => v_days), null, now()
  )
  on conflict (profile_id) do update set
    intent_state = excluded.intent_state,
    available_from = excluded.available_from,
    work_authorised_countries = excluded.work_authorised_countries,
    allowed_markets = excluded.allowed_markets,
    allowed_channels = excluded.allowed_channels,
    contact_authority = excluded.contact_authority,
    publication_authority = excluded.publication_authority,
    identity_disclosure_authority = excluded.identity_disclosure_authority,
    -- A re-answer IS a reconfirmation, and it revives a withdrawn row.
    reconfirmed_at = now(),
    valid_until = excluded.valid_until,
    withdrawn_at = null,
    updated_at = now()
  where d.profile_id = v_uid;

  return jsonb_build_object('ok', true, 'status', 'declared');
end;
$$;

create or replace function public.reconfirm_my_first_party_supply_declaration(
  p_valid_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_days integer := coalesce(p_valid_days, 60);
  v_hit integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if v_days < 1 or v_days > 365 then
    return jsonb_build_object('ok', false, 'error', 'invalid_validity_window');
  end if;
  update public.first_party_supply_declarations
    set reconfirmed_at = now(),
        valid_until = now() + make_interval(days => v_days),
        updated_at = now()
    where profile_id = v_uid and withdrawn_at is null;
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_live_declaration');
  end if;
  return jsonb_build_object('ok', true, 'status', 'reconfirmed');
end;
$$;

create or replace function public.withdraw_my_first_party_supply_declaration()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  update public.first_party_supply_declarations
    set withdrawn_at = now(), updated_at = now()
    where profile_id = v_uid and withdrawn_at is null;
  return jsonb_build_object('ok', true, 'status', 'withdrawn');
end;
$$;

create or replace function public.my_first_party_supply_declaration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'intentState', d.intent_state,
      'availableFrom', d.available_from,
      'workAuthorisedCountries', to_jsonb(d.work_authorised_countries),
      'allowedMarkets', to_jsonb(d.allowed_markets),
      'allowedChannels', to_jsonb(d.allowed_channels),
      'contactAuthority', d.contact_authority,
      'publicationAuthority', d.publication_authority,
      'identityDisclosureAuthority', d.identity_disclosure_authority,
      'declaredAt', d.declared_at,
      'reconfirmedAt', d.reconfirmed_at,
      'validUntil', d.valid_until,
      'withdrawnAt', d.withdrawn_at,
      'freshness', public.first_party_supply_freshness(d.reconfirmed_at, d.valid_until, d.withdrawn_at),
      'matchAuthority', public.partner_supply_representation_authorised(d.profile_id)
    )
    from public.first_party_supply_declarations d
    where d.profile_id = auth.uid()
  ), jsonb_build_object('intentState', null, 'matchAuthority', false))
$$;

revoke all on function public.upsert_my_first_party_supply_declaration(text, date, text[], text[], text[], boolean, boolean, boolean, integer) from public;
revoke all on function public.upsert_my_first_party_supply_declaration(text, date, text[], text[], text[], boolean, boolean, boolean, integer) from anon;
grant execute on function public.upsert_my_first_party_supply_declaration(text, date, text[], text[], text[], boolean, boolean, boolean, integer) to authenticated;

revoke all on function public.reconfirm_my_first_party_supply_declaration(integer) from public;
revoke all on function public.reconfirm_my_first_party_supply_declaration(integer) from anon;
grant execute on function public.reconfirm_my_first_party_supply_declaration(integer) to authenticated;

revoke all on function public.withdraw_my_first_party_supply_declaration() from public;
revoke all on function public.withdraw_my_first_party_supply_declaration() from anon;
grant execute on function public.withdraw_my_first_party_supply_declaration() to authenticated;

revoke all on function public.my_first_party_supply_declaration() from public;
revoke all on function public.my_first_party_supply_declaration() from anon;
grant execute on function public.my_first_party_supply_declaration() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The trades a person's evidence supports — never only the CV job title
-- ---------------------------------------------------------------------------

create or replace function public.first_party_supply_trades(p_worker uuid)
returns text[]
language sql
stable
set search_path = public
as $$
  -- Declared professions, PLUS professions whose CORE skills this worker holds
  -- with evidence (a work-journal entry, a manager confirmation, or an explicit
  -- verification). A self-declared skill never adds an adjacent trade, and a
  -- skill is never inferred from a neighbouring skill — only a real held skill
  -- that is core to a profession can widen the search.
  --
  -- Slugs are emitted with underscores as spaces because the consumer
  -- classifies free-text trade titles: "concrete_worker" matches nothing,
  -- "concrete worker" matches CONCRETE_WORKER. An unrecognised trade is not
  -- dropped there either — it comes back as an unresolved trade, so a taxonomy
  -- gap stays countable instead of silently narrowing the search.
  select coalesce(array_agg(distinct replace(slug, '_', ' ')), '{}'::text[])
  from (
    select p.slug
    from public.worker_professions wp
    join public.professions p on p.id = wp.profession_id
    where wp.worker_id = p_worker and p.is_active

    union

    select p.slug
    from public.worker_skills ws
    join public.profession_skills ps on ps.skill_id = ws.skill_id and ps.is_core
    join public.professions p on p.id = ps.profession_id and p.is_active
    where ws.worker_id = p_worker
      and (ws.verified or ws.source in ('work_journal', 'manager_confirmed'))
  ) t
$$;

revoke all on function public.first_party_supply_trades(uuid) from public;
revoke all on function public.first_party_supply_trades(uuid) from anon;

-- ---------------------------------------------------------------------------
-- 8. The feed projection — service_role only
-- ---------------------------------------------------------------------------

create or replace function public.first_party_supply_feed_v1()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  -- The MINIMUM AUTHORISED PROJECTION, and nothing else. There is no name,
  -- email, phone, address or free-text field in this select list, and adding
  -- one would have to be a deliberate edit here rather than a field that
  -- travelled along with a join.
  --
  -- The authority filter lives in THIS function, not in the emitting
  -- application, so a second caller cannot get a laxer answer than the first.
  select jsonb_build_object(
    'schemaVersion', 'agentai-first-party-market-signal/v1',
    'signalId', 'lm-sig-' || d.id::text,
    'signalType', 'WORKER_AVAILABILITY',
    'actorType', d.actor_type,
    -- Opaque and stable: a random uuid the product can resolve and the
    -- consumer cannot. Never derived from a name, an email or a profile id.
    'actorRef', 'lm:' || lower(d.actor_type) || ':' || d.id::text,
    'projectScope', 'labourmarketai',
    'currentState', d.intent_state,
    'freshness', public.first_party_supply_freshness(d.reconfirmed_at, d.valid_until, d.withdrawn_at),
    'geography', to_jsonb(d.work_authorised_countries),
    'allowedMarkets', to_jsonb(d.allowed_markets),
    'trades', to_jsonb(public.first_party_supply_trades(w.id)),
    'availableFromIso', to_jsonb(d.available_from),
    'headcount', to_jsonb(d.headcount),
    'requirementSummary', null::jsonb,
    -- `profile_completeness` is 0 for every worker because nothing computes it
    -- yet. Emitting 0.0 would claim a measurement of zero; null says the
    -- product did not report one, which is what is true, and the consumer
    -- treats null as neutral rather than punitive.
    'evidenceCompleteness', case
      when w.profile_completeness > 0 then to_jsonb(round(w.profile_completeness::numeric / 100, 4))
      else null::jsonb
    end,
    'verifiedAtIso', to_char(d.reconfirmed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAtIso', to_char(d.valid_until at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'authorities', jsonb_build_object(
      -- Reaching this row already means MATCH was granted; stating it
      -- explicitly keeps the emitted row self-describing rather than
      -- meaningful only next to the query that produced it.
      'matchAuthority', 'GRANTED',
      'contactAuthority', case when d.contact_authority then 'GRANTED' else 'DENIED' end,
      'publicationAuthority', case when d.publication_authority then 'GRANTED' else 'DENIED' end,
      'identityDisclosureAuthority', case when d.identity_disclosure_authority then 'GRANTED' else 'DENIED' end
    ),
    'allowedChannels', to_jsonb(d.allowed_channels),
    'provenance', 'FIRST_PARTY_REGISTERED'
  )
  from public.first_party_supply_declarations d
  join public.workers w on w.profile_id = d.profile_id
  where d.withdrawn_at is null
    and d.valid_until > now()
    and public.partner_supply_representation_authorised(d.profile_id)
  order by d.id;
$$;

comment on function public.first_party_supply_feed_v1() is
  'The agentai-first-party-market-signal/v1 projection. Emits ONLY rows with a current granted partner_supply_representation consent, a live declaration and an unexpired validity window. Withdrawn and expired supply is absent, never downgraded. service_role only — never grant this to authenticated.';

-- The one function in this migration that authenticated users must NOT hold:
-- it returns every authorised person at once, which is a legitimate thing for
-- the emitter to do and an illegitimate thing for a signed-in account to do.
revoke all on function public.first_party_supply_feed_v1() from public;
revoke all on function public.first_party_supply_feed_v1() from anon;
revoke all on function public.first_party_supply_feed_v1() from authenticated;
grant execute on function public.first_party_supply_feed_v1() to service_role;

-- ROLLBACK
-- See supabase/rollbacks/20260904120000_first_party_supply_representation_v1.down.sql
-- (drops the six functions and the table, and removes the seeded purpose row
-- only when no consent event references it).
