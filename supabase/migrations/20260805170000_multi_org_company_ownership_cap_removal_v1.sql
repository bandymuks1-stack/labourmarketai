-- 20260805170000 — remove the one-person-one-company database cap (M-P0-1)
--
-- SAFETY CLASS: RED. Drops a UNIQUE constraint on an existing production
-- table — a schema-shape change on live data. Owner-gated.
--
-- There is deliberately NO `-- @human-gate-approved` marker in this file.
-- The owner's 2026-08-05 directive commissioned this PACKAGE
-- ("Prepare owner-gated migration") — it did not approve the APPLY. CI
-- staying RED is the honest state until a decision is recorded in
-- docs/architecture/MULTI_ORGANIZATION_STRUCTURAL_TRAIN.md.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- `companies_profile_id_key UNIQUE (profile_id)` (0006) hard-caps every
-- profile at ONE company row. Product doctrine (owner, 2026-08-05): a person
-- may own, manage, join, work for and collaborate with several organizations
-- simultaneously. The cap makes the doctrine unrepresentable at the schema
-- level and forces every writer into upsert-by-profile singleton behaviour
-- (`save_company_setup`, `complete_onboarding` company branch,
-- `getOwnCompany()`), where creating organization B silently RENAMES A.
--
-- Production state measured 2026-08-05 (read-only): 7 companies rows,
-- 7 distinct profile_ids — no profile owns two companies yet, so this
-- migration changes NO existing row and cannot collide.
--
-- ── WHAT CHANGES ───────────────────────────────────────────────────────────
--   1. The cap constraint is dropped.
--   2. Duplicate creation of the SAME canonical company stays prevented by a
--      truthful key: one creator cannot register the same canonical
--      (case/whitespace-insensitive) legal name twice. Distinct companies by
--      the same creator are now legal — that is the point.
--   3. `companies.profile_id` is DEMOTED (by documented intent, the column
--      stays) to legacy creator metadata. It is no longer a licence to infer
--      "the" company of a profile. Authorization truth moves to organization
--      ownership/membership in M-P0-4; `owns_company()` remains factually
--      correct per-row meanwhile (each row still has exactly one creator).
--
-- NOT IN SCOPE, deliberately: no writer is changed here (M-P0-2/M-P0-3), no
-- membership table is created here (M-P0-4), no RLS policy changes, no
-- grants, no DML. No silent first-company fallback is introduced anywhere.
--
-- ROLLBACK: supabase/rollbacks/20260805170000_multi_org_company_ownership_cap_removal_v1.down.sql
-- restores UNIQUE (profile_id) — possible ONLY while no profile owns two
-- companies; the rollback fails loudly (counts only, no ids printed)
-- otherwise. The window closes the moment a second company legitimately
-- exists.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Safety assertions ──────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'companies_profile_id_key'
       and conrelid = 'public.companies'::regclass
  ) then
    raise exception
      'companies_profile_id_key not found — already dropped or renamed; review 20260805170000';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'companies'
       and column_name = 'legal_name'
  ) then
    raise exception
      'companies.legal_name missing — the replacement key target drifted; review 20260805170000';
  end if;

  -- The replacement key must be creatable: no creator may already hold two
  -- rows with the same canonical legal name (impossible while the cap
  -- exists, asserted anyway so a re-run on drifted state fails closed).
  if exists (
    select 1 from public.companies
     where legal_name is not null
     group by profile_id, lower(btrim(legal_name))
    having count(*) > 1
  ) then
    raise exception
      'duplicate (creator, canonical legal_name) pairs exist — resolve before applying 20260805170000';
  end if;
end $$;

-- ── 2. Drop the cap ───────────────────────────────────────────────────────
alter table public.companies
  drop constraint companies_profile_id_key;

-- ── 3. Truthful duplicate-prevention key ──────────────────────────────────
-- Same creator + same canonical legal name = the same company → blocked.
-- Same creator + different company = now legal (the doctrine).
create unique index companies_creator_canonical_name_key
  on public.companies (profile_id, lower(btrim(legal_name)))
  where legal_name is not null;

comment on index public.companies_creator_canonical_name_key is
  'M-P0-1 replacement for companies_profile_id_key: prevents the same '
  'creator registering the same canonical legal name twice, while allowing '
  'one person to own several distinct companies (owner doctrine 2026-08-05).';

-- ── 4. Demote profile_id to creator metadata ──────────────────────────────
comment on column public.companies.profile_id is
  'LEGACY CREATOR METADATA (M-P0-1, 2026-08-05): the profile that created '
  'this company row. NOT unique any more and NOT authorization truth — do '
  'not infer "the" company of a profile from it, and do not add a fallback '
  'that picks the first/oldest row. Organization ownership/membership '
  '(M-P0-4) is the authority model; owns_company() stays valid per-row.';
