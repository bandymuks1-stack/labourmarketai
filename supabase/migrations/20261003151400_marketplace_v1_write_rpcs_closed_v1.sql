-- ============================================================================
-- 20261003151400 — close the weaker v1 write doors of marketplace_listings
--
-- RED by rule (REVOKE). needs-human-gate. Apply only via Supabase MCP
-- apply_migration after owner approval, AFTER 20261003150300 (which creates the
-- v2 RPCs) and AFTER the app that calls v2 is deployed. Never db push.
-- @human-gate-approved
--
-- FINDING (convergence audit, P1). create_ / update_ / set_marketplace_listing_
-- status_v1 are SECURITY DEFINER and executable by `authenticated`. They are
-- the FROZEN pre-universal doors: they know only the 7 original work
-- categories, accept no amount/expiry, and set_status_v1 checks only owner_id
-- and status in (draft, active, closed) — it does NOT apply the 'listing
-- expired' check that set_marketplace_listing_status_v2 enforces. Any listing
-- owner could therefore call v1 straight through PostgREST and flip an
-- EXPIRED listing to status 'active' (not discoverable, because the index and
-- the select policy filter expiry, but the row then claims a state the v2
-- door refuses). The category / publish-policy half of the finding is already
-- closed by the 20261003150300 backstop trigger on marketplace_listings
-- (proved in the scratch script); the expiry half is not, and v1 can never
-- grow into the v2 contract.
--
-- FIX. After v2 exists nothing needs v1: REVOKE EXECUTE on the three v1
-- functions from public, anon and authenticated (production ACL read
-- 2026-10-05: {postgres, authenticated} only). v2 is byte-unchanged. The
-- app's v1 fallback is restricted to "function missing" (PGRST202 / 42883) so
-- a permission error is never mistaken for it.
--
-- NOT TOUCHED: delete_marketplace_listing_v1 (owner delete; no publish policy
-- applies to deleting) stays callable by authenticated.
--
-- ROLLBACK: supabase/rollbacks/20261003151400_marketplace_v1_write_rpcs_closed_v1.down.sql
-- ============================================================================

begin;

revoke execute on function public.create_marketplace_listing_v1(text, text, text, text, text, text, text, uuid, uuid) from public;
revoke execute on function public.create_marketplace_listing_v1(text, text, text, text, text, text, text, uuid, uuid) from anon;
revoke execute on function public.create_marketplace_listing_v1(text, text, text, text, text, text, text, uuid, uuid) from authenticated;

revoke execute on function public.update_marketplace_listing_v1(uuid, text, text, text, text, text, text, text) from public;
revoke execute on function public.update_marketplace_listing_v1(uuid, text, text, text, text, text, text, text) from anon;
revoke execute on function public.update_marketplace_listing_v1(uuid, text, text, text, text, text, text, text) from authenticated;

revoke execute on function public.set_marketplace_listing_status_v1(uuid, text) from public;
revoke execute on function public.set_marketplace_listing_status_v1(uuid, text) from anon;
revoke execute on function public.set_marketplace_listing_status_v1(uuid, text) from authenticated;

commit;
