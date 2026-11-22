-- 20261122160000_open_need_messaging_v1
--
-- RED tier (needs-human-gate). NOT applied to any shared database. Production
-- apply only via Supabase MCP apply_migration after the owner approves THIS
-- migration by name.
--
-- WHY (owner decision A, 2026-11-22 — messaging about an open need, decision
-- 0033 direct counterparty; owner option 1 of 2026-11-22: hide it IN THE
-- THREADS, at the server): an agency, subcontractor or brigade may write to the
-- client about an OPEN NEED without the client's identity being revealed. The
-- client answers in the same in-app conversation; its identity stays hidden
-- from the provider until the client itself chooses to show it.
--
-- THE RULE: hiding a name on screen is not enough. Any signed-in user can map a
-- profile id to a company (companies.profile_id is a discovery column), so the
-- provider must not RECEIVE the client's profile id from any read — not from
-- the door, not from participant rows, not from message authors, not from
-- attachment paths.
--
-- ONE QUESTION, ABOUT THE CALLER ONLY: open_need_viewer_blinded_v1(conversation)
-- is true when the caller is a participant of an UNDISCLOSED 'open_need' thread
-- and is NOT the need's owner. It never takes a candidate profile id, so it
-- cannot be used as an oracle ("is this profile the client?").
--
-- WHAT — the existing conversation system, no second channel:
--   1. conversations.source_type gains ONE member, 'open_need' (source_id =
--      customer_requests.id). The CHECK is recreated with the four others.
--   2. open_need_identity_disclosures — one row per thread once the client has
--      chosen to show its name. Participants read it; only function 5 writes.
--   3. open_need_viewer_blinded_v1 / open_need_caller_hidden_v1 — the two
--      caller-only questions the policies below ask.
--   4. open_need_conversation_open_v1(request, org) — the provider's door. The
--      board's own gate (list_open_demand_for_team_offer_v1, called) must hold;
--      the database then finds the caller's existing open-need thread for that
--      need or creates one (both participants, stamped 'open_need', the same
--      24 h / 20 cap as every new conversation) and returns ONLY its id. Never
--      a thread the two already share (that would link the need to a person).
--   5. disclose_open_need_identity_v1(conversation) — only the need's owner.
--   6. RLS, narrowed (never widened):
--      conversation_participants_select — a blinded caller sees only its own
--        row (the client's row — profile id, read receipt — stays out);
--      conversation_messages_select — a blinded caller reads only its OWN
--        messages from the table;
--      conversation_messages_visible_v1 — the ONE read of a thread's messages
--        for the app: every column, the same participant gate, and for a
--        blinded caller the other side's author_id replaced by a stable
--        per-thread pseudonymous id (mine / theirs and unread still work; the
--        real author stays stored for audit);
--      attachments — an undisclosed client cannot upload (storage path and
--        uploader_id would carry its id): storage insert policy + a trigger.
--   7. conversation_live_recipients_v1 — service_role only: the live
--      recipients of a sender's message, so the server can notify a hidden
--      client without the provider's session ever reading it.
--   8. conversation_counterpart_identities — the need owner is 'Client ' + six
--      characters of the need id until disclosure (one new first branch).
--   9. conversation_source_context — one 'open_need' branch.
--  10. list_open_demand_for_team_offer_v1 — company_name is NULL.
--
--  11. The other doors found by the independent review (R2): each answer is
--      narrowed, nothing else changes —
--      revoke_conversation_participant refuses every non-admin in an
--        open-need thread (one constant answer: no guess test, no kick-out);
--      my_direct_conversations_with_workers_v1 skips threads the caller is
--        blinded in;
--      team_offer_thread_party_v1 / list_team_demand_offers_for_team_v1 name
--        the client to the supplier only once the client ACCEPTED the offer;
--      send_work_instruction(_to_project) never reuses an open-need thread.
--
-- NOT CHANGED: conversations policies; participants/messages INSERT and UPDATE
-- policies; profiles / customer_requests / companies; team_demand_offers;
-- offer_team_to_demand_v1. The need's own free-text title is the client's
-- words and is shown as it is on the board.
--
-- Rollback: supabase/rollbacks/20261122160000_open_need_messaging_v1.down.sql
-- Apply via Supabase MCP apply_migration only.

begin;

-- 1) The closed source set gains 'open_need'.
alter table public.conversations drop constraint if exists conversations_source_type_check;
alter table public.conversations
  add constraint conversations_source_type_check
    check (source_type in
      ('scouting','accepted_service_request','demand_interest','accepted_booking','open_need'));

-- 2) The client's own choice to be named in one open-need thread.
create table if not exists public.open_need_identity_disclosures (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  disclosed_by    uuid not null references public.profiles(id) on delete cascade,
  disclosed_at    timestamptz not null default now()
);
alter table public.open_need_identity_disclosures enable row level security;
revoke all on table public.open_need_identity_disclosures from public, anon, authenticated;
grant select on table public.open_need_identity_disclosures to authenticated;
drop policy if exists open_need_identity_disclosures_select on public.open_need_identity_disclosures;
create policy open_need_identity_disclosures_select on public.open_need_identity_disclosures
  for select to authenticated
  using (public.is_conversation_participant(conversation_id));
-- No insert / update / delete policy: written only by the function below.

-- GDPR erasure v3 registry: the person's own choice; deleted with the account
-- (the client is then unnamed again — the safe direction).
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'open_need_identity_disclosures', 'disclosed_by', 'profiles', 'cascade', 'allow_cascade', 'engineering', false,
   'Art. 17(1)(a)/(b): the person''s own choice to show their name in one thread; deleted with the account',
   'no domain state; deleting it hides the name again')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;

-- 3) The two caller-only questions.
create or replace function public.open_need_viewer_blinded_v1(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Keyed on the THREAD, not on the live need: the door's caller (created_by)
  -- is the provider. Deleting or re-owning the need never un-blinds it.
  select exists (
    select 1
      from public.conversations c
      join public.conversation_participants me
        on me.conversation_id = c.id and me.profile_id = auth.uid()
     where c.id = p_conversation_id
       and c.source_type = 'open_need'
       and c.created_by = auth.uid()
       and not exists (select 1 from public.open_need_identity_disclosures d
                        where d.conversation_id = c.id)
  );
$$;
revoke all on function public.open_need_viewer_blinded_v1(uuid) from public, anon;
grant execute on function public.open_need_viewer_blinded_v1(uuid) to authenticated;

create or replace function public.open_need_caller_hidden_v1(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- The caller is the hidden side: a participant of an undisclosed open-need
  -- thread that it did not open.
  select exists (
    select 1
      from public.conversations c
      join public.conversation_participants me
        on me.conversation_id = c.id and me.profile_id = auth.uid()
     where c.id = p_conversation_id
       and c.source_type = 'open_need'
       and c.created_by is distinct from auth.uid()
       and not exists (select 1 from public.open_need_identity_disclosures d
                        where d.conversation_id = c.id)
  );
$$;
revoke all on function public.open_need_caller_hidden_v1(uuid) from public, anon;
grant execute on function public.open_need_caller_hidden_v1(uuid) to authenticated;

-- 4) The provider's door: the database opens the thread and returns its id only.
create or replace function public.open_need_conversation_open_v1(p_request_id uuid, p_org_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  uid     uuid := auth.uid();
  v_owner uuid;
  v_title text;
  v_id    uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  -- The board gate, called: zero rows unless the caller manages p_org_id and
  -- the need is open, verified, not its own and offerable to that org.
  if not exists (
    select 1 from public.list_open_demand_for_team_offer_v1(p_org_id) b
     where b.request_id = p_request_id
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select cr.profile_id,
         left(coalesce(nullif(btrim(cr.role_or_work_type), ''), nullif(btrim(cr.title), '')), 120)
    into v_owner, v_title
    from public.customer_requests cr
   where cr.id = p_request_id;
  if v_owner is null or v_owner = uid then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- The caller's own open-need thread about THIS need, if any.
  select c.id into v_id
    from public.conversations c
    join public.conversation_participants me
      on me.conversation_id = c.id and me.profile_id = uid and me.revoked_at is null
   where c.source_type = 'open_need' and c.source_id = p_request_id
   order by c.created_at
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- The same abuse cap as every new conversation (lib/communication/rate-caps.ts).
  if (select count(*) from public.conversations
       where created_by = uid and created_at >= now() - interval '24 hours') >= 20 then
    raise exception 'rate limited' using errcode = 'P0001';
  end if;

  insert into public.conversations (subject, kind, created_by, source_type, source_id)
  values (v_title, 'direct', uid, 'open_need', p_request_id)
  returning id into v_id;
  insert into public.conversation_participants (conversation_id, profile_id, added_by)
  values (v_id, uid, uid), (v_id, v_owner, uid);
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'open_need_conversation_opened_v1', 'conversations', v_id,
          jsonb_build_object('request_id', p_request_id, 'org_id', p_org_id));
  return v_id;
end $$;
revoke all on function public.open_need_conversation_open_v1(uuid, uuid) from public, anon;
grant execute on function public.open_need_conversation_open_v1(uuid, uuid) to authenticated;

-- 5) The client shows its name in one thread.
create or replace function public.disclose_open_need_identity_v1(p_conversation_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  v_new integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.conversations c
      join public.customer_requests cr on cr.id = c.source_id
      join public.conversation_participants cp
        on cp.conversation_id = c.id and cp.profile_id = uid and cp.revoked_at is null
     where c.id = p_conversation_id
       and c.source_type = 'open_need'
       and cr.profile_id = uid
  ) then
    -- Same answer for "no such thread" and "not yours".
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.open_need_identity_disclosures (conversation_id, disclosed_by)
  values (p_conversation_id, uid)
  on conflict (conversation_id) do nothing;
  get diagnostics v_new = row_count;
  if v_new > 0 then
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'open_need_identity_disclosed_v1', 'conversations', p_conversation_id, '{}'::jsonb);
  end if;
  return true;
end $$;
revoke all on function public.disclose_open_need_identity_v1(uuid) from public, anon;
grant execute on function public.disclose_open_need_identity_v1(uuid) to authenticated;

-- 8) Conversation names: the client is hidden in an open-need thread until it
--    discloses. Every other branch is the 20261018160000 body unchanged.
create or replace function public.conversation_counterpart_identities(p_conversation_ids uuid[])
returns table (conversation_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select cp.conversation_id,
         case
           -- OPEN NEED (20261122160000): the need's owner is not named to the
           -- provider until the owner discloses in THIS thread.
           when c.source_type = 'open_need'
                and cp.profile_id is distinct from c.created_by
                and not exists (select 1 from public.open_need_identity_disclosures d
                                 where d.conversation_id = c.id)
             then 'Client ' || upper(left(regexp_replace(c.source_id::text, '[^a-zA-Z0-9]', '', 'g'), 6))
           -- Only CANDIDATE threads hide a name: threads about a demand (scouting / demand interest),
           -- and only the participant who is the CANDIDATE on that demand (an interest or shortlist row
           -- on c.source_id) — whoever opened the thread. The employer side is never hidden, and every
           -- other thread (colleagues, own employer, buyer / provider, support) is unchanged.
           when coalesce(c.source_type, '') not in ('scouting', 'demand_interest') then p.full_name
           when w.id is null then p.full_name
           when not (
             exists (select 1 from public.demand_interest_signals i
                      where i.request_id = c.source_id and i.worker_id = w.id)
             or exists (select 1 from public.demand_shortlist s
                         where s.request_id = c.source_id and s.worker_id = w.id)
           ) then p.full_name
           when public.caller_has_worker_relation_v1(w.id) then p.full_name
           when exists (
             select 1
               from (select distinct on (e.recipient_organization_id, e.context_type, e.context_id)
                            e.action, e.selected_fields, e.consent_text_version, e.recipient_organization_id
                       from public.privacy_consent_events e
                      where e.user_id = cp.profile_id and e.purpose = 'employer_data_disclosure'
                      order by e.recipient_organization_id, e.context_type, e.context_id,
                               e.created_at desc, e.seq desc) l
               join public.privacy_consent_purposes pp on pp.purpose = 'employer_data_disclosure'
              where l.action = 'granted'
                and l.consent_text_version = pp.current_version
                and l.selected_fields ? 'full_name'
                and public.manages_organization(l.recipient_organization_id)
           ) then p.full_name                                     -- the worker's own disclosure grant
           else 'Candidate ' || upper(left(regexp_replace(w.id::text, '[^a-zA-Z0-9]', '', 'g'), 6))
         end
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  join public.profiles p on p.id = cp.profile_id
  left join public.workers w on w.profile_id = cp.profile_id
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

-- 9) Source context: one more branch for 'open_need' (placed right after the
--    other customer_requests branch; every other branch unchanged).
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
    select
      cr.title as source_title,
      case when cr.profile_id = auth.uid() then 'company_scouting' end
        as source_route_hint
    from public.customer_requests cr
    where c.source_type in ('scouting', 'demand_interest')
      and cr.id = c.source_id
    union all
    -- open_need (20261122160000) → the need's role or title; the need owner
    -- gets the route to its needs, the provider gets no route.
    select
      coalesce(nullif(btrim(cr.role_or_work_type), ''), cr.title) as source_title,
      case when cr.profile_id = auth.uid() then 'company_needs' end
        as source_route_hint
    from public.customer_requests cr
    where c.source_type = 'open_need'
      and cr.id = c.source_id
    union all
    select
      so.title as source_title,
      'service_requests' as source_route_hint
    from public.service_offering_requests sor
    join public.service_offerings so on so.id = sor.offering_id
    where c.source_type = 'accepted_service_request'
      and sor.id = c.source_id
    union all
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

-- 10) The board no longer names the client (same signature; company_name NULL).
CREATE OR REPLACE FUNCTION public.list_open_demand_for_team_offer_v1(p_team_org_id uuid)
 RETURNS TABLE(request_id uuid, role_text text, country text, team_size integer, start_period text, company_name text, created_at timestamp with time zone, open_offer_id uuid, open_offer_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_sees_fixtures boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not coalesce((
       exists (select 1 from public.organizations o
                where o.id = p_team_org_id
                  and o.organization_type in ('team', 'company', 'agency'))
       and (public.manages_organization(p_team_org_id)
            or exists (select 1 from public.organizations o
                        where o.id = p_team_org_id and o.owner_profile_id = uid))
     ), false) then
    return;
  end if;
  v_sees_fixtures := public.is_synthetic_viewer_v1()
    or exists (select 1 from public.organizations o
                where o.id = p_team_org_id
                  and public.is_synthetic_fixture_label_v1(o.display_name, o.legal_name));

  return query
  select cr.id,
         coalesce(nullif(btrim(cr.role_or_work_type), ''), nullif(btrim(cr.title), '')),
         cr.country,
         cr.team_size,
         cr.start_period,
         -- OPEN NEED (20261122160000): the client is not named on the board.
         null::text,
         cr.created_at,
         o.id,
         o.status
    from public.customer_requests cr
    join public.companies c
      on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
     and c.verification_status = 'verified'
    left join public.team_demand_offers o
      on o.request_id = cr.id and o.team_org_id = p_team_org_id
     and o.status in ('offered', 'accepted')
   where cr.status = 'submitted'
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
     and cr.profile_id <> uid
     and not coalesce(public.has_org_demand_access(cr.organization_id), false)
     and cr.organization_id is distinct from p_team_org_id
     and (v_sees_fixtures
          or not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)
          or cr.profile_id = uid
          or coalesce(public.has_org_demand_access(cr.organization_id), false))
   order by cr.created_at desc
   limit 100;
end;
$function$;
revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from public, anon;
grant execute on function public.list_open_demand_for_team_offer_v1(uuid) to authenticated;

-- 6) RLS, narrowed: a blinded caller never reads the other side's id.
drop policy if exists conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select on public.conversation_participants for select
  using (
    profile_id = auth.uid()
    or (public.is_conversation_participant(conversation_id)
        and not public.open_need_viewer_blinded_v1(conversation_id))
    or public.is_admin()
  );

drop policy if exists conversation_messages_select on public.conversation_messages;
create policy conversation_messages_select on public.conversation_messages for select
  using (
    (public.is_conversation_participant(conversation_id)
     and (author_id = auth.uid() or not public.open_need_viewer_blinded_v1(conversation_id)))
    or public.is_admin()
  );

-- The app's one read of a thread's messages. Owner-privileged (it re-applies
-- the participant gate itself), security_barrier so no caller predicate runs
-- before the gate. For a blinded caller the other side's author is a stable
-- per-thread pseudonymous id: the real author stays in the table for audit.
create or replace view public.conversation_messages_visible_v1
  with (security_barrier = true) as
select m.id,
       m.conversation_id,
       case when m.author_id is distinct from auth.uid()
                 and public.open_need_viewer_blinded_v1(m.conversation_id)
            then md5('open_need_counterpart:' || m.conversation_id::text)::uuid
            else m.author_id
       end as author_id,
       m.body,
       m.created_at,
       m.is_instruction,
       m.original_language,
       m.target_language,
       m.translated_text,
       m.translation_status,
       m.is_clarification_request,
       m.project_id,
       m.team_offer_id
  from public.conversation_messages m
 where public.is_conversation_participant(m.conversation_id)
    or public.is_admin();
revoke all on public.conversation_messages_visible_v1 from public, anon, authenticated;
grant select on public.conversation_messages_visible_v1 to authenticated;

-- Attachments: an undisclosed client cannot upload (the storage path and
-- uploader_id would carry its profile id). After disclosure it can.
create or replace function public.conversation_id_of_path_v1(p_object_name text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  return ((storage.foldername(p_object_name))[1])::uuid;
exception when others then
  return null;
end $$;
revoke all on function public.conversation_id_of_path_v1(text) from public, anon;
grant execute on function public.conversation_id_of_path_v1(text) to authenticated;

drop policy if exists "conversation-attachments participant insert" on storage.objects;
create policy "conversation-attachments participant insert"
  on storage.objects for insert
  with check (
    bucket_id = 'conversation-attachments'
    and auth.uid() is not null
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_conversation_participant_path(name)
    and not public.open_need_caller_hidden_v1(public.conversation_id_of_path_v1(name))
  );

create or replace function public.conversation_attachment_hidden_uploader_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
      from public.conversations c
     where c.id = new.conversation_id
       and c.source_type = 'open_need'
       and c.created_by is distinct from new.uploader_id
       and not exists (select 1 from public.open_need_identity_disclosures d
                        where d.conversation_id = c.id)
  ) then
    raise exception 'attachments wait until the name is shown' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.conversation_attachment_hidden_uploader_guard_v1() from public, anon, authenticated;
drop trigger if exists conversation_attachment_hidden_uploader_guard_v1 on public.conversation_message_attachments;
create trigger conversation_attachment_hidden_uploader_guard_v1
  before insert on public.conversation_message_attachments
  for each row execute function public.conversation_attachment_hidden_uploader_guard_v1();

-- 7) Server-only: the live recipients of a sender's message (notifications).
create or replace function public.conversation_live_recipients_v1(p_conversation_id uuid, p_author_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cp.profile_id
    from public.conversation_participants cp
   where cp.conversation_id = p_conversation_id
     and cp.revoked_at is null
     and cp.profile_id <> p_author_id
     and exists (select 1 from public.conversation_participants a
                  where a.conversation_id = p_conversation_id
                    and a.profile_id = p_author_id and a.revoked_at is null);
$$;
revoke all on function public.conversation_live_recipients_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.conversation_live_recipients_v1(uuid, uuid) to service_role;

-- 11) The other doors R2 found (2026-11-22): each one answer changed, nothing else.
CREATE OR REPLACE FUNCTION public.revoke_conversation_participant(p_conversation_id uuid, p_profile_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- OPEN NEED (20261122160000): nobody but an admin removes anyone from an
  -- open-need thread. The one constant answer, before any lookup, so the
  -- provider cannot test a guessed profile id against it.
  if exists (select 1 from public.conversations c
              where c.id = p_conversation_id and c.source_type = 'open_need')
     and not public.is_admin() then
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
end $function$;
revoke all on function public.revoke_conversation_participant(uuid, uuid) from public, anon;
grant execute on function public.revoke_conversation_participant(uuid, uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_direct_conversations_with_workers_v1(p_worker_ids uuid[])
 RETURNS TABLE(worker_id uuid, conversation_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if cardinality(p_worker_ids) > 500 then
    raise exception 'Too many workers requested' using errcode = '22023';   -- never a silent empty answer
  end if;
  return query
  select w.id, mine.conversation_id
    from public.workers w
    join public.conversation_participants theirs on theirs.profile_id = w.profile_id and theirs.revoked_at is null
    join public.conversation_participants mine on mine.conversation_id = theirs.conversation_id
                                              and mine.profile_id = auth.uid() and mine.revoked_at is null
    join public.conversations c on c.id = mine.conversation_id and c.kind = 'direct'
   where auth.uid() is not null
     and w.id = any (p_worker_ids)
     -- OPEN NEED (20261122160000): a blinded caller learns nothing about who
     -- the other side of an undisclosed open-need thread is.
     and not public.open_need_viewer_blinded_v1(mine.conversation_id);
end;
$function$;
revoke all on function public.my_direct_conversations_with_workers_v1(uuid[]) from public, anon;
grant execute on function public.my_direct_conversations_with_workers_v1(uuid[]) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.team_offer_thread_party_v1(p_offer_id uuid)
 RETURNS TABLE(side text, offer_status text, counterpart_profile_id uuid, subject text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_side text;
  o      record;
begin
  if auth.uid() is null or p_offer_id is null then
    return;
  end if;
  v_side := public.team_offer_party_side_v1(p_offer_id);
  if v_side is null then
    return;
  end if;
  select t.status, t.offered_by, t.request_id, t.team_org_id into o
    from public.team_demand_offers t where t.id = p_offer_id;
  if not found then
    return;
  end if;
  return query
  select v_side,
         o.status,
         -- OPEN NEED (20261122160000): the supplier learns who the client is
         -- only once the client ACCEPTED the offer (the approved cooperation
         -- step); before that the app talks through the open-need thread.
         case when v_side = 'supplier'
              then case when o.status in ('accepted', 'assigned')
                        then (select cr.profile_id from public.customer_requests cr where cr.id = o.request_id)
                   end
              else o.offered_by
         end,
         (select nullif(btrim(g.display_name), '') from public.organizations g where g.id = o.team_org_id);
end;
$function$;
revoke all on function public.team_offer_thread_party_v1(uuid) from public, anon;
grant execute on function public.team_offer_thread_party_v1(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_team_demand_offers_for_team_v1(p_team_org_id uuid)
 RETURNS TABLE(offer_id uuid, request_id uuid, role_text text, country text, company_name text, status text, offered_at timestamp with time zone, responded_at timestamp with time zone, assignment_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not coalesce(
       public.manages_organization(p_team_org_id)
       or exists (select 1 from public.organizations g
                   where g.id = p_team_org_id and g.owner_profile_id = uid),
       false) then
    return;
  end if;
  return query
  select o.id, o.request_id,
         coalesce(nullif(btrim(cr.role_or_work_type), ''), nullif(btrim(cr.title), '')),
         cr.country,
         -- OPEN NEED (20261122160000): named only once the client accepted.
         case when o.status in ('accepted', 'assigned')
              then coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), ''))
         end,
         o.status, o.offered_at, o.responded_at, o.assignment_id
    from public.team_demand_offers o
    join public.customer_requests cr on cr.id = o.request_id
    left join public.companies c on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
   where o.team_org_id = p_team_org_id
   order by o.offered_at desc
   limit 100;
end;
$function$;
revoke all on function public.list_team_demand_offers_for_team_v1(uuid) from public, anon;
grant execute on function public.list_team_demand_offers_for_team_v1(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.send_work_instruction(p_worker_profile_id text, p_body text, p_original_language text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid       uuid := auth.uid();
  worker_pid uuid := nullif(p_worker_profile_id, '')::uuid;
  w_id      uuid;
  conv_id   uuid;
  msg_id    uuid;
  cleaned   text := nullif(trim(coalesce(p_body, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if worker_pid is null then
    raise exception 'Worker is required' using errcode = '22023';
  end if;
  if cleaned is null then
    raise exception 'Instruction text is required' using errcode = '22023';
  end if;

  select id into w_id from public.workers where profile_id = worker_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;

  -- Relationship gate: the caller must MANAGE this worker (active roster link to
  -- a company/agency the caller owns), or be an admin. Prevents instructing an
  -- unrelated worker.
  if not (
    exists (
      select 1 from public.company_workers cw
       where cw.worker_id = w_id and cw.status = 'active'
         and public.owns_company(cw.company_id)
    )
    or exists (
      select 1 from public.agency_workers aw
       where aw.worker_id = w_id and aw.status = 'active'
         and public.owns_agency(aw.agency_id)
    )
    or public.is_admin()
  ) then
    raise exception 'Not authorized to instruct this worker' using errcode = '42501';
  end if;

  -- Find an existing direct conversation that already has BOTH the caller and
  -- the worker as participants; otherwise create one and add both.
  select c.id into conv_id
    from public.conversations c
    join public.conversation_participants p1
      on p1.conversation_id = c.id and p1.profile_id = uid
    join public.conversation_participants p2
      on p2.conversation_id = c.id and p2.profile_id = worker_pid
   where c.kind = 'direct'
     -- OPEN NEED (20261122160000): an instruction never lands in, or tests,
     -- an anonymous open-need thread.
     and c.source_type is distinct from 'open_need'
   order by c.created_at asc
   limit 1;

  if conv_id is null then
    insert into public.conversations (subject, kind, created_by)
      values (null, 'direct', uid)
      returning id into conv_id;
    insert into public.conversation_participants (conversation_id, profile_id, added_by)
      values (conv_id, uid, uid), (conv_id, worker_pid, uid);
  end if;

  insert into public.conversation_messages
    (conversation_id, author_id, body, is_instruction, original_language, translation_status)
    values (conv_id, uid, left(cleaned, 10000), true,
            nullif(trim(coalesce(p_original_language, '')), ''), 'unavailable')
    returning id into msg_id;

  update public.conversations set updated_at = now() where id = conv_id;
  return msg_id;
end;
$function$;
revoke all on function public.send_work_instruction(text, text, text) from public, anon;
grant execute on function public.send_work_instruction(text, text, text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.send_work_instruction_to_project(p_worker_profile_id text, p_body text, p_original_language text DEFAULT NULL::text, p_project_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid        uuid := auth.uid();
  worker_pid uuid := nullif(p_worker_profile_id, '')::uuid;
  pid        uuid := nullif(p_project_id, '')::uuid;
  w_id       uuid;
  conv_id    uuid;
  msg_id     uuid;
  cleaned    text := nullif(trim(coalesce(p_body, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if worker_pid is null then
    raise exception 'Worker is required' using errcode = '22023';
  end if;
  if pid is null then
    raise exception 'Project is required' using errcode = '22023';
  end if;
  if cleaned is null then
    raise exception 'Instruction text is required' using errcode = '22023';
  end if;

  select id into w_id from public.workers where profile_id = worker_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;

  if not (
    (
      (
        exists (
          select 1 from public.project_worker_assignments pwa
           where pwa.project_id = pid and pwa.worker_id = w_id and pwa.status = 'active'
        )
        or coalesce(public.team_work_context_v1(worker_pid, pid), false)
      )
      and public.can_manage_project(pid)
    )
    or public.is_admin()
  ) then
    raise exception 'Not authorized to instruct this worker on this project'
      using errcode = '42501';
  end if;

  select c.id into conv_id
    from public.conversations c
    join public.conversation_participants p1
      on p1.conversation_id = c.id and p1.profile_id = uid
    join public.conversation_participants p2
      on p2.conversation_id = c.id and p2.profile_id = worker_pid
   where c.kind = 'direct'
     -- OPEN NEED (20261122160000): an instruction never lands in, or tests,
     -- an anonymous open-need thread.
     and c.source_type is distinct from 'open_need'
   order by c.created_at asc
   limit 1;

  if conv_id is null then
    insert into public.conversations (subject, kind, created_by)
      values (null, 'direct', uid)
      returning id into conv_id;
    insert into public.conversation_participants (conversation_id, profile_id, added_by)
      values (conv_id, uid, uid), (conv_id, worker_pid, uid);
  end if;

  insert into public.conversation_messages
    (conversation_id, author_id, body, is_instruction, original_language, translation_status, project_id)
    values (conv_id, uid, left(cleaned, 10000), true,
            nullif(trim(coalesce(p_original_language, '')), ''), 'unavailable', pid)
    returning id into msg_id;

  update public.conversations set updated_at = now() where id = conv_id;
  return msg_id;
end;
$function$;
revoke all on function public.send_work_instruction_to_project(text, text, text, text) from public, anon;
grant execute on function public.send_work_instruction_to_project(text, text, text, text) to authenticated, service_role;

commit;
