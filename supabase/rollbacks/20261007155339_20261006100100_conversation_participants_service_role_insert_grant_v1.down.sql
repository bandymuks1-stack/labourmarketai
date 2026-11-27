-- ROLLBACK for 20261007155339_20261006100100_conversation_participants_service_role_insert_grant_v1.sql
-- RECONSTRUCTED after the production apply; the production ledger stored NO rollback.
-- Intentionally a no-op. The restored migration only REPEATS a grant that the preceding
-- migration already made: 20261006100100_conversation_participants_server_authority_v1.sql
-- line 88 (`grant insert on public.conversation_participants to service_role;`). The state
-- before this migration therefore already holds that privilege, and revoking it here would
-- break participant inserts in apps/web/lib/communication/communication-core.ts. Rolling
-- back the earlier migration is that migration's own rollback, not this one.
select 1;
