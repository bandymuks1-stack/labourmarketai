-- Rollback of 20261112120000 (save_customer_request_v2). The function holds no
-- data; rows it wrote keep their kind and language (values the CHECK allows).
-- The app falls back to v1 on 42883 / PGRST202.
begin;
drop function if exists public.save_customer_request_v2(uuid, text, text, text, text, text, integer, text, text, text, text, text, text);
commit;
