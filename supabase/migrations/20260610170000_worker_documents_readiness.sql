-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner + Chat Claude
-- review (S3 / feat/cc/s3-documents-readiness). Never `db push`.
--
-- Worker documents + country requirements + append-only audit (design:
-- docs/product/documents-readiness-design.md). WORKER-axis inventory that
-- COMPLEMENTS the existing PROJECT-axis checklist
-- (project_worker_readiness_items, 20260609180000) — an extension of the
-- canon, not a parallel: different axes, the project side stays untouched.
--
-- Honesty invariants baked in:
--   * status stores only missing/ready/blocked — "expiring" is DERIVED from
--     valid_until in the app layer (doctrine §6: never store derivable data);
--   * country_document_requirements ships EMPTY — no invented legal facts;
--     every future row carries source_status (default needs_legal_source);
--   * nothing here is a legal-compliance verification — manager/owner input
--     plus date arithmetic only.
-- Write path: SECURITY DEFINER RPC only (search_path pinned, direct writes
-- revoked) — mirrors the 20260608140000/20260609180000 hardening standard.
-- ============================================================================

begin;

-- 1. Document type registry (§10 slug registry; labels via slug→JSON) ───────
create table if not exists public.document_types (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  category    text not null default 'qualification'
                check (category in ('identity','qualification','posting')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into public.document_types (slug, category) values
  ('cv', 'qualification'),
  ('id_document', 'identity'),
  ('a1_certificate', 'posting'),
  ('employment_contract', 'posting'),
  ('posted_worker_package', 'posting'),
  ('professional_certificate', 'qualification')
on conflict (slug) do nothing;

-- 2. Worker document inventory (worker axis; default-closed §4) ─────────────
create table if not exists public.worker_documents (
  id                  uuid primary key default gen_random_uuid(),
  worker_id           uuid not null references public.workers(id) on delete cascade,
  document_type_slug  text not null references public.document_types(slug),
  country             char(2),
  status              text not null default 'missing'
                        check (status in ('missing','ready','blocked')),
  valid_from          date,
  valid_until         date,
  file_path           text,
  note                text,
  updated_by          uuid not null references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists worker_documents_unique_idx
  on public.worker_documents (worker_id, document_type_slug, coalesce(country, ''));
create index if not exists worker_documents_worker_idx
  on public.worker_documents (worker_id);

-- 3. Append-only audit (§3) ─────────────────────────────────────────────────
create table if not exists public.worker_document_events (
  id                  uuid primary key default gen_random_uuid(),
  worker_document_id  uuid not null references public.worker_documents(id) on delete cascade,
  actor_id            uuid not null references public.profiles(id),
  event_type          text not null
                        check (event_type in ('created','updated','status_changed')),
  before_state        jsonb,
  after_state         jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists worker_document_events_doc_idx
  on public.worker_document_events (worker_document_id, created_at);

-- 4. Country requirements STRUCTURE (content curated later, never invented) ─
create table if not exists public.country_document_requirements (
  id                  uuid primary key default gen_random_uuid(),
  country             char(2) not null
                        check (country in ('LT','LV','EE','NL','DE','DK','NO','SE','PL','BE')),
  document_type_slug  text not null references public.document_types(slug),
  requirement_level   text not null default 'required'
                        check (requirement_level in ('required','recommended','conditional')),
  condition_note      text,
  source_status       text not null default 'needs_legal_source'
                        check (source_status in ('needs_legal_source','sourced','reviewed')),
  source_url          text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (country, document_type_slug, requirement_level)
);

-- 5. RLS ────────────────────────────────────────────────────────────────────
alter table public.document_types enable row level security;
alter table public.worker_documents enable row level security;
alter table public.worker_document_events enable row level security;
alter table public.country_document_requirements enable row level security;

drop policy if exists document_types_select on public.document_types;
create policy document_types_select on public.document_types
  for select to authenticated using (is_active);
drop policy if exists document_types_write on public.document_types;
create policy document_types_write on public.document_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Default-closed: the worker (owner) + admin. Employers/agencies see nothing
-- here — marketplace visibility arrives via S4 rules, never a broad grant.
drop policy if exists worker_documents_select on public.worker_documents;
create policy worker_documents_select on public.worker_documents
  for select to authenticated
  using (
    exists (select 1 from public.workers w
             where w.id = worker_id and w.profile_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists worker_document_events_select on public.worker_document_events;
create policy worker_document_events_select on public.worker_document_events
  for select to authenticated
  using (
    exists (select 1 from public.worker_documents wd
              join public.workers w on w.id = wd.worker_id
             where wd.id = worker_document_id and w.profile_id = auth.uid())
    or public.is_admin()
  );
-- Append-only: NO update/delete policy on events, ever.

drop policy if exists country_document_requirements_select on public.country_document_requirements;
create policy country_document_requirements_select on public.country_document_requirements
  for select to authenticated using (is_active);
drop policy if exists country_document_requirements_write on public.country_document_requirements;
create policy country_document_requirements_write on public.country_document_requirements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 6. Gated write RPC (the ONLY write path for worker_documents) ─────────────
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
       ('LT','LV','EE','NL','DE','DK','NO','SE','PL','BE') then
    raise exception 'Invalid country' using errcode = '22023';
  end if;
  if not exists (select 1 from public.document_types dt
                  where dt.slug = p_document_type_slug and dt.is_active) then
    raise exception 'Unknown document type' using errcode = '22023';
  end if;

  -- Owner-scoped: the caller's OWN worker row (admin may also maintain).
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

-- 7. Grants — SELECT only; writes RPC-only ──────────────────────────────────
grant select on public.document_types to authenticated;
grant select on public.worker_documents to authenticated;
grant select on public.worker_document_events to authenticated;
grant select on public.country_document_requirements to authenticated;
revoke insert, update, delete on public.worker_documents from authenticated;
revoke insert, update, delete on public.worker_document_events from authenticated;

commit;

-- ROLLBACK (reverse SQL — new objects only; reversible):
-- drop function if exists public.upsert_worker_document(text, text, text, text, text, text);
-- drop table if exists public.country_document_requirements;
-- drop table if exists public.worker_document_events;
-- drop table if exists public.worker_documents;
-- drop table if exists public.document_types;
