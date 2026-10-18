-- Rollback for 20260908120000_education_program_correction_v1.sql
--
-- Drops the one function this migration added. Nothing else was altered, so
-- this is a complete inverse: no policy, table, column, grant on an existing
-- object or other function was touched on the way in.
--
-- WHAT ROLLING BACK COSTS. Corrections already made to programme rows STAY —
-- they are ordinary column values written by an authorized manager, and
-- reverting them would mean restoring data the institution deliberately
-- changed. What is lost is the ability to correct a programme again: the rows
-- become immutable once more, exactly as they were before.
--
-- Prefer fixing forward.

drop function if exists public.update_education_program_v1(uuid, text, text, text, text);
