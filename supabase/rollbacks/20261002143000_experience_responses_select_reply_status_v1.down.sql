-- ROLLBACK for 20261002143000_experience_responses_select_reply_status_v1.sql
--
-- Restores `experience_responses_select` to the LIVE pre-image (read back from
-- pg_policies on production 2026-10-03; the stored expression is reproduced
-- exactly, verified on a scratch PostgreSQL 16 by comparing the stored
-- expression tree before the forward migration and after this rollback).
--
-- WARNING, stated plainly: running this REINTRODUCES EVID-6. The experience
-- author can again read a reply moderation has not published — `submitted`,
-- `in_moderation` or `rejected` — whenever the record is published, because the
-- only `moderation_status` consulted belongs to the RECORD. A migration must be
-- reversible; reversing this one is not a good idea. PREFER FIXING FORWARD.
--
-- A policy swap only: ALTER POLICY changes the USING expression, nothing else.
-- No data, grant, table, column, function or other policy is touched.

alter policy experience_responses_select on public.experience_responses
  using (
    (author_profile_id = auth.uid())
    or public.is_admin()
    or (exists (
      select 1
        from public.experience_records r
       where r.id = public.experience_responses.experience_record_id
         and r.author_profile_id = auth.uid()
         and r.moderation_status = 'published'
    ))
  );
