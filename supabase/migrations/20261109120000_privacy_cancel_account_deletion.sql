-- @human-gate-approved (acknowledgement only: RED, NOT applied; owner/DI approval required; grace = owner decision 2026-11-09: 30 days)
--
-- 20261109120000 — the account holder can CANCEL their own account-deletion
-- request (owner P0 2026-11-09), and the erasure runner can no longer erase a
-- request that was withdrawn while it was running.
--
-- WHAT THIS CHANGES (and nothing else)
--   1. public.privacy_cancel_account_deletion_v1() — NEW. SECURITY DEFINER,
--      auth.uid() only (no id parameter), authenticated only. One atomic UPDATE
--      closes the holder's OPEN account-deletion request(s) (submitted /
--      in_review / needs_followup) as closed + closed_outcome 'withdrawn',
--      appends {status, outcome, at, by:'holder'} to payload.privacy_review_log
--      (no personal data), and in the same transaction deletes the request's
--      confirmation row (privacy_erasure_confirmations_v1) and every held /
--      queued notice (privacy_erasure_notices_v1). Contract (the app depends on
--      it EXACTLY):
--        {"status":"ok","request_id":uuid}            withdrawn now
--        {"status":"ok_already","request_id":uuid}    already closed as withdrawn
--        {"status":"not_cancellable","request_id":uuid} approved / executed / closed otherwise
--        {"status":"not_found"}                       no account-deletion request
--        {"status":"not_signed_in"}                   auth.uid() is null
--   2. public.privacy_account_deletion_status_v1() — NEW. SECURITY DEFINER,
--      own row only, authenticated only:
--        {"status":"none"} |
--        {"status":"pending"|"withdrawn"|"in_progress"|"done", "request_id",
--         "submitted_at", "deletion_confirmed_at"|null, "scheduled_erasure_at"|null,
--         "cancellable": bool}
--   3. HARDENING — privacy_erasure_mark_v1 and erase_user_account_v3 now lock
--      the request row FOR UPDATE first and re-check that it is not closed and
--      that its confirmation still exists; otherwise they stop without erasing
--      (their existing skip shapes). Bodies are recreated from 20261019140000
--      with ONLY that change. Before this, erase_user_account_v3 compared a
--      fingerprint without a lock and its final UPDATE was unconditional: a
--      withdrawal committing after the fingerprint check could still be erased.
--   4. GRACE PERIOD — privacy_erasure_due_v1 returns a confirmed request only
--      once confirmed_at <= now() - public.privacy_account_deletion_grace().
--      The grace is ONE named constant (30 days, owner decision 2026-11-09).
--   5. LOOPHOLE CLOSED — RLS (0028 customer_requests_update) lets an owner
--      PATCH their own row, so a holder could rewrite payload (e.g. drop
--      privacy_request_type to hide a request from the runner, or forge a log
--      entry) or move status. CHOICE: a row-scoped BEFORE UPDATE trigger
--      (customer_requests_privacy_row_guard) that refuses ANY change to a
--      privacy-request row made on the raw `authenticated` / `anon` surface by a
--      non-admin. NOT a column REVOKE: grants cannot be row-conditional, and
--      revoking UPDATE(payload, status, closed_outcome) would break the LIVE
--      owner close / reopen / edit flows on ordinary demand rows of the SAME
--      table (lib/demand/demand-lifecycle.ts). SECURITY DEFINER RPCs (function
--      owner), service_role (runner) and the admin review queue
--      (lib/admin/privacy-requests.ts, is_admin()) are unchanged. Same
--      raw-surface test (current_user = 'authenticated') as the existing
--      demand_org_attribution_guard (20260806200000).
--   6. TRANSITION GUARD — customer_requests_status_transition_guard gains ONE
--      narrow branch: an account-deletion row may go submitted / in_review /
--      needs_followup -> closed with closed_outcome 'withdrawn' ONLY inside a
--      definer context (current_user is not authenticated/anon), for the
--      signed-in holder's own row, while the cancel RPC's transaction-local
--      marker names that holder. Every other rule is byte-for-byte unchanged.
--
-- Additive: no DROP TABLE / COLUMN, no RLS policy change, no grant widening
-- (new functions: EXECUTE revoked from public/anon, granted to authenticated;
-- the grace constant: service_role only). RLS is only tightened (trigger).
--
-- RED class: SECURITY DEFINER, GRANT/REVOKE, CREATE TRIGGER, DML in function
-- bodies, dynamic SQL inside the recreated executor. NOT APPLIED anywhere.
-- Proof: apps/web/scripts/db-proof/privacy-cancel-account-deletion-local.mjs
-- (throwaway local PostgreSQL 16 cluster).
--
-- ROLLBACK: supabase/rollbacks/20261109120000_privacy_cancel_account_deletion.down.sql
-- (restores the 20261019140000 / 20260705150000 bodies, drops the trigger and
-- the three new functions; withdrawn rows stay as ordinary closed history).

begin;
-- fail fast instead of queueing every customer_requests write behind CREATE TRIGGER / CREATE OR REPLACE
set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────
-- 0 · the grace period — ONE named constant
-- ─────────────────────────────────────────────────────────────────────────
-- Owner decision 2026-11-09, verbatim: "Deletion waiting period: 30 days."
create or replace function public.privacy_account_deletion_grace()
returns interval
language sql
immutable
parallel safe
set search_path = ''
as $$
  select interval '30 days'
$$;
comment on function public.privacy_account_deletion_grace() is
  'Time between the holder''s confirmation and the automatic erasure, during which the holder can still cancel (privacy_cancel_account_deletion_v1). Owner decision 2026-11-09, verbatim: "Deletion waiting period: 30 days."';
revoke all on function public.privacy_account_deletion_grace() from public, anon, authenticated;
grant execute on function public.privacy_account_deletion_grace() to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 1 · transition guard — one narrow holder-withdraw branch (20260705150000 otherwise unchanged)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.customer_requests_status_transition_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;
    if (old.status = 'draft' and new.status in ('submitted', 'closed'))
       or (old.status = 'submitted' and new.status = 'closed')
       or (old.status = 'closed' and new.status = 'submitted') then
      return new;
    end if;
    -- 20261109120000: the holder withdraws their own account-deletion request.
    -- Only inside privacy_cancel_account_deletion_v1 (definer context + its
    -- transaction-local marker naming this holder); never on the raw surface.
    if old.status in ('submitted', 'in_review', 'needs_followup')
       and new.status = 'closed'
       and new.closed_outcome = 'withdrawn'
       and old.payload->>'privacy_request_type' = 'account_deletion'
       and new.payload->>'privacy_request_type' = 'account_deletion'
       and current_user not in ('authenticated', 'anon')
       and old.profile_id = auth.uid()
       and new.profile_id = old.profile_id
       and coalesce(current_setting('lm.privacy_withdraw_holder', true), '') = old.profile_id::text then
      return new;
    end if;
    raise exception 'invalid demand status transition: % -> %',
      old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2 · privacy-request rows are RPC-only on the raw surface
-- ─────────────────────────────────────────────────────────────────────────
-- INVOKER rights ON PURPOSE (as demand_org_attribution_guard): current_user is
-- 'authenticated' on a PostgREST PATCH and the FUNCTION OWNER inside the
-- SECURITY DEFINER privacy RPCs; a definer guard could not tell them apart.
create or replace function public.customer_requests_privacy_row_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not (coalesce(old.payload ? 'privacy_request_type', false)
          or coalesce(new.payload ? 'privacy_request_type', false)
          or coalesce(old.payload->>'source', '') = 'privacy_self_service'
          or coalesce(new.payload->>'source', '') = 'privacy_self_service') then
    return new;                                   -- ordinary demand rows: unchanged
  end if;
  if current_user not in ('authenticated', 'anon') then
    return new;                                   -- definer RPCs, service_role runner, migrations
  end if;
  if current_user = 'authenticated' then
    if public.is_admin() then
      return new;                                 -- operator review queue (lib/admin/privacy-requests.ts)
    end if;
  end if;
  if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'privacy_request_rpc_only: a privacy request changes only through its RPCs'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.customer_requests_privacy_row_guard() from public, anon, authenticated;
comment on function public.customer_requests_privacy_row_guard() is
  'A privacy-request row (payload.privacy_request_type / source privacy_self_service) changes on the raw authenticated surface only for an admin; the holder uses privacy_cancel_account_deletion_v1. 20261109120000.';

drop trigger if exists customer_requests_privacy_row_guard on public.customer_requests;
create trigger customer_requests_privacy_row_guard
  before update on public.customer_requests
  for each row
  execute function public.customer_requests_privacy_row_guard();

-- ─────────────────────────────────────────────────────────────────────────
-- 3 · the holder cancels their own account-deletion request
-- ─────────────────────────────────────────────────────────────────────────
-- Which request: an approved one first (the erasure is under way: nothing to
-- cancel, say so), else the latest open one, else the latest one.
create or replace function public.privacy_cancel_account_deletion_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_req     uuid;
  v_status  text;
  v_owner   uuid;
  v_outcome text;
  v_ids     uuid[];
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;

  select cr.id into v_req
    from public.customer_requests cr
   where cr.profile_id = v_uid
     and cr.payload->>'privacy_request_type' = 'account_deletion'
   order by case when cr.status = 'approved' then 0
                 when cr.status in ('submitted', 'in_review', 'needs_followup') then 1
                 else 2 end,
            cr.created_at desc, cr.id desc
   limit 1;
  if v_req is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- the same row lock the runner (privacy_erasure_mark_v1) and the executor
  -- (erase_user_account_v3) take: whoever is first wins, the other one sees it
  select cr.status, cr.profile_id, cr.closed_outcome
    into v_status, v_owner, v_outcome
    from public.customer_requests cr
   where cr.id = v_req
     for update;

  if v_owner is distinct from v_uid then
    -- the executor severed the row while we waited: the erasure ran
    return jsonb_build_object('status', 'not_cancellable', 'request_id', v_req);
  end if;

  if v_status in ('submitted', 'in_review', 'needs_followup') then
    perform pg_catalog.set_config('lm.privacy_withdraw_holder', v_uid::text, true);
    with w as (
      update public.customer_requests cr
         set status = 'closed',
             closed_outcome = 'withdrawn',
             updated_at = now(),
             payload = jsonb_set(coalesce(cr.payload, '{}'::jsonb), '{privacy_review_log}',
               coalesce(cr.payload->'privacy_review_log', '[]'::jsonb)
                 || jsonb_build_array(jsonb_build_object(
                      'status', 'closed', 'outcome', 'withdrawn', 'at', now(), 'by', 'holder')))
       where cr.profile_id = v_uid
         and cr.payload->>'privacy_request_type' = 'account_deletion'
         and cr.status in ('submitted', 'in_review', 'needs_followup')
      returning cr.id
    )
    select coalesce(array_agg(w.id), '{}'::uuid[]) into v_ids from w;
    perform pg_catalog.set_config('lm.privacy_withdraw_holder', '', true);

    delete from public.privacy_erasure_confirmations_v1 c where c.request_id = any (v_ids);
    delete from public.privacy_erasure_notices_v1 n
     where n.request_id = any (v_ids) and n.status in ('held', 'queued');
    return jsonb_build_object('status', 'ok', 'request_id', v_req);
  end if;

  if v_status = 'closed' and v_outcome = 'withdrawn' then
    return jsonb_build_object('status', 'ok_already', 'request_id', v_req);
  end if;

  return jsonb_build_object('status', 'not_cancellable', 'request_id', v_req);
end;
$$;
revoke all on function public.privacy_cancel_account_deletion_v1() from public, anon;
grant execute on function public.privacy_cancel_account_deletion_v1() to authenticated;
comment on function public.privacy_cancel_account_deletion_v1() is
  'The signed-in holder withdraws their own open account-deletion request(s): closed + withdrawn, log entry by holder, confirmation and held/queued notices deleted, one transaction under the request row lock. Returns {status: ok|ok_already|not_cancellable|not_found|not_signed_in, request_id?}. 20261109120000.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4 · the holder reads the state of their own account-deletion request
-- ─────────────────────────────────────────────────────────────────────────
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
    'scheduled_erasure_at', v_confirmed + public.privacy_account_deletion_grace(),
    'cancellable', r.status in ('submitted', 'in_review', 'needs_followup')
  );
end;
$$;
revoke all on function public.privacy_account_deletion_status_v1() from public, anon;
grant execute on function public.privacy_account_deletion_status_v1() to authenticated;
comment on function public.privacy_account_deletion_status_v1() is
  'The signed-in holder''s latest account-deletion request (an approved one first, else the latest open, else the latest): {status: none|pending|withdrawn|in_progress|done, request_id, submitted_at, deletion_confirmed_at, scheduled_erasure_at, cancellable}. Own row only. 20261109120000.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5 · runner primitives: grace period + row lock (20261019140000 otherwise unchanged)
-- ─────────────────────────────────────────────────────────────────────────
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
     and c.confirmed_at <= now() - public.privacy_account_deletion_grace()
     and exists (select 1 from auth.users u where u.id = cr.profile_id)
   order by c.confirmed_at
   limit greatest(1, least(coalesce(p_limit, 5), 50));
$$;

create or replace function public.privacy_erasure_mark_v1(p_request_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if p_status not in ('approved', 'needs_followup') then
    raise exception 'privacy_erasure_mark_v1: status must be approved or needs_followup' using errcode = '22023';
  end if;
  -- 20261109120000: lock the request row first, then re-check (a holder's
  -- withdrawal either committed before this point or waits for this one)
  select cr.status into v_status
    from public.customer_requests cr
   where cr.id = p_request_id and cr.payload->>'privacy_request_type' = 'account_deletion'
     for update;
  if not exists (select 1 from public.privacy_erasure_confirmations_v1 where request_id = p_request_id) then
    return jsonb_build_object('ok', false, 'error', 'not_confirmed');
  end if;
  if v_status is null or v_status = 'closed' then
    return jsonb_build_object('ok', false, 'error', 'not_open');
  end if;
  update public.customer_requests
     set status = p_status,
         manual_review_note = left(coalesce(p_note, manual_review_note), 2000),
         payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{privacy_review_log}',
           coalesce(payload->'privacy_review_log', '[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('status', p_status, 'at', now(), 'by', 'system')))
         , updated_at = now()
   where id = p_request_id and payload->>'privacy_request_type' = 'account_deletion'
     and status <> 'closed';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_open');
  end if;
  if p_status = 'needs_followup' then
    -- the account stays: a completion notice captured for it must not keep the address
    delete from public.privacy_erasure_notices_v1
     where request_id = p_request_id and kind = 'erasure_completed' and status = 'held';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6 · EXECUTE (erase_user_account_v3) — 20261019140000 body + the 9.0 row lock
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.erase_user_account_v3(
  p_request_id uuid,
  p_token text,
  p_executed_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth public.privacy_erasure_authorizations_v3%rowtype;
  v_plan jsonb;
  v_user uuid;
  v_worker uuid;
  v_requested_at timestamptz;
  v_subject uuid := gen_random_uuid();
  v_emails text[];
  v_sentinel_email text;
  v_key uuid;
  v_target uuid;
  v_n bigint;
  v_receipt uuid;
  v_fail text;
  v_sqlstate text;
  r record;
  g text;
  e text;
  c text;
  v_sets text;
  v_req_status text;
begin
  if p_request_id is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('erased', false, 'refusals', jsonb_build_array(jsonb_build_object('reason', 'authorization invalid, expired or already used')));
  end if;

  -- 9.0 (20261109120000) lock the request row for the whole execution and
  --     re-check it: a holder's withdrawal (privacy_cancel_account_deletion_v1)
  --     either committed before this point and is seen here, or waits until
  --     this transaction ends and then finds nothing left to cancel. A closed
  --     or no-longer-confirmed request is neither consumed nor erased.
  select cr.status into v_req_status
    from public.customer_requests cr
   where cr.id = p_request_id
     for update;
  if v_req_status is null or v_req_status = 'closed'
     or not exists (select 1 from public.privacy_erasure_confirmations_v1 c where c.request_id = p_request_id) then
    return jsonb_build_object('erased', false, 'refusals', jsonb_build_array(jsonb_build_object('reason', 'request withdrawn, closed or no longer confirmed')));
  end if;

  -- 9.1 atomic single use: exactly one of any number of concurrent calls gets the row
  update public.privacy_erasure_authorizations_v3 a
     set consumed_at = now()
   where a.token_digest = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and a.request_id = p_request_id
     and a.consumed_at is null
     and a.expires_at > now()
  returning a.* into v_auth;
  if v_auth.id is null then
    return jsonb_build_object('erased', false, 'refusals', jsonb_build_array(jsonb_build_object('reason', 'authorization invalid, expired or already used')));
  end if;

  -- 9.2 state and plan must be exactly what the admin authorized
  if public.privacy_erasure_state_fingerprint_v3(p_request_id) is distinct from v_auth.state_fingerprint then
    update public.privacy_erasure_authorizations_v3 set outcome = 'refused: request state changed since authorization' where id = v_auth.id;
    return jsonb_build_object('erased', false, 'refusals', jsonb_build_array(jsonb_build_object('reason', 'request state changed since authorization; request a new token')));
  end if;
  v_plan := public.privacy_erasure_plan_v3(p_request_id, v_auth.external);
  if not (v_plan->>'executable')::boolean then
    update public.privacy_erasure_authorizations_v3 set outcome = 'refused: plan no longer executable' where id = v_auth.id;
    return jsonb_build_object('erased', false) || v_plan;
  end if;
  if v_plan->>'plan_digest' is distinct from v_auth.plan_digest then
    update public.privacy_erasure_authorizations_v3 set outcome = 'refused: plan changed since authorization' where id = v_auth.id;
    return jsonb_build_object('erased', false, 'refusals', jsonb_build_array(jsonb_build_object('reason', 'the plan changed since authorization; review and request a new token')));
  end if;

  select cr.profile_id, cr.created_at into v_user, v_requested_at from public.customer_requests cr where cr.id = p_request_id;
  select w.id into v_worker from public.workers w where w.profile_id = v_user limit 1;
  select coalesce(array_agg(distinct lower(x)), '{}') into v_emails
    from (select u.email::text as x from auth.users u where u.id = v_user and u.email is not null
          union select p.email from public.profiles p where p.id = v_user and p.email is not null) s;
  v_sentinel_email := 'erased-' || replace(v_subject::text, '-', '') || '@erased.invalid';

  -- 9.3 all or nothing: any failure rolls this block back and is recorded as a refusal
  begin
    -- (a) ai_runs: existing RPC (sever subject, clear AI content)
    if to_regprocedure('public.ai_runs_delink_subject(uuid)') is not null then
      perform public.ai_runs_delink_subject(v_user);
    end if;

    -- (b) value rules
    for r in select * from jsonb_to_recordset(v_plan->'actions')
               as x("table" text, "column" text, rows bigint, treatment text, match text, scrub jsonb)
             where treatment in ('pseudonymise_value', 'delete_rows', 'pseudonymise_mentions') and match is not null
    loop
      if r.treatment = 'delete_rows' then
        if r.match = 'email_exact' then
          execute format('delete from %s where lower(%I::text) = any($1)', r."table", r."column") using v_emails;
        end if;
      elsif r.treatment = 'pseudonymise_value' then
        v_sets := format('%I = $2', r."column");
        for c in select jsonb_array_elements_text(coalesce(r.scrub, '[]'::jsonb)) loop
          v_sets := v_sets || format(', %I = null', c);
        end loop;
        if r.match = 'email_exact' then
          execute format('update %s set %s where lower(%I::text) = any($1)', r."table", v_sets, r."column") using v_emails, v_sentinel_email;
        elsif r.match = 'phone_exact' then
          execute format('update %s set %s where regexp_replace(coalesce(%I::text, ''''), ''\D'', '''', ''g'') = $1', r."table", v_sets, r."column")
            using (select nullif(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), '') from public.profiles p where p.id = v_user), null;
        end if;
      else -- pseudonymise_mentions (text or jsonb): id -> tombstone, e-mail -> sentinel e-mail
        v_sets := format('%I::text', r."column");
        v_sets := format('replace(%s, $1, $2)', v_sets);
        foreach e in array v_emails loop
          v_sets := format('replace(%s, %L, %L)', v_sets, e, v_sentinel_email);
        end loop;
        execute format('update %s set %I = (%s)::%s where %I::text ilike $3 or lower(%I::text) ilike any($4)',
          r."table", r."column", v_sets,
          (select format_type(a.atttypid, a.atttypmod) from pg_attribute a where a.attrelid = r."table"::regclass and a.attname = r."column"),
          r."column", r."column")
          using v_user::text, v_subject::text, '%' || v_user::text || '%',
                coalesce((select array_agg('%' || x || '%') from unnest(v_emails) x), array['%' || v_user::text || '%']);
      end if;
    end loop;

    -- (c) FK treatments, in a deterministic order: delete, set null, sever, ledger
    for r in select * from jsonb_to_recordset(v_plan->'actions')
               as x("table" text, "column" text, parent text, rows bigint, treatment text, guards jsonb, scrub jsonb, match text)
             where match is null and treatment in ('delete_rows', 'set_null', 'sever_sentinel', 'pseudonymise_ledger')
             order by case treatment when 'delete_rows' then 1 when 'set_null' then 2 when 'sever_sentinel' then 3 else 4 end, "table", "column"
    loop
      v_key := case when r.parent = 'workers' then v_worker else v_user end;
      v_target := case when r.parent = 'workers' then public.privacy_erasure_sentinel_worker_id() else public.privacy_erasure_sentinel_profile_id() end;
      for g in select jsonb_array_elements_text(coalesce(r.guards, '[]'::jsonb)) loop
        execute format('alter table %s disable trigger %I', r."table", g);
      end loop;
      v_sets := '';
      for c in select jsonb_array_elements_text(coalesce(r.scrub, '[]'::jsonb)) loop
        v_sets := v_sets || format(', %I = null', c);
      end loop;
      if r.treatment = 'delete_rows' then
        execute format('delete from %s where %I = $1', r."table", r."column") using v_key;
      elsif r.treatment = 'set_null' then
        execute format('update %s set %I = null%s where %I = $1', r."table", r."column", v_sets, r."column") using v_key;
      elsif r.treatment = 'sever_sentinel' then
        execute format('update %s set %I = $2%s where %I = $1', r."table", r."column", v_sets, r."column") using v_key, v_target;
      else
        execute format('update %s set %I = null, erased_subject_id = $2, erased_at = now() where %I = $1', r."table", r."column", r."column") using v_key, v_subject;
      end if;
      for g in select jsonb_array_elements_text(coalesce(r.guards, '[]'::jsonb)) loop
        execute format('alter table %s enable trigger %I', r."table", g);
      end loop;
    end loop;

    -- (d) the privacy request row survives, severed and closed (Art. 5(2); E4: 3 y)
    update public.customer_requests
       set status = 'closed',
           payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('privacy_erasure', 'executed', 'erased_subject_id', v_subject)
     where id = p_request_id;

    -- (e) the account: cascades now meet only rows the registry decided as allow_cascade
    delete from auth.users where id = v_user;

    -- (f) nothing may still point at the person
    for r in
      select c.conrelid::regclass::text as tbl, a.attname::text as col,
             case c.confrelid when 'public.profiles'::regclass then 'profiles' else 'workers' end as parent
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f' and c.confrelid in ('public.profiles'::regclass, 'public.workers'::regclass)
    loop
      v_key := case when r.parent = 'workers' then v_worker else v_user end;
      continue when v_key is null;
      execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_n using v_key;
      if v_n > 0 then
        raise exception 'post-check: % rows in %.% still reference the person', v_n, r.tbl, r.col using errcode = 'LME03';
      end if;
    end loop;
  exception when others then
    v_fail := sqlerrm; v_sqlstate := sqlstate;
    update public.privacy_erasure_authorizations_v3 set outcome = 'failed: ' || v_sqlstate || ' ' || left(v_fail, 200) where id = v_auth.id;
    return jsonb_build_object('erased', false,
      'refusals', jsonb_build_array(jsonb_build_object('reason', 'execution failed and was rolled back: ' || v_fail, 'sqlstate', v_sqlstate)),
      'actions', v_plan->'actions');
  end;

  -- 9.4 receipt (no identifier of the person) + authorization outcome
  insert into public.privacy_erasure_receipts_v3 (request_id, authorization_id, erased_subject_id, requested_at, executed_by, external, actions, retained)
  values (p_request_id, v_auth.id, v_subject, v_requested_at, p_executed_by, v_auth.external, v_plan->'actions', v_plan->'retained')
  returning id into v_receipt;
  update public.privacy_erasure_authorizations_v3 set outcome = 'erased', receipt_id = v_receipt where id = v_auth.id;

  return jsonb_build_object('erased', true, 'receipt_id', v_receipt, 'erased_subject_id', v_subject,
    'actions', v_plan->'actions', 'retained', v_plan->'retained');
end;
$$;

revoke all on function public.erase_user_account_v3(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.erase_user_account_v3(uuid, text, uuid) to service_role;
revoke all on function public.privacy_erasure_due_v1(int) from public, anon, authenticated;
revoke all on function public.privacy_erasure_mark_v1(uuid, text, text) from public, anon, authenticated;
grant execute on function public.privacy_erasure_due_v1(int) to service_role;
grant execute on function public.privacy_erasure_mark_v1(uuid, text, text) to service_role;
comment on function public.erase_user_account_v3(uuid, text, uuid) is
  'GDPR Art. 17 executor v3 (#856). Locks the request row and refuses a closed / unconfirmed request (20261109120000), consumes the token atomically, re-plans, refuses on any drift, executes everything in one transaction (guards disabled only around the one statement each), deletes auth.users last, writes an append-only receipt without identifiers. service_role only.';

commit;
