-- ROLLBACK of 20261018160000_worker_identity_split_v1
-- Restores the previous workers_select policy (can_view_worker, including the discoverability branch)
-- and the previous conversation_counterpart_identities body (byte-identical to the applied
-- 20260705170000 version), and removes the functions this migration added.
-- ORDER: reverse of the apply order. If 20261018150000 (applied AFTER this file) is live, roll IT back
-- first — it replaces this file's discovery projection with its counted two-tier version.
-- caller_has_worker_relation_v1 is dropped here only when 20261018150000's gate no longer exists;
-- otherwise it is kept (it grants nothing on its own).
begin;
drop policy if exists workers_select on public.workers;
create policy workers_select on public.workers
  for select using (public.can_view_worker(id));

create or replace function public.conversation_counterpart_identities(p_conversation_ids uuid[])
 returns table(conversation_id uuid, display_name text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select cp.conversation_id, p.full_name
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  join public.profiles p on p.id = cp.profile_id
  where cp.conversation_id = any(p_conversation_ids)
    and c.kind = 'direct'
    and cp.profile_id <> auth.uid()
    and cp.revoked_at is null
    and public.is_conversation_participant(cp.conversation_id)
    and (
      select count(*)
      from public.conversation_participants cp2
      where cp2.conversation_id = cp.conversation_id
        and cp2.revoked_at is null
    ) = 2;
$function$;

drop function if exists public.list_discoverable_worker_profiles_v1(uuid[]);
drop function if exists public.list_discoverable_worker_ids_v1(text, integer);
drop function if exists public.candidate_profile_for_contact_v1(uuid, uuid);
drop function if exists public.my_direct_conversations_with_workers_v1(uuid[]);
drop function if exists public.employer_disclosure_granted_v1(uuid, uuid, text, uuid);
do $$
begin
  if to_regprocedure('public.record_worker_profile_view_v1(uuid,uuid)') is null then
    drop function if exists public.caller_has_worker_relation_v1(uuid);
  end if;
end $$;
commit;
