-- @human-gate-approved
--
-- WORKER → REAL VACANCY → INTEREST → NONSTOP COMMERCIAL HANDOFF v1
-- RED, PREPARED, NOT APPLIED. Owner gate open. Draft PR + `needs-human-gate`
-- + `blocked:migration`; apply only through the owner channel (Supabase MCP
-- `apply_migration`, never `db push`). Dry-run proven inside a rolled-back
-- transaction on production before the PR was opened (zero residue).
--
-- ─────────────────────────────────────────────────────────────────────────
-- WHAT THIS IS
--
-- Two things were structurally missing between "a worker sees a real public
-- vacancy on the board" and "Nonstop can approach that employer":
--
--   1. INTEREST ON A PUBLIC VACANCY. `demand_interest_signals` is the ONE
--      canonical interest object (2026-07-04), but it could only point at a
--      platform demand (`customer_requests`). The worker board has rendered
--      real public-source ads (`public_vacancies`, 52k live rows) since
--      2026-08-09 with exactly one action — the publisher's own ad — because
--      an interest signal that reached nobody would have been a fake
--      control. It now reaches somebody (2 below), so the SAME table gains a
--      second source column, exactly as `worker_saved_opportunities` did on
--      2026-08-19: `public_vacancy_id`, `request_id` nullable, exactly one
--      of the two, one row per (worker, vacancy). EXTEND, NOT NEW: no second
--      interest table, no "vacancy_interest" parallel.
--
--   2. THE COMMERCIAL HANDOFF. `commercial_handoffs` is LabourMarket.ai's
--      canonical OUTGOING event: "this worker (canonical ref) explicitly
--      wants this real vacancy (canonical ref) of this identifiable employer
--      (stable key) — Nonstop may pursue it through its own commercial
--      workflow". One row per interest signal (UNIQUE), created ONLY through
--      `create_commercial_handoff_v1` (SECURITY DEFINER, caller must own the
--      signal), and only when every criterion of the commercial rule holds
--      IN THE DATABASE, never on a client's word:
--        - the signal is the caller's own, `interested`, on a PUBLIC vacancy
--          (v1 scope — a platform demand's owner already receives the
--          interest in-product; whether Nonstop should also approach a
--          platform customer is an OPEN OWNER DECISION, not a default);
--        - the vacancy is live (active, not expired);
--        - the employer is identifiable: a published name AND a stable
--          identity (publisher org id, or a homepage host) — `employer_key`
--          is that identity, per company, so the outreach policy's
--          "one contact per company, ever" stays enforceable;
--        - the recency floor of `employer-outreach-policy.ts` is recorded
--          as `outreach_state` at creation from the publisher's OWN
--          publication date: under 30 days → `ineligible_too_new`, else
--          `eligible_for_human_review`. Eligible is not approved; nothing
--          here can produce "send".
--
-- ─────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES NOT DO — the invariants that survive it
--   * NO OUTREACH. No email, no message, no webhook. A handoff row is a
--     fact for Nonstop's commercial workflow and Agentai OS's contact
--     discovery to act on under their own owner gates. `status` moves only
--     by service_role (the delivery reader) — a worker cannot mark anything
--     delivered.
--   * NO CONFIDENTIAL EVIDENCE. The row carries references and a consent
--     record. No journal text, no CV, no note. The delivery projection
--     (`lib/commercial/handoff-contract.ts`) is built from canonical tables
--     at read time and is itself allow-listed.
--   * CONSENT IS SEPARATE. Interest in a vacancy is not permission to be
--     proposed to its employer. `proposition_consent` records the worker's
--     explicit, versioned answer to THAT question (`employer-proposition-v1`),
--     given on the interest form; `{}`/`given:false` means Nonstop may
--     pursue the vacancy but may not name the person.
--   * WITHDRAWAL IS HONOURED. Withdrawing the interest closes the handoff
--     (trigger) — Nonstop never acts on a hand that was lowered.
--   * RLS: a worker reads their OWN handoff rows (to see "Nonstop was
--     informed"); admins read all; service_role reads and updates status.
--     No INSERT path outside the SECURITY DEFINER function. `anon` nothing.
--   * The demand-owner SELECT policy on `demand_interest_signals` joins
--     `customer_requests` on `request_id`; a vacancy row has a NULL
--     `request_id` and is therefore invisible to every company. Unchanged.
--
-- ROLLBACK: supabase/rollbacks/20260917160000_vacancy_interest_commercial_handoff_v1.down.sql
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. demand_interest_signals: the second canonical source ────────────────

alter table public.demand_interest_signals
  add column if not exists public_vacancy_id uuid
    references public.public_vacancies(id) on delete cascade;

alter table public.demand_interest_signals
  alter column request_id drop not null;

alter table public.demand_interest_signals
  drop constraint if exists demand_interest_signals_exactly_one_source;
alter table public.demand_interest_signals
  add constraint demand_interest_signals_exactly_one_source
  check (num_nonnulls(request_id, public_vacancy_id) = 1);

-- One row per (worker, vacancy). A plain UNIQUE (NULLs distinct) so the
-- worker's own RLS upsert can name it in ON CONFLICT — a partial index
-- cannot be targeted through PostgREST.
alter table public.demand_interest_signals
  drop constraint if exists demand_interest_signals_worker_vacancy_key;
alter table public.demand_interest_signals
  add constraint demand_interest_signals_worker_vacancy_key
  unique (worker_id, public_vacancy_id);

create index if not exists demand_interest_signals_vacancy_idx
  on public.demand_interest_signals (public_vacancy_id)
  where public_vacancy_id is not null;

-- ── 2. commercial_handoffs: the canonical outgoing event ───────────────────

create table if not exists public.commercial_handoffs (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null default 'worker_vacancy_interest'
                        check (kind in ('worker_vacancy_interest')),
  schema_version      integer not null default 1,
  -- ONE handoff per interest signal — the idempotency key.
  interest_signal_id  uuid not null unique
                        references public.demand_interest_signals(id) on delete cascade,
  worker_id           uuid not null references public.workers(id) on delete cascade,
  public_vacancy_id   uuid references public.public_vacancies(id) on delete cascade,
  request_id          uuid references public.customer_requests(id) on delete cascade,
  -- Stable per-company identity: '<provider_key>:org:<external_org_id>' or
  -- '<provider_key>:host:<homepage>'. Outreach is deduplicated on THIS.
  employer_key        text not null check (char_length(employer_key) between 3 and 300),
  -- The worker's explicit answer to "may Nonstop present me to this
  -- employer?" — {given, version, at}. Empty = not given.
  proposition_consent jsonb not null default '{}'::jsonb,
  outreach_state      text not null
                        check (outreach_state in (
                          'ineligible_too_new',
                          'eligible_for_human_review',
                          'approved_for_single_contact',
                          'contacted',
                          'opted_out',
                          'company_claimed'
                        )),
  status              text not null default 'queued'
                        check (status in ('queued', 'delivered', 'acknowledged', 'closed')),
  created_at          timestamptz not null default now(),
  delivered_at        timestamptz,
  closed_at           timestamptz,
  constraint commercial_handoffs_exactly_one_source
    check (num_nonnulls(request_id, public_vacancy_id) = 1)
);

create index if not exists commercial_handoffs_queue_idx
  on public.commercial_handoffs (status, created_at)
  where status = 'queued';
create index if not exists commercial_handoffs_worker_idx
  on public.commercial_handoffs (worker_id, created_at desc);
create index if not exists commercial_handoffs_employer_idx
  on public.commercial_handoffs (employer_key);

alter table public.commercial_handoffs enable row level security;

drop policy if exists commercial_handoffs_worker_select on public.commercial_handoffs;
create policy commercial_handoffs_worker_select
  on public.commercial_handoffs for select
  using (
    public.is_admin()
    or worker_id in (select w.id from public.workers w where w.profile_id = auth.uid())
  );

revoke all on public.commercial_handoffs from public;
revoke all on public.commercial_handoffs from anon;
grant select on public.commercial_handoffs to authenticated;
-- The delivery reader (server-side, service_role): read the queue, mark
-- delivered / acknowledged / closed. Never insert.
grant select, update on public.commercial_handoffs to service_role;

-- ── 3. create_commercial_handoff_v1 — the ONLY insert path ─────────────────

create or replace function public.create_commercial_handoff_v1(
  p_signal_id           uuid,
  p_proposition_consent jsonb default '{}'::jsonb
) returns table (handoff_id uuid, created boolean, outreach_state text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_worker   uuid;
  v_sig      record;
  v_vac      record;
  v_key      text;
  v_state    text;
  v_consent  jsonb;
  v_existing record;
  v_row      record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  -- The caller's OWN, still-standing interest, on a PUBLIC vacancy (v1).
  -- Existence-oracle closure: a foreign or unknown signal id and a missing
  -- one look identical from outside (P0002), never a different error.
  select s.id, s.worker_id, s.status, s.public_vacancy_id, s.request_id
    into v_sig
    from public.demand_interest_signals s
   where s.id = p_signal_id
     and s.worker_id = v_worker;
  if v_sig.id is null then
    raise exception 'Interest not found' using errcode = 'P0002';
  end if;
  if v_sig.status is distinct from 'interested' then
    raise exception 'Interest not active' using errcode = 'P0002';
  end if;
  if v_sig.public_vacancy_id is null then
    -- Platform demands: the owner is already told in-product; a Nonstop
    -- approach to a platform customer is an open owner decision.
    raise exception 'Not a public vacancy interest' using errcode = 'P0002';
  end if;

  -- Idempotent: the signal already has its handoff → return it, created=false.
  select h.id, h.outreach_state, h.status into v_existing
    from public.commercial_handoffs h
   where h.interest_signal_id = v_sig.id;
  if v_existing.id is not null then
    return query select v_existing.id, false, v_existing.outreach_state, v_existing.status;
    return;
  end if;

  -- A LIVE vacancy with an IDENTIFIABLE employer.
  select pv.id, pv.provider_key, pv.employer_name, pv.employer_external_org_id,
         pv.employer_homepage, pv.published_at
    into v_vac
    from public.public_vacancies pv
   where pv.id = v_sig.public_vacancy_id
     and pv.is_active
     and (pv.expires_at is null or pv.expires_at > now());
  if v_vac.id is null then
    raise exception 'Vacancy not open' using errcode = 'P0002';
  end if;
  if nullif(trim(coalesce(v_vac.employer_name, '')), '') is null then
    raise exception 'Employer not identifiable' using errcode = 'P0002';
  end if;
  if nullif(trim(coalesce(v_vac.employer_external_org_id, '')), '') is not null then
    v_key := v_vac.provider_key || ':org:' || trim(v_vac.employer_external_org_id);
  elsif nullif(trim(coalesce(v_vac.employer_homepage, '')), '') is not null then
    v_key := v_vac.provider_key || ':host:' || lower(trim(v_vac.employer_homepage));
  else
    raise exception 'Employer not identifiable' using errcode = 'P0002';
  end if;

  -- The recency floor of employer-outreach-policy.ts, from the publisher's
  -- OWN publication date. Under 30 full days → too new, no exceptions.
  if v_vac.published_at is null or v_vac.published_at > now() then
    raise exception 'Publication date unusable' using errcode = 'P0002';
  end if;
  v_state := case
    when v_vac.published_at > now() - interval '30 days' then 'ineligible_too_new'
    else 'eligible_for_human_review'
  end;

  -- Consent: only the shape the form produces is stored; anything else is
  -- recorded as NOT given. Never trusted as a free jsonb.
  if jsonb_typeof(p_proposition_consent) = 'object'
     and (p_proposition_consent ->> 'given') = 'true'
     and (p_proposition_consent ->> 'version') = 'employer-proposition-v1'
  then
    v_consent := jsonb_build_object(
      'given', true,
      'version', 'employer-proposition-v1',
      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  else
    v_consent := jsonb_build_object('given', false);
  end if;

  insert into public.commercial_handoffs as h
    (interest_signal_id, worker_id, public_vacancy_id, employer_key,
     proposition_consent, outreach_state)
  values
    (v_sig.id, v_worker, v_vac.id, v_key, v_consent, v_state)
  on conflict (interest_signal_id) do nothing
  returning h.id, h.outreach_state, h.status into v_row;

  if v_row.id is null then
    -- Lost a race with an identical call: return the row that won.
    select h.id, h.outreach_state, h.status into v_existing
      from public.commercial_handoffs h where h.interest_signal_id = v_sig.id;
    return query select v_existing.id, false, v_existing.outreach_state, v_existing.status;
    return;
  end if;
  return query select v_row.id, true, v_row.outreach_state, v_row.status;
end;
$$;

revoke all on function public.create_commercial_handoff_v1(uuid, jsonb) from public;
revoke all on function public.create_commercial_handoff_v1(uuid, jsonb) from anon;
grant execute on function public.create_commercial_handoff_v1(uuid, jsonb) to authenticated;

-- ── 4. The delivery READER — service_role only, canonical joins at read time ─
--
-- service_role deliberately holds no grant on worker_skills / worker_professions
-- / worker_languages / profiles (production allowlist). The dispatcher that
-- hands a queued row to Nonstop needs the worker's DECLARED professional
-- context; rather than widening any table grant, ONE function projects the
-- allow-listed facts of QUEUED rows, joined from the canonical tables at
-- read time (nothing copied onto the handoff row, nothing stale). It reads
-- NO note, NO journal, NO CV, NO document, NO contact column.
create or replace function public.list_queued_commercial_handoffs_v1(
  p_limit integer default 50
) returns table (
  handoff_id          uuid,
  created_at          timestamptz,
  outreach_state      text,
  employer_key        text,
  proposition_consent jsonb,
  interest_signal_id  uuid,
  interest_at         timestamptz,
  interest_status     text,
  match_status        text,
  profile_id          uuid,
  worker_id           uuid,
  locale              text,
  profession_slug     text,
  skill_slugs         text[],
  languages           text[],
  availability_status text,
  current_country     text,
  basis               text,
  vacancy_id          uuid,
  provider_key        text,
  external_id         text,
  title               text,
  country             text,
  city                text,
  published_at        timestamptz,
  expires_at          timestamptz,
  application_url     text,
  vacancy_profession  text,
  employer_name       text,
  employer_org_id     text,
  employer_homepage   text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.id,
    h.created_at,
    h.outreach_state,
    h.employer_key,
    h.proposition_consent,
    s.id,
    s.updated_at,
    s.status,
    s.match_snapshot ->> 'status_band',
    w.profile_id,
    w.id,
    p.locale,
    (select pr.slug from public.worker_professions wp
       join public.professions pr on pr.id = wp.profession_id
      where wp.worker_id = w.id
      order by wp.is_primary desc, wp.created_at asc limit 1),
    coalesce((select array_agg(sk.slug order by sk.slug)
                from public.worker_skills ws join public.skills sk on sk.id = ws.skill_id
               where ws.worker_id = w.id), '{}'::text[]),
    coalesce((select array_agg(wl.lang order by wl.lang)
                from public.worker_languages wl where wl.worker_id = w.id), '{}'::text[]),
    w.availability_status,
    w.current_location_country,
    case
      when exists (select 1 from public.worker_skills ws where ws.worker_id = w.id and ws.verified)
        then 'mixed'
      when exists (select 1 from public.worker_skills ws where ws.worker_id = w.id and ws.source = 'work_journal')
        then 'evidenced'
      else 'declared'
    end,
    pv.id,
    pv.provider_key,
    pv.external_id,
    pv.title_raw,
    pv.country,
    pv.city,
    pv.published_at,
    pv.expires_at,
    pv.application_url,
    pv.profession_slug,
    pv.employer_name,
    pv.employer_external_org_id,
    pv.employer_homepage
  from public.commercial_handoffs h
  join public.demand_interest_signals s on s.id = h.interest_signal_id
  join public.workers w on w.id = h.worker_id
  left join public.profiles p on p.id = w.profile_id
  join public.public_vacancies pv on pv.id = h.public_vacancy_id
  where h.status = 'queued'
    and s.status = 'interested'
  order by h.created_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.list_queued_commercial_handoffs_v1(integer) from public;
revoke all on function public.list_queued_commercial_handoffs_v1(integer) from anon;
revoke all on function public.list_queued_commercial_handoffs_v1(integer) from authenticated;
grant execute on function public.list_queued_commercial_handoffs_v1(integer) to service_role;

-- ── 5. A lowered hand closes the handoff ───────────────────────────────────

create or replace function public.commercial_handoff_follow_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'withdrawn' and old.status is distinct from 'withdrawn' then
    update public.commercial_handoffs h
       set status = 'closed', closed_at = now()
     where h.interest_signal_id = new.id
       and h.status <> 'closed';
  end if;
  return new;
end;
$$;

-- A trigger function is invoked by the trigger, never by a role; still, a
-- SECURITY DEFINER function created after the 20260722160000 closure must
-- revoke its default EXECUTE explicitly (secdef-local-reset guard).
revoke all on function public.commercial_handoff_follow_withdrawal() from public;
revoke all on function public.commercial_handoff_follow_withdrawal() from anon;
revoke all on function public.commercial_handoff_follow_withdrawal() from authenticated;

drop trigger if exists demand_interest_signals_close_handoff on public.demand_interest_signals;
create trigger demand_interest_signals_close_handoff
  after update of status on public.demand_interest_signals
  for each row execute function public.commercial_handoff_follow_withdrawal();

commit;
