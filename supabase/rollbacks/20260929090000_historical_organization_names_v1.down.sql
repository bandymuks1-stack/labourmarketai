-- Rollback 20260929090000: the historical name read did not exist before.
drop function if exists public.my_historical_organization_names_v1(uuid[]);
