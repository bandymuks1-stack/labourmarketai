-- ============================================================================
-- ROLLBACK for 20260924130000_set_company_description_v1
--
-- Removes the description write function. The app action falls back to its
-- previous direct UPDATE (42883 / PGRST202 fallback in
-- apps/web/lib/company/description-actions.ts) — i.e. today's behaviour.
-- No data is touched: descriptions already saved stay as they are.
-- ============================================================================

drop function if exists public.set_company_description_v1(uuid, text);
