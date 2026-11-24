-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260705170000 — conversation_counterpart_identities: the §8.1 safe
-- counterpart identity reader (product-tree branch 20, contact permission +
-- counterpart identity).
--
-- PROBLEM: profiles RLS is own-profile-only ((id = auth.uid()) OR is_admin()),
-- so a participant of a direct (1:1) conversation cannot see WHO they are
-- talking to — the UI must render the honest "details are not shown yet"
-- restricted chip forever. Users must understand who they are dealing with,
-- without unsafe contact leakage.
--
-- SOLUTION (mirrors the approved 20260627174500 requester-identity pattern):
-- ONE new SECURITY DEFINER *read* function that returns, for a set of
-- conversation ids, ONLY the display name (profiles.full_name) of the OTHER
-- unrevoked participant — and ONLY when ALL of these hold, re-checked at fire
-- time:
--   * the CALLER is an unrevoked participant of the conversation
--     (public.is_conversation_participant — the existing SECURITY DEFINER
--     helper from 20260612170000, which already filters revoked grants);
--   * the conversation kind is 'direct' (a 1:1 thread; team/support rosters
--     are never exposed through this reader);
--   * the conversation has EXACTLY 2 unrevoked participants (a drifted or
--     multi-party thread returns nothing rather than guessing).
-- It is additive: no table, no column, no RLS policy change, no table grant
-- change. Existing reads keep working under their RLS; the app enriches them
-- with this function and degrades gracefully (restricted chip) while it is
-- absent.
--
-- PRIVACY BOUNDARY (the function projection IS the boundary):
--   * EXPOSES only full_name (display name) of the counterpart of a 2-person
--     direct conversation the caller belongs to.
--   * NEVER exposes email, phone, country/location, profile_text, consent
--     flags, avatar, profile id, or any other profile field.
--   * No broad profiles SELECT, no anon/public grant, no using(true).
--   * Unauthenticated → auth.uid() is null → is_conversation_participant is
--     false for every row → 0 rows.
--
-- @human-gate-approved — TIER: owner-gated. SECURITY DEFINER + GRANT are
-- RED-class by the migration-safety rules, so this PR ships as a
-- needs-human-gate DRAFT with the exact SQL; prod apply stays manual via
-- Supabase MCP after owner approval — never db push. Execute is revoked from
-- public/anon and granted to authenticated only; search_path is pinned.
--
-- ROLLBACK: supabase/rollbacks/20260705170000_conversation_counterpart_identity.down.sql
-- ============================================================================

begin;

-- Minimum-safe counterpart identity for direct conversations. Returns one row
-- per qualifying conversation id, carrying ONLY the display name. The WHERE
-- clause is the authority + scope check, evaluated per call.
create or replace function public.conversation_counterpart_identities(p_conversation_ids uuid[])
returns table (conversation_id uuid, display_name text)
language sql security definer set search_path = public stable as $$
  select cp.conversation_id, p.full_name
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  join public.profiles p on p.id = cp.profile_id
  where cp.conversation_id = any(p_conversation_ids)
    and c.kind = 'direct'
    and cp.profile_id <> auth.uid()
    and cp.revoked_at is null
    and public.is_conversation_participant(cp.conversation_id)
    and (
      select count(*)
      from public.conversation_participants cp2
      where cp2.conversation_id = cp.conversation_id
        and cp2.revoked_at is null
    ) = 2;
$$;

revoke all on function public.conversation_counterpart_identities(uuid[]) from public;
revoke all on function public.conversation_counterpart_identities(uuid[]) from anon;
grant execute on function public.conversation_counterpart_identities(uuid[]) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — see
-- supabase/rollbacks/20260705170000_conversation_counterpart_identity.down.sql).
-- Drops the function only; no data is touched by the rollback.
-- ─────────────────────────────────────────────────────────────────────────
