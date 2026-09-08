-- 20260908120000_experience_response_moderation_scope_v1
--
-- @human-gate-approved
--
-- ── SCOPE OF THE MARKER ───────────────────────────────────────────────────
-- SAFETY CLASS: RED. One SELECT policy replacement on a table holding
-- moderated free text about real people. Apply ONLY via Supabase MCP
-- `apply_migration` after explicit owner approval. Never `supabase db push`.
--
-- The owner approved the IMPLEMENTATION of EVID-6 on 2026-09-08 and stopped
-- short of the apply: "paruošk jį ir sustok tik prieš faktinį pritaikymą."
-- The marker above is therefore the doctrine RISK ACKNOWLEDGEMENT that lets a
-- deliberate RED file pass the static gate. IT IS NOT AN APPROVAL TO APPLY,
-- and it does not reclassify this file to GREEN. This ships UNAPPLIED.
--
-- ── THE DEFECT, MEASURED ON PRODUCTION 2026-09-08 ─────────────────────────
--
-- `experience_responses_select` reads, today, live:
--
--   (author_profile_id = auth.uid())
--   OR is_admin()
--   OR EXISTS (
--        SELECT 1 FROM experience_records r
--         WHERE r.id = experience_responses.experience_record_id
--           AND r.author_profile_id = auth.uid()
--           AND r.moderation_status = 'published')
--
-- The third branch exists so the AUTHOR of an experience can read the
-- subject's reply to it. But the `moderation_status` it tests belongs to `r`
-- — the experience RECORD. The RESPONSE's own `moderation_status` is never
-- consulted, and BOTH tables carry that column (verified: both
-- `experience_records` and `experience_responses` have it).
--
-- So an experience author can read a reply that moderation has NOT published
-- — a `submitted`, `in_moderation` or `rejected` reply — for as long as the
-- underlying record is published. The subject's half-written or refused reply
-- is visible to the very person it answers.
--
-- WHY IT LOOKS CORRECT AND IS NOT: inside that subquery `moderation_status`
-- unqualified resolves to `r`, which is exactly what the author of the policy
-- meant for the RECORD and exactly what they did not mean for the RESPONSE.
-- Postgres prints the stored policy with `r.` prefixed, so reading the policy
-- back does not reveal the mistake either. This is the same shape as the
-- unqualified-column defect the product register already records once.
--
-- Today the SURFACE withholds it — `readResponsesFor` is only called for rows
-- the viewer may see, and the CV/experience UI does not render an unpublished
-- reply. That is defence in depth doing its job, and it is not a substitute
-- for a correct policy: any new reader of `experience_responses`, including a
-- direct PostgREST call under the author's own JWT, gets the unpublished row.
--
-- ── THE REPAIR ────────────────────────────────────────────────────────────
--
-- Add the response's OWN moderation status to the author branch, and qualify
-- EVERY column reference explicitly so the ambiguity that caused this cannot
-- recur by reading. Strictly NARROWING: the branch keeps every condition it
-- had and gains one.
--
--   before   author sees the reply when the RECORD is published
--   after    author sees the reply when the RECORD is published
--            AND the REPLY itself is published
--
-- The subject's own branch (`author_profile_id = auth.uid()`) is untouched, so
-- a person always sees their own reply in every state — including while it is
-- in moderation, which is the state they most need to see. `is_admin()` is
-- untouched. No table, column, row, grant or other policy is altered, and no
-- role gains anything: this migration can only REMOVE rows from a result set.
--
-- ── NOT VERIFIED AGAINST A LIVE APPLY ─────────────────────────────────────
--
-- Stated plainly, because this register has been burned by the opposite:
-- production holds 0 `experience_responses` rows, so there is no data on which
-- to demonstrate the before/after difference, and this file has NOT been
-- applied or trial-applied. What IS verified on production is the DEFECT: the
-- policy text above is the live policy, and both tables carry
-- `moderation_status`. The repair itself is CODE_PROVEN only.
--
-- Rollback:
-- supabase/rollbacks/20260908120000_experience_response_moderation_scope_v1.down.sql

drop policy if exists experience_responses_select on public.experience_responses;

create policy experience_responses_select on public.experience_responses
  for select to authenticated
  using (
    -- The subject reading their OWN reply, in every state. Never narrowed:
    -- a person must be able to see a reply that is still in moderation.
    public.experience_responses.author_profile_id = auth.uid()
    or public.is_admin()
    or (
      -- THE FIX: the reply's own moderation status, qualified so it cannot be
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

comment on policy experience_responses_select on public.experience_responses is
  'A reply is readable by its own author in any state, by an admin, and by the experience author ONLY when the reply itself is published AND the record is published. Both moderation_status references are qualified on purpose: the unqualified one inside the subquery resolved to the RECORD and handed the author an unpublished reply (EVID-6).';
