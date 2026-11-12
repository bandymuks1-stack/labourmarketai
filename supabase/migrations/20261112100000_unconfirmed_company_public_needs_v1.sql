-- 20261112100000_unconfirmed_company_public_needs_v1
--
-- @human-gate-approved (acknowledgement only: RED — a new anon-reachable SECURITY DEFINER
--   reader, a SECURITY DEFINER body replace of the worker board, three new SECURITY DEFINER
--   doors, a new RLS table and GRANT/REVOKE. Owner decision V-1, 2026-11-12. NOT applied.
--   Production apply is a separate owner approval via Supabase MCP apply_migration only —
--   never `supabase db push`.)
--
-- ── OWNER DECISION V-1 (2026-11-12) ──────────────────────────────────────
-- Until now a worker saw a company's need only when the company was VERIFIED (7 of 52).
-- From now on a submitted need of an UNCONFIRMED company is also shown — to workers and to
-- signed-out visitors — when (1) the required fields are filled and (2) deterministic
-- security + antispam checks pass. It is labelled "Company not confirmed" and never carries a
-- verification badge (SEP-3 EVIDENCE != VERIFICATION). A suspicious or incomplete need is HELD
-- for an operator, who approves or rejects it; the company sees that it is waiting.
--
-- ── ONE RULE, ONE PLACE ──────────────────────────────────────────────────
-- `need_public_state_v1(request_id)` is the ONLY place that decides whether a need may be
-- shown and how. Every read path calls it:
--   list_open_demand_for_workers()          worker board, web chat find-work, MCP work_find
--   list_public_company_needs_v1(...)       public /jobs section, MCP jobs_search (anon too)
--   get_my_need_public_states_v1(ids)       the company's own "waiting for review" readback
--   list_need_public_review_queue_v1()      the operator queue
--   decide_need_public_review_v1(...)       the operator decision (binds to the content)
-- States (closed set):
--   not_listed          not a submitted demand-kind need, or no company — never shown
--   verified            the company is verified — shown exactly as before (badge unchanged)
--   unconfirmed_public  unconfirmed company, every check passed (or an operator approved this
--                       exact content) — shown, labelled "Company not confirmed"
--   held_incomplete     a required field is missing — not shown, waits for the company/operator
--   held_review         an antispam / security check tripped — not shown, waits for an operator
--   rejected            an operator rejected this exact content — not shown
-- A verified company's needs are NOT re-screened: nothing visible today becomes invisible.
--
-- ── THE CHECKS (deterministic, no AI, no network) ────────────────────────
-- Required: role (>= 2 chars), country (ISO-2), a place, the company's name, the company's
--   country, and a company that is past 'draft' (activated by its owner).
-- On the text that is SHOWN (role, place, company name): a link or bare domain, an e-mail
--   address, a phone number, a messenger contact channel, or an advertising pitch. The link and
--   pitch lists are the ones the public intake already uses (lib/staffing/intake-advertising.ts).
-- On the text that is NOT shown (title, summary, notes): an advertising pitch only — a company
--   may legitimately write its own phone in its private notes.
-- Rate: more than 5 demand-kind needs from one organization in the 24 h up to this one.
-- Duplicate: the same summary (>= 40 chars, whitespace/case folded) submitted EARLIER by
--   ANOTHER organization (only the later copy is held, so copying never hides the original).
-- Disposable e-mail: the poster's sign-in address is on a disposable-mail domain.
--
-- ── OPERATOR DECISIONS ───────────────────────────────────────────────────
-- `customer_request_public_reviews` (append-only; RLS on, no policy, no client grant) holds
-- each decision with the md5 of the content it judged. A later edit of what is shown changes
-- the hash, so an approval never carries over to new text — the need is screened again.
-- WHY A NEW TABLE (doctrine §2 canonical check): `customer_requests` is writable by its owner
-- under RLS (0028 customer_requests_update), so an approval stored on that row could be set by
-- the company itself; `customer_requests.status` is the company's own lifecycle (draft ->
-- submitted -> closed, transition-guarded). The decision is the operator's act and evidence of
-- who allowed what, when — so it is its own append-only row, readable only through the doors
-- below. No translation columns, no denormalized names.
--
-- ── WHAT A SIGNED-OUT VISITOR RECEIVES (list_public_company_needs_v1) ────
-- id, role_text, country, location_label, team_size, start_period, created_at, company_name,
-- company_confirmed. Never: contact e-mail/phone, the poster, title, summary, notes, payload,
-- registration code, website, address. Max 50 rows, bounded inputs. Synthetic QA fixtures are
-- never returned.
--
-- Rollback: supabase/rollbacks/20261112100000_unconfirmed_company_public_needs_v1.down.sql

begin;

set local lock_timeout = '5s';

-- ── 1. Operator decisions (append-only) ──────────────────────────────────
create table if not exists public.customer_request_public_reviews (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.customer_requests(id) on delete cascade,
  decision     text not null check (decision in ('approved', 'rejected')),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{32}$'),
  reason       text check (reason is null or char_length(reason) <= 500),
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz not null default now()
);

comment on table public.customer_request_public_reviews is
  'Operator decisions on whether a need of an unconfirmed company may be shown publicly (owner decision V-1, 2026-11-12). Append-only; each row binds to the md5 of the content it judged. Read and written only by need_public_state_v1 and the review doors.';

-- @plan-cache-proof: n/a — the decision lookup index serves one equality probe per need (request_id + content_hash) on a table that starts empty and grows by operator clicks; no RPC term or search plan depends on it.
create index if not exists customer_request_public_reviews_request_idx
  on public.customer_request_public_reviews (request_id, decided_at desc);

alter table public.customer_request_public_reviews enable row level security;
revoke all on public.customer_request_public_reviews from public, anon, authenticated, service_role;

-- GDPR erasure v3 registry: the operator is an ACTOR on a decision about a NEED (never its
-- subject); the reference is nullable and severed by NULL with the account.
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'customer_request_public_reviews', 'decided_by', 'profiles', 'set null', 'set_null', 'engineering', false,
   'nullable reference; severed by NULL',
   'FK already SET NULL; the operator is an actor on a need decision, never its subject')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;

-- ── 2. Deterministic text checks ─────────────────────────────────────────
-- Returns the closed flags the text trips: link | email | phone | contact_channel | pitch.
create or replace function public.need_public_text_flags_v1(p_text text)
returns text[]
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select pg_catalog.array_remove(array[
    case when coalesce(p_text, '') ~* '(https?://|\mwww\.|\m[a-z0-9-]+\.(com|org|net|io|ai|co|app|biz|info|shop|site|online|world|top|xyz)\M)'
         then 'link' end,
    case when coalesce(p_text, '') ~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}'
         then 'email' end,
    case when coalesce(p_text, '') ~ '(\+[0-9][0-9 ().-]{6,}[0-9])|(\m[0-9]{3}[ .-]?[0-9]{3}[ .-]?[0-9]{3,4}\M)'
         then 'phone' end,
    case when coalesce(p_text, '') ~* '\m(whats ?app|telegram|viber|signal me|wechat)\M'
         then 'contact_channel' end,
    case when coalesce(p_text, '') ~* '(freeb2bdata|companyscout|\mb2b data\M|\mlead finder\M|[0-9][0-9.,]*\s*(million|mln)\s+(companies|people|contacts|emails|leads)|\mverified e-?mails?\M|\munlimited (csv )?exports?\M|\mexport (it|them) to csv\M|\mlifetime (access|seat|deal)\M|\mclaim your (lifetime )?seat\M|\mearn [0-9]+% commission|\munsubscribe\M|\mrank (on|in) google\M|\mguest posts?\M|\mdatabase of ([0-9.,]+\s*(million|mln)?\s*)?(companies|businesses|contacts|leads)\M|\m(lead|e-?mail|contact) lists?\M|\mopt[- ]out\M)'
         then 'pitch' end
  ], null::text)
$function$;

-- A small closed list of disposable-mail domains (exact domain or a subdomain of one).
create or replace function public.is_disposable_email_domain_v1(p_email text)
returns boolean
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select coalesce(
    (select bool_or(d = dom or d like '%.' || dom)
       from (select pg_catalog.lower(pg_catalog.split_part(coalesce(p_email, ''), '@', 2)) as d) x,
            pg_catalog.unnest(array[
              'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com',
              '10minutemail.com', 'temp-mail.org', 'tempmail.com', 'tempmail.net', 'tempail.com',
              'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc',
              'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'emailondeck.com',
              'mohmal.com', 'burnermail.io', 'spamgourmet.com', 'mailnesia.com', 'mailcatch.com',
              'moakt.com', 'tempr.email', 'discard.email', 'mytemp.email', 'grr.la'
            ]) as dom
      where x.d <> ''),
    false)
$function$;

-- ── 3. THE ONE RULE ──────────────────────────────────────────────────────
create or replace function public.need_public_state_v1(p_request_id uuid)
returns table(state text, reasons text[], company_confirmed boolean, content_hash text)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  r          public.customer_requests%rowtype;
  c          public.companies%rowtype;
  v_loc      text;
  v_name     text;
  v_hash     text;
  v_reasons  text[] := '{}';
  v_missing  boolean;
  v_shown    text[];
  v_private  text[];
  v_decision text;
  v_email    text;
  v_summary  text;
begin
  select * into r from public.customer_requests x where x.id = p_request_id;
  if not found
     or r.status <> 'submitted'
     or not (r.kind is null or r.kind in ('company_request', 'buyer_request')) then
    return query select 'not_listed'::text, '{}'::text[], false, null::text;
    return;
  end if;

  select * into c from public.companies x
   where x.id = public.demand_company_id_v1(r.organization_id, r.profile_id);
  if not found then
    return query select 'not_listed'::text, '{}'::text[], false, null::text;
    return;
  end if;

  -- A verified company is shown exactly as before; it is not re-screened.
  if c.verification_status = 'verified' then
    return query select 'verified'::text, '{}'::text[], true, null::text;
    return;
  end if;

  v_loc := coalesce(
    (select nullif(trim(coalesce(cdl.city, cdl.location_label)), '')
       from public.company_demand_locations cdl
      where cdl.request_id = r.id and cdl.active
      order by cdl.updated_at desc
      limit 1),
    nullif(trim(r.location), ''));
  v_name := coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), ''));
  v_hash := md5(concat_ws(chr(31), r.title, r.role_or_work_type, r.need_summary, r.notes,
                          v_loc, r.country, v_name));

  -- (1) required fields
  if char_length(coalesce(trim(r.role_or_work_type), '')) < 2 then v_reasons := v_reasons || 'missing_role'::text; end if;
  if coalesce(r.country, '') !~ '^[A-Z]{2}$' then v_reasons := v_reasons || 'missing_country'::text; end if;
  if v_loc is null then v_reasons := v_reasons || 'missing_location'::text; end if;
  if v_name is null then v_reasons := v_reasons || 'missing_company_name'::text; end if;
  if nullif(trim(coalesce(c.country, '')), '') is null then v_reasons := v_reasons || 'missing_company_country'::text; end if;
  -- a company still in draft was never activated by its owner
  if c.verification_status = 'draft' then v_reasons := v_reasons || 'company_draft'::text; end if;
  v_missing := cardinality(v_reasons) > 0;

  -- (2) the text that is shown: every flag
  v_shown := public.need_public_text_flags_v1(concat_ws(' ', r.role_or_work_type, v_loc, v_name));
  v_reasons := v_reasons || v_shown;
  -- the text that is not shown: an advertising pitch only
  v_private := public.need_public_text_flags_v1(concat_ws(' ', r.title, r.need_summary, r.notes));
  if 'pitch' = any(v_private) and not ('pitch' = any(v_shown)) then
    v_reasons := v_reasons || 'pitch'::text;
  end if;

  -- (3) rate of posting: more than 5 demand-kind needs from one organization in 24 h
  if (select count(*)
        from public.customer_requests o
       where coalesce(o.organization_id, o.profile_id) = coalesce(r.organization_id, r.profile_id)
         and (o.kind is null or o.kind in ('company_request', 'buyer_request'))
         and o.status <> 'draft'
         and o.created_at >  r.created_at - interval '24 hours'
         and o.created_at <= r.created_at) > 5 then
    v_reasons := v_reasons || 'rate'::text;
  end if;

  -- (4) duplicate text from another organization
  v_summary := lower(regexp_replace(trim(coalesce(r.need_summary, '')), '\s+', ' ', 'g'));
  if char_length(v_summary) >= 40 and exists (
       select 1 from public.customer_requests o
        where o.id <> r.id
          and o.status <> 'draft'
          and coalesce(o.organization_id, o.profile_id) <> coalesce(r.organization_id, r.profile_id)
          -- only the LATER copy is held: copying a company's text never hides the original
          and (o.created_at < r.created_at or (o.created_at = r.created_at and o.id < r.id))
          and lower(regexp_replace(trim(coalesce(o.need_summary, '')), '\s+', ' ', 'g')) = v_summary) then
    v_reasons := v_reasons || 'duplicate_text'::text;
  end if;

  -- (5) disposable sign-in e-mail of the poster
  select u.email into v_email from auth.users u where u.id = r.profile_id;
  if public.is_disposable_email_domain_v1(v_email) then
    v_reasons := v_reasons || 'disposable_email'::text;
  end if;

  -- An operator's decision on THIS content wins.
  select d.decision into v_decision
    from public.customer_request_public_reviews d
   where d.request_id = r.id and d.content_hash = v_hash
   order by d.decided_at desc, d.id desc
   limit 1;

  return query select
    case
      when v_decision = 'approved' then 'unconfirmed_public'
      when v_decision = 'rejected' then 'rejected'
      when cardinality(v_reasons) = 0 then 'unconfirmed_public'
      when v_missing then 'held_incomplete'
      else 'held_review'
    end::text,
    v_reasons,
    false,
    v_hash;
end
$function$;

-- Internal: called only from inside the SECURITY DEFINER doors below (as their owner).
revoke all on function public.need_public_text_flags_v1(text) from public, anon, authenticated, service_role;
revoke all on function public.is_disposable_email_domain_v1(text) from public, anon, authenticated, service_role;
revoke all on function public.need_public_state_v1(uuid) from public, anon, authenticated, service_role;

-- ── 4. Worker board — the verified-only join becomes the one rule ────────
-- Same signature, same columns, same caller gate, filters, projection, LIMIT and grants as
-- 20261029190000 (production md5 recorded there). Two changes only:
--   * the company join no longer requires verification; the WHERE admits
--     need_public_state_v1 in ('verified', 'unconfirmed_public');
--   * route_status says which: 'approved_direct_partner' (verified, as before) or
--     'unconfirmed_company' (labelled, never badged).
-- The return type is unchanged, so CREATE OR REPLACE keeps the one dependant policy
-- (demand_interest_signals_worker_insert) untouched.
CREATE OR REPLACE FUNCTION public.list_open_demand_for_workers()
 RETURNS TABLE(id uuid, role_text text, country text, team_size integer, start_period text, accommodation text, created_at timestamp with time zone, company_name text, route_status text, location_label text, transport text, required_tools text[], structured jsonb, need_skill_slugs text[], need_skill_source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid      uuid := auth.uid();
  v_worker uuid;
  v_sees_fixtures boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    return; -- not a worker -> empty, never an error surface
  end if;
  -- A synthetic QA identity keeps seeing fixtures; nobody else (20261028123000).
  v_sees_fixtures := public.is_synthetic_viewer_v1();

  return query
  select cr.id,
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         case
           when cr.payload ->> 'accommodation' in (
             'provided_free', 'provided_paid', 'provided_deducted',
             'not_provided', 'yes', 'no', 'unknown'
           ) then cr.payload ->> 'accommodation'
           else null
         end as accommodation,
         cr.created_at,
         coalesce(
           nullif(trim(c.display_name), ''),
           nullif(trim(c.legal_name), '')
         ) as company_name,
         -- V-1 (20261112100000): verified keeps its route; an unconfirmed company is named so.
         case when st.state = 'verified' then 'approved_direct_partner'
              else 'unconfirmed_company' end::text as route_status,
         coalesce(
           (select nullif(trim(coalesce(cdl.city, cdl.location_label)), '')
              from public.company_demand_locations cdl
             where cdl.request_id = cr.id
               and cdl.active
             order by cdl.updated_at desc
             limit 1),
           nullif(trim(cr.location), '')
         ) as location_label,
         case
           when cr.payload ->> 'transport' in (
             'provided', 'compensated', 'not_provided', 'unknown'
           ) then cr.payload ->> 'transport'
           else null
         end as transport,
         case
           when jsonb_typeof(cr.payload -> 'required_tools') = 'array' then
             (select array_agg(v order by v)
                from jsonb_array_elements_text(cr.payload -> 'required_tools') as v
               where v in (
                 'bulldozer-operator', 'compactor-operator', 'crane-operator',
                 'equipment-operation', 'excavator-operator',
                 'forklift-operator', 'grader-operator', 'hand-tools',
                 'loader-operator', 'scaffolding'
               ))
           else null
         end as required_tools,
         -- Worker-safe structured_v2 projection - SQL-side whitelist, never
         -- the raw payload (see demand_structured_v2_public).
         public.demand_structured_v2_public(cr.payload -> 'structured_v2')
           as structured,
         -- THE NEED'S REQUIRED SKILLS (20261029190000): catalogue slugs only,
         -- each an ACTIVE public.skills.slug — never free text.
         ns.slugs as need_skill_slugs,
         ns.source as need_skill_source
    from public.customer_requests cr
    -- THE NEED'S OWN COMPANY — the one rule (20261020010000).
    join public.companies c
      on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
    -- WHO MAY SEE IT — the one rule (20261112100000, owner decision V-1).
    cross join lateral public.need_public_state_v1(cr.id) st
    -- 1. the company's confirmed set; 2. the set derived at intake.
    left join lateral (
      select hs.slugs as human_slugs,
             ds.slugs as derived_slugs,
             case
               when cr.payload -> 'need_skills' ->> 'source' in (
                 'esco_mapped', 'recognized_from_text', 'profession_expanded'
               ) then cr.payload -> 'need_skills' ->> 'source'
               else null
             end as derived_source
        from (select array_agg(distinct v order by v) as slugs
                from jsonb_array_elements_text(
                       case
                         when jsonb_typeof(cr.payload -> 'structured_need' -> 'skill_slugs') = 'array'
                           then cr.payload -> 'structured_need' -> 'skill_slugs'
                         else '[]'::jsonb
                       end) as v
               where exists (select 1 from public.skills s
                              where s.slug = v and s.is_active is not false)) hs,
             (select array_agg(distinct v order by v) as slugs
                from jsonb_array_elements_text(
                       case
                         when jsonb_typeof(cr.payload -> 'need_skills' -> 'slugs') = 'array'
                           then cr.payload -> 'need_skills' -> 'slugs'
                         else '[]'::jsonb
                       end) as v
               where exists (select 1 from public.skills s
                              where s.slug = v and s.is_active is not false)) ds
    ) nsr on true
    cross join lateral (
      select case
               when nsr.human_slugs is not null then nsr.human_slugs
               when nsr.derived_source is not null then nsr.derived_slugs
               else null
             end as slugs,
             case
               when nsr.human_slugs is not null then 'human_structured'
               when nsr.derived_source is not null and nsr.derived_slugs is not null
                 then nsr.derived_source
               else null
             end as source
    ) ns
   where cr.status = 'submitted'
     and st.state in ('verified', 'unconfirmed_public')
     -- DIRECTION OF THE MARKET (owner window 7 section 4). A worker board
     -- shows DEMAND. agency_offer is an agency offering the people it HAS -
     -- supply - and rendering it here presents an offer as a vacancy.
     -- Closed allow-list: a future supply kind is invisible by default.
     -- The null branch keeps the pre-kind buyer-spine rows (0028).
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
     -- SYNTHETIC QA FIXTURES (20261028123000): another organization's fixture
     -- need is not market reality. Kept for the need's own people and for a
     -- synthetic viewer (lib/qa/synthetic-fixture.ts).
     and (v_sees_fixtures
          or not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)
          or cr.profile_id = uid
          or coalesce(public.has_org_demand_access(cr.organization_id), false))
   order by cr.created_at desc
   limit 100;
end
$function$;

revoke all on function public.list_open_demand_for_workers() from public, anon;
grant execute on function public.list_open_demand_for_workers() to authenticated;
revoke all on function public.list_open_demand_for_workers() from service_role;

-- ── 5. Public reader — signed-out visitors, public /jobs, MCP jobs_search ─
create or replace function public.list_public_company_needs_v1(p_query text default null, p_country text default null)
returns table(id uuid, role_text text, country text, location_label text, team_size integer,
              start_period text, created_at timestamptz, company_name text, company_confirmed boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_q       text := nullif(regexp_replace(lower(left(coalesce(p_query, ''), 80)), '[^[:alnum:] -]+', '', 'g'), '');
  v_country text := case when p_country ~ '^[A-Z]{2}$' then p_country else null end;
begin
  return query
  select cr.id,
         cr.role_or_work_type,
         cr.country,
         coalesce(
           (select nullif(trim(coalesce(cdl.city, cdl.location_label)), '')
              from public.company_demand_locations cdl
             where cdl.request_id = cr.id and cdl.active
             order by cdl.updated_at desc
             limit 1),
           nullif(trim(cr.location), '')) as location_label,
         cr.team_size,
         cr.start_period,
         cr.created_at,
         coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), '')) as company_name,
         (st.state = 'verified') as company_confirmed
    from public.customer_requests cr
    join public.companies c
      on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
    cross join lateral public.need_public_state_v1(cr.id) st
   where cr.status = 'submitted'
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
     and st.state in ('verified', 'unconfirmed_public')
     and not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)
     and (v_country is null or cr.country = v_country)
     and (v_q is null
          or strpos(lower(coalesce(cr.role_or_work_type, '')), v_q) > 0
          or strpos(lower(replace(coalesce(cr.role_or_work_type, ''), '-', ' ')), v_q) > 0)
   order by cr.created_at desc
   limit 50;
end
$function$;

revoke all on function public.list_public_company_needs_v1(text, text) from public, service_role;
grant execute on function public.list_public_company_needs_v1(p_query text, p_country text) to anon, authenticated;

-- ── 6. The company's own readback: is my need shown, held or rejected? ───
create or replace function public.get_my_need_public_states_v1(p_request_ids uuid[])
returns table(request_id uuid, state text, reasons text[])
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_request_ids is null or cardinality(p_request_ids) = 0 then
    return;
  end if;
  if cardinality(p_request_ids) > 200 then
    raise exception 'too many ids' using errcode = '22023';
  end if;

  return query
  select cr.id, st.state, st.reasons
    from public.customer_requests cr
    cross join lateral public.need_public_state_v1(cr.id) st
   where cr.id = any(p_request_ids)
     and (cr.profile_id = uid
          or coalesce(public.has_org_demand_access(cr.organization_id), false)
          or public.is_admin());
end
$function$;

revoke all on function public.get_my_need_public_states_v1(uuid[]) from public, anon, service_role;
grant execute on function public.get_my_need_public_states_v1(uuid[]) to authenticated;

-- ── 7. Operator queue (admin only) ───────────────────────────────────────
create or replace function public.list_need_public_review_queue_v1()
returns table(request_id uuid, role_text text, title text, country text, location_label text,
              company_id uuid, company_name text, created_at timestamptz, state text, reasons text[])
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  select cr.id,
         cr.role_or_work_type,
         cr.title,
         cr.country,
         coalesce(
           (select nullif(trim(coalesce(cdl.city, cdl.location_label)), '')
              from public.company_demand_locations cdl
             where cdl.request_id = cr.id and cdl.active
             order by cdl.updated_at desc
             limit 1),
           nullif(trim(cr.location), '')) as location_label,
         c.id,
         coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), '')),
         cr.created_at,
         st.state,
         st.reasons
    from public.customer_requests cr
    join public.companies c
      on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
    cross join lateral public.need_public_state_v1(cr.id) st
   where cr.status = 'submitted'
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
     and c.verification_status is distinct from 'verified'
     and st.state in ('held_incomplete', 'held_review', 'rejected')
   order by cr.created_at desc
   limit 200;
end
$function$;

revoke all on function public.list_need_public_review_queue_v1() from public, anon, service_role;
grant execute on function public.list_need_public_review_queue_v1() to authenticated;

-- ── 8. Operator decision (admin only) — binds to the current content ─────
create or replace function public.decide_need_public_review_v1(p_request_id uuid, p_decision text, p_reason text default null)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  uid     uuid := auth.uid();
  v_state text;
  v_hash  text;
begin
  if uid is null or not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  -- Serialise decisions on one need.
  perform 1 from public.customer_requests cr where cr.id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select st.state, st.content_hash into v_state, v_hash
    from public.need_public_state_v1(p_request_id) st;
  if v_state in ('not_listed', 'verified') or v_hash is null then
    raise exception 'not_reviewable' using errcode = '22023';
  end if;

  insert into public.customer_request_public_reviews (request_id, decision, content_hash, reason, decided_by)
  values (p_request_id, p_decision, v_hash, nullif(trim(p_reason), ''), uid);

  select st.state into v_state from public.need_public_state_v1(p_request_id) st;
  return v_state;
end
$function$;

revoke all on function public.decide_need_public_review_v1(uuid, text, text) from public, anon, service_role;
grant execute on function public.decide_need_public_review_v1(uuid, text, text) to authenticated;

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261112100000_unconfirmed_company_public_needs_v1.down.sql
