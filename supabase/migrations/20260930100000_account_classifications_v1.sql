-- ============================================================================
-- 20260930100000 — which accounts are real market participants.
--
-- Owner decision 2026-09-30 (§7): 40 TEST + 6 INTERNAL accounts must not
-- pollute marketplace KPIs; nothing is deleted; a name heuristic may NOT be
-- the long-term canonical mechanism. This is that mechanism: an explicit,
-- evidenced, admin-owned classification per account.
--
--   real      a genuine market participant
--   test      an E2E / QA / fixture / scanner account
--   internal  the owner's or team's own account
--   (no row)  UNKNOWN — never silently counted as real or as test
--
-- Marketplace KPIs count `real`; technical dashboards may show the rest
-- separately. Every row says WHY (basis + evidence) and WHO decided.
--
-- ADDITIVE ONLY. One new table. RLS: platform admins read and write; a person
-- may READ their own row (it is data about them — the subject-access export
-- reads it as the person, lib/privacy/personal-relations.ts). No existing
-- table, policy or function changes. No data in this file — rows are written
-- by an admin through the table's own policy.
--
-- ROLLBACK: supabase/rollbacks/20260930100000_account_classifications_v1.down.sql
-- ============================================================================

create table if not exists public.account_classifications (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  account_class text not null check (account_class in ('real', 'test', 'internal')),
  basis         text not null check (basis in (
                  'test_email_domain',
                  'e2e_account',
                  'qa_synthetic_marker',
                  'team_plus_alias',
                  'owner_team',
                  'security_scanner',
                  'manual_review'
                )),
  evidence      text not null check (char_length(evidence) between 1 and 300),
  decided_by    uuid references public.profiles(id) on delete set null,
  decided_at    timestamptz not null default now()
);

comment on table public.account_classifications is
  'Explicit REAL / TEST / INTERNAL classification per account with evidence. No row = UNKNOWN. Marketplace KPIs count real only.';

alter table public.account_classifications enable row level security;

create policy account_classifications_admin_select
  on public.account_classifications for select to authenticated
  using (public.is_admin());

create policy account_classifications_self_select
  on public.account_classifications for select to authenticated
  using (profile_id = auth.uid());

create policy account_classifications_admin_write
  on public.account_classifications for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
