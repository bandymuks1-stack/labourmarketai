-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET. Draft PR + needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration.
-- 20261114070000_experience_moderation_conflict_v1
--
-- RED tier (needs-human-gate): SECURITY DEFINER functions (one new, five
-- replaced) and one REVOKE. No table, column, row, policy or constraint
-- changes. Risk findings acknowledged: security-definer-function,
-- grant-or-revoke.
--
-- WHY (register 2.24, owner rule 2026-11-13: a moderator with a conflict of
-- interest does not decide; an independent one takes it). The five moderator
-- functions of 20260802120000_experience_records_v1 check only is_admin().
-- The web app refuses a party before calling them (PR #3301), but a moderator
-- can call the functions directly with their own session, below the app. The
-- rule therefore has to live here.
--
-- WHAT
--   * experience_moderator_is_party(record) — true when auth.uid() wrote the
--     experience, is the person it is about, or manages the organization on
--     either side (subject_organization_id / author_organization_id, through
--     the existing manages_organization). Internal: EXECUTE revoked from
--     public, anon and authenticated; only the five functions below call it.
--   * start_experience_moderation, decide_experience_moderation,
--     review_experience_dispute, resolve_experience_dispute,
--     moderate_experience_response — bodies copied from 20260802120000 with
--     ONE added block right after the unchanged is_admin() check: a party is
--     refused with code 'conflict_of_interest' and the refusal is written to
--     the audit trail (action 'moderator_conflict_refused'). For a reply, its
--     own author is a party too.
--   * resolve_experience_dispute no longer accepts 'changed' (answers
--     'invalid_resolution'): nothing changes the text. The column's CHECK is
--     NOT narrowed, so an existing 'resolved_changed' row stays valid.
--   * Signatures, return shapes and every other line are unchanged. The
--     grants are restated at the end exactly as they were (authenticated
--     only); nobody gains or loses EXECUTE on the five.
--
-- WHAT IT DOES NOT DO: it does not change who is an administrator, any RLS
-- policy, submit_experience_record, submit_experience_response,
-- open_experience_dispute or get_experience_counts.
--
-- Strictly NARROWING for moderators: it can only refuse a step that was
-- allowed. With ONE administrator account, a record that administrator is a
-- party to cannot be moderated or decided until a second administrator exists.
--
-- Rollback: supabase/rollbacks/20261114070000_experience_moderation_conflict_v1.down.sql
-- (restores the five 20260802120000 bodies byte for byte, drops the helper).
-- Apply via Supabase MCP apply_migration only.

begin;

create or replace function public.experience_moderator_is_party(p_record_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.experience_records r
     where r.id = p_record_id
       and (r.author_profile_id = auth.uid()
            or r.subject_profile_id = auth.uid()
            or (r.subject_organization_id is not null
                and public.manages_organization(r.subject_organization_id))
            or (r.author_organization_id is not null
                and public.manages_organization(r.author_organization_id)))
  );
$$;
revoke all on function public.experience_moderator_is_party(uuid) from public, anon, authenticated;

create or replace function public.start_experience_moderation(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'not_authorized'); end if;
  -- A party to the record does not moderate or decide it (owner rule
  -- 2026-11-13). Refused here, below every client, and left in the audit trail.
  if public.experience_moderator_is_party(p_id) then
    perform public.experience_audit('experience_record', p_id, 'moderator_conflict_refused', null, null, null);
    return jsonb_build_object('ok', false, 'code', 'conflict_of_interest');
  end if;
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
  -- A party to the record does not moderate or decide it (owner rule
  -- 2026-11-13). Refused here, below every client, and left in the audit trail.
  if public.experience_moderator_is_party(p_id) then
    perform public.experience_audit('experience_record', p_id, 'moderator_conflict_refused', null, null, null);
    return jsonb_build_object('ok', false, 'code', 'conflict_of_interest');
  end if;
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
  -- A party to the record does not moderate or decide it (owner rule
  -- 2026-11-13). Refused here, below every client, and left in the audit trail.
  if exists (
       select 1 from public.experience_responses x
        where x.id = p_id
          and (x.author_profile_id = auth.uid()
               or public.experience_moderator_is_party(x.experience_record_id))) then
    perform public.experience_audit('experience_response', p_id, 'moderator_conflict_refused', null, null, null);
    return jsonb_build_object('ok', false, 'code', 'conflict_of_interest');
  end if;
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
  -- A party to the record does not moderate or decide it (owner rule
  -- 2026-11-13). Refused here, below every client, and left in the audit trail.
  if public.experience_moderator_is_party(p_id) then
    perform public.experience_audit('experience_record', p_id, 'moderator_conflict_refused', null, null, null);
    return jsonb_build_object('ok', false, 'code', 'conflict_of_interest');
  end if;
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
  -- A party to the record does not moderate or decide it (owner rule
  -- 2026-11-13). Refused here, below every client, and left in the audit trail.
  if public.experience_moderator_is_party(p_id) then
    perform public.experience_audit('experience_record', p_id, 'moderator_conflict_refused', null, null, null);
    return jsonb_build_object('ok', false, 'code', 'conflict_of_interest');
  end if;
  -- 'changed' is refused: nothing changes the text, so it must not be
  -- recordable as if a correction had been made (owner rule 2026-11-13).
  if p_resolution not in ('upheld','removed') then
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

-- Grants restated, not changed: exactly the ACL 20260802120000 gave these five
-- (authenticated only). Written out so a fresh replay can never leave a
-- SECURITY DEFINER function on a default EXECUTE grant.
revoke execute on function public.start_experience_moderation(uuid) from public, anon;
revoke execute on function public.decide_experience_moderation(uuid, text, text) from public, anon;
revoke execute on function public.moderate_experience_response(uuid, text, text) from public, anon;
revoke execute on function public.review_experience_dispute(uuid) from public, anon;
revoke execute on function public.resolve_experience_dispute(uuid, text, text) from public, anon;
grant execute on function public.start_experience_moderation(uuid) to authenticated;
grant execute on function public.decide_experience_moderation(uuid, text, text) to authenticated;
grant execute on function public.moderate_experience_response(uuid, text, text) to authenticated;
grant execute on function public.review_experience_dispute(uuid) to authenticated;
grant execute on function public.resolve_experience_dispute(uuid, text, text) to authenticated;

commit;
