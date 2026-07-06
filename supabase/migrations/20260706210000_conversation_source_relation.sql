-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260706210000 — conversation source relation v1 (owner said YES to the
-- decision sheet docs/launch/conversation-source-relation-owner-decision-v1.md;
-- design per docs/launch/conversation-source-relation-review-pack-v1.md §6).
--
-- PROBLEM: public.conversations stores only a free-text subject, so a thread
-- opened from a booking, a service request, a demand shortlist or a demand
-- interest all look identical. The app cannot honestly say which one it came
-- from and cannot link back to it — the UI shows a deliberately neutral
-- "About work" label forever (heuristic guessing from subject text was
-- considered and REJECTED as fake UI).
--
-- SOLUTION (two parts, both additive):
--   1. Two NULLABLE columns on public.conversations —
--      source_type (text, CHECK-constrained to the closed set of the four
--      sanctioned context callers) + source_id (uuid, NO FK — four possible
--      parent tables; validated by the reader RPC, never trusted raw).
--      Existing rows stay NULL forever: no backfill, no guessing,
--      forward-only. Written ONLY by the abuse-caps-pinned
--      createConversation (apps/web/lib/communication/actions.ts) via an
--      optional sourceHint stamped by the four gated context callers AFTER
--      their own server-side gate held — stamping cannot mint permission.
--   2. ONE participant-scoped SECURITY DEFINER reader RPC,
--      conversation_source_context(p_conversation_ids uuid[]), modelled
--      exactly on the approved conversation_counterpart_identities
--      (20260705170000). Re-checked at fire time per row:
--        * the CALLER is an unrevoked participant
--          (public.is_conversation_participant, the existing SECURITY
--          DEFINER helper from 20260612170000);
--        * the source row still exists and carries a non-empty title —
--          a gone/unreadable source row is simply OMITTED, so the UI
--          degrades to today's neutral label (honest degradation, no
--          fabrication).
--      It returns ONLY a display title + an app-route discriminator.
--      RAW source_id NEVER reaches the client.
--
-- PRIVACY BOUNDARY (the function projection IS the boundary):
--   * EXPOSES only: source_type (closed set), the source row's display title
--     (demand title / offering title / booking role_text — the same string
--     the thread subject already snapshotted at creation), and a route-hint
--     token ('bookings' / 'service_requests' / 'company_scouting').
--   * The 'company_scouting' hint is returned ONLY to the demand owner
--     (customer_requests.profile_id = auth.uid()); the worker participant
--     gets a NULL hint (label without a link) — no cross-role route leak.
--   * NEVER exposes source_id, profile ids, contact channels, or any other
--     source-row field. No broad table SELECT, no anon/public grant,
--     no using(true).
--   * Unauthenticated → auth.uid() is null → is_conversation_participant is
--     false for every row → 0 rows.
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   * NO new or changed RLS policy on public.conversations — the columns
--     ride the existing participant-scoped SELECT policy and the
--     created_by = auth.uid() INSERT policy from 0021_communication.sql;
--   * NO foreign key on source_id (four possible parent tables — the RPC
--     validates liveness instead);
--   * NO backfill / data migration of existing rows (permanently NULL);
--   * NO table grants, NO trigger, NO destructive statement of any kind.
--
-- DRAFT — needs-human-gate. TIER: owner-gated (SECURITY DEFINER + GRANT +
-- ALTER TABLE are RED-class by the migration-safety rules), so this PR ships
-- as a needs-human-gate DRAFT with the exact SQL; the owner reviews it, adds
-- the approval marker, merges, and applies manually via Supabase MCP —
-- never db push. Until applied the app degrades honestly: the stamped insert
-- sees 42703 (undefined column) and falls back to the current no-source
-- insert; the reader sees 42883 (undefined function) and returns an empty
-- map, so the UI keeps today's neutral label. No errors, no fake state.
--
-- ROLLBACK: supabase/rollbacks/20260706210000_conversation_source_relation.down.sql
-- (drops the RPC + the two columns; the columns are new and nullable, so the
-- rollback loses only the new relation stamps — see the rollback header).
-- ============================================================================

begin;

-- 1) The relation columns — nullable, additive-only, no default, no FK.
--    Closed source_type set = the four sanctioned context callers (review
--    pack §1.3 rows 2-5); NULL = generic / support / pre-migration thread.
alter table public.conversations
  add column source_type text
    check (source_type in
      ('scouting','accepted_service_request','demand_interest','accepted_booking')),
  add column source_id uuid;

comment on column public.conversations.source_type is
  'Which sanctioned context caller opened the thread (scouting / accepted_service_request / demand_interest / accepted_booking); null = generic / support / pre-migration. Forward-only: existing rows stay null.';
comment on column public.conversations.source_id is
  'Row id in the source table implied by source_type; validated live by the conversation_source_context RPC, never trusted raw and never returned to the client. No FK (four possible parent tables).';

-- 2) The participant-scoped reader. One row per qualifying conversation id,
--    carrying ONLY source_type + a live-resolved display title + a route-hint
--    token. The WHERE clause is the authority + liveness check, evaluated per
--    call; a missing/unreadable/blank-title source row yields NO row (the UI
--    then degrades to the neutral label).
create or replace function public.conversation_source_context(p_conversation_ids uuid[])
returns table (
  conversation_id   uuid,
  source_type       text,
  source_title      text,
  source_route_hint text
)
language sql security definer set search_path = public stable as $$
  select
    c.id,
    c.source_type,
    src.source_title,
    src.source_route_hint
  from public.conversations c
  join lateral (
    -- scouting / demand_interest → the demand row (customer_requests).
    -- The scouting route hint goes ONLY to the demand owner; the worker
    -- participant gets a null hint (label without a link).
    select
      cr.title as source_title,
      case when cr.profile_id = auth.uid() then 'company_scouting' end
        as source_route_hint
    from public.customer_requests cr
    where c.source_type in ('scouting', 'demand_interest')
      and cr.id = c.source_id
    union all
    -- accepted_service_request → the accepted marketplace request's offering
    -- title. Both buyer and provider share the same list route.
    select
      so.title as source_title,
      'service_requests' as source_route_hint
    from public.service_offering_requests sor
    join public.service_offerings so on so.id = sor.offering_id
    where c.source_type = 'accepted_service_request'
      and sor.id = c.source_id
    union all
    -- accepted_booking → the booking row's role_text. Both company and
    -- worker share the same list route.
    select
      br.role_text as source_title,
      'bookings' as source_route_hint
    from public.booking_requests br
    where c.source_type = 'accepted_booking'
      and br.id = c.source_id
  ) src on true
  where c.id = any(p_conversation_ids)
    and c.source_type is not null
    and c.source_id is not null
    and nullif(btrim(coalesce(src.source_title, '')), '') is not null
    and public.is_conversation_participant(c.id);
$$;

revoke all on function public.conversation_source_context(uuid[]) from public;
revoke all on function public.conversation_source_context(uuid[]) from anon;
grant execute on function public.conversation_source_context(uuid[]) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — see
-- supabase/rollbacks/20260706210000_conversation_source_relation.down.sql).
-- Drops the function and the two nullable columns; only the new relation
-- stamps are lost — every pre-existing conversation field is untouched.
-- ─────────────────────────────────────────────────────────────────────────
