-- ============================================================================
-- APPLIED to prod via Supabase MCP apply_migration after owner + Chat Claude
-- review (2026-06-11, ledger version 20260611091820). Never `db push`.
--
-- S5 agency demand visibility — the narrowest possible bridge that lets an
-- AGENCY see open demand and raise a hand, with NO RLS widening:
--
--   public.list_open_demand_for_agencies() -> setof curated row
--     Caller gate: the caller OWNS an agency (agencies.profile_id =
--     auth.uid()). Returns ONLY status='submitted' customer_requests and
--     ONLY a curated, non-personal column set (role text, country, team
--     size, start period, duration, created_at) — never profile_id, never
--     contact data, never the free-text notes. Definer read; the
--     customer_requests SELECT RLS (owner-or-admin, 0028) stays untouched.
--
--   public.mark_agency_can_offer(p_request_id, p_note) -> text
--     "Galim pasiūlyti" — an agency PROPOSAL marker, NEVER a match: it
--     appends one entry to payload.agency_offers (append-only array; an
--     existing entry is never modified) and writes an audit_logs row. It
--     never touches status, manual_review_note or payload.match_log — the
--     match decision stays a HUMAN act at the admin workbench/draft board
--     (doctrine §7; workbench guard pins the human rule).
--     Outcomes: 'marked' | 'already_marked' | 'not_agency' |
--     'request_not_found' | 'request_not_open'.
--
-- Doctrine §4: default-closed preserved — visibility goes through a gated
-- DEFINER function with a curated projection, not through a policy. §19:
-- nothing here ranks anything; the list is recency-ordered facts.
-- ROLLBACK at the bottom (new functions only; fully reversible).
-- ============================================================================

begin;

-- ── list_open_demand_for_agencies: curated open-demand read ───────────────
create or replace function public.list_open_demand_for_agencies()
returns table (
  id               uuid,
  role_text        text,
  country          text,
  team_size        int,
  start_period     text,
  duration         text,
  created_at       timestamptz,
  can_offer_marked boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_agency uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select a.id into v_agency from public.agencies a where a.profile_id = uid;
  if v_agency is null then
    return; -- not an agency owner → empty, never an error surface
  end if;

  return query
  select cr.id,
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         cr.duration,
         cr.created_at,
         exists (
           select 1
           from jsonb_array_elements(
                  coalesce(cr.payload -> 'agency_offers', '[]'::jsonb)
                ) o
           where o ->> 'agency_id' = v_agency::text
         )
    from public.customer_requests cr
   where cr.status = 'submitted'
   order by cr.created_at desc
   limit 100;
end $$;

revoke all on function
  public.list_open_demand_for_agencies() from public;
grant execute on function
  public.list_open_demand_for_agencies() to authenticated;

-- ── mark_agency_can_offer: append-only proposal marker (never a match) ────
create or replace function public.mark_agency_can_offer(
  p_request_id uuid,
  p_note       text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_agency uuid;
  v_name   text;
  v_status text;
  v_marked boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select a.id, a.legal_name into v_agency, v_name
    from public.agencies a where a.profile_id = uid;
  if v_agency is null then
    return 'not_agency';
  end if;

  select cr.status,
         exists (
           select 1
           from jsonb_array_elements(
                  coalesce(cr.payload -> 'agency_offers', '[]'::jsonb)
                ) o
           where o ->> 'agency_id' = v_agency::text
         )
    into v_status, v_marked
    from public.customer_requests cr
   where cr.id = p_request_id;
  if not found then
    return 'request_not_found';
  end if;
  if v_status is distinct from 'submitted' then
    return 'request_not_open';
  end if;
  if v_marked then
    return 'already_marked';
  end if;

  -- Append-only: existing offers are never modified; status / match_log /
  -- manual_review_note are never touched here.
  update public.customer_requests
     set payload = jsonb_set(
           coalesce(payload, '{}'::jsonb),
           '{agency_offers}',
           coalesce(payload -> 'agency_offers', '[]'::jsonb)
             || jsonb_build_object(
                  'agency_id', v_agency::text,
                  'agency_name', v_name,
                  'marked_at', now(),
                  'note', nullif(btrim(coalesce(p_note, '')), '')))
   where id = p_request_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'agency_can_offer', 'customer_requests', p_request_id,
          jsonb_build_object('agency_id', v_agency,
                             'note', nullif(btrim(coalesce(p_note, '')), '')));

  return 'marked';
end $$;

revoke all on function
  public.mark_agency_can_offer(uuid, text) from public;
grant execute on function
  public.mark_agency_can_offer(uuid, text) to authenticated;

commit;

-- ROLLBACK (reverse SQL — new functions only; reversible):
-- drop function if exists public.mark_agency_can_offer(uuid, text);
-- drop function if exists public.list_open_demand_for_agencies();
