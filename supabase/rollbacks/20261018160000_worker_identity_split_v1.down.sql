-- ROLLBACK of 20261018160000_worker_identity_split_v1
-- Restores the previous workers_select policy (can_view_worker, including the discoverability branch)
-- and the previous conversation_counterpart_identities body (byte-identical to the applied
-- 20260705170000 version), and removes the functions this migration added.
-- caller_has_worker_relation_v1 is KEPT: the same function is also created by
-- 20261018150000_employer_profile_views_v1 and may be in use there; it grants nothing on its own.
-- ORDER: if 20261018150000 is also applied, roll THIS file back first (its policy is the only object
-- that depends on caller_has_worker_relation_v1 besides that migration's own gate).
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
commit;
