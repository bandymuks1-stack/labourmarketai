-- @human-gate-approved  (RED: replaces a CHECK constraint; owner-approved scope A on 2026-10-12, NOT applied to prod without a separate final approval)
-- team_offer_conversation_source_v1 — allow `team_offer` as a conversation source type.
--
-- OWNER DECISION 3, variant A (2026-10-12): narrow RED DB change for the B2B
-- conversation need/offer context. Scope = widen conversations_source_type_check
-- by exactly ONE member. Nothing else: no column, no function, no policy, no
-- grant, no RLS change (explicitly not widened to other RED items).
--
-- BEFORE: source_type in ('scouting','accepted_service_request','demand_interest','accepted_booking')
-- AFTER : the same four + 'team_offer'
--
-- Every existing row stays valid (strict superset; NULL stays allowed).
-- The one-thread-per-pair rule is unchanged (dedupe lives in the app).
--
-- -- ROLLBACK
-- supabase/rollbacks/20261012180000_team_offer_conversation_source_v1.down.sql
-- (refuses while any conversation carries source_type = 'team_offer').

begin;

alter table public.conversations
  drop constraint if exists conversations_source_type_check;

alter table public.conversations
  add constraint conversations_source_type_check
  check (source_type in ('scouting', 'accepted_service_request', 'demand_interest', 'accepted_booking', 'team_offer'));

commit;
