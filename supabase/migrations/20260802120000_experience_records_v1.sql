-- @human-gate-approved
--
-- ── SCOPE OF THE OWNER APPROVAL (Owner Decision 2, 2026-08-02) ──────────────
--
-- The owner reviewed the human-gate package on PR #974 and approved the
-- migration-safety findings for THIS PR. The annotation above downgrades those
-- findings from job-level errors to acknowledged notices. It is NOT a claim
-- that the migration is low-risk, and it grants nothing beyond what is listed.
--
-- APPROVAL APPLIES TO: pull request #974 (W6 slice 3 — experience records,
-- moderation and disputes) and to these FOUR findings, each confirmed as real:
--
--   1. security-definer-function — 9 SECURITY DEFINER functions (1 audit
--      helper + 8 domain RPCs), each `set search_path = public`. Required
--      because eligibility is re-derived across booking_requests /
--      engagement_contexts / service_offering_requests / workers rows the
--      caller often cannot read, and the tables are RLS-write-closed.
--   2. grant-or-revoke — REVOKE ALL from anon+authenticated on both tables,
--      GRANT SELECT back to authenticated only, EXECUTE revoked from
--      public+anon on all 9 functions and granted to authenticated on the 8
--      domain RPCs. The audit helper is granted to nobody.
--   3. RLS policy changes — `drop policy if exists` + `create policy` for
--      experience_records_select and experience_responses_select (the
--      idempotent re-runnable form; Postgres has no `create policy if not
--      exists`). No INSERT/UPDATE/DELETE policy is created on either table.
--   4. DML inside function bodies — UPDATE statements in the moderation and
--      dispute RPCs. There is no DELETE statement anywhere in this migration.
--
-- APPROVAL DOES **NOT** COVER:
--
--   * APPLYING THIS MIGRATION IN PRODUCTION. Owner Decision 3 is a SEPARATE
--     decision and has NOT been given. Do not run Supabase `apply_migration`,
--     do not run manual production SQL, do not seed experience rows, and do
--     not run a destructive authenticated production proof.
--   * RUNNING THE PAIRED ROLLBACK AGAINST REAL PRODUCTION DATA. The rollback
--     drops both tables and would destroy any rows in them. It is acceptable
--     ONLY while production has never had this domain applied (rows: 0). Once
--     production carries real experience records, the rollback is destructive
--     and needs its own owner decision, plus a backup/restore plan and a
--     non-destructive forward-fix path.
--
-- Until Decision 3 is given the post-merge state is
-- `W6_SLICE_3_MERGED_PENDING_PRODUCTION_MIGRATION_APPROVAL`.
--
-- Apply ONLY via Supabase MCP apply_migration after the SEPARATE production
-- approval. Never `db push`.
--
-- 20260802120000 — experience records v1 (W6 slice 3: subjective experiences,
-- moderation, right of reply, disputes — ONE canonical domain).
--
-- Contract source: apps/web/lib/trust/experience-eligibility.ts (the W6
-- owner directive resolved its OWNER_DECISION gate). Doctrine encoded here:
--   - sentiment is ONLY positive|negative — no stars, no numbers, no scale;
--   - a record exists ONLY after a real completed canonical interaction
--     (accepted+started booking / ended engagement / accepted service
--     request), re-derived SERVER-SIDE in the submit RPC;
--   - exactly ONE record per (author, subject, interaction) — idempotent
--     duplicate outcome, never a second vote;
--   - moderation lifecycle submitted → in_moderation → published|rejected
--     (moderator-only; the author can never self-publish);
--   - dispute is a SEPARATE dimension (none/opened/under_review/
--     resolved_upheld|changed|removed) — a published record can be disputed
--     and stay published while the moderator decides; state is never lost;
--   - right of reply: the subject side may file ONE response, itself
--     moderated; it never edits or removes the original;
--   - NO silent delete: removal is dispute resolution 'resolved_removed'
--     (derivation hides it; history and audit stay);
--   - every significant action appends a public.audit_logs row with
--     prev/new state + reason;
--   - writes are RPC-only (SECURITY DEFINER, authz inside, text outcomes);
--     direct DML is revoked. RLS SELECT is default-closed: author, subject
--     side, admin. Public consumption is COUNT-ONLY via one reader RPC.
--
-- Rollback: paired supabase/rollbacks/20260802120000_experience_records_v1.down.sql
-- (drops functions + tables; audit_logs history is append-only and stays).

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.experience_records (
  id                       uuid primary key default gen_random_uuid(),
  author_profile_id        uuid not null references public.profiles(id) on delete cascade,
  subject_type             text not null check (subject_type in ('worker','organization')),
  subject_profile_id       uuid references public.profiles(id) on delete cascade,
  subject_organization_id  uuid references public.organizations(id) on delete cascade,
  interaction_kind         text not null check (interaction_kind in
                             ('accepted_booking','completed_engagement','concluded_service_request')),
  interaction_id           uuid not null,
  sentiment                text not null check (sentiment in ('positive','negative')),
  body                     text not null check (char_length(body) between 1 and 2000),
  -- Optional factual dimension chips (contract EXPERIENCE_DIMENSIONS);
  -- validated in the RPC, never a numeric scale.
  dimensions               jsonb,
  moderation_status        text not null default 'submitted' check (moderation_status in
                             ('submitted','in_moderation','published','rejected')),
  dispute_status           text not null default 'none' check (dispute_status in
                             ('none','opened','under_review',
                              'resolved_upheld','resolved_changed','resolved_removed')),
  dispute_reason           text check (dispute_reason is null or char_length(dispute_reason) <= 2000),
  dispute_resolution_reason text check (dispute_resolution_reason is null
                             or char_length(dispute_resolution_reason) <= 2000),
  submitted_at             timestamptz not null default now(),
  published_at             timestamptz,
  rejected_at              timestamptz,
  moderated_by             uuid references public.profiles(id) on delete set null,
  moderation_reason        text check (moderation_reason is null or char_length(moderation_reason) <= 2000),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- exactly one subject shape per subject_type
  check ((subject_type = 'worker' and subject_profile_id is not null and subject_organization_id is null)
      or (subject_type = 'organization' and subject_organization_id is not null and subject_profile_id is null)),
  -- no self-review at the DB layer too
  check (subject_profile_id is null or subject_profile_id <> author_profile_id),
  -- a decided record carries its decision facts
  check (moderation_status <> 'rejected' or moderation_reason is not null),
  check (moderation_status <> 'published' or published_at is not null),
  check (moderation_status <> 'rejected' or rejected_at is not null)
);

-- ONE record per author+subject+interaction (the two subject shapes).
create unique index if not exists experience_records_one_per_interaction_worker
  on public.experience_records (author_profile_id, subject_profile_id, interaction_kind, interaction_id)
  where subject_profile_id is not null;
create unique index if not exists experience_records_one_per_interaction_org
  on public.experience_records (author_profile_id, subject_organization_id, interaction_kind, interaction_id)
  where subject_organization_id is not null;
create index if not exists experience_records_subject_worker_idx
  on public.experience_records (subject_profile_id, moderation_status)
  where subject_profile_id is not null;
create index if not exists experience_records_subject_org_idx
  on public.experience_records (subject_organization_id, moderation_status)
  where subject_organization_id is not null;

create table if not exists public.experience_responses (
  id                    uuid primary key default gen_random_uuid(),
  experience_record_id  uuid not null unique references public.experience_records(id) on delete cascade,
  author_profile_id     uuid not null references public.profiles(id) on delete cascade,
  body                  text not null check (char_length(body) between 1 and 2000),
  moderation_status     text not null default 'submitted' check (moderation_status in
                          ('submitted','in_moderation','published','rejected')),
  moderated_by          uuid references public.profiles(id) on delete set null,
  moderation_reason     text check (moderation_reason is null or char_length(moderation_reason) <= 2000),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── RLS: default-closed SELECT; writes RPC-only ─────────────────────────────

alter table public.experience_records enable row level security;
alter table public.experience_responses enable row level security;

-- Author sees their own record in every state. The subject side sees a record
-- about them once it is PUBLISHED (the moderation queue is not a notification
-- channel). Admin sees all. Nobody else reads rows — public consumption is
-- the count-only RPC.
drop policy if exists experience_records_select on public.experience_records;
create policy experience_records_select on public.experience_records
  for select using (
    author_profile_id = auth.uid()
    or public.is_admin()
    or (moderation_status = 'published' and subject_profile_id = auth.uid())
    or (moderation_status = 'published' and subject_organization_id is not null
        and public.manages_organization(subject_organization_id))
  );

drop policy if exists experience_responses_select on public.experience_responses;
create policy experience_responses_select on public.experience_responses
  for select using (
    author_profile_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.experience_records r
      where r.id = experience_record_id
        and r.author_profile_id = auth.uid()
        and moderation_status = 'published'
    )
  );

-- No INSERT/UPDATE/DELETE policies exist: every write goes through the
-- SECURITY DEFINER RPCs below.
--
-- REVOKE ALL first, then grant back exactly one privilege. Supabase's default
-- privileges hand every new public table SELECT (plus TRUNCATE/REFERENCES/
-- TRIGGER) to BOTH anon and authenticated, so a `revoke insert, update,
-- delete` alone would leave anon holding SELECT. RLS would still return no
-- rows — but anon evaluating the policy hits public.is_admin(), which anon
-- cannot execute, so the read ERRORS instead of coming back empty. Anon must
-- hold nothing at all in this domain (defence in depth, caught by the
-- behavioural proof script).
revoke all on public.experience_records from anon, authenticated;
revoke all on public.experience_responses from anon, authenticated;
grant select on public.experience_records to authenticated;
grant select on public.experience_responses to authenticated;

-- ── Audit helper (append-only rows in the ONE audit chain) ──────────────────

create or replace function public.experience_audit(
  p_entity text, p_entity_id uuid, p_action text,
  p_prev text, p_next text, p_reason text
) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), p_action, p_entity, p_entity_id,
          jsonb_build_object('prev_status', p_prev, 'new_status', p_next,
                             'reason', p_reason));
$$;
revoke execute on function public.experience_audit(text, uuid, text, text, text, text)
  from public, anon, authenticated;

-- ── Submit (server-side eligibility re-derivation; idempotent duplicate) ────

create or replace function public.submit_experience_record(
  p_subject_type text,
  p_subject_id uuid,
  p_interaction_kind text,
  p_interaction_id uuid,
  p_sentiment text,
  p_body text,
  p_dimensions jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_author uuid := auth.uid();
  v_ok boolean := false;
  v_subject_profile uuid;
  v_subject_org uuid;
  v_existing uuid;
  v_id uuid;
  v_worker_profile uuid;
  v_dim jsonb;
begin
  if v_author is null then return jsonb_build_object('ok', false, 'code', 'not_authenticated'); end if;
  if p_sentiment not in ('positive','negative') then
    return jsonb_build_object('ok', false, 'code', 'invalid_sentiment');
  end if;
  if p_body is null or char_length(trim(p_body)) < 1 or char_length(p_body) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_body');
  end if;
  if p_subject_type = 'worker' then
    v_subject_profile := p_subject_id;
  elsif p_subject_type = 'organization' then
    v_subject_org := p_subject_id;
  else
    return jsonb_build_object('ok', false, 'code', 'invalid_subject');
  end if;
  if v_subject_profile is not distinct from v_author then
    return jsonb_build_object('ok', false, 'code', 'self_review');
  end if;
  -- optional dimension chips: every key must be a contract dimension with a
  -- contract outcome — never a number.
  if p_dimensions is not null then
    for v_dim in select jsonb_array_elements(p_dimensions) loop
      if not (v_dim ? 'dimension') or not (v_dim ? 'outcome')
        or v_dim->>'dimension' not in
          ('punctuality_reliability','communication','work_quality','condition_accuracy',
           'compensation_accuracy','accommodation_accuracy','transport_accuracy')
        or v_dim->>'outcome' not in ('as_agreed','minor_issues','not_as_agreed') then
        return jsonb_build_object('ok', false, 'code', 'invalid_dimensions');
      end if;
    end loop;
  end if;

  -- ELIGIBILITY: the author and the subject must be the two REAL parties of a
  -- COMPLETED canonical interaction (contract isInteractionCompleted).
  if p_interaction_kind = 'accepted_booking' then
    select true into v_ok
    from public.booking_requests b
    join public.workers w on w.id = b.worker_id
    where b.id = p_interaction_id
      and b.status = 'accepted'
      and b.start_date is not null and b.start_date <= current_date
      and ((b.owner_id = v_author and w.profile_id = v_subject_profile)
        or (w.profile_id = v_author and b.owner_id = v_subject_profile));
  elsif p_interaction_kind = 'completed_engagement' then
    select true into v_ok
    from public.engagement_contexts ec
    where ec.id = p_interaction_id
      and (ec.status = 'ended' or ec.ended_at is not null)
      and (
        -- worker authors about the org, or an org manager authors about the worker
        (ec.profile_id = v_author and v_subject_org is not null
          and ec.organization_id = v_subject_org)
        or (v_subject_profile is not null and ec.profile_id = v_subject_profile
          and ec.organization_id is not null
          and public.manages_organization(ec.organization_id))
      );
  elsif p_interaction_kind = 'concluded_service_request' then
    select true into v_ok
    from public.service_offering_requests s
    where s.id = p_interaction_id
      and s.status = 'accepted'
      and ((s.buyer_id = v_author and s.provider_id = v_subject_profile)
        or (s.provider_id = v_author and s.buyer_id = v_subject_profile));
  else
    return jsonb_build_object('ok', false, 'code', 'unknown_interaction_kind');
  end if;

  if v_ok is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'not_eligible');
  end if;

  -- idempotent duplicate: the same author+subject+interaction returns the
  -- existing record, never a second vote.
  select id into v_existing from public.experience_records
  where author_profile_id = v_author
    and interaction_kind = p_interaction_kind
    and interaction_id = p_interaction_id
    and (subject_profile_id is not distinct from v_subject_profile)
    and (subject_organization_id is not distinct from v_subject_org);
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'code', 'duplicate_for_interaction', 'id', v_existing);
  end if;

  insert into public.experience_records
    (author_profile_id, subject_type, subject_profile_id, subject_organization_id,
     interaction_kind, interaction_id, sentiment, body, dimensions)
  values
    (v_author, p_subject_type, v_subject_profile, v_subject_org,
     p_interaction_kind, p_interaction_id, p_sentiment, trim(p_body), p_dimensions)
  returning id into v_id;
  perform public.experience_audit('experience_record', v_id, 'experience_submitted',
    null, 'submitted', null);
  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'submitted');
end;
$$;

-- ── Moderation (moderator = server-side is_admin(); reason mandatory) ───────

create or replace function public.start_experience_moderation(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'not_authorized'); end if;
  update public.experience_records
     set moderation_status = 'in_moderation', moderated_by = auth.uid(), updated_at = now()
   where id = p_id and moderation_status = 'submitted';
  if not found then return jsonb_build_object('ok', false, 'code', 'invalid_transition'); end if;
  perform public.experience_audit('experience_record', p_id, 'moderation_started',
    'submitted', 'in_moderation', null);
  return jsonb_build_object('ok', true, 'status', 'in_moderation');
end;
$$;

create or replace function public.decide_experience_moderation(
  p_id uuid, p_decision text, p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'not_authorized'); end if;
  if p_decision not in ('published','rejected') then
    return jsonb_build_object('ok', false, 'code', 'invalid_decision');
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 1 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;
  update public.experience_records
     set moderation_status = p_decision,
         moderated_by = auth.uid(),
         moderation_reason = trim(p_reason),
         published_at = case when p_decision = 'published' then now() else published_at end,
         rejected_at  = case when p_decision = 'rejected'  then now() else rejected_at end,
         updated_at = now()
   where id = p_id and moderation_status = 'in_moderation';
  if not found then return jsonb_build_object('ok', false, 'code', 'invalid_transition'); end if;
  perform public.experience_audit('experience_record', p_id, 'moderation_decided',
    'in_moderation', p_decision, trim(p_reason));
  return jsonb_build_object('ok', true, 'status', p_decision);
end;
$$;

-- ── Right of reply (subject side; ONE response; itself moderated) ───────────

create or replace function public.submit_experience_response(
  p_experience_id uuid, p_body text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_author uuid := auth.uid();
  r record;
  v_id uuid;
begin
  if v_author is null then return jsonb_build_object('ok', false, 'code', 'not_authenticated'); end if;
  if p_body is null or char_length(trim(p_body)) < 1 or char_length(p_body) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_body');
  end if;
  select * into r from public.experience_records where id = p_experience_id;
  if r.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if r.moderation_status <> 'published' then
    return jsonb_build_object('ok', false, 'code', 'not_published');
  end if;
  -- the SUBJECT side only: the person the record is about, or a live manager
  -- of the subject organization. Never the record's author.
  if not ((r.subject_profile_id is not distinct from v_author)
       or (r.subject_organization_id is not null
           and public.manages_organization(r.subject_organization_id))) then
    return jsonb_build_object('ok', false, 'code', 'not_subject');
  end if;
  if exists (select 1 from public.experience_responses
             where experience_record_id = p_experience_id) then
    return jsonb_build_object('ok', false, 'code', 'response_exists');
  end if;
  insert into public.experience_responses (experience_record_id, author_profile_id, body)
  values (p_experience_id, v_author, trim(p_body))
  returning id into v_id;
  perform public.experience_audit('experience_response', v_id, 'response_submitted',
    null, 'submitted', null);
  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'submitted');
end;
$$;

create or replace function public.moderate_experience_response(
  p_id uuid, p_decision text, p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prev text;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'not_authorized'); end if;
  if p_decision not in ('published','rejected') then
    return jsonb_build_object('ok', false, 'code', 'invalid_decision');
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 1 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;
  select moderation_status into v_prev from public.experience_responses where id = p_id;
  if v_prev is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_prev not in ('submitted','in_moderation') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;
  update public.experience_responses
     set moderation_status = p_decision, moderated_by = auth.uid(),
         moderation_reason = trim(p_reason), updated_at = now()
   where id = p_id;
  perform public.experience_audit('experience_response', p_id, 'response_moderated',
    v_prev, p_decision, trim(p_reason));
  return jsonb_build_object('ok', true, 'status', p_decision);
end;
$$;

-- ── Dispute (separate dimension — moderation state never lost) ──────────────

create or replace function public.open_experience_dispute(
  p_experience_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_author uuid := auth.uid();
  r record;
begin
  if v_author is null then return jsonb_build_object('ok', false, 'code', 'not_authenticated'); end if;
  if p_reason is null or char_length(trim(p_reason)) < 1 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;
  select * into r from public.experience_records where id = p_experience_id;
  if r.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not ((r.subject_profile_id is not distinct from v_author)
       or (r.subject_organization_id is not null
           and public.manages_organization(r.subject_organization_id))) then
    return jsonb_build_object('ok', false, 'code', 'not_subject');
  end if;
  if r.moderation_status <> 'published' then
    return jsonb_build_object('ok', false, 'code', 'not_published');
  end if;
  if r.dispute_status <> 'none' then
    return jsonb_build_object('ok', false, 'code', 'dispute_exists');
  end if;
  update public.experience_records
     set dispute_status = 'opened', dispute_reason = trim(p_reason), updated_at = now()
   where id = p_experience_id;
  perform public.experience_audit('experience_record', p_experience_id, 'dispute_opened',
    'none', 'opened', trim(p_reason));
  return jsonb_build_object('ok', true, 'dispute', 'opened');
end;
$$;

create or replace function public.review_experience_dispute(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'not_authorized'); end if;
  update public.experience_records
     set dispute_status = 'under_review', updated_at = now()
   where id = p_id and dispute_status = 'opened';
  if not found then return jsonb_build_object('ok', false, 'code', 'invalid_transition'); end if;
  perform public.experience_audit('experience_record', p_id, 'dispute_review_started',
    'opened', 'under_review', null);
  return jsonb_build_object('ok', true, 'dispute', 'under_review');
end;
$$;

create or replace function public.resolve_experience_dispute(
  p_id uuid, p_resolution text, p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_next text;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'not_authorized'); end if;
  if p_resolution not in ('upheld','changed','removed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_resolution');
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 1 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;
  v_next := 'resolved_' || p_resolution;
  update public.experience_records
     set dispute_status = v_next,
         dispute_resolution_reason = trim(p_reason),
         updated_at = now()
   where id = p_id and dispute_status = 'under_review';
  if not found then return jsonb_build_object('ok', false, 'code', 'invalid_transition'); end if;
  perform public.experience_audit('experience_record', p_id, 'dispute_resolved',
    'under_review', v_next, trim(p_reason));
  return jsonb_build_object('ok', true, 'dispute', v_next);
end;
$$;

-- ── Count-only public aggregation (the ONE derivation) ──────────────────────
-- Rule (W6, chosen EXPLICITLY): a disputed published record STAYS in the
-- count but is surfaced separately as disputed — visible, never presented as
-- an undisputed fact. resolved_removed rows leave the counts entirely (the
-- no-silent-delete hide-by-state). Nothing but published experience records
-- is ever counted: no evidence, no skills, no confidence, no signals.

create or replace function public.get_experience_counts(
  p_subject_type text, p_subject_id uuid
) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'positive', count(*) filter (where sentiment = 'positive'
                                 and dispute_status <> 'resolved_removed'),
    'negative', count(*) filter (where sentiment = 'negative'
                                 and dispute_status <> 'resolved_removed'),
    'disputed', count(*) filter (where dispute_status in ('opened','under_review')),
    'total_considered', count(*) filter (where dispute_status <> 'resolved_removed')
  )
  from public.experience_records
  where moderation_status = 'published'
    and ((p_subject_type = 'worker' and subject_profile_id = p_subject_id)
      or (p_subject_type = 'organization' and subject_organization_id = p_subject_id));
$$;

-- ── Grants: authenticated-only execution; anon and public revoked ───────────

revoke execute on function public.submit_experience_record(text, uuid, text, uuid, text, text, jsonb) from public, anon;
revoke execute on function public.start_experience_moderation(uuid) from public, anon;
revoke execute on function public.decide_experience_moderation(uuid, text, text) from public, anon;
revoke execute on function public.submit_experience_response(uuid, text) from public, anon;
revoke execute on function public.moderate_experience_response(uuid, text, text) from public, anon;
revoke execute on function public.open_experience_dispute(uuid, text) from public, anon;
revoke execute on function public.review_experience_dispute(uuid) from public, anon;
revoke execute on function public.resolve_experience_dispute(uuid, text, text) from public, anon;
revoke execute on function public.get_experience_counts(text, uuid) from public, anon;
grant execute on function public.submit_experience_record(text, uuid, text, uuid, text, text, jsonb) to authenticated;
grant execute on function public.start_experience_moderation(uuid) to authenticated;
grant execute on function public.decide_experience_moderation(uuid, text, text) to authenticated;
grant execute on function public.submit_experience_response(uuid, text) to authenticated;
grant execute on function public.moderate_experience_response(uuid, text, text) to authenticated;
grant execute on function public.open_experience_dispute(uuid, text) to authenticated;
grant execute on function public.review_experience_dispute(uuid) to authenticated;
grant execute on function public.resolve_experience_dispute(uuid, text, text) to authenticated;
grant execute on function public.get_experience_counts(text, uuid) to authenticated;

-- DOWN: see the paired rollback file.
