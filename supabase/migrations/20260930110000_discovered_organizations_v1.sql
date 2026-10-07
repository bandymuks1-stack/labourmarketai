-- ============================================================================
-- 20260930110000 — discovered (unclaimed) organizations + marketplace company ingest.
--
-- RED by rule (new SECURITY DEFINER functions, GRANTs, additive RLS on
-- organizations, seed/backfill DML). MODEL OWNER-APPROVED 2026-09-30
-- ("#2000 — MODEL DIRECTION APPROVED"; §3 import permission; §4 claim
-- evidence). The exact SQL below still needs the owner's apply sentence.
-- Apply only via Supabase MCP apply_migration.
-- @human-gate-approved
--
-- MODEL (docs/proposals/discovered-organization-model-v1.md):
--   organizations.claim_state   discovered → invited → claim_requested →
--                               representative_verified → claimed
--   owner_profile_id = NULL     no confirmed platform owner (unchanged meaning)
--   organization_identifiers    strong keys (registration_code, vat, web_domain)
--                               are UNIQUE — a duplicate is refused by the DB
--   organization_facts          append-only sourced facts (never overwrite)
--   organization_claims         the claim record; the claimant can never decide
--                               their own claim
--   platform_capability_grants  `marketplace_company_ingest` — NOT hard-coded
--                               to admins: admin OR an explicit grant OR the
--                               service role
--
-- IMPORT ≠ CLAIM. The ingest writes owner_profile_id = NULL and
-- claim_state = 'discovered'; nothing in this file can set an owner. Linking a
-- verified claim to ownership (setting owner_profile_id + the companies
-- binding) is a SEPARATE later RED step — it touches the membership seed
-- triggers and the companies mirror and is deliberately not bundled here.
--
-- An email domain is EVIDENCE only (verification_method
-- 'official_domain_email'); no code path turns it into ownership.
--
-- ROLLBACK: supabase/rollbacks/20260930110000_discovered_organizations_v1.down.sql
-- ============================================================================

-- ── 1. claim_state on the ONE organizations table ───────────────────────────
alter table public.organizations
  add column if not exists claim_state text not null default 'claimed';

alter table public.organizations
  add constraint organizations_claim_state_check
  check (claim_state in ('discovered','invited','claim_requested','representative_verified','claimed'));

-- An unclaimed organization has no owner. (A claimed one may have lost its
-- owner through ON DELETE SET NULL — that direction is not constrained.)
alter table public.organizations
  add constraint organizations_unclaimed_has_no_owner
  check (claim_state = 'claimed' or owner_profile_id is null);

-- ── 1b. the owner-membership seed learns the one exception ──────────────────
-- `company_memberships_seed_org_owner` (20260807090000) refuses ANY
-- organization without an owner ("org_without_owner"). That invariant stays
-- for every CLAIMED organization, byte-for-byte. The ONLY new path is an
-- UNCLAIMED (discovered/…) organization, which by the approved model has no
-- confirmed owner — so it seeds no membership and is not refused. Found by the
-- rolled-back production dry run of this file (2026-09-30).
create or replace function public.company_memberships_seed_org_owner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.owner_profile_id is null then
    if new.claim_state <> 'claimed' then
      return new;
    end if;
    raise exception
      'org_without_owner: organization % has no owner_profile_id — the canonical owner membership cannot be created, so the organization must not be created',
      new.id
      using errcode = '23514';
  end if;
  insert into public.company_memberships
    (organization_id, profile_id, role, status, accepted_at, source)
  select new.id, new.owner_profile_id, 'owner', 'active', now(), 'org-create'
  where not exists (
    select 1 from public.company_memberships m
     where m.organization_id = new.id
       and m.profile_id = new.owner_profile_id
       and m.status in ('invited','active')
  )
  on conflict do nothing;
  return new;
end $function$;

-- A trigger function, never callable by a client (same grants as 20260807090000).
revoke all on function public.company_memberships_seed_org_owner() from public;
revoke all on function public.company_memberships_seed_org_owner() from anon;
revoke all on function public.company_memberships_seed_org_owner() from authenticated;

-- ── 2. platform capability grants ──────────────────────────────────────────
create table if not exists public.platform_capability_grants (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  capability  text not null check (capability in ('marketplace_company_ingest')),
  granted_by  uuid references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_by  uuid references public.profiles(id) on delete set null,
  revoked_at  timestamptz,
  note        text check (note is null or char_length(note) <= 300)
);
create unique index if not exists platform_capability_grants_active_uq
  on public.platform_capability_grants (profile_id, capability) where revoked_at is null;

alter table public.platform_capability_grants enable row level security;
create policy platform_capability_grants_admin_all
  on public.platform_capability_grants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy platform_capability_grants_self_select
  on public.platform_capability_grants for select to authenticated
  using (profile_id = auth.uid());

create or replace function public.has_platform_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(auth.role(), '') = 'service_role'
      or public.is_admin()
      or exists (select 1 from public.platform_capability_grants g
                  where g.profile_id = auth.uid()
                    and g.capability = p_capability
                    and g.revoked_at is null);
$function$;

-- ── 3. identifiers (de-duplication keys) ───────────────────────────────────
create table if not exists public.organization_identifiers (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  scheme           text not null check (scheme in ('registration_code','vat','web_domain','name_country')),
  country          text not null default '' check (country = '' or country ~ '^[A-Z]{2}$'),
  value_normalized text not null check (char_length(value_normalized) between 1 and 200),
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles(id) on delete set null
);
-- Strong keys: one organization per key. The weak name key is not unique —
-- it only raises "possible duplicate".
create unique index if not exists organization_identifiers_strong_uq
  on public.organization_identifiers (scheme, country, value_normalized)
  where scheme <> 'name_country';
create index if not exists organization_identifiers_weak_idx
  on public.organization_identifiers (country, value_normalized)
  where scheme = 'name_country';
create index if not exists organization_identifiers_org_idx
  on public.organization_identifiers (organization_id);

-- ── 4. append-only sourced facts ────────────────────────────────────────────
create table if not exists public.organization_facts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  field            text not null check (field in (
                     'legal_name','display_name','country','city','website','sector',
                     'contact_public_email','contact_public_phone','headcount_band',
                     'registration_code','vat','market_role','description','demand_signal')),
  value            jsonb not null,
  source_kind      text not null check (source_kind in (
                     'public_register','company_website','job_posting','owner_import',
                     'partner_referral','direct_contact','agentai_signal','claimed_representative')),
  source_ref       text check (source_ref is null or char_length(source_ref) <= 500),
  observed_at      date not null,
  import_batch_id  uuid,
  recorded_by      uuid references public.profiles(id) on delete set null,
  superseded_by    uuid references public.organization_facts(id),
  created_at       timestamptz not null default now()
);
create index if not exists organization_facts_org_idx on public.organization_facts (organization_id, field);
create index if not exists organization_facts_batch_idx on public.organization_facts (import_batch_id);

-- Append-only: no UPDATE of content, no DELETE (superseding is a new row
-- pointing back; only `superseded_by` may be set, once).
create or replace function public.organization_facts_append_only()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'organization_facts is append-only' using errcode = '42501';
  end if;
  if new.organization_id is distinct from old.organization_id
     or new.field is distinct from old.field
     or new.value is distinct from old.value
     or new.source_kind is distinct from old.source_kind
     or new.source_ref is distinct from old.source_ref
     or new.observed_at is distinct from old.observed_at
     or new.import_batch_id is distinct from old.import_batch_id
     or new.recorded_by is distinct from old.recorded_by
     or new.created_at is distinct from old.created_at
     or old.superseded_by is not null then
    raise exception 'organization_facts is append-only' using errcode = '42501';
  end if;
  return new;
end;
$function$;
create trigger organization_facts_append_only
  before update or delete on public.organization_facts
  for each row execute function public.organization_facts_append_only();

-- ── 5. claims ───────────────────────────────────────────────────────────────
create table if not exists public.organization_claims (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  claimant_profile_id       uuid not null references public.profiles(id) on delete cascade,
  state                     text not null default 'requested'
                              check (state in ('invited','requested','representative_verified','linked','rejected','withdrawn')),
  verification_method       text check (verification_method in (
                              'official_domain_email','existing_org_admin_invitation',
                              'operator_manual_review','official_register_representation')),
  verification_evidence_ref text check (verification_evidence_ref is null or char_length(verification_evidence_ref) <= 500),
  decided_by                uuid references public.profiles(id) on delete set null,
  decided_at                timestamptz,
  decision_note             text check (decision_note is null or char_length(decision_note) <= 500),
  created_at                timestamptz not null default now(),
  -- The claimant can never decide their own claim.
  constraint organization_claims_not_self_decided check (decided_by is null or decided_by <> claimant_profile_id),
  -- A decision always names who, when, how and on what evidence.
  constraint organization_claims_decision_complete check (
    state not in ('representative_verified','linked')
    or (decided_by is not null and decided_at is not null
        and verification_method is not null and verification_evidence_ref is not null))
);
create unique index if not exists organization_claims_one_open_uq
  on public.organization_claims (organization_id, claimant_profile_id)
  where state in ('invited','requested','representative_verified');

-- ── 6. RLS on the new tables ────────────────────────────────────────────────
alter table public.organization_identifiers enable row level security;
alter table public.organization_facts enable row level security;
alter table public.organization_claims enable row level security;

create policy organization_identifiers_select on public.organization_identifiers
  for select to authenticated
  using (public.is_admin()
         or public.has_platform_capability('marketplace_company_ingest')
         or public.belongs_to_organization(organization_id));
create policy organization_facts_select on public.organization_facts
  for select to authenticated
  using (public.is_admin()
         or public.has_platform_capability('marketplace_company_ingest')
         or public.belongs_to_organization(organization_id));
create policy organization_claims_select on public.organization_claims
  for select to authenticated
  using (claimant_profile_id = auth.uid()
         or public.is_admin()
         or public.has_platform_capability('marketplace_company_ingest'));
-- Writes to all three go ONLY through the SECURITY DEFINER functions below.

-- ADDITIVE read on organizations: an ingest operator may read UNCLAIMED
-- organizations (never a claimed one they do not belong to).
create policy organizations_select_unclaimed_for_ingest on public.organizations
  for select to authenticated
  using (claim_state <> 'claimed' and public.has_platform_capability('marketplace_company_ingest'));

-- ── 7. market role seeds (additive) ────────────────────────────────────────
insert into public.organization_role_types (slug, category) values
  ('contractor', 'project'), ('subcontractor', 'project'), ('supplier', 'service')
on conflict (slug) do nothing;

-- ── 8. backfill identifiers for EXISTING organizations ─────────────────────
-- So an import can never create a second copy of a company already here.
insert into public.organization_identifiers (organization_id, scheme, country, value_normalized)
select o.id, 'registration_code', coalesce(o.country, ''), upper(regexp_replace(c.registration_code, '[^A-Za-z0-9]', '', 'g'))
  from public.organizations o join public.companies c on c.id = o.legacy_company_id
 where c.registration_code is not null and regexp_replace(c.registration_code, '[^A-Za-z0-9]', '', 'g') <> ''
on conflict do nothing;
insert into public.organization_identifiers (organization_id, scheme, country, value_normalized)
select o.id, 'vat', '', upper(regexp_replace(coalesce(c.vat_number, o.vat_number), '[^A-Za-z0-9]', '', 'g'))
  from public.organizations o left join public.companies c on c.id = o.legacy_company_id
 where coalesce(c.vat_number, o.vat_number) is not null
   and regexp_replace(coalesce(c.vat_number, o.vat_number), '[^A-Za-z0-9]', '', 'g') <> ''
on conflict do nothing;
insert into public.organization_identifiers (organization_id, scheme, country, value_normalized)
select o.id, 'name_country', coalesce(o.country, ''),
       left(lower(regexp_replace(coalesce(o.legal_name, o.display_name), '[^[:alnum:]]+', ' ', 'g')), 200)
  from public.organizations o
 where coalesce(o.legal_name, o.display_name) is not null
   and btrim(regexp_replace(coalesce(o.legal_name, o.display_name), '[^[:alnum:]]+', ' ', 'g')) <> '';

-- ── 9. the ingest — ONE write path for discovered organizations ────────────
-- p_rows: [{ ref, display_name, legal_name?, country?, registration_code?,
--            vat?, web_domain?, name_key, roles?[], facts?[{field, value,
--            source_kind, source_ref?, observed_at}] }]
-- Values arrive NORMALIZED by the app (lib/marketplace/company-ingest.ts) and
-- are re-validated here. Per row, in this order:
--   a strong key already known       → 'known': facts are ADDED to that
--                                      organization; its columns are never
--                                      touched (better data is never overwritten)
--   strong keys of two organizations → 'conflict': nothing written
--   no strong key known              → 'created': organization (owner NULL,
--                                      claim_state 'discovered') + identifiers +
--                                      facts + roles
create or replace function public.ingest_discovered_organizations_v1(
  p_batch_id uuid,
  p_rows     jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid       uuid := auth.uid();
  r         jsonb;
  f         jsonb;
  role_slug text;
  v_ref     text;
  v_country text;
  v_reg     text;
  v_vat     text;
  v_dom     text;
  v_name    text;
  v_display text;
  known_ids uuid[];
  v_org     uuid;
  v_outcome text;
  results   jsonb := '[]'::jsonb;
  n_created int := 0;
  n_known   int := 0;
  n_conflict int := 0;
begin
  if not public.has_platform_capability('marketplace_company_ingest') then
    raise exception 'marketplace_company_ingest capability required' using errcode = '42501';
  end if;
  if p_batch_id is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'batch id and a row array are required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'at most 1000 rows per batch' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_ref     := left(coalesce(r->>'ref', ''), 40);
    v_display := btrim(coalesce(r->>'display_name', ''));
    v_country := nullif(upper(btrim(coalesce(r->>'country', ''))), '');
    v_reg     := nullif(upper(regexp_replace(coalesce(r->>'registration_code', ''), '[^A-Za-z0-9]', '', 'g')), '');
    v_vat     := nullif(upper(regexp_replace(coalesce(r->>'vat', ''), '[^A-Za-z0-9]', '', 'g')), '');
    v_dom     := nullif(lower(btrim(coalesce(r->>'web_domain', ''))), '');
    v_name    := nullif(left(btrim(coalesce(r->>'name_key', '')), 200), '');

    if char_length(v_display) not between 2 and 200
       or (v_country is not null and not exists (select 1 from public.countries c where c.code = v_country))
       or (v_dom is not null and v_dom !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') then
      results := results || jsonb_build_object('ref', v_ref, 'outcome', 'invalid');
      continue;
    end if;

    select coalesce(array_agg(distinct i.organization_id), '{}') into known_ids
      from public.organization_identifiers i
     where (i.scheme = 'registration_code' and v_reg is not null and i.value_normalized = v_reg and i.country = coalesce(v_country, ''))
        or (i.scheme = 'vat' and v_vat is not null and i.value_normalized = v_vat)
        or (i.scheme = 'web_domain' and v_dom is not null and i.value_normalized = v_dom);

    if cardinality(known_ids) > 1 then
      n_conflict := n_conflict + 1;
      results := results || jsonb_build_object('ref', v_ref, 'outcome', 'conflict',
                                               'organization_ids', to_jsonb(known_ids));
      continue;
    elsif cardinality(known_ids) = 1 then
      v_org := known_ids[1];
      v_outcome := 'known';
      n_known := n_known + 1;
    else
      insert into public.organizations (organization_type, owner_profile_id, claim_state, display_name, legal_name, country)
      values ('company', null, 'discovered', v_display, nullif(btrim(coalesce(r->>'legal_name', '')), ''), v_country)
      returning id into v_org;
      v_outcome := 'created';
      n_created := n_created + 1;
      if v_reg is not null then
        insert into public.organization_identifiers (organization_id, scheme, country, value_normalized, created_by)
        values (v_org, 'registration_code', coalesce(v_country, ''), v_reg, uid) on conflict do nothing;
      end if;
      if v_vat is not null then
        insert into public.organization_identifiers (organization_id, scheme, country, value_normalized, created_by)
        values (v_org, 'vat', '', v_vat, uid) on conflict do nothing;
      end if;
      if v_dom is not null then
        insert into public.organization_identifiers (organization_id, scheme, country, value_normalized, created_by)
        values (v_org, 'web_domain', '', v_dom, uid) on conflict do nothing;
      end if;
      if v_name is not null then
        insert into public.organization_identifiers (organization_id, scheme, country, value_normalized, created_by)
        values (v_org, 'name_country', coalesce(v_country, ''), v_name, uid);
      end if;
      if jsonb_typeof(r->'roles') = 'array' then
        for role_slug in select jsonb_array_elements_text(r->'roles') loop
          if exists (select 1 from public.organization_role_types t where t.slug = role_slug) then
            insert into public.organization_roles (organization_id, role_slug) values (v_org, role_slug)
            on conflict do nothing;
          end if;
        end loop;
      end if;
    end if;

    -- Facts are appended in BOTH cases — a known organization gains sourced
    -- facts, never overwritten columns.
    if jsonb_typeof(r->'facts') = 'array' then
      for f in select * from jsonb_array_elements(r->'facts') loop
        insert into public.organization_facts
          (organization_id, field, value, source_kind, source_ref, observed_at, import_batch_id, recorded_by)
        values (v_org, f->>'field', f->'value', f->>'source_kind', nullif(f->>'source_ref', ''),
                (f->>'observed_at')::date, p_batch_id, uid);
      end loop;
    end if;

    results := results || jsonb_build_object('ref', v_ref, 'outcome', v_outcome, 'organization_id', v_org);
  end loop;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (uid, 'ingest_discovered_organizations_v1', 'import_batch', p_batch_id,
          jsonb_build_object('rows', jsonb_array_length(p_rows), 'created', n_created,
                             'known', n_known, 'conflict', n_conflict), now());

  return jsonb_build_object('batch_id', p_batch_id, 'created', n_created, 'known', n_known,
                            'conflict', n_conflict, 'rows', results);
end;
$function$;

-- ── 10. claims — request and decide (NOT link; see header) ──────────────────
create or replace function public.request_organization_claim_v1(
  p_organization_id uuid,
  p_method          text,
  p_evidence_ref    text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_state text;
  cid uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select claim_state into v_state from public.organizations where id = p_organization_id;
  if v_state is null or v_state = 'claimed' then
    raise exception 'Organization is not claimable' using errcode = '22023';
  end if;
  if p_method not in ('official_domain_email','existing_org_admin_invitation',
                      'operator_manual_review','official_register_representation') then
    raise exception 'Invalid verification method' using errcode = '22023';
  end if;
  insert into public.organization_claims (organization_id, claimant_profile_id, state, verification_method, verification_evidence_ref)
  values (p_organization_id, uid, 'requested', p_method, left(p_evidence_ref, 500))
  returning id into cid;
  update public.organizations set claim_state = 'claim_requested', updated_at = now()
   where id = p_organization_id and claim_state in ('discovered', 'invited');
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (uid, 'request_organization_claim_v1', 'organization', p_organization_id,
          jsonb_build_object('claim_id', cid, 'method', p_method), now());
  return cid;
end;
$function$;

create or replace function public.decide_organization_claim_v1(
  p_claim_id     uuid,
  p_decision     text,
  p_evidence_ref text,
  p_note         text
) returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  c   public.organization_claims;
begin
  if not (public.is_admin() or public.has_platform_capability('marketplace_company_ingest')) then
    raise exception 'Not authorized to decide claims' using errcode = '42501';
  end if;
  select * into c from public.organization_claims where id = p_claim_id for update;
  if c.id is null then raise exception 'No such claim' using errcode = 'P0002'; end if;
  if c.claimant_profile_id = uid then
    raise exception 'A claimant cannot decide their own claim' using errcode = '42501';
  end if;
  if c.state <> 'requested' then return 'not_pending'; end if;
  if p_decision = 'verify' then
    if coalesce(btrim(p_evidence_ref), '') = '' then
      raise exception 'Verification needs documented evidence' using errcode = '22023';
    end if;
    update public.organization_claims
       set state = 'representative_verified', decided_by = uid, decided_at = now(),
           verification_evidence_ref = left(p_evidence_ref, 500), decision_note = left(p_note, 500)
     where id = p_claim_id;
    update public.organizations set claim_state = 'representative_verified', updated_at = now()
     where id = c.organization_id and claim_state <> 'claimed';
  elsif p_decision = 'reject' then
    update public.organization_claims
       set state = 'rejected', decided_by = uid, decided_at = now(), decision_note = left(p_note, 500)
     where id = p_claim_id;
  else
    raise exception 'Decision must be verify or reject' using errcode = '22023';
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (uid, 'decide_organization_claim_v1', 'organization_claim', p_claim_id,
          jsonb_build_object('organization_id', c.organization_id, 'decision', p_decision), now());
  return p_decision;
end;
$function$;

-- ── 11. grants ──────────────────────────────────────────────────────────────
revoke all on function public.has_platform_capability(text) from public, anon;
grant execute on function public.has_platform_capability(text) to authenticated;
revoke all on function public.ingest_discovered_organizations_v1(uuid, jsonb) from public, anon;
grant execute on function public.ingest_discovered_organizations_v1(uuid, jsonb) to authenticated;
revoke all on function public.request_organization_claim_v1(uuid, text, text) from public, anon;
grant execute on function public.request_organization_claim_v1(uuid, text, text) to authenticated;
revoke all on function public.decide_organization_claim_v1(uuid, text, text, text) from public, anon;
grant execute on function public.decide_organization_claim_v1(uuid, text, text, text) to authenticated;
revoke all on function public.organization_facts_append_only() from public, anon;
