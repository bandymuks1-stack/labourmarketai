-- 20260907153000_employer_supply_discovery_v1
--
-- RED CLASS — a NEW `SECURITY DEFINER` reader plus its `GRANT`. Applied via
-- Supabase MCP `apply_migration`. Never `supabase db push`.
--
-- @human-gate-approved
--
-- APPROVED AND APPLIED. The owner approved this migration by name on
-- 2026-09-07 (decision DEM-9, gate HG-2026-09-07), together with
-- 20260907114500_organization_evidence_import_v1, and specified the apply
-- order: this file first. It was applied via Supabase MCP `apply_migration`
-- and carries ledger version `20260907180546`.
--
-- The marker above is therefore now a statement of fact rather than a claim.
-- It does NOT make this file GREEN class: a SECURITY DEFINER reader stays RED,
-- so the PR carrying it remains a draft with `needs-human-gate`. The marker
-- only records that the human gate it was waiting for has been passed.
--
-- VERIFIED AGAINST PRODUCTION AFTER APPLY (2026-09-07, live, not inferred):
--   * the function exists, is `security definer`, `search_path=public`;
--   * EXECUTE is held by `authenticated` only — `anon` is refused at the
--     privilege level with `42501: permission denied for function`, not merely
--     filtered inside the body;
--   * called through the REAL applied function under three real users' own
--     auth contexts, the contract holds exactly as designed:
--       A  a manager of two organizations who authored neither row  2 of 2
--       B  the agency that authored one of the two rows             1 of 2
--       C  a person who manages nothing                             0, no error
--     A proves the capability, B proves self-exclusion is not over-broad, and
--     C proves authorization fails closed AND quietly.
--   * no existing table, policy, function or privilege was altered.
--
-- ── THE OTHER HALF OF THE MARKET ─────────────────────────────────────────
--
-- Six surfaces have now been fixed for serving SUPPLY where DEMAND belongs
-- (#1588 the worker board, #1596 the agency board, four in window 8, and the
-- market-map read in this PR). Every one of those was subtractive: stop
-- showing supply on a demand surface.
--
-- Subtracting is only half of a market. Measured on production 2026-09-07:
--
--   customer_requests.kind = 'agency_offer', status = 'submitted'   2 rows
--   customer_requests.kind = 'agency_offer', status = 'draft'       1 row
--
-- Three real declarations of available people, and `customer_requests_select`
-- is `(profile_id = auth.uid() OR is_admin() OR has_org_demand_access(
-- organization_id))` — so the ONLY people who can see an agency's supply are
-- that agency itself and an admin. **No employer on this platform can
-- discover available workforce at all.** The supply side of the marketplace
-- is written and unreadable.
--
-- That is the difference between a job board and a labour market: an employer
-- must be able to find capacity that already exists, not only publish a need
-- and wait. It is also what makes the supply an agency declares worth
-- declaring.
--
-- ── WHAT THIS ADDS ───────────────────────────────────────────────────────
--
-- ONE new gated read: the exact mirror of `list_open_demand_for_agencies()`,
-- pointing the other way. Same shape, same caller-gate pattern, same closed
-- allow-list on `kind`, same ordering and limit.
--
--   list_open_demand_for_agencies()   demand, for a caller who is an agency
--   list_open_supply_for_employers()  SUPPLY, for a caller who manages an org
--
-- ── WHAT IT DELIBERATELY DOES NOT EXPOSE ─────────────────────────────────
--
-- The SAME six non-identifying columns the agency board already exposes in
-- the other direction, and nothing more:
--
--   role_or_work_type · country · team_size · start_period · duration ·
--   created_at
--
-- NOT the supplying organization's name, NOT the profile behind it, NOT
-- `notes`, NOT `need_summary`, NOT `payload`, NOT contact details. An
-- employer learns that capacity of a shape exists and where — the same
-- anonymised preview posture the scouting surface already takes toward
-- workers. Making contact stays a separate, consented act; this function
-- creates no path to one.
--
-- ── AUTHORIZATION ────────────────────────────────────────────────────────
--
-- The caller must MANAGE an organization. That is the un-parameterised form
-- of `manages_organization(org)`'s own predicate, restated inline because the
-- question here is "do you manage ANY organization", which that helper cannot
-- express. A worker, a plain member, and an unauthenticated caller all get
-- nothing — the function returns zero rows rather than raising, exactly as
-- the agency mirror does for a caller who is not an agency.
--
-- A caller never receives their own side's rows back: neither rows they
-- created, nor rows belonging to an organization they manage. An agency
-- browsing for work does not find itself listed as available workforce.
--
-- ── WHY A `SECURITY DEFINER` FUNCTION AND NOT A POLICY ───────────────────
--
-- A policy widening `customer_requests_select` would grant employers row
-- access to the whole supply row — `notes`, `payload`, `profile_id` and all —
-- and would be reachable by every other read of that table. A gated function
-- exposes six columns through one named door, and nothing else changes.
-- Narrower is the correct direction for a first cross-organization read.
--
-- ── PROVEN ON PRODUCTION, IN A TRANSACTION, THEN ROLLED BACK ─────────────
--
-- The candidate body below was created on the production database inside a
-- transaction, called through the real function under three real users' own
-- auth contexts (`set local role authenticated` + `request.jwt.claims`), and
-- rolled back. Production is unchanged and still carries the gap — verified
-- afterwards: `list_open_supply_for_employers` does not exist there.
--
-- Rollback semantics were themselves proven first, with a throwaway function
-- created and rolled back in the same shape, so the measurement below is not
-- resting on an assumption about the tool.
--
-- Supply rows on production: 2 (`kind = 'agency_offer'`, `status =
-- 'submitted'`). Today every one of them is invisible to every employer.
--
--   caller                                        rows visible
--   ─────────────────────────────────────────────────────────────
--   A  a real manager of two organizations             2 of 2
--   B  an agency that authored one of the two rows     1 of 2
--   C  a worker who manages nothing                    0
--
-- Read them as three separate assertions:
--
--   A  the capability actually works — an employer who could previously see
--      NOTHING now sees the whole supply side;
--   B  self-exclusion works, and is not over-broad: B authored exactly one of
--      the two rows, gets that one withheld, and still sees the other agency's;
--   C  authorization works, and fails CLOSED and QUIETLY — zero rows and no
--      exception, so a UI renders an honest empty state rather than parsing an
--      error to tell "nothing available" from "not allowed".
--
-- What this is NOT: a human UI walk. Nobody has looked at this board in a
-- browser. It is a production data-path proof, which is the strongest evidence
-- available without one.
--
-- ── NOT DESTRUCTIVE ──────────────────────────────────────────────────────
--
-- Creates one function. Alters no table, no policy, no existing function, no
-- privilege on anything that already exists. Writes no rows. Rollback is
-- `supabase/rollbacks/20260907153000_employer_supply_discovery_v1.down.sql`,
-- which drops it.

create or replace function public.list_open_supply_for_employers()
returns table (
  id            uuid,
  role_text     text,
  country       text,
  team_size     integer,
  start_period  text,
  duration      text,
  created_at    timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- DOES THIS CALLER MANAGE ANY ORGANIZATION? The un-parameterised form of
  -- `manages_organization(org)`. A caller who manages none gets an empty
  -- result, never an error - the same shape the agency mirror uses for a
  -- caller who is not an agency, so a UI can render an honest empty state
  -- without having to distinguish "no supply" from "not allowed" by parsing
  -- an exception.
  if not exists (
        select 1
          from public.engagement_contexts ec
         where ec.profile_id = uid
           and ec.organization_id is not null
           and ec.status = 'active'
           and ec.relationship_slug in ('manager', 'owner', 'external_manager')
      )
     and not exists (
        select 1
          from public.company_memberships m
         where m.profile_id = uid
           and m.status = 'active'
           and m.role in ('owner', 'admin', 'manager', 'external_manager')
      )
  then
    return;
  end if;

  return query
  select cr.id,
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         cr.duration,
         cr.created_at
    from public.customer_requests cr
   where cr.status = 'submitted'
     -- DIRECTION OF THE MARKET. This board is available workforce, so it
     -- shows SUPPLY only. A closed allow-list, never a deny-list of the
     -- demand kinds: a deny-list lets the NEXT demand kind straight through,
     -- which is this entire defect class. There is deliberately no `kind is
     -- null` branch here - the pre-`kind` rows from migration 0028 are
     -- genuine demand, and treating an unknown direction as supply is exactly
     -- the guess this function exists to stop.
     and cr.kind in ('agency_offer')
     -- Never hand a caller their own side back. An agency browsing for work
     -- must not find itself listed as available workforce.
     and cr.profile_id <> uid
     and (
       cr.organization_id is null
       or not public.manages_organization(cr.organization_id)
     )
   order by cr.created_at desc
   limit 100;
end
$$;

-- Same privilege posture as every other gated board read. `from anon` is
-- NAMED rather than merely covered by `from public`: on a clean local reset
-- the environment's default privileges can hand anon EXECUTE.
revoke all on function public.list_open_supply_for_employers() from public;
revoke all on function public.list_open_supply_for_employers() from anon;
grant execute on function public.list_open_supply_for_employers() to authenticated;

comment on function public.list_open_supply_for_employers() is
  'Available workforce an employer may discover: submitted customer_requests rows whose kind is a SUPPLY kind, minus the caller''s own and their organizations''. Six non-identifying columns only - no organization name, no profile, no notes, no payload, no contact. The caller must manage an organization; anyone else gets zero rows. The mirror of list_open_demand_for_agencies().';
