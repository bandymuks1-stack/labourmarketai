-- ROLLBACK for 20261019180000_worker_language_uk_rpc_v1.sql
-- Restores the 11-language validation. Refuses while any worker has stated
-- Ukrainian (their rows would become unsavable again).

begin;

do $$
begin
  if exists (select 1 from public.worker_languages where lang = 'uk') then
    raise exception 'rollback refused: % worker language row(s) are uk', (select count(*) from public.worker_languages where lang = 'uk');
  end if;
end $$;

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
       ('en','lt','lv','et','nl','de','da','no','sv','pl','ru') then
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
