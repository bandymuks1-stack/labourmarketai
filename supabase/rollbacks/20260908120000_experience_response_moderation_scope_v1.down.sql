-- ROLLBACK for 20260908120000_experience_response_moderation_scope_v1.sql
--
-- Restores `experience_responses_select` EXACTLY as production carried it on
-- 2026-09-08, captured from `pg_policies` before the forward migration was
-- written (not reconstructed from memory).
--
-- WARNING, stated plainly: running this REINTRODUCES EVID-6. The experience
-- author can again read a reply moderation has not published — `submitted`,
-- `in_moderation` or `rejected` — whenever the underlying record is published,
-- because the only `moderation_status` consulted belongs to the RECORD. It
-- exists because a migration must be reversible, not because reversing it is a
-- good idea. Prefer fixing forward.
--
-- No data is touched in either direction. No grant, table or column changes.

drop policy if exists experience_responses_select on public.experience_responses;

create policy experience_responses_select on public.experience_responses
  for select to authenticated
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
