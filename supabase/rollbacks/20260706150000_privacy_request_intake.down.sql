-- Rollback for 20260706150000_privacy_request_intake.sql
--
-- Drops ONLY the one NEW-name function. Privacy-request rows are ordinary
-- customer_requests rows (payload->>'privacy_request_type') and are
-- deliberately kept as audit history — a privacy request must not vanish
-- because the intake path was rolled back.

begin;

drop function if exists public.submit_privacy_request_v1(text, text);

commit;
