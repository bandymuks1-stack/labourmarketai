-- Rollback for 20261012090000_ops_product_metrics_v1.sql
-- The function stores nothing; dropping it loses no data. The operator view
-- and the monitor fall back to reporting the affected metrics as UNKNOWN.
drop function if exists public.ops_product_metrics_v1();
