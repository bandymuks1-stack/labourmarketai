-- ROLLBACK for 20261007155339_20261006100100_conversation_participants_service_role_insert_grant_v1.sql
-- RECONSTRUCTED after the production apply; the production ledger stored NO rollback.
revoke insert on public.conversation_participants from service_role;
