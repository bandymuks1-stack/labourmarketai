-- ROLLBACK for 20261019150000_privacy_erasure_registry_not_null_authors_v1.sql
-- Restores the two registry rows to set_null (the plan then refuses every
-- erasure again with the schema-drift reason). Data-only, idempotent.

begin;

update public.privacy_erasure_registry_v3
   set treatment = 'set_null', decided_by = 'engineering',
       legal_basis = 'nullable reference; severed by NULL',
       note = 'FK already SET NULL; v3 runs it explicitly before the account delete',
       updated_at = now()
 where schema_name = 'public'
   and ((table_name = 'agency_client_connections' and column_name = 'invited_by')
     or (table_name = 'agency_client_request_shares' and column_name = 'shared_by'))
   and treatment = 'sever_sentinel';

commit;
