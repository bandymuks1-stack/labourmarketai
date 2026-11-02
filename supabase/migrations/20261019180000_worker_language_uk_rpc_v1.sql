-- @human-gate-approved (acknowledgement: RED by SECURITY DEFINER replace; forward fix of 20261019170000)
--
-- 20261019180000 — the language save RPC accepts Ukrainian too.
--
-- 20261019170000 widened the worker_languages CHECK and the demand projection to
-- 'uk', but every worker write goes through save_worker_language_v1, whose own
-- validation still listed the original 11 languages — a worker choosing
-- Ukrainian would get "Invalid language". This re-issues the function with 'uk'
-- added to that one list; the body is otherwise identical to production
-- (md5 dca3293bc6887a5510941ffdf19ca1e6 before this change). Grants are kept by
-- CREATE OR REPLACE.
-- Rollback: supabase/rollbacks/20261019180000_worker_language_uk_rpc_v1.down.sql

begin;

CREATE OR REPLACE FUNCTION public.save_worker_language_v1(p_lang text, p_level text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid  uuid := auth.uid();
  w_id uuid;
  row_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_lang is null or p_lang not in
       ('en','lt','lv','et','nl','de','da','no','sv','pl','ru','uk') then
    raise exception 'Invalid language' using errcode = '22023';
  end if;
  if p_level is null or p_level not in
       ('A1','A2','B1','B2','C1','C2','native') then
    raise exception 'Invalid level' using errcode = '22023';
  end if;

  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  insert into public.worker_languages as wl (worker_id, lang, level)
  values (w_id, p_lang, p_level)
  on conflict (worker_id, lang)
  do update set level = excluded.level, updated_at = now()
  returning wl.id into row_id;

  return row_id;
end;
$function$;

revoke all on function public.save_worker_language_v1(text, text) from public, anon;
grant execute on function public.save_worker_language_v1(text, text) to authenticated;

commit;
