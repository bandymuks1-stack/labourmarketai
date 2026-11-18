-- Rollback for 20261011160000_absence_authority_engagement_v1: restores the
-- production policy, view and RPC bodies verbatim (caller_manages_worker), then
-- drops the new predicate once nothing references it.

begin;

alter policy worker_absences_select on public.worker_absences
  using (
    (exists (
      select 1 from public.workers w
       where w.id = worker_absences.worker_id and w.profile_id = auth.uid()))
    or (public.caller_manages_worker(worker_id) and status = 'requested')
    or public.is_admin()
  );

create or replace view public.worker_absence_scheduling as
  select a.id,
         a.worker_id,
         a.start_date,
         a.end_date,
         a.half_day,
         a.status
    from public.worker_absences a
   where a.status = 'approved'
     and (public.caller_manages_worker(a.worker_id)
          or public.is_admin()
          or exists (
            select 1 from public.workers w
             where w.id = a.worker_id and w.profile_id = auth.uid()));

create or replace function public.review_worker_absence_v1(p_absence_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_worker uuid;
  v_status text;
begin
  select worker_id, status into v_worker, v_status from public.worker_absences where id = p_absence_id;
  if v_worker is null then
    raise exception 'absence not found';
  end if;
  if not public.caller_manages_worker(v_worker) then
    raise exception 'not authorized to review this absence';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'invalid decision';
  end if;
  if v_status <> 'requested' then
    raise exception 'only a requested absence can be reviewed';
  end if;
  update public.worker_absences
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_absence_id;
end;
$function$;

drop function if exists public.caller_manages_worker_absence(uuid);

commit;
