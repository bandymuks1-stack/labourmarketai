-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY. PREPARED FOR REVIEW ONLY.
--
-- This file carries NO approval annotation on purpose: the owner has not
-- approved it, and the annotation would assert an approval that does not
-- exist. migration-safety is RED on this file BY DESIGN. It is also a
-- LEGALLY SIGNIFICANT authority object (who may recognise prior learning),
-- so the gate is the owner's twice over.
--
-- 20260915140000 — competency_recognitions v1 (SKL-9, ARCH-2)
-- J-WORKER-EVIDENCE step 7 · J-INSTITUTION-OUTCOME step 6:
--   real work → demonstrated competency → formal requirement → recognised
--   equivalence / RPL, by an INDEPENDENT ASSESSOR.
--
-- THE WRONG ANSWER THIS ENDS. "Five years of real work" reads on every
-- requirement surface as "certificate missing". SEP-6 keeps five states
-- apart — demonstrated capability, formal qualification, recognised
-- equivalence, valid credential, missing requirement — and the product has
-- objects for exactly two of them (journal evidence; worker_documents). The
-- middle state, RECOGNISED EQUIVALENCE, has no object at any layer. The pure
-- model (`lib/skills/recognition-model.ts`) derives the five states from
-- what exists; this relation is the one thing it cannot derive: an
-- assessor's act.
--
-- WHAT THIS ADDS. ONE relation and TWO commands.
--
--   competency_recognitions
--     the subject; the formal requirement it answers (a document type, a
--     skill or a profession+country — closed kinds); the evidence examined
--     (journal entry ids, snapshotted as a closed jsonb list, so the record
--     keeps saying what was looked at even if an entry is later edited);
--     the assessing organization and the person who acted for it; the
--     decision (recognised / not_recognised); validity; revocation with a
--     reason; correction by APPEND (a new row superseding the old — the old
--     row is never rewritten). The subject can always read their own.
--
--   record_competency_recognition_v1(...)
--     SECURITY DEFINER. Enforces the authority rule the model states:
--       · the assessing organization holds an assessor role — today
--         `training_provider` in `organization_roles`;
--       · the caller MANAGES that organization (`manages_organization`);
--       · the caller is not the subject;
--       · the assessing organization does not ENGAGE the subject as a worker
--         (no active `engagement_contexts` row for the subject in that
--         organization other than `student`) — a beneficiary cannot assess;
--       · every evidence id names a journal entry that belongs to the
--         subject AND carries a confirmation — an assessor may only cite
--         evidence that is at least manager-confirmed, never self-reported.
--     Refuses each with 42501 / 22023 by name.
--
--   revoke_competency_recognition_v1(id, reason)
--     Only a manager of the SAME assessing organization. Sets revoked_at and
--     the reason; nothing else on the row changes.
--
-- RLS, STATED EXPLICITLY.
--   anon:          nothing.
--   authenticated: SELECT for the subject (their own recognitions, always),
--                  managers of the assessing organization, and admin.
--                  Employers do NOT read this table — a recognition reaches
--                  an employer only through the subject's own requirement
--                  ledger, which the subject already controls.
--                  No INSERT / UPDATE / DELETE policy: the RPCs write.
--
-- WHAT IS DELIBERATELY NOT BUILT. No assessment workflow, no request-for-
-- assessment object (a later slice), no score, no ESCO ranking (ESCO is the
-- semantic layer only), no automatic recognition from evidence counts —
-- the floor in the model says "could be assessed", never "is recognised".
--
-- RISK / REVERSIBILITY. Additive. Nothing existing is altered.
-- ROLLBACK: supabase/rollbacks/20260915140000_competency_recognitions_v1.down.sql
-- (guarded — refuses while recognitions exist; a recognition is a legal act).
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.organization_roles') is null then raise exception 'organization_roles missing'; end if;
  if to_regclass('public.journal_entries') is null then raise exception 'journal_entries missing'; end if;
  if to_regclass('public.engagement_contexts') is null then raise exception 'engagement_contexts missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'manages_organization') then raise exception 'manages_organization missing'; end if;
end $$;

create table if not exists public.competency_recognitions (
  id                       uuid primary key default gen_random_uuid(),
  subject_profile_id       uuid not null references public.profiles(id) on delete cascade,
  requirement_kind         text not null check (requirement_kind in ('document_type', 'skill', 'profession')),
  requirement_key          text not null check (char_length(requirement_key) between 1 and 120),
  requirement_country      text check (requirement_country is null or char_length(requirement_country) = 2),
  evidence_entry_ids       jsonb not null,
  assessor_organization_id uuid not null references public.organizations(id) on delete restrict,
  assessed_by              uuid not null references public.profiles(id) on delete restrict,
  decision                 text not null check (decision in ('recognised', 'not_recognised')),
  valid_from               date,
  valid_until              date,
  note                     text check (note is null or char_length(note) <= 2000),
  supersedes_id            uuid references public.competency_recognitions(id) on delete set null,
  revoked_at               timestamptz,
  revoked_reason           text check (revoked_reason is null or char_length(revoked_reason) <= 1000),
  created_at               timestamptz not null default now(),
  constraint competency_recognitions_evidence_shape check (
    jsonb_typeof(evidence_entry_ids) = 'array' and jsonb_array_length(evidence_entry_ids) between 1 and 50
  ),
  constraint competency_recognitions_validity_shape check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint competency_recognitions_revocation_shape check (
    (revoked_at is null and revoked_reason is null) or (revoked_at is not null and revoked_reason is not null)
  )
);

comment on table public.competency_recognitions is
  'SKL-9 / ARCH-2. An INDEPENDENT ASSESSOR''s act recognising a person''s demonstrated capability against a formal requirement (RPL / equivalence). Never self-issued, never issued by an organization that engages the subject. Corrected by superseding row, revoked in place with a reason, never rewritten. Readable by the subject always.';

create index if not exists competency_recognitions_subject_idx
  on public.competency_recognitions (subject_profile_id, requirement_kind, requirement_key);
create index if not exists competency_recognitions_assessor_idx
  on public.competency_recognitions (assessor_organization_id, created_at desc);

alter table public.competency_recognitions enable row level security;
alter table public.competency_recognitions force row level security;
revoke all on public.competency_recognitions from public, anon;
grant select on public.competency_recognitions to authenticated;

drop policy if exists competency_recognitions_select on public.competency_recognitions;
create policy competency_recognitions_select
  on public.competency_recognitions
  for select
  to authenticated
  using (
    subject_profile_id = auth.uid()
    or public.manages_organization(assessor_organization_id)
    or public.is_admin()
  );

-- ── The authority rule, enforced where it cannot be bypassed ───────────────
create or replace function public.record_competency_recognition_v1(
  p_subject_profile_id       uuid,
  p_requirement_kind         text,
  p_requirement_key          text,
  p_requirement_country      text,
  p_evidence_entry_ids       jsonb,
  p_assessor_organization_id uuid,
  p_decision                 text,
  p_valid_from               date,
  p_valid_until              date,
  p_note                     text,
  p_supersedes_id            uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_eid text;
  v_n   integer;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  -- 1. an assessor role
  if not exists (
    select 1 from public.organization_roles r
     where r.organization_id = p_assessor_organization_id and r.role_slug = 'training_provider'
  ) then
    raise exception 'not_an_assessor_role' using errcode = '42501';
  end if;
  -- 2. the caller manages the assessor
  if not (public.manages_organization(p_assessor_organization_id) or public.is_admin()) then
    raise exception 'actor_does_not_manage_assessor' using errcode = '42501';
  end if;
  -- 3. nobody recognises themselves
  if v_uid = p_subject_profile_id then
    raise exception 'self_recognition' using errcode = '42501';
  end if;
  -- 4. a beneficiary cannot assess: the assessor must not ENGAGE the subject
  --    as a worker. A student relationship is the one an institution is
  --    expected to hold and is not an interest in the answer.
  if exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = p_subject_profile_id
       and ec.organization_id = p_assessor_organization_id
       and ec.status = 'active'
       and ec.relationship_slug <> 'student'
  ) then
    raise exception 'beneficiary_organization' using errcode = '42501';
  end if;

  if p_requirement_kind not in ('document_type', 'skill', 'profession') then
    raise exception 'invalid requirement_kind' using errcode = '22023';
  end if;
  if p_decision not in ('recognised', 'not_recognised') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  if p_evidence_entry_ids is null or jsonb_typeof(p_evidence_entry_ids) <> 'array'
     or jsonb_array_length(p_evidence_entry_ids) < 1 or jsonb_array_length(p_evidence_entry_ids) > 50 then
    raise exception 'evidence must name 1..50 journal entries' using errcode = '22023';
  end if;

  -- 5. every cited entry belongs to the subject AND is at least confirmed.
  --    An assessor may look at anything the subject shows them; they may
  --    CITE only evidence someone other than the subject has confirmed.
  for v_eid in select jsonb_array_elements_text(p_evidence_entry_ids) loop
    select count(*) into v_n
      from public.journal_entries je
      join public.workers w on w.id = je.worker_id
     where je.id = v_eid::uuid
       and w.profile_id = p_subject_profile_id
       and exists (
         select 1 from public.journal_entry_confirmations c
          where c.entry_id = je.id and c.confirmer_id <> p_subject_profile_id
       );
    if v_n = 0 then
      raise exception 'evidence entry % is not the subject''s confirmed work', v_eid using errcode = '22023';
    end if;
  end loop;

  if p_supersedes_id is not null and not exists (
    select 1 from public.competency_recognitions s
     where s.id = p_supersedes_id and s.assessor_organization_id = p_assessor_organization_id
  ) then
    raise exception 'can only supersede own organization''s recognition' using errcode = '42501';
  end if;

  insert into public.competency_recognitions
    (subject_profile_id, requirement_kind, requirement_key, requirement_country, evidence_entry_ids,
     assessor_organization_id, assessed_by, decision, valid_from, valid_until, note, supersedes_id)
  values
    (p_subject_profile_id, p_requirement_kind, p_requirement_key, upper(p_requirement_country),
     p_evidence_entry_ids, p_assessor_organization_id, v_uid, p_decision, p_valid_from, p_valid_until,
     nullif(trim(p_note), ''), p_supersedes_id)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.revoke_competency_recognition_v1(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select assessor_organization_id into v_org from public.competency_recognitions where id = p_id;
  if v_org is null then raise exception 'No such recognition' using errcode = '42501'; end if;
  if not (public.manages_organization(v_org) or public.is_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_reason is null or char_length(trim(p_reason)) = 0 or char_length(p_reason) > 1000 then
    raise exception 'a revocation must carry a reason' using errcode = '22023';
  end if;
  update public.competency_recognitions
     set revoked_at = coalesce(revoked_at, now()), revoked_reason = coalesce(revoked_reason, trim(p_reason))
   where id = p_id;
end $$;

revoke all on function public.record_competency_recognition_v1(uuid, text, text, text, jsonb, uuid, text, date, date, text, uuid) from public, anon;
revoke all on function public.revoke_competency_recognition_v1(uuid, text) from public, anon;
grant execute on function public.record_competency_recognition_v1(uuid, text, text, text, jsonb, uuid, text, date, date, text, uuid) to authenticated;
grant execute on function public.revoke_competency_recognition_v1(uuid, text) to authenticated;

commit;

-- ROLLBACK
-- (see supabase/rollbacks/20260915140000_competency_recognitions_v1.down.sql — guarded)
-- drop function if exists public.revoke_competency_recognition_v1(uuid, text);
-- drop function if exists public.record_competency_recognition_v1(uuid, text, text, text, jsonb, uuid, text, date, date, text, uuid);
-- drop table if exists public.competency_recognitions;
