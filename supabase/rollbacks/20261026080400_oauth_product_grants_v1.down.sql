-- ============================================================================
-- ROLLBACK for 20261026080400_oauth_product_grants_v1 (OAuth security B3)
--
-- READ BEFORE RUNNING. Dropping this table is a WIDENING, not a neutral undo:
-- a client a person limited to, say, read:profile becomes an unscoped legacy
-- client again, which MCP_SCOPE_ENFORCEMENT=off|log lets use every assistant
-- action. So the script refuses while any active (not revoked) grant exists,
-- unless the operator acknowledges that in the same session:
--
--   set lm.b3_rollback_ack = 'widening-accepted';
--
-- Safe order instead: revert the app PR first (the door then stops reading
-- this table, and B2 no longer enforces anything for these clients), decide
-- deliberately whether MCP_SCOPE_ENFORCEMENT should be `enforce` meanwhile,
-- then run this. Receipts already written stay in audit_logs (immutable).
-- ============================================================================

do $$
declare v_active bigint := 0;
begin
  if to_regclass('public.oauth_product_grants') is not null then
    execute 'select count(*) from public.oauth_product_grants where revoked_at is null' into v_active;
  end if;
  if v_active > 0 and coalesce(current_setting('lm.b3_rollback_ack', true), '') <> 'widening-accepted' then
    raise exception 'oauth_product_grants rollback refused: % active grant(s) exist; dropping them turns those clients unscoped (widening). Set lm.b3_rollback_ack = ''widening-accepted'' to proceed.', v_active;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is not null then
    delete from public.privacy_erasure_registry_v3
     where schema_name = 'public' and table_name = 'oauth_product_grants' and column_name = 'user_id';
  end if;
end $$;

drop function if exists public.oauth_door_product_grant_v1();
drop function if exists public.read_oauth_product_grant_v1(uuid, text);
drop function if exists public.revoke_oauth_product_grant_v1(uuid);
drop function if exists public.grant_oauth_product_scopes_v1(uuid, text[], text, text);
drop table if exists public.oauth_product_grants;
