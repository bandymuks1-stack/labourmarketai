-- ============================================================================
-- 20260612170000 — conversation participant grants become REVOCABLE records
-- (CHAT VISIBILITY AUDIT fix — doctrine §4.3: grants are records, not flags;
--  revocation = setting revoked_at, never deleting the row).
--
-- RED TIER (owner rule, chat-visibility audit 2026-06-12): this migration
-- changes RLS-relevant semantics (the participant-check function + the UPDATE
-- grant surface) → ships as a DRAFT PR with the needs-human-gate label and is
-- applied to prod ONLY via Supabase MCP apply_migration after DI approval.
-- Never `db push`.
--
-- @human-gate-approved — DI approved + APPLIED to prod via the owner channel
-- and verified (2026-06-12: 7/7 hostile negative tests green, F0 recursion
-- confirmed fixed). This annotation lets the human-reviewed RED migration pass
-- the migration-safety check so the file can land in the repo ledger. The PR
-- merge is SYNC-ONLY — the migration is already live on prod; do NOT re-apply.
-- The classifier still records the RED findings (SECURITY DEFINER, GRANT/
-- REVOKE, data UPDATE) as notices for the audit trail.
--
-- WHAT THE AUDIT FOUND (see docs/audits/CHAT_VISIBILITY_AUDIT.md):
--   F0. is_conversation_participant() shipped as SECURITY INVOKER and reads
--       conversation_participants — whose OWN select policy calls
--       is_conversation_participant(). A plain authenticated SELECT on
--       conversations therefore recurses until `stack depth limit exceeded`
--       (SQLSTATE 54001). The chat read path is broken/DoS-prone today; it
--       has gone unnoticed only because the prod tables are still empty.
--       Fix: make the helper SECURITY DEFINER so its internal read bypasses
--       RLS and cannot re-enter the policy (the canonical Supabase pattern).
--   F1. conversation_participants has NO revoked_at — a grant, once given,
--       could never be withdrawn (the object-owner / customer scenario in
--       doctrine §4.3 was unimplementable).
--   F2. There was NO participant-removal path at all (no DELETE policy —
--       good, append-only; but also no revocation — bad).
--   F3. The broad `GRANT UPDATE` from 0021 let any participant UPDATE every
--       column of their OWN row (added_by / added_at — and, once F1 ships,
--       revoked_at, i.e. self-un-revocation). The own-row UPDATE policy was
--       only ever meant for last_read_at.
--
-- WHAT THIS MIGRATION DOES (all additive / narrowing — no loosening):
--   1. revoked_at + revoked_by columns on conversation_participants.
--   2. is_conversation_participant() becomes SECURITY DEFINER (fixes F0) AND
--      now requires revoked_at IS NULL — every SELECT/INSERT policy on
--      conversations + conversation_messages and the participants SELECT
--      policy inherit both the recursion fix and the revocation cut-off
--      atomically. DEFINER is safe here: the body is a fixed existence check
--      keyed on auth.uid() with a pinned search_path — it cannot be steered
--      to read another caller's rows.
--   3. revoke_conversation_participant(conversation_id, profile_id) RPC —
--      SECURITY DEFINER, creator-or-admin only, sets revoked_at/revoked_by
--      (an UPDATE, never a DELETE), audit-logged per doctrine §3.4.
--   4. Column-level UPDATE grant: `UPDATE` on the table is revoked from
--      `authenticated` and re-granted on (last_read_at) ONLY — closing F3
--      and making self-un-revocation impossible at the grant layer.
--
-- The revoked row STAYS FOREVER: who could see what, and when access ended,
-- is itself legal evidence (§3, §4.3).
-- ============================================================================

begin;

-- 1. Revocation columns (grants are records — §4.3).
alter table public.conversation_participants
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles(id);

-- 2. A revoked grant no longer makes you a participant. Every policy that
--    calls this helper (conversations SELECT, messages SELECT/INSERT,
--    participants SELECT) inherits the cut-off the moment revoked_at is set.
--    SECURITY DEFINER (fixes F0): the internal read of
--    conversation_participants must NOT re-enter that table's RLS policy —
--    otherwise the policy calls this function, which reads the table, which
--    re-evaluates the policy … → stack overflow. The body is a fixed
--    existence check bound to auth.uid() with a pinned search_path, so
--    DEFINER cannot be abused to read another user's membership.
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversation_participants cp
     where cp.conversation_id = p_conversation_id
       and cp.profile_id = auth.uid()
       and cp.revoked_at is null
  );
$$;

-- 3. Revocation RPC — the ONLY write path for revoked_at/revoked_by.
--    Creator-or-admin only; an UPDATE, never a DELETE; audit-logged (§3.4).
create or replace function public.revoke_conversation_participant(
  p_conversation_id uuid,
  p_profile_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_creator uuid;
  v_revoked timestamptz;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select created_by into v_creator
    from public.conversations where id = p_conversation_id;
  if v_creator is null then
    raise exception 'conversation_not_found';
  end if;
  if v_creator <> uid and not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  -- The creator's own grant is not revocable through this path — a thread
  -- without its owner is a different product decision, not a side effect.
  if p_profile_id = v_creator then
    raise exception 'cannot_revoke_creator';
  end if;
  select revoked_at into v_revoked
    from public.conversation_participants
   where conversation_id = p_conversation_id
     and profile_id = p_profile_id;
  if not found then
    raise exception 'participant_not_found';
  end if;
  if v_revoked is not null then
    return 'already_revoked';
  end if;

  update public.conversation_participants
     set revoked_at = now(),
         revoked_by = uid
   where conversation_id = p_conversation_id
     and profile_id = p_profile_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (
    uid,
    'conversation_participant_revoked',
    'conversations',
    p_conversation_id,
    jsonb_build_object('profile_id', p_profile_id)
  );

  return 'ok';
end $$;

revoke all on function public.revoke_conversation_participant(uuid, uuid) from public;
grant execute on function public.revoke_conversation_participant(uuid, uuid) to authenticated;

-- 4. Grant hardening (closes audit findings F3 + F4). Today both `anon` and
--    `authenticated` hold the broad Supabase default grant (SELECT/INSERT/
--    UPDATE/DELETE/TRUNCATE) on all three tables — only RLS stands between
--    `anon` and the data, and `authenticated` holds DELETE/UPDATE(all cols)
--    that no policy should ever satisfy. We close that at the privilege
--    layer too (defense-in-depth; append-only §3.1 enforced by BOTH grant
--    and policy):
--      • anon / public: zero privileges on all three tables (§4 — anon must
--        have zero access; RLS already yields nothing, now the grant agrees).
--      • authenticated: exactly the 0021-intended surface and no more —
--        SELECT/INSERT on conversations + messages (append-only: no UPDATE,
--        no DELETE), SELECT/INSERT + UPDATE(last_read_at) on participants
--        (the own-row last_read_at policy is the only mutation; F3 closed).
--    The SECURITY DEFINER RPCs run as the table owner and are unaffected.
revoke all on public.conversations              from anon, public;
revoke all on public.conversation_participants  from anon, public;
revoke all on public.conversation_messages      from anon, public;

revoke all on public.conversations              from authenticated;
revoke all on public.conversation_participants  from authenticated;
revoke all on public.conversation_messages      from authenticated;

grant select, insert                       on public.conversations             to authenticated;
grant select, insert                       on public.conversation_messages     to authenticated;
grant select, insert                       on public.conversation_participants to authenticated;
grant update (last_read_at)                on public.conversation_participants to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — copy-paste). Restores the exact pre-audit state.
-- NOTE: dropping the columns discards revocation history — per §3/§4.3 that
-- history is evidence; roll back only if the slice itself must be undone.
-- ─────────────────────────────────────────────────────────────────────────
--   begin;
--   -- restore the pre-audit broad grants (Supabase default) on all three tables
--   grant all on public.conversations              to anon, authenticated;
--   grant all on public.conversation_participants  to anon, authenticated;
--   grant all on public.conversation_messages      to anon, authenticated;
--   drop function if exists public.revoke_conversation_participant(uuid, uuid);
--   -- NOTE: the pre-audit function was SECURITY INVOKER and recursed
--   -- (finding F0). Rolling back restores that latent bug — prefer keeping
--   -- the SECURITY DEFINER definition even if the revocation columns are
--   -- dropped. This block restores the EXACT pre-audit state for completeness.
--   create or replace function public.is_conversation_participant(p_conversation_id uuid)
--   returns boolean language sql security invoker stable as $body$
--     select exists (
--       select 1 from public.conversation_participants cp
--        where cp.conversation_id = p_conversation_id
--          and cp.profile_id = auth.uid()
--     );
--   $body$;
--   alter table public.conversation_participants drop column if exists revoked_by;
--   alter table public.conversation_participants drop column if exists revoked_at;
--   commit;
