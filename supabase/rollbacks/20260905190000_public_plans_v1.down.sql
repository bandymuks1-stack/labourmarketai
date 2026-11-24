-- 20260905190000_public_plans_v1.down.sql
-- Reverses 20260905190000_public_plans_v1.sql.
--
-- Drops the ONE anon-safe public catalogue RPC. No data is touched; the `plans`
-- table, its rows and its RLS policy are unchanged. After this runs the public
-- /pricing page falls back to the pre-2026-09-05 state (card without a price
-- figure) — the application already tolerates the RPC being absent.
--
-- Apply via Supabase MCP `apply_migration` (never `supabase db push`).

drop function if exists public.public_plans_v1();
