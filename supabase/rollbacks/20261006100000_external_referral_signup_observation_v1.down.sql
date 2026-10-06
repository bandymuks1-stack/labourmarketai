-- Rollback for 20261006100000_external_referral_signup_observation_v1.sql
-- Drops the two functions only. Audit rows already written
-- (`external_referral_signup_observed`) are append-only history and stay.
begin;

drop function if exists public.external_referral_observed_signups_v1(text, text[]);
drop function if exists public.record_external_referral_signup_v1(text, text);

commit;
