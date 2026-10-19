-- ROLLBACK for 20261019190000_erasure_sentinel_finite_ban_v1.sql
-- Intentionally a no-op: restoring 'infinity' would break GoTrue's admin user
-- listing again. The sentinel stays banned until 2999-12-31.

begin;
select 1;
commit;
