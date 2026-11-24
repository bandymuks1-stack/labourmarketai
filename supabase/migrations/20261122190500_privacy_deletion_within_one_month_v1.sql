-- @human-gate-approved (acknowledgement only: RED, NOT applied; owner approval of this exact SQL required)
-- ============================================================================
-- 20261122190500_privacy_deletion_within_one_month_v1
--
-- SAFETY CLASS: RED. Replaces two SECURITY DEFINER bodies and adds one
-- function; ZERO rows change at apply time.
--
-- WHY (owner request 2026-11-22, coordinator relay). privacy_erasure_due_v1
-- erases a confirmed account-deletion request only once
-- confirmed_at <= now() - 30 days (owner decision 2026-11-09). Counted from
-- the CONFIRMATION, the wait adds to however long the request waited for it,
-- so a verified request received on day 0 and confirmed on day 28 is erased on
-- day 58. GDPR Art. 12(3) requires the controller to act on the request
-- "without undue delay and in any event within one month of receipt"
-- (extendable by two further months only "where necessary, taking into
-- account the complexity and number of the requests", with the person told
-- within the first month); Art. 17(1) requires erasure "without undue delay".
-- A cooling-off period the person can cancel is compatible, but it may not
-- carry the erasure past the one-month limit.
--
-- CHANGE. One rule, named once:
--   privacy_account_deletion_due_at(received, confirmed) =
--     greatest(confirmed,
--              least(confirmed + privacy_account_deletion_grace(),
--                    received + interval '1 month' - interval '3 days'))
-- i.e. the 30-day cooling-off still applies, but never beyond three days
-- before the one-month limit (margin for the 10-minute runner, a Storage
-- clean-up and the completion notice), and never before the confirmation. An
-- unconfirmed request is never due (unchanged: due requires a confirmation
-- row). privacy_erasure_due_v1 and privacy_account_deletion_status_v1
-- (scheduled_erasure_at, shown to the holder) use it; their bodies are
-- otherwise byte-identical to 20261109120000.
--
-- EFFECT. A request confirmed late is erased within the month; the holder's
-- window to cancel shrinks accordingly (it is never negative: due_at >=
-- confirmed). Requests received more than 27 days ago become due as soon as
-- they are confirmed. Nothing else changes: confirmation is still required
-- (fresh_sign_in by the holder, or owner_written_approval), the executor's
-- plan, refusals and retention rules are untouched.
--
-- Rollback: supabase/rollbacks/20261122190500_privacy_deletion_within_one_month_v1.down.sql
-- ============================================================================

create or replace function public.privacy_account_deletion_due_at(p_received timestamptz, p_confirmed timestamptz)
returns timestamptz
language sql
stable  -- timestamptz + interval '1 month' depends on the session time zone
parallel safe
set search_path = ''
as $$
  select case
    when p_confirmed is null then null
    else greatest(
      p_confirmed,
      least(p_confirmed + public.privacy_account_deletion_grace(),
            coalesce(p_received, p_confirmed) + interval '1 month' - interval '3 days'))
  end
$$;
comment on function public.privacy_account_deletion_due_at(timestamptz, timestamptz) is
  'When a confirmed account-deletion request is erased: the cooling-off (privacy_account_deletion_grace) after confirmation, but never later than 3 days before one month from receipt (GDPR Art. 12(3)), never before confirmation. Null when unconfirmed.';
revoke all on function public.privacy_account_deletion_due_at(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.privacy_account_deletion_due_at(timestamptz, timestamptz) to service_role;

create or replace function public.privacy_erasure_due_v1(p_limit int default 5)
returns table (request_id uuid, status text, method text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cr.id, cr.status, c.method
    from public.customer_requests cr
    join public.privacy_erasure_confirmations_v1 c on c.request_id = cr.id
   where cr.payload->>'privacy_request_type' = 'account_deletion'
     and cr.status in ('submitted', 'in_review', 'approved')
     and public.privacy_account_deletion_due_at(cr.created_at, c.confirmed_at) <= now()
     and exists (select 1 from auth.users u where u.id = cr.profile_id)
   order by c.confirmed_at
   limit greatest(1, least(coalesce(p_limit, 5), 50));
$$;

revoke all on function public.privacy_erasure_due_v1(int) from public, anon, authenticated;
grant execute on function public.privacy_erasure_due_v1(int) to service_role;

create or replace function public.privacy_account_deletion_status_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r record;
  v_confirmed timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'none');
  end if;
  select cr.id, cr.status, cr.closed_outcome, cr.created_at into r
    from public.customer_requests cr
   where cr.profile_id = v_uid
     and cr.payload->>'privacy_request_type' = 'account_deletion'
   order by case when cr.status = 'approved' then 0
                 when cr.status in ('submitted', 'in_review', 'needs_followup') then 1
                 else 2 end,
            cr.created_at desc, cr.id desc
   limit 1;
  if r.id is null then
    return jsonb_build_object('status', 'none');
  end if;
  select c.confirmed_at into v_confirmed
    from public.privacy_erasure_confirmations_v1 c where c.request_id = r.id;
  return jsonb_build_object(
    'status', case when r.status = 'approved' then 'in_progress'
                   when r.status = 'closed' and r.closed_outcome = 'withdrawn' then 'withdrawn'
                   when r.status = 'closed' then 'done'
                   else 'pending' end,
    'request_id', r.id,
    'submitted_at', r.created_at,
    'deletion_confirmed_at', v_confirmed,
    'scheduled_erasure_at', public.privacy_account_deletion_due_at(r.created_at, v_confirmed),
    'cancellable', r.status in ('submitted', 'in_review', 'needs_followup')
  );
end;
$$;

revoke all on function public.privacy_account_deletion_status_v1() from public, anon;
grant execute on function public.privacy_account_deletion_status_v1() to authenticated;
