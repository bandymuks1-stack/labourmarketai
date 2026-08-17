-- ROLLBACK for 20260817181000_leave_balance_policies_v1.sql
--
-- Restores the prior state exactly: drops ONLY the one module command and
-- the leave_balance_policies table. No existing object was touched by the
-- up migration, so nothing is recreated here. Feature-created rows live
-- ONLY in leave_balance_policies; dropping the table is the complete data
-- rollback (balances were never stored anywhere — they are derived at read
-- time and simply stop being derivable).

begin;

drop function if exists public.set_leave_balance_policy_v1(text, text, numeric, numeric, boolean);

drop table if exists public.leave_balance_policies;

commit;
