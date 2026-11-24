-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner + Chat Claude
-- review (S2 / feat/cc/esco-taxonomy-foundation). Never `db push`.
--
-- Additive ESCO references on the EXISTING curated registries (design doc
-- §2): professions/skills stay first-class + slug→JSON; an optional
-- esco_uri links a curated row to its ESCO canonical concept. Existing 18
-- professions / 94 skills are untouched (esco_uri stays NULL until curated).
-- No drops, no RLS/grant change.
-- ============================================================================

begin;

alter table public.professions
  add column if not exists esco_uri text;
alter table public.skills
  add column if not exists esco_uri text;

create index if not exists professions_esco_uri_idx
  on public.professions (esco_uri) where esco_uri is not null;
create index if not exists skills_esco_uri_idx
  on public.skills (esco_uri) where esco_uri is not null;

commit;

-- ROLLBACK (reverse SQL):
-- drop index if exists public.skills_esco_uri_idx;
-- drop index if exists public.professions_esco_uri_idx;
-- alter table public.skills drop column if exists esco_uri;
-- alter table public.professions drop column if exists esco_uri;
