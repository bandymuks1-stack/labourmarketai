-- Rollback for 20260718170000_assets_logistics.sql
-- Brand-new objects only; nothing else depends on them. Reversible.

drop function if exists public.return_asset_v1(uuid, text, text);
drop function if exists public.transfer_asset_assignment_v1(uuid, uuid, uuid, text);
drop function if exists public.acknowledge_asset_assignment_v1(uuid);
drop function if exists public.issue_asset_v1(uuid, uuid, uuid, text, text);
drop function if exists public.caller_manages_asset(uuid);
drop function if exists public.create_asset_v1(uuid, text, text, text, text, text);

drop table if exists public.asset_assignments cascade;
drop table if exists public.assets cascade;
