-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner + Chat Claude
-- review (S2 / feat/cc/esco-taxonomy-foundation). Never `db push`.
--
-- ESCO taxonomy core (design: docs/product/esco-taxonomy-design.md).
-- Full ESCO v1.2.1 catalogue layer UNDER the curated professions/skills
-- registries (which stay slug→JSON and are NOT touched here). Additive only.
--
-- esco_labels is a normalized platform-content label table (locale = row,
-- NOT name_* translation columns) — the §2 storage decision is flagged for
-- owner review in the design doc §3. Source = official ESCO translations.
--
-- Attribution (EU licence): this service uses the ESCO classification of
-- the European Commission.
-- ============================================================================

begin;

create table if not exists public.esco_occupations (
  id          uuid primary key default gen_random_uuid(),
  esco_uri    text not null unique,
  isco_group  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.esco_skills (
  id          uuid primary key default gen_random_uuid(),
  esco_uri    text not null unique,
  skill_type  text check (skill_type is null or skill_type in ('skill','competence','knowledge','language')),
  reuse_level text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.esco_occupation_skills (
  occupation_id  uuid not null references public.esco_occupations(id) on delete cascade,
  skill_id       uuid not null references public.esco_skills(id) on delete cascade,
  relation_type  text not null default 'essential'
                   check (relation_type in ('essential','optional')),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  primary key (occupation_id, skill_id)
);

-- Normalized multilingual labels (preferred + alternative + hidden search
-- terms) for both concept kinds. Locale set mirrors doctrine §2.4.
create table if not exists public.esco_labels (
  id            uuid primary key default gen_random_uuid(),
  concept_type  text not null check (concept_type in ('occupation','skill')),
  concept_id    uuid not null,
  locale        char(2) not null
                  check (locale in ('en','lt','lv','et','nl','de','da','no','sv','pl')),
  label         text not null check (char_length(label) between 1 and 400),
  label_type    text not null default 'preferred'
                  check (label_type in ('preferred','alternative','hidden')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (concept_type, concept_id, locale, label, label_type)
);

-- Typeahead: prefix search per locale (lower(label) LIKE 'q%').
create index if not exists esco_labels_typeahead_idx
  on public.esco_labels (locale, lower(label) text_pattern_ops);
create index if not exists esco_labels_concept_idx
  on public.esco_labels (concept_type, concept_id);

-- ── RLS: read-only taxonomy for the app session; writes via import/admin ──
alter table public.esco_occupations enable row level security;
alter table public.esco_skills enable row level security;
alter table public.esco_occupation_skills enable row level security;
alter table public.esco_labels enable row level security;

drop policy if exists esco_occupations_select on public.esco_occupations;
create policy esco_occupations_select on public.esco_occupations
  for select to authenticated using (is_active);
drop policy if exists esco_skills_select on public.esco_skills;
create policy esco_skills_select on public.esco_skills
  for select to authenticated using (is_active);
drop policy if exists esco_occupation_skills_select on public.esco_occupation_skills;
create policy esco_occupation_skills_select on public.esco_occupation_skills
  for select to authenticated using (is_active);
drop policy if exists esco_labels_select on public.esco_labels;
create policy esco_labels_select on public.esco_labels
  for select to authenticated using (is_active);

-- Admin-only writes through the user session (import uses service role).
drop policy if exists esco_occupations_write on public.esco_occupations;
create policy esco_occupations_write on public.esco_occupations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists esco_skills_write on public.esco_skills;
create policy esco_skills_write on public.esco_skills
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists esco_occupation_skills_write on public.esco_occupation_skills;
create policy esco_occupation_skills_write on public.esco_occupation_skills
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists esco_labels_write on public.esco_labels;
create policy esco_labels_write on public.esco_labels
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.esco_occupations, public.esco_skills,
  public.esco_occupation_skills, public.esco_labels to authenticated;

commit;

-- ROLLBACK (reverse SQL — tables are new and import-only; reversible):
-- drop table if exists public.esco_labels;
-- drop table if exists public.esco_occupation_skills;
-- drop table if exists public.esco_skills;
-- drop table if exists public.esco_occupations;
