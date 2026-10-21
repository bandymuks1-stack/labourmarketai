-- Rollback of 20261021095000_demand_interest_org_managers_v1.
-- Restores, verbatim, the demand-owner read policy of 20260704230000 and the
-- acknowledge_demand_interest body of 20260705120000 (creator only), with the
-- same grants. No data is touched: acknowledgements a colleague made stay as
-- recorded (honest history). Apply via Supabase MCP apply_migration.

begin;

drop policy if exists demand_interest_signals_demand_owner_select
  on public.demand_interest_signals;
create policy demand_interest_signals_demand_owner_select
  on public.demand_interest_signals for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.customer_requests cr
       where cr.id = request_id
         and cr.profile_id = auth.uid()
    )
  );

create or replace function public.acknowledge_demand_interest(
  p_request_id uuid,
  p_worker_id  uuid,
  p_status     text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_owner uuid;
  v_cur   text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_status not in ('reviewed','contacted') then
    raise exception 'Invalid acknowledgement status' using errcode = '22023';
  end if;

  -- The caller must OWN the demand.
  select cr.profile_id into v_owner
    from public.customer_requests cr
   where cr.id = p_request_id;
  if v_owner is null or v_owner <> uid then
    raise exception 'Not the demand owner' using errcode = '42501';
  end if;

  select dis.status into v_cur
    from public.demand_interest_signals dis
   where dis.request_id = p_request_id
     and dis.worker_id = p_worker_id;
  if v_cur is null then
    return false; -- no signal → nothing to acknowledge (honest no-op)
  end if;
  if v_cur = 'withdrawn' then
    return false; -- the worker's withdrawal is immutable to the company
  end if;

  update public.demand_interest_signals
     set status = p_status,
         updated_at = now()
   where request_id = p_request_id
     and worker_id = p_worker_id
     and status <> 'withdrawn';
  return true;
end $$;

revoke all on function
  public.acknowledge_demand_interest(uuid, uuid, text) from public;
revoke all on function
  public.acknowledge_demand_interest(uuid, uuid, text) from anon;
grant execute on function
  public.acknowledge_demand_interest(uuid, uuid, text) to authenticated;

commit;
