-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner + Chat Claude review.
-- Never `db push`.
--
-- Pre-payment readiness sprint (PR2) — Worker document VERIFICATION dimension
-- + Finland (FI) document support + extended document-type registry.
--
-- Extends the live 20260610170000 worker-documents model WITHOUT touching its
-- existing status CHECK (missing/ready/blocked). Adds a SEPARATE, additive
-- verification axis so a document can be "ready" (worker says it exists) yet
-- still "pending"/"verified"/"rejected" by an admin. No FAKE verification:
-- `verified` is set ONLY by an admin RPC that stamps verified_by + verified_at
-- and writes an append-only event (§7).
--
-- Also widens the country allowlist to include FI (drop + re-add CHECK — the
-- GREEN widening idiom) and registers more real document types.
-- ============================================================================

-- @human-gate-approved
begin;

-- 1. Additive verification axis on worker_documents ─────────────────────────
alter table public.worker_documents
  add column if not exists verification text not null default 'unverified'
    check (verification in ('unverified','pending','verified','rejected')),
  add column if not exists verified_by  uuid references public.profiles(id),
  add column if not exists verified_at  timestamptz,
  add column if not exists reviewer_note text
    check (reviewer_note is null or char_length(reviewer_note) <= 2000);

-- 2. Extended document-type registry (real cross-border work documents) ─────
insert into public.document_types (slug, category) values
  ('work_permit', 'posting'),
  ('residence_permit', 'identity'),
  ('tax_registration', 'posting'),
  ('social_security_registration', 'posting'),
  ('posting_notification', 'posting'),
  ('health_safety_card', 'qualification')
on conflict (slug) do nothing;

-- 3. Add Finland to the countries master list ───────────────────────────────
insert into public.countries (code, name_lt, name_en, is_target_market) values
  ('FI', 'Suomija', 'Finland', true)
on conflict (code) do nothing;

-- 4. Widen the country_document_requirements allowlist to include FI ─────────
--    (drop + re-add CHECK = GREEN widening idiom; table ships empty so no row
--     can violate the wider set.)
alter table public.country_document_requirements
  drop constraint if exists country_document_requirements_country_check;
alter table public.country_document_requirements
  add constraint country_document_requirements_country_check
  check (country in ('LT','LV','EE','NL','DE','DK','NO','SE','PL','BE','FI'));

-- 5. Replace upsert_worker_document to allow FI (status axis unchanged) ──────
create or replace function public.upsert_worker_document(
  p_document_type_slug text,
  p_country            text,
  p_status             text,
  p_valid_from         text,
  p_valid_until        text,
  p_note               text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  w_id     uuid;
  v_country char(2) := nullif(trim(coalesce(p_country, '')), '');
  v_status text := coalesce(nullif(p_status, ''), 'missing');
  v_from   date := nullif(p_valid_from, '')::date;
  v_until  date := nullif(p_valid_until, '')::date;
  existing public.worker_documents%rowtype;
  row_id   uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_status not in ('missing','ready','blocked') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  if v_country is not null and v_country not in
       ('LT','LV','EE','NL','DE','DK','NO','SE','PL','BE','FI') then
    raise exception 'Invalid country' using errcode = '22023';
  end if;
  if not exists (select 1 from public.document_types dt
                  where dt.slug = p_document_type_slug and dt.is_active) then
    raise exception 'Unknown document type' using errcode = '22023';
  end if;

  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    if public.is_admin() then
      raise exception 'Admin maintenance path arrives with the review UI slice'
        using errcode = '42501';
    end if;
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  select * into existing from public.worker_documents wd
   where wd.worker_id = w_id
     and wd.document_type_slug = p_document_type_slug
     and coalesce(wd.country, '') = coalesce(v_country, '');

  insert into public.worker_documents
      (worker_id, document_type_slug, country, status,
       valid_from, valid_until, note, updated_by, updated_at)
    values (w_id, p_document_type_slug, v_country, v_status,
            v_from, v_until, nullif(p_note, ''), uid, now())
  on conflict (worker_id, document_type_slug, coalesce(country, ''))
  do update
    set status = excluded.status, valid_from = excluded.valid_from,
        valid_until = excluded.valid_until, note = excluded.note,
        updated_by = excluded.updated_by, updated_at = now()
  returning id into row_id;

  insert into public.worker_document_events
      (worker_document_id, actor_id, event_type, before_state, after_state)
    values (
      row_id,
      uid,
      case when existing.id is null then 'created'
           when existing.status is distinct from v_status then 'status_changed'
           else 'updated' end,
      case when existing.id is null then null
           else jsonb_build_object('status', existing.status,
                  'valid_from', existing.valid_from,
                  'valid_until', existing.valid_until) end,
      jsonb_build_object('status', v_status,
        'valid_from', v_from, 'valid_until', v_until)
    );

  return row_id;
end;
$$;
revoke all on function public.upsert_worker_document(text, text, text, text, text, text) from public;
grant execute on function public.upsert_worker_document(text, text, text, text, text, text) to authenticated;

-- 6. Worker requests verification of their own document (→ 'pending') ────────
create or replace function public.request_worker_document_verification(
  p_document_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  wd  public.worker_documents%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into wd from public.worker_documents where id = p_document_id;
  if wd.id is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.workers w
                  where w.id = wd.worker_id and w.profile_id = uid) then
    raise exception 'Not your document' using errcode = '42501';
  end if;
  if wd.status <> 'ready' then
    raise exception 'Only a ready document can be sent for verification'
      using errcode = '22023';
  end if;

  update public.worker_documents
     set verification = 'pending', verified_by = null, verified_at = null,
         updated_by = uid, updated_at = now()
   where id = wd.id;

  insert into public.worker_document_events
      (worker_document_id, actor_id, event_type, before_state, after_state)
    values (wd.id, uid, 'updated',
            jsonb_build_object('verification', wd.verification),
            jsonb_build_object('verification', 'pending'));

  return 'pending';
end;
$$;
revoke all on function public.request_worker_document_verification(uuid) from public;
grant execute on function public.request_worker_document_verification(uuid) to authenticated;

-- 7. Admin verifies / rejects a document (the ONLY path to 'verified') ───────
create or replace function public.admin_set_worker_document_verification(
  p_document_id uuid,
  p_decision    text,
  p_note        text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  wd  public.worker_documents%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_decision not in ('verified','rejected','pending','unverified') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  select * into wd from public.worker_documents where id = p_document_id;
  if wd.id is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  update public.worker_documents
     set verification = p_decision,
         verified_by = case when p_decision in ('verified','rejected') then uid else null end,
         verified_at = case when p_decision in ('verified','rejected') then now() else null end,
         reviewer_note = nullif(trim(coalesce(p_note,'')), ''),
         updated_by = uid, updated_at = now()
   where id = wd.id;

  insert into public.worker_document_events
      (worker_document_id, actor_id, event_type, before_state, after_state)
    values (wd.id, uid, 'status_changed',
            jsonb_build_object('verification', wd.verification),
            jsonb_build_object('verification', p_decision));

  return p_decision;
end;
$$;
revoke all on function public.admin_set_worker_document_verification(uuid, text, text) from public;
grant execute on function public.admin_set_worker_document_verification(uuid, text, text) to authenticated;

commit;

-- ROLLBACK: see supabase/rollbacks/20260613100200_worker_document_verification.down.sql
