-- @human-gate-approved
--
-- SAFETY CLASS: RED (replaces a SECURITY DEFINER function that RLS reads).
-- Draft PR + needs-human-gate; apply ONLY via Supabase MCP apply_migration
-- after the owner approves this exact file.
--
-- 20261019070000 — DISCOVERABILITY PAUSES WHILE AN ACCOUNT DELETION IS OPEN
--
-- WHY: a person who asked to delete their account stays discoverable to
-- employers until the request is executed, because discoverability reads the
-- consent ledger only. Production 2026-10-19: the one open account_deletion
-- request (filed 2026-10-14) still had a live discoverability grant, so the
-- person's worker row stayed readable to employers with no relationship.
-- Processing the profile for discovery after the person asked for erasure is
-- exactly what the request objects to.
--
-- WHAT: worker_profile_discoverable() keeps its ledger rule unchanged and adds
-- one condition — no OPEN account_deletion privacy request
-- (submitted / in_review / needs_followup / approved) by that profile.
--
-- WHAT IT DOES NOT DO:
--   * no consent row is written or changed (the platform never withdraws a
--     consent on a person's behalf; the ledger stays the person's own record);
--   * no data is deleted, redacted or moved;
--   * working relationships are unaffected: can_view_worker's relationship
--     branches do not call this function, so employers who already work with
--     the person keep exactly what they have;
--   * signature, language, volatility, SECURITY DEFINER, search_path and the
--     grants (authenticated + postgres) are unchanged — CREATE OR REPLACE
--     keeps the ACL.
--
-- EFFECT is narrowing only: every caller (can_view_worker, the partner-supply
-- authorisation, admin privacy counts) sees "not discoverable" for that one
-- person while the request is open. When the request is closed the ledger
-- rule alone decides again.
--
-- COST: one indexed lookup (customer_requests_profile_idx) per call; the
-- table holds 36 rows.
--
-- ROLLBACK: supabase/rollbacks/20261019070000_discoverability_paused_by_open_deletion_request_v1.down.sql
-- restores the previous body verbatim.

create or replace function public.worker_profile_discoverable(p_profile uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((
    select e.action = 'granted' and e.consent_text_version = p.current_version
    from public.privacy_consent_events e
    join public.privacy_consent_purposes p on p.purpose = e.purpose
    where e.user_id = p_profile
      and e.purpose = 'profile_discoverability'
    order by e.created_at desc, e.seq desc
    limit 1
  ), false)
  and not exists (
    select 1
    from public.customer_requests r
    where r.profile_id = p_profile
      and r.payload->>'privacy_request_type' = 'account_deletion'
      and r.status in ('submitted', 'in_review', 'needs_followup', 'approved')
  )
$function$;

comment on function public.worker_profile_discoverable(uuid) is
  'True only with a current-version profile_discoverability grant as the newest ledger row AND no open account_deletion privacy request (20261019070000).';
