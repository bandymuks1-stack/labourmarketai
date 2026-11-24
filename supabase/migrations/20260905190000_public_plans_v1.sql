-- @human-gate-approved
-- 20260905190000_public_plans_v1.sql
--
-- WHY. The public /pricing page renders the price FIGURE from `plans.price_eur_monthly`
-- (the ONE home of the figure, owner-approved 2026-09-05: FREE €0, ORGANIZATION €99).
-- RLS policy `plans_select` is `using (true)`, but the 2026-07-22 anon-revoke pass left
-- the `anon` and `authenticated` roles with NO table privilege on `plans`
-- ("permission denied for table plans"), so every visitor — and every signed-in
-- organisation — sees a card without a price (prod walk f4b5e582, 2026-09-05).
--
-- FIX. The same anon-safe pattern as the public job board: ONE SECURITY DEFINER
-- function returning the catalogue columns only, executable by anon + authenticated,
-- listed in `apps/web/lib/security/anon-secdef-allowlist.ts`. No table grant is
-- widened; `plans` stays unreadable directly. Read-only, no parameters, no PII.
--
-- RED class (grant to anon) — human gate: owner approval + apply via Supabase MCP.

create or replace function public.public_plans_v1()
returns table (
  slug text,
  name_lt text,
  name_en text,
  price_eur_monthly numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select p.slug, p.name_lt, p.name_en, p.price_eur_monthly
  from public.plans p
  where p.active = true
  order by p.price_eur_monthly nulls last, p.slug;
$$;

comment on function public.public_plans_v1() is
  'Public plan catalogue (slug, names, monthly EUR figure) for /pricing. Read-only; the only anon path to plans.';

-- REVOKE FROM PUBLIC FIRST (the default PUBLIC EXECUTE grant is the 2026-07-22 P0 idiom).
revoke execute on function public.public_plans_v1() from public;
grant execute on function public.public_plans_v1() to anon, authenticated;

-- ROLLBACK
--   drop function if exists public.public_plans_v1();
--   (no data is touched; the table and its policies are unchanged)
