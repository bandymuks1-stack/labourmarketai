-- Rollback for 20261122160000_privacy_deletion_within_one_month_v1: restores privacy_erasure_due_v1 and
-- privacy_account_deletion_status_v1 exactly as in 20261109120000 and drops
-- privacy_account_deletion_due_at. Erasures already run are not undone.

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
    'scheduled_erasure_at', v_confirmed + public.privacy_account_deletion_grace(),
    'cancellable', r.status in ('submitted', 'in_review', 'needs_followup')
  );
end;
$$;

revoke all on function public.privacy_account_deletion_status_v1() from public, anon;
grant execute on function public.privacy_account_deletion_status_v1() to authenticated;

drop function if exists public.privacy_account_deletion_due_at(timestamptz, timestamptz);
