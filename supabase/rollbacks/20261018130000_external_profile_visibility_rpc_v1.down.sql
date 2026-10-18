-- ROLLBACK of 20261018130000_external_profile_visibility_rpc_v1
-- Removes only the function this migration added. No table, column, policy or data is touched;
-- saved `visibility` values stay as they are (the column and its CHECK predate this migration).
drop function if exists public.set_external_profile_visibility_v1(uuid, text);
