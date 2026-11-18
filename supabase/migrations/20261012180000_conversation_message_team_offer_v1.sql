-- @human-gate-approved  (RED: new column + SECURITY DEFINER trigger/helper + revokes; owner approval required BEFORE apply)
-- conversation_message_team_offer_v1 — which need/offer a B2B message is about,
-- inside the ONE thread a pair of people shares.
--
-- OWNER DECISION 3 (2026-10-12, refined): do not apply the conversations
-- source_type widening (#2319 first draft); choose the minimal safe RED with
-- `conversation_messages.team_offer_id`. The SERVER must verify that the offer
-- belongs to that conversation and that the participants may see it. Keep one
-- thread per pair and the whole history.
--
-- WHY. One direct thread per pair is the rule (getOrCreateDirectConversation
-- dedupe), so two companies that negotiate two offers (two needs, or two
-- brigades) do it in ONE conversation. `conversations.source_*` holds one
-- source per thread, so it cannot say which message is about which offer. A
-- per-message label can, and it never splits or rewrites the thread.
--
-- WHAT.
--   1. `conversation_messages.team_offer_id uuid NULL` → team_demand_offers(id)
--      ON DELETE SET NULL (an offer that disappears never deletes a message;
--      the history stays whole). Partial index for the per-thread read.
--      Nullable and additive: every existing row and every existing insert
--      (which never names it) is unchanged.
--   2. `team_offer_side_of_profile_v1(offer, profile)` — INTERNAL helper (no
--      role may execute it; only the trigger below, as definer). The SAME
--      party rule as team_offer_party_side_v1 (applied 20261011200000) but for
--      a named profile instead of auth.uid(): supplier = owner / manager of the
--      offering organization (manages_organization's two sources); receiver =
--      the need's owner or a demand-access holder of the need's organization
--      (team_offer_receiver_v1 → has_org_demand_access). Mirrors are pinned by
--      apps/web/lib/guards/conversation-message-team-offer-v1.test.ts.
--   3. BEFORE INSERT OR UPDATE OF team_offer_id trigger. A non-null label is
--      accepted ONLY when ALL hold, else the statement fails (42501):
--        a. the row's author is the caller (auth.uid());
--        b. the author is a party of that offer (canonical
--           team_offer_party_side_v1, in the author's own session);
--        c. the author is an active (non-revoked) participant of the thread;
--        d. the thread holds at least one OTHER active participant who is a
--           party of the OPPOSITE side of the same offer — i.e. this thread
--           is a conversation between the two sides of THIS offer. A label
--           for an offer from another pair, or an offer the author is not
--           party to, is refused by the database, whatever the client sends.
--
-- READ SIDE. RLS on conversation_messages is unchanged (participants read the
-- row, so they see the uuid). What the offer IS (need / brigade / status) is
-- shown only through team_offer_thread_party_v1 (applied, party-gated): a
-- participant who is not a party sees no details.
--
-- NOT CHANGED: conversations, conversations_source_type_check (the first #2319
-- draft is withdrawn), every policy, every table grant, team_offer_thread_party_v1.
--
-- ROLLBACK: supabase/rollbacks/20261012180000_conversation_message_team_offer_v1.down.sql
-- (only while NO message carries a label: then everything goes. With labels it
-- refuses — labels are history, and the column never stays without its guard).

begin;

alter table public.conversation_messages
  add column if not exists team_offer_id uuid
    references public.team_demand_offers(id) on delete set null;

create index if not exists conversation_messages_team_offer_idx
  on public.conversation_messages (conversation_id, team_offer_id)
  where team_offer_id is not null;

create or replace function public.team_offer_side_of_profile_v1(p_offer_id uuid, p_profile uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o record;
begin
  if p_offer_id is null or p_profile is null then
    return null;
  end if;
  select t.team_org_id, t.request_id into o
    from public.team_demand_offers t where t.id = p_offer_id;
  if not found then
    return null;
  end if;
  if exists (select 1 from public.organizations g
              where g.id = o.team_org_id and g.owner_profile_id = p_profile)
     or exists (select 1 from public.engagement_contexts ec
                 where ec.profile_id = p_profile
                   and ec.organization_id = o.team_org_id
                   and ec.status = 'active'
                   and ec.relationship_slug in ('manager','owner','external_manager'))
     or exists (select 1 from public.company_memberships m
                 where m.profile_id = p_profile
                   and m.organization_id = o.team_org_id
                   and m.status = 'active'
                   and m.role in ('owner','admin','manager','external_manager')) then
    return 'supplier';
  end if;
  if exists (select 1 from public.customer_requests cr
              where cr.id = o.request_id
                and (cr.profile_id = p_profile
                     or (cr.organization_id is not null
                         and exists (select 1 from public.company_memberships m
                                      where m.profile_id = p_profile
                                        and m.organization_id = cr.organization_id
                                        and m.status = 'active'
                                        and m.role in ('owner','admin','manager','external_manager'))))) then
    return 'receiver';
  end if;
  return null;
end;
$$;

revoke all on function public.team_offer_side_of_profile_v1(uuid, uuid) from public;
revoke all on function public.team_offer_side_of_profile_v1(uuid, uuid) from anon;
revoke all on function public.team_offer_side_of_profile_v1(uuid, uuid) from authenticated;

create or replace function public.conversation_message_team_offer_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_side text;
begin
  if new.team_offer_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.team_offer_id is not distinct from old.team_offer_id then
    return new;
  end if;
  -- a. the label is the author's own statement, in the author's own session.
  if uid is null or new.author_id is distinct from uid then
    raise exception 'team_offer_label_refused: not the author' using errcode = '42501';
  end if;
  -- b. the author is a party of the offer (the canonical, applied rule).
  v_side := public.team_offer_party_side_v1(new.team_offer_id);
  if v_side is null then
    raise exception 'team_offer_label_refused: not a party' using errcode = '42501';
  end if;
  -- c. the author is in this thread.
  if not exists (select 1 from public.conversation_participants cp
                  where cp.conversation_id = new.conversation_id
                    and cp.profile_id = uid
                    and cp.revoked_at is null) then
    raise exception 'team_offer_label_refused: not a participant' using errcode = '42501';
  end if;
  -- d. the other side of THIS offer is in this thread.
  if not exists (select 1 from public.conversation_participants cp
                  where cp.conversation_id = new.conversation_id
                    and cp.profile_id <> uid
                    and cp.revoked_at is null
                    and public.team_offer_side_of_profile_v1(new.team_offer_id, cp.profile_id) is not null
                    and public.team_offer_side_of_profile_v1(new.team_offer_id, cp.profile_id) <> v_side) then
    raise exception 'team_offer_label_refused: offer not in this conversation' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.conversation_message_team_offer_guard_v1() from public;
revoke all on function public.conversation_message_team_offer_guard_v1() from anon;
revoke all on function public.conversation_message_team_offer_guard_v1() from authenticated;

drop trigger if exists conversation_messages_team_offer_guard on public.conversation_messages;
create trigger conversation_messages_team_offer_guard
  before insert or update of team_offer_id on public.conversation_messages
  for each row execute function public.conversation_message_team_offer_guard_v1();

commit;
