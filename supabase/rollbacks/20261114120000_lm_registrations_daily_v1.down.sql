-- Rollback of 20261114120000_lm_registrations_daily_v1: the function holds no data and nothing depends on it except
-- GET /api/internal/registrations-daily/v1, which answers 503 without it (never 200 with zeros).
drop function if exists public.lm_registrations_daily_v1(date);
