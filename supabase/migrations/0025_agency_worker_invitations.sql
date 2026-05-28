-- 0025 — Agency-worker invitations (Stage 2 PR 2).
--
-- Adds the invitation channel for the agency → worker link. Self-entry
-- stays open (a worker can sign up at /auth/signup independently and
-- later be linked); this table is the ADDITIONAL channel per
-- docs/policies/onboarding-channels-policy-v1.md.
--
-- Schema:
--   public.agency_worker_invitations (
--     id, agency_id, invited_email, status, inviter_profile_id,
--     note, created_at, accepted_at, expires_at
--   )
-- Status enum: pending | accepted | cancelled | expired.
--
-- RPC (security definer):
--   public.invite_agency_worker(p_agency_id, p_email, p_note) →
--     'invited' | 'already_pending' | 'already_linked' |
--     'not_owner' | 'invalid_email'.
--
-- The RPC's `owns_agency(p_agency_id)` check scopes the action to the
-- agency owner. If the invited email already maps to a profile that is
-- already linked via `agency_workers`, the RPC returns 'already_linked'
-- — no duplicate row is inserted. If a pending invitation already
-- exists for the same (agency_id, invited_email), 'already_pending' is
-- returned.
--
-- RLS:
--   - SELECT: agency owner sees own invitations; invitee sees
--     invitations addressed to their email; admin sees all.
--   - INSERT: only via the RPC (REVOKE direct INSERT from
--     authenticated). The RPC re-validates ownership inside its body.
--   - UPDATE / DELETE: only by agency owner or admin; status flips are
--     additive (no destruction of history).
--
-- Application status:
--   This migration is COMMITTED to repo but NOT yet applied to
--   production. The /dashboard/agency invite form degrades gracefully
--   when the RPC is missing — it shows the literal blocker
--   "Migration 0025_agency_worker_invitations not yet applied". Once
--   the owner runs this migration via Supabase SQL Editor or MCP
--   apply_migration, the form persists invitations end-to-end with no
--   code change.

-- ── 1. Table ─────────────────────────────────────────────────────────
create table if not exists public.agency_worker_invitations (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies(id)
                        on delete cascade,
  invited_email       text not null check (
                        invited_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
                      ),
  status              text not null default 'pending'
                        check (status in ('pending','accepted','cancelled','expired')),
  inviter_profile_id  uuid not null references public.profiles(id),
  note                text,
  created_at          timestamptz not null default now(),
  accepted_at         timestamptz,
  expires_at          timestamptz,
  -- prevent duplicate pending invitations for the same (agency, email)
  unique (agency_id, invited_email)
);

-- ── 2. RLS ───────────────────────────────────────────────────────────
alter table public.agency_worker_invitations enable row level security;

drop policy if exists agency_worker_invitations_select
  on public.agency_worker_invitations;
create policy agency_worker_invitations_select
  on public.agency_worker_invitations for select
  using (
    public.owns_agency(agency_id)
    or invited_email = (select email from public.profiles where id = auth.uid())
    or public.is_admin()
  );

drop policy if exists agency_worker_invitations_update
  on public.agency_worker_invitations;
create policy agency_worker_invitations_update
  on public.agency_worker_invitations for update
  using (public.owns_agency(agency_id) or public.is_admin())
  with check (public.owns_agency(agency_id) or public.is_admin());

-- INSERT goes through the RPC only — revoke direct inserts so
-- authenticated cannot bypass the ownership / dedupe checks.
drop policy if exists agency_worker_invitations_insert
  on public.agency_worker_invitations;
create policy agency_worker_invitations_insert
  on public.agency_worker_invitations for insert
  with check (public.is_admin());

-- ── 3. Grants ────────────────────────────────────────────────────────
grant select, update on public.agency_worker_invitations to authenticated;
-- INSERT/DELETE intentionally not granted; INSERT goes via RPC.

-- ── 4. RPC ───────────────────────────────────────────────────────────
create or replace function public.invite_agency_worker(
  p_agency_id uuid,
  p_email     text,
  p_note      text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid            uuid := auth.uid();
  normalised_em  text := lower(trim(p_email));
  existing_link  uuid;
  existing_inv   uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.owns_agency(p_agency_id) then
    return 'not_owner';
  end if;

  if normalised_em is null
     or not (normalised_em ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') then
    return 'invalid_email';
  end if;

  -- already linked via agency_workers?
  select aw.worker_id into existing_link
  from public.agency_workers aw
  join public.workers w  on w.id = aw.worker_id
  join public.profiles p on p.id = w.profile_id
  where aw.agency_id = p_agency_id
    and lower(p.email) = normalised_em
  limit 1;
  if existing_link is not null then
    return 'already_linked';
  end if;

  -- already pending?
  select id into existing_inv
  from public.agency_worker_invitations
  where agency_id = p_agency_id
    and lower(invited_email) = normalised_em
    and status = 'pending'
  limit 1;
  if existing_inv is not null then
    return 'already_pending';
  end if;

  insert into public.agency_worker_invitations (
    agency_id, invited_email, status, inviter_profile_id, note
  ) values (
    p_agency_id, normalised_em, 'pending', uid, nullif(trim(coalesce(p_note,'')), '')
  )
  on conflict (agency_id, invited_email) do update
    set status = 'pending', inviter_profile_id = excluded.inviter_profile_id, note = excluded.note;

  return 'invited';
end $$;

revoke all on function public.invite_agency_worker(uuid, text, text) from public;
grant execute on function public.invite_agency_worker(uuid, text, text) to authenticated;
