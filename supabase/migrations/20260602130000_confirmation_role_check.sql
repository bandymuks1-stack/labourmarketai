-- 20260602130000 — Confirmation role schema hardening v1 (additive CHECK).
-- @human-gate-approved
--
-- WHY: `journal_entry_confirmations.confirmer_role` is `text not null` with no
-- database constraint (migration 0013). Today every write path already limits
-- it to the three supported confirmers — the review RPCs (0034 +
-- 20260530140000_membership_engagement_reroute) and the confirm/reject server
-- actions all derive the value from an engagement whose `relationship_slug` is
-- gated to ('manager','owner','external_manager'). This migration pins that
-- already-true invariant at the schema layer so a future bad RPC, a manual
-- write, or a broadening edit cannot silently introduce an unsupported
-- confirmer role (e.g. parent/guardian/teacher/buyer/customer/family/child)
-- before the linkage + consent + minor-safety design exists
-- (see docs/design/universal-confirmation-roles-v1.md).
--
-- This is purely a SAFETY NET: it adds no capability and changes no behaviour
-- for any current code path. Broadening the confirmer set later means REPLACING
-- this constraint in a dedicated, separately-designed migration.
--
-- CLASS: RED / human-gated. Additive + reversible, but it changes write-time
-- acceptance semantics at the DB level, so it is owner-applied via Supabase MCP
-- `apply_migration` after explicit approval — never `supabase db push`, never
-- auto-applied. See the PR runbook.
--
-- SAFETY: idempotent (guarded add); pre-flight assertion fails loudly with a
-- clear message if any existing row already violates the invariant, so the
-- owner sees the offending count instead of an opaque constraint error.

-- Pre-flight: refuse to add the constraint if any existing confirmation already
-- uses an unsupported role (the app never writes such a row; this only guards a
-- dirty/legacy datum).
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from public.journal_entry_confirmations
  where confirmer_role not in ('manager', 'owner', 'external_manager');
  if v_bad > 0 then
    raise exception
      'confirmation_role_check: % existing row(s) have an unsupported confirmer_role; resolve them before applying this migration',
      v_bad;
  end if;
end
$$;

-- Add the CHECK only if it is not already present (idempotent re-run safety).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_confirmations_confirmer_role_check'
      and conrelid = 'public.journal_entry_confirmations'::regclass
  ) then
    alter table public.journal_entry_confirmations
      add constraint journal_entry_confirmations_confirmer_role_check
      check (confirmer_role in ('manager', 'owner', 'external_manager'));
  end if;
end
$$;

-- ROLLBACK (reversible — run to undo this migration):
--   alter table public.journal_entry_confirmations
--     drop constraint if exists journal_entry_confirmations_confirmer_role_check;
