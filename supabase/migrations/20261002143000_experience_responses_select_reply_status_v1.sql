-- ============================================================================
-- DRAFT — needs-human-gate — SECURITY (RLS, EVID-6). DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
-- @human-gate-approved
--
-- 20261002143000 — experience_responses_select resolves the REPLY's moderation
-- status (EVID-6).
--
-- DEFECT (measured on production, read-only, 2026-10-03). The live policy is
--
--   author_profile_id = auth.uid()
--   OR is_admin()
--   OR EXISTS (SELECT 1 FROM experience_records r
--               WHERE r.id = experience_responses.experience_record_id
--                 AND r.author_profile_id = auth.uid()
--                 AND r.moderation_status = 'published')
--
-- The third branch lets the AUTHOR of an experience read the subject's reply to
-- it. The `moderation_status` it tests is the RECORD's (`r.`): written
-- unqualified inside the subquery it bound to `r`, and Postgres prints it back
-- as `r.moderation_status`, so reading the policy back does not reveal the
-- mistake. The REPLY's own moderation_status is never consulted, so the record
-- author can read a reply that moderation has not published (submitted,
-- in_moderation or rejected) for as long as the record is published.
-- Production today: 1 experience_responses row ('submitted') under a published
-- record = 1 exposed row.
--
-- FIX. ONE policy changed in place with ALTER POLICY ... USING: the record
-- author's branch additionally requires the reply itself to be 'published', and
-- every column is fully qualified so the ambiguity cannot recur by reading.
--   * Strictly NARROWING. The reply author's branch (own reply, every state) and
--     the admin branch are byte-for-byte unchanged. Nobody gains anything; this
--     can only REMOVE rows from a result set. No new reader.
--   * ALTER POLICY changes ONLY the USING expression: the policy name, command
--     (SELECT) and roles (the live policy is {public}) are untouched, there is
--     no window with the policy absent, and no other policy exists on the table
--     (writes have none: RPC-only submit_experience_response /
--     moderate_experience_response, whose bodies are NOT touched).
--   * No table, column, row, grant, function or other policy is altered.
--   * Fail-closed: moderation_status and author_profile_id are NOT NULL; a NULL
--     auth.uid() makes every branch false/NULL, and RLS treats NULL as "not
--     visible".
--
-- ROLLBACK: supabase/rollbacks/20261002143000_experience_responses_select_reply_status_v1.down.sql
-- restores the live pre-image and DELIBERATELY REINTRODUCES the defect — prefer
-- fixing forward.
-- ============================================================================

alter policy experience_responses_select on public.experience_responses
  using (
    -- The subject reading their OWN reply, in every state. Never narrowed: a
    -- person must be able to see a reply that is still in moderation.
    public.experience_responses.author_profile_id = auth.uid()
    or public.is_admin()
    or (
      -- THE FIX: the reply's OWN moderation status, qualified so it cannot be
      -- mistaken for the record's.
      public.experience_responses.moderation_status = 'published'
      and exists (
        select 1
          from public.experience_records r
         where r.id = public.experience_responses.experience_record_id
           and r.author_profile_id = auth.uid()
           and r.moderation_status = 'published'
      )
    )
  );
