-- @human-gate-approved (acknowledgement: RED by SECURITY DEFINER + GRANT; owner directive 2026-10-19 "pilnai veikiantis darbuotojo kelias")
--
-- 20261019160000 — the person writes their own public professional summary (PER-2).
--
-- workers.headline and workers.bio are the employer-facing summary (readable
-- only by the person and by organisations with a working relationship, through
-- caller_has_worker_relation_v1 since 20261018160000). No role holds UPDATE on
-- workers; every worker write is a narrow owner-scoped RPC (save_worker_card,
-- save_worker_availability_prefs). In production 0 of 119 workers had either
-- field, because no such RPC existed for them. This is that RPC: it writes
-- ONLY these two columns, ONLY on the caller's own row.
--
-- The private narrative stays profiles.profile_text (owner-only, never mirrored);
-- this is the separate text the person writes knowing who sees it.
-- Rollback: supabase/rollbacks/20261019160000_worker_public_summary_v1.down.sql

begin;

create or replace function public.save_worker_public_summary_v1(p_headline text, p_bio text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_headline text := nullif(btrim(coalesce(p_headline, '')), '');
  v_bio text := nullif(btrim(coalesce(p_bio, '')), '');
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if v_headline is not null and char_length(v_headline) > 120 then
    return jsonb_build_object('ok', false, 'error', 'headline_too_long');
  end if;
  if v_bio is not null and char_length(v_bio) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'bio_too_long');
  end if;
  update public.workers
     set headline = v_headline, bio = v_bio, updated_at = now()
   where profile_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_worker_profile');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.save_worker_public_summary_v1(text, text) from public, anon;
grant execute on function public.save_worker_public_summary_v1(text, text) to authenticated;
comment on function public.save_worker_public_summary_v1(text, text) is
  'The caller writes their own employer-facing summary (workers.headline <= 120, workers.bio <= 1000) on their own workers row only. Empty clears.';

commit;
