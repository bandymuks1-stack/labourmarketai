-- ════════════════════════════════════════════════════════════════════════
-- 0013_work_journal_m1.sql — Work Journal M1 (closed declare→confirm→verify loop)
--
-- Implements docs/architecture/WORK-JOURNAL-DESIGN.md v1.0 §3, grounded on
-- docs/architecture/SCHEMA_INVENTORY.md. ADDITIVE / non-destructive: creates new
-- tables, ALTERs worker_skills to ADD columns, adds mirror triggers + backfill.
-- Existing tables (companies/agencies/workers/profiles) are NOT mutated.
-- Per §14 the destructive collapse of companies/agencies→organizations is
-- deferred to M3 (separate two-PR cycle); M1 only scaffolds + mirrors.
--
-- Executor corrections vs the v1.0 doc (flagged in the PR):
--   • organizations.owner_profile_id is NULLABLE (doc said NOT NULL, but that
--     contradicts ON DELETE SET NULL and companies.profile_id is itself
--     nullable — backfill would fail). FK ON DELETE SET NULL.
--   • engagement_contexts.country_code / organizations.country are TEXT (match
--     countries.code), not char(2). Backfill only sets country_code when it
--     matches a real countries.code.
--   • platform_skill_aggregates is a TABLE in M1 (empty); M3 converts it to a
--     materialized view + refresh cron (doc §3.11). Avoids an empty matview.
--   • EXPLICIT GRANTs to `authenticated` added (this project has no default
--     grants — see migration 0004). Without them the app session can't touch
--     the tables. RLS (below) restricts which rows.
--
-- A manual DOWN script is at the very bottom (commented). Migrations here are
-- forward-only (db push), so the rollback is run by hand / via git revert.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── helper: does the current user manage this organization? ─────────────────
create or replace function public.manages_organization(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = auth.uid()
       and ec.organization_id = org
       and ec.status = 'active'
       and ec.relationship_slug in ('manager','owner','external_manager')
  )
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 1. organizations (scaffolded root; mirrors companies/agencies in M1)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.organizations (
  id                uuid primary key default gen_random_uuid(),
  owner_profile_id  uuid references public.profiles(id) on delete set null,  -- nullable (see header)
  organization_type text not null check (organization_type in ('company','agency','other')),
  legal_name        text,
  display_name      text,
  country           text references public.countries(code),
  description       text,
  vat_number        text,
  website           text,
  trust_score       integer not null default 0,
  legacy_company_id uuid references public.companies(id),
  legacy_agency_id  uuid references public.agencies(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_organizations_owner on public.organizations(owner_profile_id);
create index if not exists idx_organizations_type on public.organizations(organization_type);
create index if not exists idx_organizations_legacy_company on public.organizations(legacy_company_id) where legacy_company_id is not null;
create index if not exists idx_organizations_legacy_agency on public.organizations(legacy_agency_id) where legacy_agency_id is not null;

-- ════════════════════════════════════════════════════════════════════════
-- 2. relationship_types (slug + JSON registry; §10)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.relationship_types (
  slug       text primary key,
  category   text not null check (category in ('employment','ownership','advisory','collaboration','status','education','other')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- 3. productivity_units (scoped slug registry; §10 / §15)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.productivity_units (
  slug                  text primary key,
  category              text not null,
  base_unit_slug        text references public.productivity_units(slug),
  scope                 text not null check (scope in ('platform','org','worker','client')),
  created_by_profile_id uuid references public.profiles(id),
  organization_id       uuid references public.organizations(id),
  parent_unit_slug      text references public.productivity_units(slug),
  conversion_factor     numeric,
  created_at            timestamptz not null default now()
);
create index if not exists idx_productivity_units_scope on public.productivity_units(scope, organization_id) where scope <> 'platform';
create index if not exists idx_productivity_units_parent on public.productivity_units(parent_unit_slug) where parent_unit_slug is not null;

-- ════════════════════════════════════════════════════════════════════════
-- 4. engagement_contexts (first-class; §5.5)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.engagement_contexts (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  organization_id   uuid references public.organizations(id) on delete set null,
  project_id        uuid references public.projects(id) on delete set null,
  relationship_slug text not null references public.relationship_types(slug),
  country_code      text references public.countries(code),
  status            text not null default 'active' check (status in ('active','paused','ended')),
  started_at        date,
  ended_at          date,
  title             text,
  description       text,
  is_primary        boolean not null default false,
  hash_prev         text,
  hash_self         text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_engagement_contexts_profile on public.engagement_contexts(profile_id, status, is_primary desc);
create index if not exists idx_engagement_contexts_org on public.engagement_contexts(organization_id) where organization_id is not null;
create index if not exists idx_engagement_contexts_project on public.engagement_contexts(project_id) where project_id is not null;

-- ════════════════════════════════════════════════════════════════════════
-- 5. journal_entries (append-only; §3)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.journal_entries (
  id                    uuid primary key default gen_random_uuid(),
  worker_id             uuid not null references public.workers(id) on delete cascade,
  engagement_context_id uuid not null references public.engagement_contexts(id) on delete restrict,
  entry_type_slug       text not null check (entry_type_slug in ('freeform','structured','hybrid')),
  profession_id         uuid references public.professions(id),
  original_text         text not null,
  original_language     char(2) not null,
  hash_prev             text,
  hash_self             text not null,
  visibility_scope      text not null default 'closed' check (visibility_scope in ('closed','team','org','client_report','public_proof_link')),
  superseded_by         uuid references public.journal_entries(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_journal_entries_worker on public.journal_entries(worker_id, created_at desc);
create index if not exists idx_journal_entries_engagement on public.journal_entries(engagement_context_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════════
-- 6. journal_entry_metrics
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.journal_entry_metrics (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.journal_entries(id) on delete cascade,
  metric_slug   text not null,
  value_numeric numeric,
  value_text    text,
  unit_slug     text references public.productivity_units(slug),
  source        text not null check (source in ('worker_input','ai_extracted','manager_corrected')),
  created_at    timestamptz not null default now()
);
create index if not exists idx_journal_entry_metrics_entry on public.journal_entry_metrics(entry_id);
create index if not exists idx_journal_entry_metrics_metric on public.journal_entry_metrics(metric_slug);

-- ════════════════════════════════════════════════════════════════════════
-- 7. journal_entry_extractions (built, unused in M1)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.journal_entry_extractions (
  id                      uuid primary key default gen_random_uuid(),
  entry_id                uuid not null references public.journal_entries(id) on delete cascade,
  ai_provider             text not null,
  ai_model                text not null,
  raw_response            jsonb not null,
  candidate_skills        jsonb not null,
  candidate_metrics       jsonb not null,
  worker_confirmed_at     timestamptz,
  worker_confirmed_subset jsonb,
  created_at              timestamptz not null default now()
);
create index if not exists idx_journal_entry_extractions_entry on public.journal_entry_extractions(entry_id);
create index if not exists idx_journal_entry_extractions_provider on public.journal_entry_extractions(ai_provider, created_at desc);

-- ════════════════════════════════════════════════════════════════════════
-- 8. journal_entry_confirmations (append-only)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.journal_entry_confirmations (
  id                              uuid primary key default gen_random_uuid(),
  entry_id                        uuid not null references public.journal_entries(id) on delete cascade,
  confirmer_id                    uuid not null references public.profiles(id),
  confirmer_engagement_context_id uuid not null references public.engagement_contexts(id),
  confirmer_role                  text not null,
  confirmation_scope              jsonb not null,
  created_at                      timestamptz not null default now()
);
create index if not exists idx_journal_entry_confirmations_entry on public.journal_entry_confirmations(entry_id);
create index if not exists idx_journal_entry_confirmations_confirmer on public.journal_entry_confirmations(confirmer_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════════
-- 9. profession_templates
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.profession_templates (
  id                  uuid primary key default gen_random_uuid(),
  profession_id       uuid not null references public.professions(id),
  template            jsonb not null,
  is_platform_default boolean not null default true,
  organization_id     uuid references public.organizations(id),
  created_at          timestamptz not null default now(),
  unique (profession_id, organization_id)
);

-- ════════════════════════════════════════════════════════════════════════
-- 10. platform_skill_aggregates (TABLE in M1; matview in M3)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.platform_skill_aggregates (
  skill_id               uuid primary key references public.skills(id),
  productivity_unit_slug text,
  sample_size            integer not null default 0,
  mean_pace              numeric,
  p25_pace               numeric,
  p50_pace               numeric,
  p75_pace               numeric,
  last_refreshed_at      timestamptz
);

-- ════════════════════════════════════════════════════════════════════════
-- 11. skill_seed_benchmarks (empty in M1)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.skill_seed_benchmarks (
  skill_id               uuid primary key references public.skills(id),
  productivity_unit_slug text,
  typical_pace           numeric,
  source_note            text
);

-- ════════════════════════════════════════════════════════════════════════
-- 12. skill_icons (slug → icon registry)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.skill_icons (
  skill_id        uuid primary key references public.skills(id),
  icon_slug       text not null,
  source          text,
  organization_id uuid references public.organizations(id),
  created_at      timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- worker_skills — ADD trust-signal columns (§3.10 / §15)
-- ════════════════════════════════════════════════════════════════════════
alter table public.worker_skills
  add column if not exists current_pace_value     numeric,
  add column if not exists current_pace_unit_slug text references public.productivity_units(slug),
  add column if not exists confidence_score       integer not null default 0,
  add column if not exists confidence_bin         text not null default 'red' check (confidence_bin in ('red','green','yellow')),
  add column if not exists last_recompute_at      timestamptz;

-- ════════════════════════════════════════════════════════════════════════
-- Mirror triggers: companies/agencies → organizations (NO delete cascade)
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.mirror_company_to_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.organizations
      (owner_profile_id, organization_type, legal_name, display_name, country,
       vat_number, website, description, trust_score, legacy_company_id)
    values
      (new.profile_id, 'company', new.legal_name, new.display_name, new.country,
       new.vat_number, new.website, new.description, new.trust_score, new.id);
  elsif (tg_op = 'UPDATE') then
    update public.organizations set
      owner_profile_id = new.profile_id, legal_name = new.legal_name,
      display_name = new.display_name, country = new.country,
      vat_number = new.vat_number, website = new.website,
      description = new.description, trust_score = new.trust_score,
      updated_at = now()
    where legacy_company_id = new.id;
  end if;
  return new;
end $$;

create or replace function public.mirror_agency_to_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.organizations
      (owner_profile_id, organization_type, legal_name, country, description, legacy_agency_id)
    values
      (new.profile_id, 'agency', new.legal_name, new.country, new.description, new.id);
  elsif (tg_op = 'UPDATE') then
    update public.organizations set
      owner_profile_id = new.profile_id, legal_name = new.legal_name,
      country = new.country, description = new.description, updated_at = now()
    where legacy_agency_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_company_mirror_org on public.companies;
create trigger on_company_mirror_org
  after insert or update on public.companies
  for each row execute function public.mirror_company_to_org();

drop trigger if exists on_agency_mirror_org on public.agencies;
create trigger on_agency_mirror_org
  after insert or update on public.agencies
  for each row execute function public.mirror_agency_to_org();

-- ════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════
-- Taxonomy / registries: readable by all authenticated; writes admin-only.
alter table public.relationship_types  enable row level security;
alter table public.productivity_units  enable row level security;
alter table public.profession_templates enable row level security;
alter table public.skill_icons          enable row level security;
alter table public.skill_seed_benchmarks enable row level security;
alter table public.platform_skill_aggregates enable row level security;
alter table public.organizations        enable row level security;

create policy relationship_types_select on public.relationship_types for select using (true);
create policy productivity_units_select on public.productivity_units for select using (true);
create policy profession_templates_select on public.profession_templates for select using (true);
create policy skill_icons_select on public.skill_icons for select using (true);
create policy skill_seed_benchmarks_select on public.skill_seed_benchmarks for select using (true);
create policy platform_skill_aggregates_select on public.platform_skill_aggregates for select using (true);
create policy relationship_types_write on public.relationship_types for all using (is_admin()) with check (is_admin());
create policy productivity_units_write on public.productivity_units for all using (is_admin()) with check (is_admin());
create policy profession_templates_write on public.profession_templates for all using (is_admin()) with check (is_admin());
create policy skill_icons_write on public.skill_icons for all using (is_admin()) with check (is_admin());
create policy skill_seed_benchmarks_write on public.skill_seed_benchmarks for all using (is_admin()) with check (is_admin());
create policy platform_skill_aggregates_write on public.platform_skill_aggregates for all using (is_admin()) with check (is_admin());

-- organizations: readable by authenticated (org directory); writes admin-only
-- (M1 writes happen via the mirror triggers, which run as definer).
create policy organizations_select on public.organizations for select using (true);
create policy organizations_write_admin on public.organizations for all using (is_admin()) with check (is_admin());

-- engagement_contexts: own, or managed org, or admin (default-closed §4).
alter table public.engagement_contexts enable row level security;
create policy engagement_contexts_select on public.engagement_contexts for select
  using (profile_id = auth.uid() or manages_organization(organization_id) or is_admin());
create policy engagement_contexts_write on public.engagement_contexts for all
  using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

-- journal_entries: worker owns, OR a manager of the entry's engagement org, OR
-- admin. Append-only: SELECT + INSERT only (no UPDATE/DELETE policy → denied).
alter table public.journal_entries enable row level security;
create policy journal_entries_select on public.journal_entries for select
  using (
    owns_worker(worker_id)
    or is_admin()
    or exists (
      select 1 from public.engagement_contexts ec
       where ec.id = journal_entries.engagement_context_id
         and manages_organization(ec.organization_id)
    )
  );
create policy journal_entries_insert on public.journal_entries for insert
  with check (owns_worker(worker_id));

-- journal_entry_metrics: visible/insertable with the parent entry.
alter table public.journal_entry_metrics enable row level security;
create policy journal_entry_metrics_select on public.journal_entry_metrics for select
  using (exists (
    select 1 from public.journal_entries je
     where je.id = journal_entry_metrics.entry_id
       and (owns_worker(je.worker_id) or is_admin()
            or exists (select 1 from public.engagement_contexts ec
                        where ec.id = je.engagement_context_id
                          and manages_organization(ec.organization_id)))
  ));
create policy journal_entry_metrics_write on public.journal_entry_metrics for all
  using (exists (select 1 from public.journal_entries je
                  where je.id = journal_entry_metrics.entry_id
                    and (owns_worker(je.worker_id) or is_admin())))
  with check (exists (select 1 from public.journal_entries je
                       where je.id = journal_entry_metrics.entry_id
                         and (owns_worker(je.worker_id) or is_admin()
                              or exists (select 1 from public.engagement_contexts ec
                                          where ec.id = je.engagement_context_id
                                            and manages_organization(ec.organization_id)))));

-- journal_entry_extractions: worker owns parent (M1 unused; future-proofed).
alter table public.journal_entry_extractions enable row level security;
create policy journal_entry_extractions_select on public.journal_entry_extractions for select
  using (exists (select 1 from public.journal_entries je
                  where je.id = journal_entry_extractions.entry_id
                    and (owns_worker(je.worker_id) or is_admin())));

-- journal_entry_confirmations: visible to worker (owns entry), confirmer, or
-- org manager. INSERT only by a manager of the entry's engagement org.
alter table public.journal_entry_confirmations enable row level security;
create policy journal_entry_confirmations_select on public.journal_entry_confirmations for select
  using (
    confirmer_id = auth.uid() or is_admin()
    or exists (select 1 from public.journal_entries je
                where je.id = journal_entry_confirmations.entry_id and owns_worker(je.worker_id))
    or exists (select 1 from public.journal_entries je
                join public.engagement_contexts ec on ec.id = je.engagement_context_id
               where je.id = journal_entry_confirmations.entry_id
                 and manages_organization(ec.organization_id))
  );
create policy journal_entry_confirmations_insert on public.journal_entry_confirmations for insert
  with check (
    confirmer_id = auth.uid()
    and exists (select 1 from public.journal_entries je
                 join public.engagement_contexts ec on ec.id = je.engagement_context_id
                where je.id = journal_entry_confirmations.entry_id
                  and manages_organization(ec.organization_id))
  );

-- ════════════════════════════════════════════════════════════════════════
-- GRANTs to authenticated (this project has no default grants — see 0004).
-- RLS above restricts rows.
-- ════════════════════════════════════════════════════════════════════════
grant select on public.organizations            to authenticated;
grant select on public.relationship_types        to authenticated;
grant select on public.productivity_units         to authenticated;
grant select on public.profession_templates       to authenticated;
grant select on public.skill_icons                to authenticated;
grant select on public.skill_seed_benchmarks       to authenticated;
grant select on public.platform_skill_aggregates   to authenticated;
grant select on public.engagement_contexts          to authenticated;
grant select, insert on public.journal_entries        to authenticated;
grant select, insert on public.journal_entry_metrics   to authenticated;
grant select, insert on public.journal_entry_confirmations to authenticated;
grant select on public.journal_entry_extractions    to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- Seeds
-- ════════════════════════════════════════════════════════════════════════
insert into public.relationship_types (slug, category) values
  ('owner','ownership'), ('employee','employment'), ('manager','employment'),
  ('consultant','advisory'), ('collaborator','collaboration'),
  ('freelancer','employment'), ('unemployed','status'),
  ('student','education'), ('volunteer','other')
on conflict (slug) do nothing;

insert into public.productivity_units (slug, category, scope, parent_unit_slug, conversion_factor) values
  ('square_meters','area_rate','platform', null, null),
  ('square_meters_per_day','area_rate','platform', null, null),
  ('box_per_day','area_rate','platform','square_meters_per_day', 1.4)
on conflict (slug) do nothing;

insert into public.profession_templates (profession_id, template, is_platform_default)
select p.id,
  jsonb_build_object(
    'structured_fields', jsonb_build_array(
      jsonb_build_object('slug','site_name','type','string','label_key','journal.field.site_name','required',true),
      jsonb_build_object('slug','tile_type','type','string','label_key','journal.field.tile_type'),
      jsonb_build_object('slug','area_done','type','number','unit_slug','square_meters','label_key','journal.field.area_done','required',true)
    ),
    'primary_productivity_unit_slug','square_meters_per_day',
    'freeform_prompt_key','journal.prompt.tiler',
    'icon_slug','icon.tile'
  ), true
from public.professions p where p.slug = 'tiler'
on conflict (profession_id, organization_id) do nothing;

-- minimal skill_icons seed for tile-related skills; others fall back to the
-- profession-level icon (design §8.2 cascade).
insert into public.skill_icons (skill_id, icon_slug, source)
select s.id, 'icon.tile', 'platform_default'
from public.skills s
where s.slug in ('tiling','grouting','mosaic-tiling','large-format-tiling','waterproofing-tiles','floor-screeding')
on conflict (skill_id) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- Backfill (after tables + triggers + seeds)
-- ════════════════════════════════════════════════════════════════════════
-- organizations from existing companies / agencies
insert into public.organizations
  (owner_profile_id, organization_type, legal_name, display_name, country, vat_number, website, description, trust_score, legacy_company_id)
select c.profile_id, 'company', c.legal_name, c.display_name, c.country, c.vat_number, c.website, c.description, c.trust_score, c.id
from public.companies c
where not exists (select 1 from public.organizations o where o.legacy_company_id = c.id);

insert into public.organizations
  (owner_profile_id, organization_type, legal_name, country, description, legacy_agency_id)
select a.profile_id, 'agency', a.legal_name, a.country, a.description, a.id
from public.agencies a
where not exists (select 1 from public.organizations o where o.legacy_agency_id = a.id);

-- engagement_contexts: a primary 'employee' engagement per worker; plus 'owner'
-- engagements for any company/agency the profile owns. hash_self over content.
insert into public.engagement_contexts
  (profile_id, relationship_slug, is_primary, status, country_code, hash_self)
select w.profile_id, 'employee', true, 'active',
       (select code from public.countries c where c.code = w.current_location_country),
       encode(extensions.digest(w.profile_id::text || ':employee:primary', 'sha256'), 'hex')
from public.workers w
where w.profile_id is not null
  and not exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = w.profile_id and ec.relationship_slug = 'employee' and ec.is_primary
  );

insert into public.engagement_contexts
  (profile_id, organization_id, relationship_slug, is_primary, status, country_code, hash_self)
select o.owner_profile_id, o.id, 'owner', false, 'active',
       o.country,
       encode(extensions.digest(o.owner_profile_id::text || ':owner:' || o.id::text, 'sha256'), 'hex')
from public.organizations o
where o.owner_profile_id is not null
  and not exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = o.owner_profile_id and ec.organization_id = o.id and ec.relationship_slug = 'owner'
  );

-- onboarded profiles with no worker row (edge case; universal-worker trigger
-- makes this rare): a primary 'unemployed' engagement.
insert into public.engagement_contexts
  (profile_id, relationship_slug, is_primary, status, hash_self)
select p.id, 'unemployed', true, 'active',
       encode(extensions.digest(p.id::text || ':unemployed:primary', 'sha256'), 'hex')
from public.profiles p
where p.onboarded = true
  and not exists (select 1 from public.workers w where w.profile_id = p.id)
  and not exists (select 1 from public.engagement_contexts ec where ec.profile_id = p.id and ec.is_primary);

-- ════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — run by hand or via git revert of the merge):
--   drop trigger if exists on_company_mirror_org on public.companies;
--   drop trigger if exists on_agency_mirror_org on public.agencies;
--   drop function if exists public.mirror_company_to_org();
--   drop function if exists public.mirror_agency_to_org();
--   alter table public.worker_skills
--     drop column if exists current_pace_value, drop column if exists current_pace_unit_slug,
--     drop column if exists confidence_score, drop column if exists confidence_bin,
--     drop column if exists last_recompute_at;
--   drop table if exists public.journal_entry_confirmations, public.journal_entry_extractions,
--     public.journal_entry_metrics, public.journal_entries, public.skill_icons,
--     public.skill_seed_benchmarks, public.platform_skill_aggregates,
--     public.profession_templates, public.engagement_contexts, public.productivity_units,
--     public.relationship_types, public.organizations cascade;
--   drop function if exists public.manages_organization(uuid);
-- ════════════════════════════════════════════════════════════════════════
