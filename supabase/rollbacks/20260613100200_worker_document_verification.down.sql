-- DOWN / rollback for 20260613100200_worker_document_verification.sql
--
-- Reverses the verification axis + FI support. Guarded where a narrowing could
-- lose data. Apply via Supabase MCP apply_migration, never `db push`.
-- Note: extra document_types rows and the FI countries row are reference data
-- left in place (harmless, referenced by nothing destructive); remove by hand
-- only if certain no worker_documents reference them.

begin;

-- Refuse to narrow the country CHECK back if any FI requirement rows exist.
do $$
begin
  if exists (select 1 from public.country_document_requirements where country = 'FI') then
    raise exception 'country_document_requirements has FI rows — handle before narrowing CHECK';
  end if;
end $$;

drop function if exists public.admin_set_worker_document_verification(uuid, text, text);
drop function if exists public.request_worker_document_verification(uuid);

-- Restore the pre-FI upsert_worker_document (10-country allowlist).
create or replace function public.upsert_worker_document(
  p_document_type_slug text, p_country text, p_status text,
  p_valid_from text, p_valid_until text, p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); w_id uuid;
  v_country char(2) := nullif(trim(coalesce(p_country, '')), '');
  v_status text := coalesce(nullif(p_status, ''), 'missing');
  v_from date := nullif(p_valid_from, '')::date;
  v_until date := nullif(p_valid_until, '')::date;
  existing public.worker_documents%rowtype; row_id uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_status not in ('missing','ready','blocked') then raise exception 'Invalid status' using errcode = '22023'; end if;
  if v_country is not null and v_country not in ('LT','LV','EE','NL','DE','DK','NO','SE','PL','BE') then
    raise exception 'Invalid country' using errcode = '22023'; end if;
  if not exists (select 1 from public.document_types dt where dt.slug = p_document_type_slug and dt.is_active) then
    raise exception 'Unknown document type' using errcode = '22023'; end if;
  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    if public.is_admin() then raise exception 'Admin maintenance path arrives with the review UI slice' using errcode = '42501'; end if;
    raise exception 'No worker profile' using errcode = 'P0002'; end if;
  select * into existing from public.worker_documents wd
   where wd.worker_id = w_id and wd.document_type_slug = p_document_type_slug
     and coalesce(wd.country, '') = coalesce(v_country, '');
  insert into public.worker_documents
      (worker_id, document_type_slug, country, status, valid_from, valid_until, note, updated_by, updated_at)
    values (w_id, p_document_type_slug, v_country, v_status, v_from, v_until, nullif(p_note, ''), uid, now())
  on conflict (worker_id, document_type_slug, coalesce(country, ''))
  do update set status = excluded.status, valid_from = excluded.valid_from,
        valid_until = excluded.valid_until, note = excluded.note,
        updated_by = excluded.updated_by, updated_at = now()
  returning id into row_id;
  insert into public.worker_document_events (worker_document_id, actor_id, event_type, before_state, after_state)
    values (row_id, uid,
      case when existing.id is null then 'created'
           when existing.status is distinct from v_status then 'status_changed' else 'updated' end,
      case when existing.id is null then null
           else jsonb_build_object('status', existing.status, 'valid_from', existing.valid_from, 'valid_until', existing.valid_until) end,
      jsonb_build_object('status', v_status, 'valid_from', v_from, 'valid_until', v_until));
  return row_id;
end; $$;
revoke all on function public.upsert_worker_document(text, text, text, text, text, text) from public;
grant execute on function public.upsert_worker_document(text, text, text, text, text, text) to authenticated;

alter table public.country_document_requirements
  drop constraint if exists country_document_requirements_country_check;
alter table public.country_document_requirements
  add constraint country_document_requirements_country_check
  check (country in ('LT','LV','EE','NL','DE','DK','NO','SE','PL','BE'));

alter table public.worker_documents
  drop column if exists reviewer_note,
  drop column if exists verified_at,
  drop column if exists verified_by,
  drop column if exists verification;

commit;
