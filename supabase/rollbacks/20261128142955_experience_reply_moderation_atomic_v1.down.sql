-- Private draft for #3301. RED, needs-human-gate.
-- Disable and drain the reply moderation writer before rollback. Existing decisions and audit rows are retained.
-- Serialize deployment with other changes to this RPC, including #3324.
-- A missing function, unexpected body, or changed function metadata aborts the statement.
do $migration$
declare
  target constant regprocedure := 'public.moderate_experience_response(uuid,text,text)'::regprocedure;
  prior_metadata jsonb;
  prior_body_md5 text;
begin
  select to_jsonb(p) - 'prosrc', md5(p.prosrc)
    into strict prior_metadata, prior_body_md5
    from pg_catalog.pg_proc p where p.oid = target;
  if prior_body_md5 is distinct from 'b3c38b7f2df8d05b4b3159d3de200683' then
    raise exception 'Unexpected reply moderation body; reconcile this migration with the deployed definition.';
  end if;

create or replace function public.moderate_experience_response(
  p_id uuid, p_decision text, p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prev text;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'not_authorized'); end if;
  if p_decision not in ('published','rejected') then
    return jsonb_build_object('ok', false, 'code', 'invalid_decision');
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 1 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;
  select moderation_status into v_prev from public.experience_responses where id = p_id;
  if v_prev is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_prev not in ('submitted','in_moderation') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;
  update public.experience_responses
     set moderation_status = p_decision, moderated_by = auth.uid(),
         moderation_reason = trim(p_reason), updated_at = now()
   where id = p_id;
  perform public.experience_audit('experience_response', p_id, 'response_moderated',
    v_prev, p_decision, trim(p_reason));
  return jsonb_build_object('ok', true, 'status', p_decision);
end;
$$;

  if not exists (
    select 1 from pg_catalog.pg_proc p
     where p.oid = target
       and md5(p.prosrc) = '58016606e70cead83d15865ddabd4ee1'
       and (to_jsonb(p) - 'prosrc') = prior_metadata
  ) then
    raise exception 'Reply moderation body or metadata verification failed.';
  end if;
end;
$migration$;
