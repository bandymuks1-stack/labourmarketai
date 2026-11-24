-- 0028 — Customer/Buyer demand request foundation (Stage 2).
--
-- Real buyer demand path. The buyer (customer) creates a structured
-- request describing what they need (title + role + team_size + start
-- period + duration + language + country + notes). The request lives
-- in `public.customer_requests`, is RLS-gated to the owning profile +
-- admin, and is reviewed manually by the operator. No auto-matching,
-- no fake candidate suggestions, no open marketplace surface.
--
-- Distinct from `public.pilot_drafts.buyer_request` (which is a
-- generic free-form draft used by the pre-Stage-2 buyer dashboard).
-- That table stays as-is; this migration adds the structured table
-- that the new request form posts to.
--
-- Status enum: draft | submitted | in_review | needs_followup |
--              approved | closed.
--
-- RPC:
--   public.save_customer_request(...) → uuid — idempotent upsert by
--   (profile_id, id). When p_request_id is null, inserts a new row
--   in 'draft' status. When p_request_id matches an existing row
--   owned by the caller, updates the columns; status can be promoted
--   from 'draft' → 'submitted' by the same caller, never demoted.
--
-- Manual-review only:
--   - No background worker, no candidate suggestion logic.
--   - The operator sees the request via admin RLS bypass on
--     /dashboard/admin/project-truth.
--   - status='submitted' triggers no external send; it is a flag the
--     operator reads.
--
-- Application status:
--   File ships in this PR. Application to prod is OWNER-GATED per
--   the goal rule. UI degrades gracefully via 42P01 + 42883 detection
--   until applied.

-- ── 1. Table ─────────────────────────────────────────────────────────
create table if not exists public.customer_requests (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid not null references public.profiles(id) on delete cascade,
  customer_id           uuid references public.customers(id) on delete set null,
  title                 text not null check (char_length(title) between 1 and 200),
  need_summary          text,
  country               text,
  location              text,
  role_or_work_type     text,
  team_size             integer check (team_size is null or team_size > 0),
  start_period          text,
  duration              text,
  language_requirement  text,
  notes                 text,
  status                text not null default 'draft'
                          check (status in (
                            'draft','submitted','in_review',
                            'needs_followup','approved','closed'
                          )),
  manual_review_note    text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists customer_requests_profile_idx
  on public.customer_requests (profile_id, created_at desc);

-- ── 2. RLS ───────────────────────────────────────────────────────────
alter table public.customer_requests enable row level security;

drop policy if exists customer_requests_select on public.customer_requests;
create policy customer_requests_select on public.customer_requests for select
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists customer_requests_insert on public.customer_requests;
create policy customer_requests_insert on public.customer_requests for insert
  with check (public.is_admin());
-- INSERT routes through the RPC only; reduces footgun risk.

drop policy if exists customer_requests_update on public.customer_requests;
create policy customer_requests_update on public.customer_requests for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists customer_requests_delete on public.customer_requests;
create policy customer_requests_delete on public.customer_requests for delete
  using (public.is_admin());

-- ── 3. Grants ────────────────────────────────────────────────────────
grant select, update on public.customer_requests to authenticated;
-- INSERT through RPC; DELETE admin only.

-- ── 4. RPC ───────────────────────────────────────────────────────────
create or replace function public.save_customer_request(
  p_request_id           uuid,
  p_title                text,
  p_need_summary         text default null,
  p_country              text default null,
  p_location             text default null,
  p_role_or_work_type    text default null,
  p_team_size            integer default null,
  p_start_period         text default null,
  p_duration             text default null,
  p_language_requirement text default null,
  p_notes                text default null,
  p_status               text default 'draft'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid              uuid := auth.uid();
  resolved_id      uuid;
  cleaned_title    text := nullif(trim(coalesce(p_title, '')), '');
  cleaned_status   text := lower(trim(coalesce(p_status, 'draft')));
  customer_uuid    uuid;
  current_status   text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if cleaned_title is null or char_length(cleaned_title) > 200 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;
  if cleaned_status not in ('draft','submitted','in_review','needs_followup','approved','closed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  -- Owner cannot self-promote to admin-only statuses.
  if cleaned_status in ('in_review','needs_followup','approved','closed') then
    if not public.is_admin() then
      cleaned_status := 'submitted';
    end if;
  end if;

  -- Resolve customer_id (optional FK).
  select id into customer_uuid
    from public.customers
   where profile_id = uid
   limit 1;

  if p_request_id is null then
    insert into public.customer_requests (
      profile_id, customer_id, title, need_summary, country, location,
      role_or_work_type, team_size, start_period, duration,
      language_requirement, notes, status
    ) values (
      uid, customer_uuid, cleaned_title,
      nullif(trim(coalesce(p_need_summary, '')), ''),
      nullif(trim(coalesce(p_country, '')), ''),
      nullif(trim(coalesce(p_location, '')), ''),
      nullif(trim(coalesce(p_role_or_work_type, '')), ''),
      p_team_size,
      nullif(trim(coalesce(p_start_period, '')), ''),
      nullif(trim(coalesce(p_duration, '')), ''),
      nullif(trim(coalesce(p_language_requirement, '')), ''),
      nullif(trim(coalesce(p_notes, '')), ''),
      cleaned_status
    )
    returning id into resolved_id;
    return resolved_id;
  end if;

  -- Update path: must own the row.
  select status into current_status
    from public.customer_requests
   where id = p_request_id and profile_id = uid;
  if current_status is null then
    -- Either does not exist OR not owned by caller — admin can use a
    -- separate admin-only path; this RPC is owner-only updates.
    raise exception 'Request not found or not owned' using errcode = '42501';
  end if;

  -- Never let a non-admin owner demote out of submitted back to draft.
  if not public.is_admin() then
    if current_status = 'submitted' and cleaned_status = 'draft' then
      cleaned_status := 'submitted';
    end if;
  end if;

  update public.customer_requests set
    title                = cleaned_title,
    need_summary         = nullif(trim(coalesce(p_need_summary, '')), ''),
    country              = nullif(trim(coalesce(p_country, '')), ''),
    location             = nullif(trim(coalesce(p_location, '')), ''),
    role_or_work_type    = nullif(trim(coalesce(p_role_or_work_type, '')), ''),
    team_size            = p_team_size,
    start_period         = nullif(trim(coalesce(p_start_period, '')), ''),
    duration             = nullif(trim(coalesce(p_duration, '')), ''),
    language_requirement = nullif(trim(coalesce(p_language_requirement, '')), ''),
    notes                = nullif(trim(coalesce(p_notes, '')), ''),
    status               = cleaned_status,
    updated_at           = now()
   where id = p_request_id
     and (profile_id = uid or public.is_admin())
  returning id into resolved_id;

  return resolved_id;
end $$;

revoke all on function public.save_customer_request(uuid, text, text, text, text, text, integer, text, text, text, text, text) from public;
grant execute on function public.save_customer_request(uuid, text, text, text, text, text, integer, text, text, text, text, text) to authenticated;
