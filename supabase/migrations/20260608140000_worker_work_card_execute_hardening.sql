-- ─────────────────────────────────────────────────────────────────────────
-- RPC Execute Hardening v1 — worker work-card RPCs
-- Slice: rpc-execute-hardening-v1
--
-- Postgres grants EXECUTE on functions to PUBLIC by default, so `anon`
-- (unauthenticated) can reach save_worker_card / confirm_worker_card via
-- /rest/v1/rpc. They already self-guard (auth.uid() is null → raise 42501, so
-- no data is touched), but the default PUBLIC grant trips the Supabase advisor
-- "Public Can Execute SECURITY DEFINER Function". This migration tightens the
-- grant to defence-in-depth: revoke the implicit PUBLIC/anon EXECUTE, keep the
-- explicit `authenticated` grant.
--
-- HARDENING-ONLY: no RPC body change, no schema change, no data change. Purely
-- a privilege tightening. Reversible.
--
-- ROLLBACK (reversible)
--   grant execute on function public.save_worker_card(text, date, text, text[], int, int) to public;
--   grant execute on function public.confirm_worker_card() to public;
-- ─────────────────────────────────────────────────────────────────────────

revoke execute on function public.save_worker_card(text, date, text, text[], int, int) from public;
revoke execute on function public.save_worker_card(text, date, text, text[], int, int) from anon;
revoke execute on function public.confirm_worker_card() from public;
revoke execute on function public.confirm_worker_card() from anon;

-- Re-affirm the intended grant (idempotent if already present).
grant execute on function public.save_worker_card(text, date, text, text[], int, int) to authenticated;
grant execute on function public.confirm_worker_card() to authenticated;
