-- Rollback for 20260903140000_institution_learner_outcomes_v1
-- Safe: drops the aggregate function only. No table, no data.

drop function if exists public.institution_learner_outcomes_v1(uuid);
