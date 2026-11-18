-- @human-gate-approved (acknowledgement: RED by data UPDATE; owner-approved 2026-10-19 with the erasure executor v3)
--
-- 20261019150000 — erasure registry: two NOT NULL author columns are severed, not nulled.
--
-- The production dry run of the executor v3 (20261019140000) refused every
-- erasure with "registry says set_null but the column is NOT NULL (schema
-- drift)" for two columns whose FK says ON DELETE SET NULL while the column
-- itself is NOT NULL:
--   agency_client_connections.invited_by
--   agency_client_request_shares.shared_by
-- A SET NULL there can never succeed, so the decision is the one every other
-- NOT NULL author column on a retained organisation record already carries:
-- sever to the sentinel. Like those, it needs a documented retention period
-- before rows are kept about a person, so a person with such rows goes to
-- human review (owner rule 2026-10-19); a person without them is unaffected.
--
-- Data-only: two registry rows. No schema, no grant, no policy.
-- Rollback: supabase/rollbacks/20261019150000_privacy_erasure_registry_not_null_authors_v1.down.sql

begin;

update public.privacy_erasure_registry_v3
   set treatment = 'sever_sentinel', decided_by = 'engineering',
       legal_basis = 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel',
       note = 'NOT NULL author/actor column on a retained record (the FK says SET NULL, which the NOT NULL column cannot take)',
       updated_at = now()
 where schema_name = 'public'
   and ((table_name = 'agency_client_connections' and column_name = 'invited_by')
     or (table_name = 'agency_client_request_shares' and column_name = 'shared_by'))
   and treatment = 'set_null';

commit;
