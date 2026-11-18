-- ============================================================================
-- 20260930130000 — ORGANIZATION HISTORY PERIODS: a continuing business keeps
-- ONE history across a change of legal entity.
--
-- RED by rule (GRANT on a new table). OWNER DECISION 2026-09-30 ("FINAL OWNER
-- MODEL — BUSINESS HISTORY CONTINUITY"). Apply only via Supabase MCP
-- apply_migration, after the owner approves the exact SQL below.
-- @human-gate-approved
--
-- WHY NOTHING EXISTING FITS (doctrine 2 canonical check, 2026-09-30):
--   • organization_evidence_records.supplied_by_organization_id = ONE
--     organization_id per record. Overloading it to mean both "the legal entity
--     at the time" and "the business the history belongs to" is exactly the
--     conflation the owner forbids.
--   • organization_evidence_parties can say "the employer at the time was
--     'Vivat Rex PL'" per record (label only, never an invented organization) —
--     that half is ALREADY expressible and is reused as is.
--   • organization_facts is a per-field sourced-fact store; a structural
--     relationship that projections must group by is not a stringly-typed field.
--   • organizations / engagement_contexts / relationship_types describe a
--     PERSON's relationship to an organization; none describes one business's
--     period under a different legal name. A search of supabase/migrations,
--     docs/design and docs/OWNER_TARGET_ARCHITECTURE_V1.md for lineage,
--     predecessor, successor, legal entity change and continuity found no
--     equivalent.
--
-- WHAT. ONE additive, append-only table. A period says: "under this legal
-- entity label, between these dates, THIS organization's business history was
-- being made". It COPIES NO EVIDENCE. Which records belong to a period is
-- COMPOSED on read from the record's own date and the supplier label its
-- employer party carries (source_labels), so one evidence record feeds the
-- worker's history, the team's, the company's and the object's without a copy.
--
-- LEGAL IDENTITY IS NEVER ASSERTED HERE. legal_entity_relation defaults to
-- 'not_asserted': the platform does not claim that the earlier legal entity and
-- this organization are the same legal person. Business-history continuity and
-- legal-entity continuity are different facts and are stored as different
-- columns (continuity vs legal_entity_relation).
--
-- UNKNOWN IS NOT ZERO. period_start / period_end are NULL when the basis
-- documents no date; a NULL bound never means "open-ended".
--
-- APPEND-ONLY. INSERT + SELECT only: no UPDATE and no DELETE policy. A
-- correction is a new row with supersedes_id pointing at the row it replaces
-- (the record_state of the chain is derived on read, latest wins), so the
-- statement that was made stays permanent.
--
-- NO SECURITY DEFINER, NO DATA WRITE, NO EXISTING OBJECT TOUCHED. The GRANT is
-- the only RED trigger; the policies are the same manages_organization pair the
-- evidence tables use, with no `(true)` predicate and nothing for anon.
--
-- ROLLBACK: supabase/rollbacks/20260930130000_organization_history_periods_v1.down.sql
-- (refuses while any row exists).
-- ============================================================================

begin;

create table if not exists public.organization_history_periods (
  id                           uuid primary key default gen_random_uuid(),
  -- The CONTINUING business the history belongs to (e.g. the current
  -- LabourMarket.ai organization). Never the earlier legal entity.
  organization_id              uuid not null references public.organizations(id) on delete restrict,
  -- The period's name exactly as the owner / source names it ("Vivat Rex").
  period_label                 text not null
                                 check (char_length(btrim(period_label)) between 1 and 200),
  -- The legal entity AS NAMED AT THE TIME. Text only unless that entity is
  -- itself a platform organization; a legal entity that is not on the platform
  -- is recorded by name and never invented as an organization row.
  legal_entity_label           text
                                 check (legal_entity_label is null
                                        or char_length(btrim(legal_entity_label)) between 1 and 200),
  legal_entity_organization_id uuid references public.organizations(id) on delete set null,
  -- Source labels that place a record in this period, exactly as the sources
  -- spell them (e.g. the sheet name in the original workbooks). Composed with
  -- the record's employer party on read.
  source_labels                text[] not null default '{}',
  period_start                 date,
  period_end                   date,
  -- Two different things, stored apart on purpose.
  continuity                   text not null default 'continuous_business_history'
                                 check (continuity in ('continuous_business_history', 'separate_history')),
  legal_entity_relation        text not null default 'not_asserted'
                                 check (legal_entity_relation in
                                   ('not_asserted', 'same_entity', 'renamed', 'successor',
                                    'sold_and_continued_by_new_entity', 'other')),
  -- WHAT SUPPORTS THE STATEMENT. An owner statement is a real basis and is
  -- labelled as one; a registry extract or contract is a stronger one.
  basis                        text not null
                                 check (basis in ('owner_statement', 'registry_extract', 'contract', 'other_document')),
  basis_reference              text check (basis_reference is null or char_length(basis_reference) <= 500),
  statement                    text check (statement is null or char_length(statement) <= 1000),
  supersedes_id                uuid references public.organization_history_periods(id) on delete restrict,
  created_by                   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at                   timestamptz not null default now(),
  constraint organization_history_periods_bounds
    check (period_end is null or period_start is null or period_end >= period_start),
  constraint organization_history_periods_not_self
    check (supersedes_id is null or supersedes_id <> id),
  constraint organization_history_periods_labels
    check (cardinality(source_labels) <= 20)
);

create index if not exists organization_history_periods_org_idx
  on public.organization_history_periods (organization_id, period_start nulls last);

-- One live statement per (organization, period label): a change is a new row
-- that supersedes the old one, never a second competing statement.
create unique index if not exists organization_history_periods_one_head
  on public.organization_history_periods (organization_id, lower(btrim(period_label)))
  where supersedes_id is null;

comment on table public.organization_history_periods is
  'One period of a continuing business, under the legal entity it then used (2026-09-30 owner decision). Copies no evidence: membership of a record in a period is composed on read from its date and supplier label. Legal identity is never asserted (legal_entity_relation defaults to not_asserted); business-history continuity is a separate column. NULL bounds mean not documented, never open-ended. APPEND-ONLY: corrections are new rows with supersedes_id.';

alter table public.organization_history_periods enable row level security;

grant select, insert on public.organization_history_periods to authenticated;

create policy organization_history_periods_select on public.organization_history_periods
  for select to authenticated
  using (public.manages_organization(organization_id) or public.is_admin());

create policy organization_history_periods_insert on public.organization_history_periods
  for insert to authenticated
  with check (
    public.manages_organization(organization_id)
    and created_by = auth.uid()
  );

commit;
