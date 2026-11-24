-- Rollback for 20260716121000_request_rate_limits_v3.sql
-- Safe: drops only the wrapper; the applied v1 RPC is untouched and the app
-- falls back to it automatically (app-layer caps stay active).

drop function if exists public.propose_booking_request_v3(uuid, uuid, text, text, text, text, text);
