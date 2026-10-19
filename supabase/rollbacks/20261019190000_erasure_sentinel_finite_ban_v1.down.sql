-- ROLLBACK for 20261019190000_erasure_sentinel_finite_ban_v1.sql
--
-- REFUSES, deliberately and loudly. The only inverse of this migration is
-- writing banned_until = 'infinity' back onto the erasure sentinel, and that
-- value is the incident itself: GoTrue cannot scan it, so the admin user
-- listing fails for EVERY user ("Database error finding users", 2026-10-19).
-- A rollback that succeeded as a no-op would let recovery tooling report the
-- change as undone when it was not; one that restored 'infinity' would
-- reintroduce the outage. So it raises, and changes nothing.
--
-- The sentinel stays banned until 2999-12-31 — still never able to sign in.
-- To truly undo the erasure executor, roll back 20261019140000 instead (its
-- rollback removes the sentinel entirely).

begin;

do $$
begin
  raise exception 'rollback refused: 20261019190000 has no safe inverse (restoring banned_until = infinity breaks GoTrue admin listUsers); roll back 20261019140000 to remove the sentinel instead'
    using errcode = 'P0001';
end $$;

commit;
