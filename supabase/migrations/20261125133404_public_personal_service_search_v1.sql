-- RED DRAFT / needs-human-gate. NOT APPLIED. Exact SQL review required before apply.
-- Extends service_offerings: owners explicitly choose a PUBLIC audience separately
-- from the existing signed-in marketplace status. No existing offer is opted in.
-- No raw-table grant, no organization-owner join, no changes to existing RLS.
-- Dependencies: canonical synthetic marker helper (20261028123000), existing
-- audit_logs (0001) and service closed_outcome (20261024090000).
-- Prospective lifecycle history reuses audit_logs atomically. No historical
-- backfill, private text snapshots, new audit reader or client EXECUTE grant.
-- Rollback: supabase/rollbacks/20261125133404_public_personal_service_search_v1.down.sql
-- @plan-cache-proof: scripts/db-proof/plan-cache-probe.sql via supabase/tests/20261125133404_public_personal_service_search_plan_cache.sql; auto + force_generic_plan, 10 calls x 8 terms x 2 query shapes, scratch PG16 100000 invented offers, worst 330.0 ms, final single-index draft (2026-11-25).
-- Local fixture only, not production or large-scale latency evidence.
-- Four warmed nested plans chose service_offerings_public_created_idx; the
-- unproven country index is omitted.
-- The limit bounds returned rows, not the number of rows filtered by the plan.
begin;

do $guard$
begin
  if to_regclass('public.service_offerings') is null
     or to_regclass('public.audit_logs') is null
     or to_regprocedure('public.is_synthetic_fixture_label_v1(text[])') is null
     or not exists (
       select 1 from pg_catalog.pg_attribute
       where attrelid = to_regclass('public.service_offerings')
         and attname = 'closed_outcome' and not attisdropped
     ) then
    raise exception 'public personal service search requires service_offerings with closed_outcome, audit_logs, and canonical synthetic helper';
  end if;
end
$guard$;

alter table public.service_offerings
  add column if not exists public_search_enabled boolean not null default false;
-- Rollback preserves recorded owner choices. Reapply accepts only the exact
-- original column contract; it never overwrites choices or repairs drift.
do $column_guard$
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.service_offerings'::regclass
      and a.attname = 'public_search_enabled'
      and not a.attisdropped
      and a.atttypid = 'boolean'::regtype
      and a.attnotnull
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid) = 'false'
  ) then
    raise exception 'public_search_enabled must be boolean NOT NULL DEFAULT false; existing values were not changed';
  end if;
end
$column_guard$;
comment on column public.service_offerings.public_search_enabled is
  'Owner-selected publication to signed-out visitors. False by default; active alone remains members-only.';

-- One append in the existing audit chain per real offering mutation, including
-- owner DELETE. Existing table RLS still authorizes the original write. The
-- internal definer only appends its actual OLD/NEW facts; callers cannot invoke
-- it as an RPC or supply an actor/history payload. An append failure aborts the
-- original statement too (no exception swallowing or best-effort second call).
-- Only lifecycle values and changed field NAMES survive: never title,
-- description, category, country or rate/contact text. This is prospective
-- change history, not past content versions or an automatic expiry event.
create function public.service_offering_history_v1()
returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $function$
declare
  v_before jsonb := null;
  v_after jsonb := null;
  v_changed text[] := array[]::text[];
  v_actor uuid;
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'service_offerings'
     or tg_op not in ('INSERT', 'UPDATE', 'DELETE') then
    raise exception 'service_offering_history_v1 is an internal offering trigger';
  end if;
  if tg_op <> 'INSERT' then
    v_before := jsonb_build_object(
      'status', old.status, 'closed_outcome', old.closed_outcome,
      'public_search_enabled', old.public_search_enabled, 'expires_at', old.expires_at);
  end if;
  if tg_op <> 'DELETE' then
    v_after := jsonb_build_object(
      'status', new.status, 'closed_outcome', new.closed_outcome,
      'public_search_enabled', new.public_search_enabled, 'expires_at', new.expires_at);
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(field order by field), array[]::text[])
      into v_changed
      from (values
        ('status', old.status is distinct from new.status),
        ('closed_outcome', old.closed_outcome is distinct from new.closed_outcome),
        ('public_search_enabled', old.public_search_enabled is distinct from new.public_search_enabled),
        ('expires_at', old.expires_at is distinct from new.expires_at),
        ('title', old.title is distinct from new.title),
        ('description', old.description is distinct from new.description),
        ('category_slug', old.category_slug is distinct from new.category_slug),
        ('location_country', old.location_country is distinct from new.location_country),
        ('remote', old.remote is distinct from new.remote),
        ('rate_text', old.rate_text is distinct from new.rate_text)
      ) as changes(field, changed)
      where changed;
    -- Timestamp-only writes and retries do not manufacture new history.
    if cardinality(v_changed) = 0 then return new; end if;
  end if;
  -- A profile cascade may already have removed the real actor. Preserve the
  -- canonical nullable/FK erasure semantics; never invent the provider as actor.
  select p.id into v_actor from public.profiles p where p.id = auth.uid();
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (
    v_actor,
    case tg_op when 'INSERT' then 'service_offering_created'
               when 'DELETE' then 'service_offering_deleted'
               else 'service_offering_changed' end,
    'service_offerings',
    case when tg_op = 'DELETE' then old.id else new.id end,
    jsonb_build_object('from_state', v_before, 'to_state', v_after, 'changed_fields', v_changed)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
revoke all on function public.service_offering_history_v1() from public, anon, authenticated;
create trigger service_offering_history_v1
  after insert or update or delete on public.service_offerings
  for each row execute function public.service_offering_history_v1();

-- The partial index contains only explicitly public active rows. Expiry remains
-- a runtime predicate; no volatile now() in an index definition.
create index service_offerings_public_created_idx
  on public.service_offerings (created_at desc, id)
  where public_search_enabled and status = 'active';

-- A fixed projection is the anonymous boundary. All filters, including detail
-- lookup and fixture exclusion, live here; the detail wrapper cannot widen it.
create function public.search_public_service_offerings_v1(
  p_query text default null,
  p_country text default null,
  p_category text default null,
  p_limit integer default 7,
  p_offset integer default 0,
  p_offering_id uuid default null
)
returns table (
  id uuid, title text, description text, category_slug text,
  location_country text, remote boolean, rate_text text, created_at timestamptz
)
language sql stable security definer
set search_path = pg_catalog
as $function$
  select s.id, s.title, s.description, s.category_slug,
         s.location_country::text, s.remote, s.rate_text, s.created_at
  from public.service_offerings s
  where s.public_search_enabled = true
    and s.status = 'active'
    and (s.expires_at is null or s.expires_at > now())
    and (p_offering_id is null or s.id = p_offering_id)
    and not public.is_synthetic_fixture_label_v1(s.title, s.description, s.category_slug, s.rate_text)
    and not exists (
      select 1 from auth.users u
      where u.id = s.provider_id
        and (coalesce(u.raw_app_meta_data -> 'qa_synthetic' = 'true'::jsonb, false)
             or coalesce(u.email ~* '^qa.[^@]*@labourmarket[.]ai$', false))
    )
    and (nullif(btrim(p_country), '') is null
         or (btrim(p_country) ~ '^[A-Za-z]{2}$' and s.location_country = upper(btrim(p_country))))
    -- Literal case-insensitive substrings, like the existing category filter.
    -- %, _, quotes and backslashes are data, never LIKE or SQL instructions.
    and (nullif(btrim(p_category), '') is null
         or strpos(lower(coalesce(s.category_slug, '')), lower(left(btrim(p_category), 80))) > 0)
    and (nullif(btrim(p_query), '') is null
         or strpos(lower(concat_ws(' ', s.title, s.description, s.category_slug)),
                   lower(left(btrim(p_query), 120))) > 0)
  order by s.created_at desc, s.id
  limit greatest(1, least(coalesce(p_limit, 7), 7))
  offset greatest(0, least(coalesce(p_offset, 0), 594));
$function$;

create function public.get_public_service_offering_v1(p_id uuid)
returns table (
  id uuid, title text, description text, category_slug text,
  location_country text, remote boolean, rate_text text, created_at timestamptz
)
language sql stable security definer
set search_path = pg_catalog
as $function$
  select r.id, r.title, r.description, r.category_slug,
         r.location_country, r.remote, r.rate_text, r.created_at
  from public.search_public_service_offerings_v1(null, null, null, 1, 0, p_id) r
  where p_id is not null;
$function$;

revoke all on function public.search_public_service_offerings_v1(text, text, text, integer, integer, uuid) from public;
revoke all on function public.get_public_service_offering_v1(uuid) from public;
grant execute on function public.search_public_service_offerings_v1(text, text, text, integer, integer, uuid) to anon, authenticated;
grant execute on function public.get_public_service_offering_v1(uuid) to anon, authenticated;

commit;
