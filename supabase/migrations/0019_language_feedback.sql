-- ════════════════════════════════════════════════════════════════════════
-- 0019 — Language QA / tester feedback v1.
--
-- A safe in-app channel for real testers to flag confusing LT/EN copy.
-- The widget captures: route, locale, the highlighted snippet (≤120 chars),
-- a short comment, and (when logged in) the profile id. Admin/owner reads
-- the inbox via `/[locale]/dashboard/admin/language-feedback`.
--
-- Safety:
--   - RLS enabled. INSERT restricted to `authenticated` and to rows whose
--     `user_id` matches `auth.uid()` (or is NULL for anonymous testers
--     who aren't signed in but still want to flag landing-page copy).
--   - SELECT only for admins (`public.is_admin()`). No public exposure.
--     The data is owner/admin-private — anyone else gets zero rows.
--   - Additive only. No DROP / no ALTER drop / no DELETE.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.language_feedback (
  id            uuid primary key default gen_random_uuid(),
  route         text not null,
  locale        text not null,
  selected_text text,
  comment       text not null,
  user_id       uuid references public.profiles(id),
  status        text not null default 'open' check (status in ('open','reviewed','fixed','dismissed')),
  created_at    timestamptz not null default now()
);

create index if not exists idx_language_feedback_status_created
  on public.language_feedback(status, created_at desc);
create index if not exists idx_language_feedback_route
  on public.language_feedback(route);

alter table public.language_feedback enable row level security;

-- INSERT: any authenticated session can submit feedback for itself; an
-- anonymous tester (no profile) can also submit by leaving user_id NULL.
-- We explicitly forbid impersonating someone else's user_id.
create policy language_feedback_insert on public.language_feedback for insert
  with check (user_id is null or user_id = auth.uid());

-- SELECT: admins only. Workers / companies / agencies / clients see
-- nothing — this is an internal review inbox.
create policy language_feedback_select on public.language_feedback for select
  using (public.is_admin());

-- No UPDATE / DELETE policies — append-only inbox (mirrors §3 doctrine for
-- journal entries). Status flips will land in a future admin write surface
-- with its own narrow RPC; v1 is read-only.

grant select, insert on public.language_feedback to authenticated;
