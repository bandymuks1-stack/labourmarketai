-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260717170000 — external_vacancies v1 (Official Vacancy Source — NAV
-- Norway v1; REQUIRES_OWNER_ACTION: NAV consumer registration + written
-- terms confirmation BEFORE any import ever runs).
--
-- WHAT: one table for PER-AD vacancy records republished from OFFICIAL
-- external sources (first source: NAV arbeidsplassen.no public vacancy
-- feed, terms https://arbeidsplassen.nav.no/vilkar-api retrieved
-- 2026-07-17). Deliberately SEPARATE from market_intelligence_observations
-- — that table is AGGREGATES ONLY (observation-contract.ts: one sourced
-- dated market data point, never per-ad records) — and separate from every
-- canonical table (customer_requests etc.): an external ad is displayed
-- source-badged, never blended into internal demand or matching.
--
-- WRITES: service-role only (operator persists the emitted, validated rows
-- from scripts/nav-vacancy-import.ts via Supabase MCP with
-- `on conflict (source_key, content_hash) do nothing` — the eurostat
-- precedent). NO insert/update/delete policy or grant for any client role.
--
-- READS: authenticated SELECT of ACTIVE rows only. The single display
-- surface is the auth-gated worker opportunities dashboard; anon gets
-- nothing (tightest honest policy — widen only if a public surface with a
-- documented noindex policy ever ships). Inactive rows are invisible to
-- clients (NAV terms: inactive ads must disappear immediately) and are
-- kept bounded for audit before deletion — see RETENTION.
--
-- PRIVACY: NO contact person data is stored (contactList is dropped by the
-- normalizer — privacy minimization; the consumer is a separate data
-- controller under Norwegian personal-data law: limit storage, delete when
-- unnecessary). description_text is bounded sanitized plain text — raw
-- source HTML is never persisted. Masked stopped ads (NAV masks
-- title/employer) simply deactivate their row.
--
-- RETENTION (documented owner runbook duty, no cron in this slice):
-- inactive rows are deleted after 30 days (service-role
-- `delete from external_vacancies where status='inactive' and
-- deactivated_at < now() - interval '30 days'`) — conservative bound
-- honouring the source's storage-limitation expectations while keeping a
-- short audit window.
--
-- COMPATIBILITY / BACKFILL: none — new table, ships empty. Until applied,
-- every consumer feature-detects 42P01 and renders nothing (no fake state);
-- the source additionally stays OFF in the code registry
-- (lib/intelligence/source-governance.ts: nav_arbeidsplassen unconfirmed/off).
-- ROLLBACK: paired supabase/rollbacks/20260717170000_external_vacancies_v1.down.sql.
--
-- POST-APPLY VERIFICATION:
--   select count(*) from public.external_vacancies;          -- 0
--   As any authenticated user: select * from public.external_vacancies; -- 0 rows, no error
--   Service-role insert of one row with status='inactive';
--   As authenticated: select count(*) ...                    -- still 0 (active-only policy)
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (new table + grants = RED-class;
-- annotation downgrades the CI finding only — the OWNER still applies
-- manually, and ONLY after the NAV registration gate is complete).
-- ============================================================================

begin;

create table if not exists public.external_vacancies (
  id                    uuid primary key default gen_random_uuid(),
  -- Source registry key (lib/intelligence/source-governance.ts). Closed set:
  -- widen the CHECK when a NEW official source passes its own legal gate.
  source_key            text not null check (source_key in ('nav_arbeidsplassen')),
  -- The source's own ad id (NAV: ad uuid). One row per source ad.
  source_vacancy_id     text not null,
  -- The ad's canonical page on the source — always present.
  canonical_source_url  text not null,
  -- Original application deep link (terms: applying happens at the source).
  application_url       text,
  source_country        text not null default 'NO' check (char_length(source_country) = 2),
  title                 text not null,
  employer_display_name text,
  location_city         text,
  location_municipal    text,
  location_county       text,
  location_country      text,
  published_at          timestamptz,
  expires_at            timestamptz,
  -- active = visible; inactive = removed from every client surface at once.
  status                text not null default 'active' check (status in ('active','inactive')),
  deactivated_at        timestamptz,
  engagement_type       text,
  language              text not null default 'no',
  -- BOUNDED sanitized plain text (normalizer cap) — never raw source HTML.
  description_text      text check (char_length(description_text) <= 8000),
  source_attribution    text not null,
  -- Derived-from-source occupation labels (jsonb array of strings).
  occupation_categories jsonb not null default '[]'::jsonb,
  transform_version     text not null,
  imported_at           timestamptz not null default now(),
  source_updated_at     timestamptz,
  -- sha256 of the stable normalized subset — idempotent import key.
  content_hash          text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (source_key, source_vacancy_id),
  unique (source_key, content_hash)
);

create index if not exists external_vacancies_active_published_idx
  on public.external_vacancies (source_key, status, published_at desc);

alter table public.external_vacancies enable row level security;

-- ACTIVE rows only, authenticated only. No anon read, no client writes of
-- any kind (service-role bypasses RLS for the operator import path).
drop policy if exists external_vacancies_select_active on public.external_vacancies;
create policy external_vacancies_select_active
  on public.external_vacancies for select
  to authenticated
  using (status = 'active');

grant select on public.external_vacancies to authenticated;
revoke insert, update, delete on public.external_vacancies from authenticated;

commit;

-- DOWN (paired rollback file — supabase/rollbacks/
-- 20260717170000_external_vacancies_v1.down.sql):
--   drop policy if exists external_vacancies_select_active on public.external_vacancies;
--   drop index if exists external_vacancies_active_published_idx;
--   drop table if exists public.external_vacancies;
