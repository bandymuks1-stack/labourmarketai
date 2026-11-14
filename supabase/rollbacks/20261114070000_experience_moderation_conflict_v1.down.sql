-- Rollback for 20261114070000_experience_moderation_conflict_v1
-- Restores the five moderator functions exactly as 20260802120000 created them
-- (a moderator who is a party is no longer refused by the database, and
-- 'changed' is accepted again), then drops the helper. No data is touched;
-- audit rows written by refusals stay (the audit trail is append-only).
-- Apply via Supabase MCP apply_migration.

begin;

create or replace function public.start_experience_moderation(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'not_authorized'); end if;
  update public.experience_records
     set moderation_status = 'in_moderation', moderated_by = auth.uid(), updated_at = now()
   where id = p_id and moderation_status = 'submitted';
  if not found then return jsonb_build_object('ok', false, 'code', 'invalid_transition'); end if;
  perform public.experience_audit('experience_record', p_id, 'moderation_started',
    'submitted', 'in_moderation', null);
  return jsonb_build_object('ok', true, 'status', 'in_moderation');
end;
$$;

create or replace function public.decide_experience_moderation(
  p_id uuid, p_decision text, p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'not_authorized'); end if;
  if p_decision not in ('published','rejected') then
    return jsonb_build_object('ok', false, 'code', 'invalid_decision');
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 1 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;
  update public.experience_records
     set moderation_status = p_decision,
         moderated_by = auth.uid(),
         moderation_reason = trim(p_reason),
         published_at = case when p_decision = 'published' then now() else published_at end,
         rejected_at  = case when p_decision = 'rejected'  then now() else rejected_at end,
         updated_at = now()
   where id = p_id and moderation_status = 'in_moderation';
  if not found then return jsonb_build_object('ok', false, 'code', 'invalid_transition'); end if;
  perform public.experience_audit('experience_record', p_id, 'moderation_decided',
    'in_moderation', p_decision, trim(p_reason));
  return jsonb_build_object('ok', true, 'status', p_decision);
end;
$$;

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

create or replace function public.review_experience_dispute(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'not_authorized'); end if;
  update public.experience_records
     set dispute_status = 'under_review', updated_at = now()
   where id = p_id and dispute_status = 'opened';
  if not found then return jsonb_build_object('ok', false, 'code', 'invalid_transition'); end if;
  perform public.experience_audit('experience_record', p_id, 'dispute_review_started',
    'opened', 'under_review', null);
  return jsonb_build_object('ok', true, 'dispute', 'under_review');
end;
$$;

create or replace function public.resolve_experience_dispute(
  p_id uuid, p_resolution text, p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_next text;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'not_authorized'); end if;
  if p_resolution not in ('upheld','changed','removed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_resolution');
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 1 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;
  v_next := 'resolved_' || p_resolution;
  update public.experience_records
     set dispute_status = v_next,
         dispute_resolution_reason = trim(p_reason),
         updated_at = now()
   where id = p_id and dispute_status = 'under_review';
  if not found then return jsonb_build_object('ok', false, 'code', 'invalid_transition'); end if;
  perform public.experience_audit('experience_record', p_id, 'dispute_resolved',
    'under_review', v_next, trim(p_reason));
  return jsonb_build_object('ok', true, 'dispute', v_next);
end;
$$;

drop function if exists public.experience_moderator_is_party(uuid);

commit;
