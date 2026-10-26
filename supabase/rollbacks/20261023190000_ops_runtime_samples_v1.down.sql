-- Rollback of 20261023190000_ops_runtime_samples_v1: the table holds runtime
-- evidence only (numbers, 14-day horizon); nothing references it, and the
-- sampler drops a failed insert silently, so the running app keeps working.
-- Deploy the code that stops the sampler (or set LM_RUNTIME_SAMPLER=off)
-- first if the table should stay gone.
drop table if exists public.ops_runtime_samples;
