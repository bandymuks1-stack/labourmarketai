-- 0027 — Company-worker relation foundation (Stage 2 follow-up).
--
-- Mirrors the agency shape (migrations 0001 agency_workers + 0025
-- agency_worker_invitations) for the company side. Closes the
-- "Company workers link — waiting on a migration" blocker that
-- /dashboard/company has carried since PR #99.
--
-- Self-entry stays open: a worker can sign up at /auth/signup
-- independently and later be linked. This migration adds the link
-- + invitation tables; it never creates a duplicate auth account
-- and never sends an external email — that step is owner-gated
-- separately (next sprint, only with real people).
--
-- Schema:
--   public.company_workers              — composite (company_id, worker_id)
--   public.company_worker_invitations   — id, company_id, invited_email,
--                                         status, inviter_profile_id, note,
--                                         created_at, accepted_at, expires_at
--
-- Status enum (invitations): pending | accepted | cancelled | expired.
-- Status enum (links):       active  | paused  | removed   — mirrors
--                                                            agency_workers.
--
-- RPC (security definer):
--   public.invite_company_worker(p_company_id, p_email, p_note) →
--     'invited' | 'already_pending' | 'already_linked' |
--     'not_owner' | 'invalid_email'.
--
-- RLS mirrors the agency policies exactly:
--   - SELECT: company owner via owns_company OR invitee (by email
--     match in profiles) OR admin.
--   - INSERT: admin only; the RPC re-validates ownership and
--     performs the write under SECURITY DEFINER.
--   - UPDATE: company owner OR admin.
--   - DELETE: admin only.
--
-- Application status:
--   File ships in this PR. Application to prod is OWNER-GATED per
--   the goal rule "do not apply production DB migration without
--   explicit owner approval". UI degrades gracefully via 42P01 +
--   42883 detection until applied.

-- ── 1. company_workers ──────────────────────────────────────────────
create table if not exists public.company_workers (
  company_id  uuid references public.companies(id) on delete cascade,
  worker_id   uuid references public.workers(id)   on delete cascade,
  status      text check (status in ('active','paused','removed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (company_id, worker_id)
);

alter table public.company_workers enable row level security;

drop policy if exists company_workers_select on public.company_workers;
create policy company_workers_select on public.company_workers for select
  using (public.owns_company(company_id)
         or public.owns_worker(worker_id)
         or public.is_admin());

drop policy if exists company_workers_write on public.company_workers;
create policy company_workers_write on public.company_workers for all
  using (public.owns_company(company_id) or public.is_admin())
  with check (public.owns_company(company_id) or public.is_admin());

grant select, insert, update, delete on public.company_workers to authenticated;

-- ── 2. company_worker_invitations ───────────────────────────────────
create table if not exists public.company_worker_invitations (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id)
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
  unique (company_id, invited_email)
);

alter table public.company_worker_invitations enable row level security;

drop policy if exists company_worker_invitations_select
  on public.company_worker_invitations;
create policy company_worker_invitations_select
  on public.company_worker_invitations for select
  using (
    public.owns_company(company_id)
    or invited_email = (select email from public.profiles where id = auth.uid())
    or public.is_admin()
  );

drop policy if exists company_worker_invitations_update
  on public.company_worker_invitations;
create policy company_worker_invitations_update
  on public.company_worker_invitations for update
  using (public.owns_company(company_id) or public.is_admin())
  with check (public.owns_company(company_id) or public.is_admin());

drop policy if exists company_worker_invitations_insert
  on public.company_worker_invitations;
create policy company_worker_invitations_insert
  on public.company_worker_invitations for insert
  with check (public.is_admin());

grant select, update on public.company_worker_invitations to authenticated;

-- ── 3. invite_company_worker RPC ────────────────────────────────────
create or replace function public.invite_company_worker(
  p_company_id uuid,
  p_email      text,
  p_note       text default null
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

  if not public.owns_company(p_company_id) then
    return 'not_owner';
  end if;

  if normalised_em is null
     or not (normalised_em ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') then
    return 'invalid_email';
  end if;

  -- Already linked via company_workers?
  select cw.worker_id into existing_link
  from public.company_workers cw
  join public.workers w  on w.id = cw.worker_id
  join public.profiles p on p.id = w.profile_id
  where cw.company_id = p_company_id
    and lower(p.email) = normalised_em
  limit 1;
  if existing_link is not null then
    return 'already_linked';
  end if;

  -- Already pending?
  select id into existing_inv
  from public.company_worker_invitations
  where company_id = p_company_id
    and lower(invited_email) = normalised_em
    and status = 'pending'
  limit 1;
  if existing_inv is not null then
    return 'already_pending';
  end if;

  insert into public.company_worker_invitations (
    company_id, invited_email, status, inviter_profile_id, note
  ) values (
    p_company_id, normalised_em, 'pending', uid, nullif(trim(coalesce(p_note,'')), '')
  )
  on conflict (company_id, invited_email) do update
    set status = 'pending', inviter_profile_id = excluded.inviter_profile_id, note = excluded.note;

  return 'invited';
end $$;

revoke all on function public.invite_company_worker(uuid, text, text) from public;
grant execute on function public.invite_company_worker(uuid, text, text) to authenticated;
