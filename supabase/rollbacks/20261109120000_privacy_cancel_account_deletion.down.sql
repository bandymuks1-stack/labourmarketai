-- ROLLBACK for 20261109120000_privacy_cancel_account_deletion.sql
--
-- Restores, byte-for-byte from their defining migrations:
--   customer_requests_status_transition_guard  (20260705150000 + search_path from 20260727120000)
--   privacy_erasure_due_v1, privacy_erasure_mark_v1, erase_user_account_v3 (20261019140000)
-- and drops what the forward migration added:
--   trigger + function customer_requests_privacy_row_guard,
--   privacy_cancel_account_deletion_v1, privacy_account_deletion_status_v1,
--   privacy_account_deletion_grace.
-- DATA: nothing is deleted. Requests a holder withdrew stay as ordinary
-- closed rows (closed_outcome 'withdrawn', a 'by: holder' log entry); their
-- confirmation / notice rows were deleted by the withdrawal itself and are not
-- recreated (a withdrawn request must never become erasable again).
-- Effect of rolling back: the holder can no longer cancel, the runner erases
-- confirmed requests without a grace period again, and the owner can again
-- PATCH a privacy row's payload — i.e. the pre-20261109120000 state.

begin;

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
    raise exception 'invalid demand status transition: % -> %',
      old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

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
begin
  if p_status not in ('approved', 'needs_followup') then
    raise exception 'privacy_erasure_mark_v1: status must be approved or needs_followup' using errcode = '22023';
  end if;
  if not exists (select 1 from public.privacy_erasure_confirmations_v1 where request_id = p_request_id) then
    return jsonb_build_object('ok', false, 'error', 'not_confirmed');
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
begin
  if p_request_id is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('erased', false, 'refusals', jsonb_build_array(jsonb_build_object('reason', 'authorization invalid, expired or already used')));
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
  'GDPR Art. 17 executor v3 (#856). Consumes the token atomically, re-plans, refuses on any drift, executes everything in one transaction (guards disabled only around the one statement each), deletes auth.users last, writes an append-only receipt without identifiers. service_role only.';

drop trigger if exists customer_requests_privacy_row_guard on public.customer_requests;
drop function if exists public.customer_requests_privacy_row_guard();
drop function if exists public.privacy_cancel_account_deletion_v1();
drop function if exists public.privacy_account_deletion_status_v1();
drop function if exists public.privacy_account_deletion_grace();

commit;
