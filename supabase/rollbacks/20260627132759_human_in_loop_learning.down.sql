-- ============================================================================
-- ROLLBACK for 20260627132759_human_in_loop_learning.sql
--
-- Guarded: refuses to drop a NON-EMPTY table (forces a deliberate, owner-approved
-- data-loss decision). The SAFE "stop" lever that needs NO drop is to disable the
-- policy instead:
--     update public.learning_policy_settings set enabled = false,
--            disabled_at = now() where enabled is true;
-- That halts all FUTURE auto-confirmations while preserving every row. Existing
-- confirmations remain as historical authorized acts (append-only by design).
-- ============================================================================

begin;

do $$
begin
  if exists (select 1 from public.learning_review_queue limit 1) then
    raise exception 'learning_review_queue is not empty — refusing automatic rollback (export/clear rows first, or disable the policy instead of dropping)';
  end if;
  if exists (select 1 from public.learning_signals limit 1) then
    raise exception 'learning_signals is not empty — refusing automatic rollback (export/clear rows first)';
  end if;
  if exists (select 1 from public.learning_policy_settings limit 1) then
    raise exception 'learning_policy_settings is not empty — refusing automatic rollback (disable policies first, then export/clear rows)';
  end if;
end $$;

-- The RPC is the ONLY writer of auto-confirmations; dropping it makes the surface
-- inert without touching any data.
drop function if exists public.apply_learning_auto_confirmation(uuid);

-- Drop child-before-parent (queue references signals + policy_settings).
drop table if exists public.learning_review_queue;
drop table if exists public.learning_signals;
drop table if exists public.learning_policy_settings;

commit;
