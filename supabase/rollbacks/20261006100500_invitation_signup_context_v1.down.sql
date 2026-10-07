-- ROLLBACK of 20261006100500_invitation_signup_context_v1.
-- Drops the service-only signup-context read. The signup page then falls back to
-- an empty email field (it treats a missing function as "no prefill").
begin;
drop function if exists public.get_invitation_signup_context_v1(text);
commit;
