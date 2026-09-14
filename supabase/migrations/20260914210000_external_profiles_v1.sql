-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY. PREPARED FOR REVIEW ONLY.
--
-- Owner decision round 2026-09-14, item 4e:
--   "REJECT AS WRITTEN. DO NOT APPLY. APPROVED only to PREPARE the proposed
--    PER-11 split for review: isolate worker_external_profiles plus only the
--    RPCs/dependencies genuinely required by its existing live consumer."
--
-- NO `@human-gate-approved` annotation is present, deliberately. The owner
-- approved PREPARING this file, not applying it. Adding the annotation would
-- assert an apply approval that does not exist.
--
-- Rollback: supabase/rollbacks/20260914210000_external_profiles_v1.down.sql
-- ============================================================================
--
-- PER-11 split — the one third of `20260713210000_multi_source_talent_v1`
-- that a live surface actually needs.
--
-- WHY A SPLIT. The parent migration is 601 lines: 3 tables, 8 SECURITY DEFINER
-- RPCs, 9 grants and an immutability trigger. Exactly ONE of its three tables
-- has a runtime consumer. Applying all three to serve one is the unused-surface
-- growth the 2026-09-07 reconciliation exists to stop, so the owner rejected the
-- parent as written and approved preparing this.
--
-- WHAT THE LIVE CONSUMER ACTUALLY NEEDS — measured from the code, not assumed:
--   * `lib/worker/external-profiles.ts` — reads `worker_external_profiles`
--     (owner-scoped) and is rendered by `components/app/external-profiles-section.tsx`
--     on `/dashboard/profile`. Today it reports `needs-migration` on 42P01.
--   * `lib/worker/external-profiles-actions.ts` — calls exactly TWO RPCs:
--         save_worker_external_profile_v1   (line 87)
--         disconnect_external_profile_v1    (line 158)
--
-- WHAT IS DELIBERATELY LEFT BEHIND, and why each is not needed:
--   * `talent_source_records` (P5 provenance) — ZERO runtime consumers; guard
--     tests only.
--   * `identity_resolution_events` (P7 audit) — ZERO runtime consumers, and its
--     select policy is `is_admin()` only: an admin-only audit table with
--     nothing writing to it.
--   * `set_external_profile_visibility_v1` — no caller. The `visibility` column
--     ships (the model parses it and the table's CHECK needs it) but the only
--     writer of it here is the disconnect path forcing 'private'. A worker
--     cannot yet change it, which is honest: there is no employer read to
--     change it FOR.
--   * `review_external_profile_snapshot_v1` — no caller.
--   * `record_talent_source_v1`, `record_identity_resolution_event_v1` — belong
--     to the two tables above.
--   * the `identity_resolution_events` immutability trigger — belongs to that
--     table.
-- They remain recorded architecture in the parent file, which stays in the tree.
--
-- NO ALREADY-EXISTING EQUIVALENT — checked against production 2026-09-14 rather
-- than assumed. Every `public` column whose name matches
-- external|portfolio|social|profile_url|website|url|link, and every table whose
-- name matches external|source|identity, was listed and reviewed. The closest
-- candidates and why none fits:
--   * `companies.website`, `organizations.website` — an ORGANIZATION's site,
--     not a person's profile link;
--   * `profiles.avatar_url` — an image, not a profile;
--   * `organization_people.external_ref` / `link_*` — an ORGANIZATION's
--     reference to a person it imported; org-owned, not the worker's own, and
--     governed by the evidence-import authority;
--   * `public_vacancies.external_id` / `employer_external_org_id` — vacancy
--     provenance from a feed;
--   * `market_intelligence_sources.*` — the market-data source registry.
-- Nothing in the schema holds a WORKER's own external profile links.
--
-- MIGRATION LINEAGE. This file and the parent BOTH create
-- `worker_external_profiles`, so they must never both be applied. Every
-- statement here is `if not exists` / `create or replace` / `drop policy if
-- exists`, so applying this first makes the parent's corresponding statements
-- no-ops rather than errors — but the parent would still bring the two unused
-- tables, which is the thing being avoided. If this is applied, the parent must
-- be recorded in `docs/APPLIED_LEDGER.md` as superseded-in-part and never
-- applied, in the same way the never-apply section records the other three.
--
-- AUTHORITY / RLS / DATA MODEL — unchanged from the parent, copied verbatim:
--   * SELECT: `owns_worker(worker_id) or is_admin()` — the worker's own rows
--     and nothing else. There is NO employer read path in v1, and the
--     'employers' visibility value is a stored preference with no policy
--     honouring it. That is an explicit v2 gate, not an oversight.
--   * No INSERT/UPDATE/DELETE policy and no write grant — writes are RPC-only.
--   * Both RPCs are SECURITY DEFINER with `search_path = public`, resolve the
--     caller's own `workers` row from `auth.uid()`, REVOKE from public and anon,
--     and grant EXECUTE to `authenticated` only.
--   * Bounds carried over: https:// only, url 12–500 chars, closed platform
--     set, snapshot <= 64 KiB, 20 profiles per worker, disconnect is SOFT
--     (provenance preserved, the row is never deleted).
--   * No automatic import: nothing here fetches any external host. A snapshot
--     can only arrive from a file the worker uploaded.
--
-- PRODUCTION STATE 2026-09-14: `worker_external_profiles`, `talent_source_records`
-- and `identity_resolution_events` are all absent. Applying this creates ONE
-- table and affects ZERO existing rows.

create table if not exists public.worker_external_profiles (
  id                   uuid primary key default gen_random_uuid(),
  worker_id            uuid not null references public.workers(id) on delete cascade,
  platform             text not null check (platform in
                         ('linkedin','github','behance','portfolio',
                          'certification_registry','other')),
  url                  text not null check (
                         char_length(url) between 12 and 500
                         and url like 'https://%'),
  visibility           text not null default 'private'
                         check (visibility in ('private','employers')),
  import_status        text not null default 'none'
                         check (import_status in ('none','file_imported','pending_review')),
  imported_snapshot    jsonb check (imported_snapshot is null
                         or pg_column_size(imported_snapshot) <= 65536),
  snapshot_reviewed_at timestamptz,
  connected_at         timestamptz not null default now(),
  disconnected_at      timestamptz,
  updated_at           timestamptz not null default now()
);

create index if not exists worker_external_profiles_worker_idx
  on public.worker_external_profiles (worker_id);

alter table public.worker_external_profiles enable row level security;

drop policy if exists worker_external_profiles_select on public.worker_external_profiles;
create policy worker_external_profiles_select
  on public.worker_external_profiles for select
  using (public.owns_worker(worker_id) or public.is_admin());

-- No insert/update/delete policies — writes are RPC-only.

create or replace function public.save_worker_external_profile_v1(
  p_platform   text,
  p_url        text,
  p_profile_id uuid default null,
  p_snapshot   jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  w_id   uuid;
  v_url  text := nullif(btrim(coalesce(p_url, '')), '');
  v_count int;
  row_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_platform is null or p_platform not in
       ('linkedin','github','behance','portfolio','certification_registry','other') then
    raise exception 'Invalid platform' using errcode = '22023';
  end if;
  if v_url is null or char_length(v_url) < 12 or char_length(v_url) > 500
     or v_url not like 'https://%' then
    raise exception 'Invalid url (https:// required)' using errcode = '22023';
  end if;
  if p_snapshot is not null and pg_column_size(p_snapshot) > 65536 then
    raise exception 'Snapshot too large' using errcode = '22023';
  end if;

  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  if p_profile_id is not null then
    update public.worker_external_profiles set
      platform        = p_platform,
      url             = v_url,
      imported_snapshot = coalesce(p_snapshot, imported_snapshot),
      import_status   = case when p_snapshot is not null then 'pending_review'
                             else import_status end,
      updated_at      = now()
    where id = p_profile_id
      and worker_id = w_id
      and disconnected_at is null
    returning id into row_id;
    if row_id is null then
      raise exception 'External profile not found' using errcode = 'P0002';
    end if;
    return row_id;
  end if;

  select count(*) into v_count
  from public.worker_external_profiles
  where worker_id = w_id;
  if v_count >= 20 then
    raise exception 'External profile cap reached' using errcode = 'P0001';
  end if;

  insert into public.worker_external_profiles
    (worker_id, platform, url, imported_snapshot, import_status)
  values
    (w_id, p_platform, v_url, p_snapshot,
     case when p_snapshot is not null then 'pending_review' else 'none' end)
  returning id into row_id;
  return row_id;
end;
$$;

create or replace function public.disconnect_external_profile_v1(
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.worker_external_profiles ep
     set disconnected_at = coalesce(ep.disconnected_at, now()),
         visibility      = 'private',
         updated_at      = now()
   from public.workers w
   where ep.id = p_profile_id
     and ep.worker_id = w.id
     and w.profile_id = uid;
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

grant select on public.worker_external_profiles to authenticated;

revoke all on function public.save_worker_external_profile_v1(text, text, uuid, jsonb) from public;
revoke all on function public.save_worker_external_profile_v1(text, text, uuid, jsonb) from anon;
grant execute on function public.save_worker_external_profile_v1(text, text, uuid, jsonb) to authenticated;

revoke all on function public.disconnect_external_profile_v1(uuid) from public;
revoke all on function public.disconnect_external_profile_v1(uuid) from anon;
grant execute on function public.disconnect_external_profile_v1(uuid) to authenticated;
