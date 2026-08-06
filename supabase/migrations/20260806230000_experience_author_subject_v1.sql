-- 20260806230000 — experience author-vs-subject model v1 (W6 author/subject
-- identity slice — SEQUENTIAL_W_EXECUTION_TRAIN queue item 1).
--
-- OWNER-GATED. This migration deliberately ships WITHOUT an approval
-- annotation (an agent never approves its own migration) and must NOT be
-- applied to production until the owner gives an explicit apply decision on
-- the PR that carries it. Apply ONLY via Supabase MCP apply_migration after
-- that decision. Never `db push`.
--
-- ── WHY THIS MIGRATION EXISTS ───────────────────────────────────────────────
--
-- The W1–W22 recount (docs/program/W1_W22_CURRENT_STATE_MATRIX.md, W6 row)
-- records one modelling defect in the experience domain:
--
--   An experience about an EMPLOYER is stored as `subject_type='worker'`
--   plus a personal profile id.
--
-- Root cause, verified on main ac6186dc:
--
--   1. The `accepted_booking` eligibility arm of submit_experience_record
--      only recognises profile↔profile parties. Since org demand spine v2
--      (20260806200000, APPLIED in production) a booking can belong to an
--      ORGANIZATION (`booking_requests.organization_id`), and a worker
--      describing that employer must produce an ORGANIZATION-subject record —
--      today the arm forces the employer's personal profile as a
--      'worker'-type subject.
--   2. The row does not record the AUTHOR SIDE. An organization manager
--      writing about a worker and a person writing as themselves are stored
--      identically (`author_profile_id` only), so org-authored rows cannot be
--      distinguished, displayed, or bounded (one org account per interaction).
--
-- Production preflight 2026-08-06: public.experience_records has 0 rows and
-- public.experience_responses has 0 rows. There is NOTHING to rewrite; every
-- backfill below is a guarded no-op in production and exists only so local
-- stacks with synthetic rows stay classified truthfully.
--
-- ── CANONICAL MODEL (kept / added) ──────────────────────────────────────────
--
-- SUBJECT (unchanged, from 20260802120000): subject_type 'worker' = a person
-- subject (subject_profile_id), 'organization' = an organization subject
-- (subject_organization_id). Exactly one shape per row (existing CHECK).
--
-- AUTHOR (added): author_side 'person' | 'organization'.
--   * 'person'        — the author acts as themselves (worker author, personal
--                       booking owner, service buyer/provider).
--                       author_organization_id IS NULL.
--   * 'organization'  — the author acts FOR an organization that is a real
--                       party of the interaction (engagement organization or
--                       org-scoped booking organization). author_organization_id
--                       carries THAT organization — inherited from the
--                       interaction row, never chosen by the client.
--   The value 'person' (not 'worker') is deliberate: a personal booking owner
--   or a service buyer is not a worker, and reusing 'worker' here would
--   recreate the exact overload this migration removes.
--
-- Invariants added:
--   * author side and author organization agree (CHECK);
--   * an organization never reviews itself (CHECK);
--   * ONE org-authored record per interaction — the organization speaks once,
--     regardless of which manager typed it (partial UNIQUE index);
--   * org authorship requires LIVE authority at submit time
--     (manages_organization — membership-widened 20260806180000, so a revoked
--     manager is refused); historical rows stay untouched on revocation.
--
-- Sentiment, moderation, dispute, response, count-only consumption: UNCHANGED.
-- No stars, no numeric score, no ranking — nothing here aggregates.
--
-- Rollback: paired
-- supabase/rollbacks/20260806230000_experience_author_subject_v1.down.sql
-- (drops the two columns + index and restores the v1 RPC body verbatim).

-- ── 1. Columns ──────────────────────────────────────────────────────────────

alter table public.experience_records
  add column if not exists author_side text not null default 'person'
    check (author_side in ('person','organization'));

alter table public.experience_records
  -- SET NULL, not CASCADE: deleting an organization must not delete a
  -- WORKER-subject record it authored — that row is part of the worker's
  -- history. The attribution degrades honestly to "organization no longer
  -- exists"; subject_organization_id keeps its v1 CASCADE semantics.
  add column if not exists author_organization_id uuid
    references public.organizations(id) on delete set null;

-- ── 2. Backfill (production no-op: 0 rows on 2026-08-06) ────────────────────
-- The only rows that can already be org-authored are engagement-kind rows
-- ABOUT a worker: the v1 eligibility arm admits that direction exclusively to
-- a manager of the engagement's organization. The organization is read from
-- the engagement row itself — canonical evidence, no inference.

update public.experience_records r
   set author_side = 'organization',
       author_organization_id = ec.organization_id
  from public.engagement_contexts ec
 where r.interaction_kind = 'completed_engagement'
   and r.subject_type = 'worker'
   and r.author_side = 'person'
   and ec.id = r.interaction_id
   and ec.organization_id is not null;

-- ── 3. Cross-column invariants ──────────────────────────────────────────────

alter table public.experience_records
  drop constraint if exists experience_records_author_side_shape;
alter table public.experience_records
  add constraint experience_records_author_side_shape
  check ((author_side = 'organization') = (author_organization_id is not null));

alter table public.experience_records
  drop constraint if exists experience_records_org_no_self_review;
alter table public.experience_records
  add constraint experience_records_org_no_self_review
  check (author_organization_id is null
      or subject_organization_id is null
      or author_organization_id <> subject_organization_id);

-- ONE org-authored record per interaction. Runs AFTER the backfill; in
-- production (0 rows) it always succeeds. A local synthetic stack where two
-- managers reviewed the same engagement under the old model would fail here —
-- that stack is disposable and must be rebuilt, not worked around.
create unique index if not exists experience_records_one_org_author_per_interaction
  on public.experience_records (author_organization_id, interaction_kind, interaction_id)
  where author_organization_id is not null;

create index if not exists experience_records_author_org_idx
  on public.experience_records (author_organization_id)
  where author_organization_id is not null;

-- ── 4. submit_experience_record v2 ──────────────────────────────────────────
-- Same signature (CREATE OR REPLACE must match), same doctrine, three changes:
--   a) the booking arm learns org-scoped bookings — worker→employer resolves
--      to the booking ORGANIZATION; employer→worker requires live authority
--      over that organization and records org authorship;
--   b) every arm derives author_side/author_organization_id SERVER-SIDE from
--      the interaction row — the client cannot express an author side at all;
--   c) org-authored duplicates are refused per ORGANIZATION, not only per
--      typing manager.

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
  v_dim jsonb;
  v_author_side text := 'person';
  v_author_org uuid;
  -- booking facts
  v_b_owner uuid; v_b_worker uuid; v_b_org uuid; v_b_status text; v_b_start date;
  -- engagement facts
  v_e_profile uuid; v_e_org uuid; v_e_status text; v_e_ended timestamptz;
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

  -- ELIGIBILITY + AUTHOR-SIDE DERIVATION. The author and the subject must be
  -- the two REAL parties of a COMPLETED canonical interaction, and the author
  -- side is read off the interaction row — never off the request.
  if p_interaction_kind = 'accepted_booking' then
    select b.owner_id, w.profile_id, b.organization_id, b.status, b.start_date
      into v_b_owner, v_b_worker, v_b_org, v_b_status, v_b_start
      from public.booking_requests b
      join public.workers w on w.id = b.worker_id
     where b.id = p_interaction_id;
    if v_b_owner is not null
       and v_b_status = 'accepted'
       and v_b_start is not null and v_b_start <= current_date then
      if v_author = v_b_owner
         and v_subject_profile is not null and v_subject_profile = v_b_worker then
        -- employer side describes the worker
        if v_b_org is not null then
          -- org-scoped booking: the organization is the acting party; live
          -- authority is required and recorded. A revoked manager stops here.
          if public.manages_organization(v_b_org) then
            v_ok := true; v_author_side := 'organization'; v_author_org := v_b_org;
          end if;
        else
          v_ok := true;  -- personal booking: person→person stays truthful
        end if;
      elsif v_author = v_b_worker then
        -- worker describes the employer side
        if v_b_org is not null then
          -- org-scoped booking: the employer party IS the organization. A
          -- person-subject about the owner's private profile is refused —
          -- that is the exact defect this migration removes.
          v_ok := (v_subject_org is not null and v_subject_org = v_b_org);
        else
          v_ok := (v_subject_profile is not null and v_subject_profile = v_b_owner);
        end if;
      end if;
    end if;
  elsif p_interaction_kind = 'completed_engagement' then
    select ec.profile_id, ec.organization_id, ec.status, ec.ended_at
      into v_e_profile, v_e_org, v_e_status, v_e_ended
      from public.engagement_contexts ec
     where ec.id = p_interaction_id;
    if v_e_profile is not null and (v_e_status = 'ended' or v_e_ended is not null) then
      if v_e_profile = v_author and v_subject_org is not null
         and v_e_org = v_subject_org then
        v_ok := true;  -- worker describes the organization they worked for
      elsif v_subject_profile is not null and v_e_profile = v_subject_profile
            and v_e_org is not null and public.manages_organization(v_e_org) then
        -- a live manager describes the engaged worker FOR the organization
        v_ok := true; v_author_side := 'organization'; v_author_org := v_e_org;
      end if;
    end if;
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

  -- idempotent duplicate — same author + subject + interaction.
  select id into v_existing from public.experience_records
  where author_profile_id = v_author
    and interaction_kind = p_interaction_kind
    and interaction_id = p_interaction_id
    and (subject_profile_id is not distinct from v_subject_profile)
    and (subject_organization_id is not distinct from v_subject_org);
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'code', 'duplicate_for_interaction', 'id', v_existing);
  end if;

  -- the ORGANIZATION speaks once per interaction, whoever types it.
  if v_author_org is not null then
    select id into v_existing from public.experience_records
    where author_organization_id = v_author_org
      and interaction_kind = p_interaction_kind
      and interaction_id = p_interaction_id;
    if v_existing is not null then
      return jsonb_build_object('ok', false, 'code', 'duplicate_for_interaction', 'id', v_existing);
    end if;
  end if;

  insert into public.experience_records
    (author_profile_id, author_side, author_organization_id,
     subject_type, subject_profile_id, subject_organization_id,
     interaction_kind, interaction_id, sentiment, body, dimensions)
  values
    (v_author, v_author_side, v_author_org,
     p_subject_type, v_subject_profile, v_subject_org,
     p_interaction_kind, p_interaction_id, p_sentiment, trim(p_body), p_dimensions)
  returning id into v_id;
  perform public.experience_audit('experience_record', v_id, 'experience_submitted',
    null, 'submitted', null);
  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'submitted');
end;
$$;

-- Redefinition post-dates the 20260722160000 closure — the privilege state
-- must be explicit in THIS file (secdef guard).
revoke execute on function public.submit_experience_record(text, uuid, text, uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.submit_experience_record(text, uuid, text, uuid, text, text, jsonb)
  to authenticated;

-- DOWN: see the paired rollback file.
