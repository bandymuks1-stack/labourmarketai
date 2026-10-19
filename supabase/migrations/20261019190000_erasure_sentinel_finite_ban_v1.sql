-- @human-gate-approved (acknowledgement: RED by auth.users update; incident fix 2026-10-19)
--
-- 20261019190000 — the erasure sentinel is banned until a FINITE date.
--
-- 20261019140000 created the "erased person" sentinel in auth.users with
-- banned_until = 'infinity'. GoTrue cannot scan an infinite timestamp, so every
-- admin listUsers call failed with "Database error finding users" (the
-- production QA walks stopped at provisioning, 2026-10-19 17:17Z). A date far in
-- the future bans the sentinel just as permanently and is readable.
-- Rollback: supabase/rollbacks/20261019190000_erasure_sentinel_finite_ban_v1.down.sql

begin;

update auth.users
   set banned_until = '2999-12-31 00:00:00+00'
 where id = public.privacy_erasure_sentinel_profile_id()
   and banned_until = 'infinity';

commit;
