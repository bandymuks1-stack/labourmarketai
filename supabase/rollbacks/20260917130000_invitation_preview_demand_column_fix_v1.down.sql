-- Rollback for 20260917130000_invitation_preview_demand_column_fix_v1.sql
-- Removes the corrected signed-in preview. The invitation page falls back to
-- get_invitation_preview_v1 (PGRST202 → v1) exactly as it did before the
-- universal-network migration; nothing else in 20260917120000 depends on it.
-- The broken original body is deliberately NOT restored — a rollback that
-- reinstates a 42703 is not a rollback.

begin;

drop function if exists public.get_invitation_preview_v2(text);

commit;
