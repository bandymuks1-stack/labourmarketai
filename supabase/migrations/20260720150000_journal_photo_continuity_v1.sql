-- @human-gate-approved
-- RED classes acknowledged (security definer / grant-revoke / data DML /
-- policy change): owner-directed W1 of the Invite-Ready Closure Train v1 —
-- journal attachment continuity, revision 2 after the owner hold. Changes vs
-- the applied W0 production body (ledger 20260720035240):
--   1. journal_entry_supersede_v2 gains the in-transaction photo-metadata
--      move (unconfirmed supersede only).
--   2. register_journal_entry_photo now LOCKS the entry row (FOR UPDATE) and
--      refuses superseded/deleted entries - serialized with the supersede on
--      the same row lock (owner-hold P2).
--   3. The org-manager STORAGE read policy now resolves the CANONICAL
--      journal_entry_photos metadata row (storage_path = object name) and its
--      CURRENT entry_id instead of trusting the immutable historical entry id
--      embedded in the path - metadata and object authorization can never
--      diverge (owner-hold P1). No access broadened; bucket stays private.
--   3b. The LEGACY 9-arg journal_entry_supersede gains the identical photo
--      move (owner-hold #2): older deployed callers can never re-strand a
--      photo after the one-time backfill.
--   4. journal_entry_photos UPDATE tightened: WITH CHECK added and the column
--      grant restricted to upload_status only, so a worker cannot repoint a
--      photo row's entry_id and redirect authorization.
--   5. Confirmation lifecycle serialized (owner-hold v4): BEFORE INSERT
--      guard trigger on journal_entry_confirmations (FOR KEY SHARE vs the
--      supersedes' FOR UPDATE), stale statuses in the interactive RPCs,
--      staleness predicate in the direct-insert policy, EXCLUSIVE-mode
--      cutover quiesce before the backfill, and explicit path-based cycle
--      detection in the backfill CTE.
--   6. reviewable_journal_entry_ids excludes superseded/deleted rows (the
--      inbox/queue/counts otherwise show permanently-unactionable cards);
--      cutover locks reordered child->parent with lock_timeout (deadlock-
--      safe quiesce that also drains legacy photo registrations); backfill
--      skips sources that acquired confirmations pre-trigger.
-- Human-gated application per the train's RED migration discipline - DRY-RUN
-- ONLY until explicit owner approval; never self-applied.
--
-- ROLLBACK: paired reverse file
--   supabase/rollbacks/20260720150000_journal_photo_continuity_v1.down.sql
--   restores, verbatim: the applied W0 v2 + legacy supersede bodies and the
--   20260612091000 register_journal_entry_photo body. It deliberately
--   RETAINS the metadata-resolving storage policy and the tightened UPDATE
--   policy/column grant (reverting those would re-expose already-moved
--   objects to the old organization). It does NOT touch the W0 integrity fix.
-- ============================================================================
-- 20260720150000_journal_photo_continuity_v1.sql
--
-- Invite-Ready Closure Train v1 - Wagon 1: journal attachment continuity.
--
-- DEFECT: editing an entry (atomic supersede A->B) left the photo metadata
-- row attached to the superseded, hidden entry A. The live entry B showed no
-- photo evidence; every per-entry photo surface (document centre, project
-- gallery, AI work-journal context) saw the live entry as photo-less, and a
-- re-attach in the composer's edit flow left the ORIGINAL photo stranded on
-- the hidden entry - silent evidence loss/duplication on every edit. After
-- this fix a re-attach on an entry that already has a photo hits the honest
-- free-tier photo_limit_reached (photo replace/remove UI is a tracked
-- follow-up).
--
-- FIX (one coherent authorization source + serialized attachment lifecycle):
--   metadata move inside the atomic supersede; registration serialized on the
--   same entry row lock; storage-object authorization resolved through the
--   canonical metadata row. Storage objects are immutable and untouched - one
--   logical attachment, provenance inherent in the storage path
--   (<profile_id>/<original_entry_id>/<photo_id>/<file>). Confirmed originals
--   (correction lane) keep their photo; removed/failed rows stay historical.
--
-- Idempotent: CREATE OR REPLACE + drop-and-recreate policies. Reversible.
-- ============================================================================

begin;

-- Bound EVERY lock wait in this transaction (child-table DDL included): a
-- stuck acquisition fails the whole apply cleanly instead of queueing
-- production writers behind it. Deadlock note: legacy supersedes read
-- confirmations AFTER their entry lock (parent->child) while confirmation
-- inserts go child->parent — no static order satisfies both, so a racing
-- legacy supersede can, in a sub-second window, deadlock this apply. That
-- aborts THIS transaction cleanly (or one app request gets 40P01); the
-- runbook step is simply: retry the apply once.
set local lock_timeout = '10s';

-- == 1. Atomic v2: supersede + selected-skill evidence + photo continuity ==

create or replace function public.journal_entry_supersede_v2(
  p_old_entry_id          uuid,
  p_engagement_context_id uuid,
  p_entry_type_slug       text,
  p_profession_id         uuid,
  p_original_text         text,
  p_original_language     char(2),
  p_hash_self             text,
  p_visibility_scope      text,
  p_metrics               jsonb,
  p_selected_slugs        text[] default '{}',
  p_rejected_slugs        text[] default '{}'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id         uuid;
  v_old_deleted_at    timestamptz;
  v_old_superseded_by uuid;
  v_old_project_id    uuid;
  v_old_correction_of uuid;
  v_old_confirmed     int;
  v_new_entry_id      uuid;
  v_row               jsonb;
  v_selected          text[];
  v_rejected          text[];
  v_slug              text;
  v_known_count       int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Row lock: serializes every concurrent supersede/correction of the same
  -- entry. The second transaction blocks here until the first commits, then
  -- sees its writes and is rejected below — never two live descendants.
  select worker_id, deleted_at, superseded_by, project_id, correction_of
    into v_worker_id, v_old_deleted_at, v_old_superseded_by, v_old_project_id,
         v_old_correction_of
    from public.journal_entries
   where id = p_old_entry_id
   for update;

  if v_worker_id is null then
    raise exception 'entry_not_found' using errcode = 'P0002';
  end if;
  if not public.owns_worker(v_worker_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if v_old_deleted_at is not null then
    raise exception 'cannot_supersede_deleted' using errcode = '42P10';
  end if;
  if v_old_superseded_by is not null then
    raise exception 'entry_superseded' using errcode = '55000';
  end if;

  select count(*) into v_old_confirmed
    from public.journal_entry_confirmations
    where entry_id = p_old_entry_id;

  -- Confirmed originals keep `superseded_by` NULL (the correction model shows
  -- both rows), so single-descendant must be enforced explicitly: only one
  -- LIVE correction may exist per confirmed original.
  if v_old_confirmed > 0 and exists (
    select 1 from public.journal_entries c
     where c.correction_of = p_old_entry_id
       and c.deleted_at is null
       and c.superseded_by is null
  ) then
    raise exception 'entry_superseded' using errcode = '55000';
  end if;

  -- Selected-slug validation. A slug both selected and rejected in the same
  -- request resolves to REJECTED (deterministic; matches the app-side rule).
  v_rejected := coalesce(p_rejected_slugs, '{}');
  v_selected := coalesce(array(
    select distinct s
      from unnest(coalesce(p_selected_slugs, '{}')) as s
     where s is not null and s <> '' and not (s = any(v_rejected))
  ), '{}');

  foreach v_slug in array v_selected loop
    if v_slug !~ '^[a-z0-9_-]{1,64}$' then
      raise exception 'invalid_skill_slug' using errcode = '22023';
    end if;
  end loop;

  if cardinality(v_selected) > 0 then
    select count(*) into v_known_count
      from public.skills sk
     where sk.slug = any(v_selected)
       and sk.is_active is not false;
    if v_known_count < cardinality(v_selected) then
      -- Unknown or inactive taxonomy row: the whole save fails loudly rather
      -- than silently dropping a selection the worker believes was saved.
      raise exception 'skill_slug_unknown' using errcode = '22023';
    end if;
  end if;

  -- New entry (hash-chained, project carried from the old row).
  -- correction_of: a CONFIRMED old entry gets a correction pointing at it;
  -- an UNCONFIRMED old entry that is ITSELF a correction carries its
  -- correction_of forward — otherwise editing a live correction would strip
  -- the marker and let a second live correction of the same original slip
  -- past the one-live-correction guard above.
  insert into public.journal_entries (
    worker_id, engagement_context_id, entry_type_slug, profession_id,
    original_text, original_language, hash_prev, hash_self,
    visibility_scope, correction_of, project_id
  )
  values (
    v_worker_id, p_engagement_context_id, p_entry_type_slug, p_profession_id,
    p_original_text, p_original_language,
    (select hash_self
       from public.journal_entries
      where worker_id = v_worker_id
        and deleted_at is null
      order by created_at desc
      limit 1),
    p_hash_self, p_visibility_scope,
    case when v_old_confirmed > 0 then p_old_entry_id
         else v_old_correction_of end,
    v_old_project_id
  )
  returning id into v_new_entry_id;

  -- Fragment / activity / time metrics from the save payload.
  if jsonb_typeof(p_metrics) = 'array' then
    for v_row in select * from jsonb_array_elements(coalesce(p_metrics, '[]'::jsonb))
    loop
      insert into public.journal_entry_metrics (
        entry_id, metric_slug, value_text, value_numeric, unit_slug, source
      )
      values (
        v_new_entry_id,
        v_row->>'metric_slug',
        nullif(v_row->>'value_text', ''),
        case
          when v_row ? 'value_numeric' and v_row->>'value_numeric' is not null
            then (v_row->>'value_numeric')::numeric
          else null
        end,
        nullif(v_row->>'unit_slug', ''),
        coalesce(v_row->>'source', 'worker_input')
      );
    end loop;
  end if;

  -- Decision markers carried from the old entry so the derivation pipeline
  -- keeps honouring the worker's past answers. A `skill_rejected` marker for
  -- a slug the worker re-selected in THIS save is NOT carried (re-add wins).
  insert into public.journal_entry_metrics (
    entry_id, metric_slug, value_text, value_numeric, source
  )
  select distinct on (m.metric_slug, trim(m.value_text))
         v_new_entry_id, m.metric_slug, m.value_text, m.value_numeric,
         'worker_input'
    from public.journal_entry_metrics m
   where m.entry_id = p_old_entry_id
     and m.metric_slug in (
       'ambiguous_resolved', 'skill_rejected',
       'skill_claim_rejected', 'unresolved_dismissed'
     )
     and m.value_text is not null
     and not (m.metric_slug = 'skill_rejected'
              and trim(m.value_text) = any(v_selected))
     and not exists (
       select 1 from public.journal_entry_metrics n
        where n.entry_id = v_new_entry_id
          and n.metric_slug = m.metric_slug
          and coalesce(trim(n.value_text), '') = coalesce(trim(m.value_text), '')
     );

  -- Non-rederivable skill evidence links carried from the old entry,
  -- excluding skills rejected in THIS save (a deliberate removal sticks).
  insert into public.journal_entry_skills (journal_entry_id, worker_id, skill_id)
  select v_new_entry_id, l.worker_id, l.skill_id
    from public.journal_entry_skills l
    join public.skills sk on sk.id = l.skill_id
   where l.journal_entry_id = p_old_entry_id
     and not (sk.slug = any(v_rejected))
  on conflict (journal_entry_id, skill_id) do nothing;

  -- Selected taxonomy skills: honest self-declared lane. Insert-only — an
  -- existing stronger row (journal-derived or manager-backed) is never
  -- downgraded.
  insert into public.worker_skills (
    worker_id, skill_id, verified, source, confidence_bin
  )
  select v_worker_id, sk.id, false, 'self_declared', 'yellow'
    from public.skills sk
   where sk.slug = any(v_selected)
     and sk.is_active is not false
  on conflict (worker_id, skill_id) do nothing;

  insert into public.journal_entry_skills (journal_entry_id, worker_id, skill_id)
  select v_new_entry_id, v_worker_id, sk.id
    from public.skills sk
   where sk.slug = any(v_selected)
     and sk.is_active is not false
  on conflict (journal_entry_id, skill_id) do nothing;

  -- Photo evidence continuity (W1): the entry's active photo metadata rides
  -- the supersede to the NEW live entry INSIDE the same transaction. The
  -- storage object is never copied, moved or deleted — one immutable object,
  -- one logical attachment; provenance stays inherent in the storage path
  -- (<profile_id>/<original_entry_id>/<photo_id>/<file>). Confirmed
  -- originals (correction lane) keep their photo — the old row stays visible
  -- and its evidence must stay with it.
  if v_old_confirmed = 0 then
    update public.journal_entry_photos
       set entry_id = v_new_entry_id,
           updated_at = now()
     where entry_id = p_old_entry_id
       and upload_status in ('uploading','uploaded');
  end if;

  -- Advance the chain pointer last, conditionally. Belt-and-braces: the row
  -- is locked above, so `superseded_by` cannot have changed — if it somehow
  -- did, fail the WHOLE transaction instead of forking the chain.
  if v_old_confirmed = 0 then
    update public.journal_entries
       set superseded_by = v_new_entry_id,
           updated_at = now()
     where id = p_old_entry_id
       and superseded_by is null;
    if not found then
      raise exception 'entry_superseded' using errcode = '55000';
    end if;
  end if;

  return v_new_entry_id;
end;
$$;

-- == 2. Serialize photo registration with the supersede (owner-hold P2) ==
-- Locks the journal entry row FOR UPDATE (the same lock the supersede takes)
-- and refuses superseded/deleted entries with structured errors, so a
-- registration racing an edit either lands BEFORE the move scan (and rides
-- it) or is refused AFTER - an active photo can never strand on a hidden
-- entry, and the 1-photo cap is race-proof.

create or replace function public.register_journal_entry_photo(
  p_photo_id     uuid,
  p_entry_id     uuid,
  p_file_name    text,
  p_mime_type    text,
  p_file_size    bigint,
  p_storage_path text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid               uuid := auth.uid();
  resolved_id       uuid;
  cleaned_name      text := nullif(trim(coalesce(p_file_name, '')), '');
  cleaned_mime      text := lower(nullif(trim(coalesce(p_mime_type, '')), ''));
  cleaned_path      text := nullif(trim(coalesce(p_storage_path, '')), '');
  expected_prefix   text;
  entry_owner       uuid;
  v_superseded_by   uuid;
  v_deleted_at      timestamptz;
  existing_count    integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if cleaned_name is null or char_length(cleaned_name) > 255 then
    raise exception 'Invalid file_name' using errcode = '22023';
  end if;

  if cleaned_mime is null or cleaned_mime not in (
    'image/jpeg',
    'image/png',
    'image/webp'
  ) then
    raise exception 'unsupported_mime_type' using errcode = '22023';
  end if;

  if p_file_size is null or p_file_size <= 0 or p_file_size > 5242880 then
    raise exception 'file_too_large' using errcode = '22023';
  end if;

  if cleaned_path is null or char_length(cleaned_path) > 1024 then
    raise exception 'Invalid storage_path' using errcode = '22023';
  end if;

  -- Caller must own the journal entry. FOR UPDATE serializes this whole
  -- registration against journal_entry_supersede_v2 (which locks the same
  -- row): register-then-edit rides the move; edit-then-register is refused.
  select w.profile_id, je.superseded_by, je.deleted_at
    into entry_owner, v_superseded_by, v_deleted_at
    from public.journal_entries je
    join public.workers w on w.id = je.worker_id
   where je.id = p_entry_id
   for update of je;
  if entry_owner is null then
    raise exception 'Entry not found' using errcode = '42704';
  end if;
  if entry_owner <> uid then
    raise exception 'Entry not owned' using errcode = '42501';
  end if;
  if v_deleted_at is not null then
    raise exception 'entry_deleted' using errcode = '42P10';
  end if;
  if v_superseded_by is not null then
    raise exception 'entry_superseded' using errcode = '55000';
  end if;

  -- FREE-TIER LIMIT: one photo per entry. Honest, server-enforced, and now
  -- race-proof (the entry row lock serializes concurrent registrations).
  select count(*) into existing_count
    from public.journal_entry_photos
   where entry_id = p_entry_id
     and upload_status in ('uploading','uploaded');
  if existing_count >= 1 then
    raise exception 'photo_limit_reached' using errcode = '22023';
  end if;

  expected_prefix := uid::text || '/' || p_entry_id::text || '/';
  if position(expected_prefix in cleaned_path) <> 1 then
    raise exception 'storage_path does not start with %', expected_prefix
      using errcode = '22023';
  end if;

  insert into public.journal_entry_photos (
    id, entry_id, profile_id, file_name, mime_type, file_size_bytes, storage_path
  ) values (
    coalesce(p_photo_id, gen_random_uuid()),
    p_entry_id,
    uid,
    cleaned_name,
    cleaned_mime,
    p_file_size,
    cleaned_path
  )
  returning id into resolved_id;

  return resolved_id;
end $$;

-- == 2b. Serialize EVERY confirmation path with the supersedes ==
-- (owner-hold v4 items 1-4). ONE BEFORE INSERT guard trigger is the hard
-- serialization point for every insert path into journal_entry_confirmations
-- (review_journal_entry, confirm_entry_and_verify_skills,
-- apply_learning_auto_confirmation, the app's direct inserts, and any future
-- compatibility path): its FOR KEY SHARE read conflicts with the supersedes'
-- FOR UPDATE, so
--   * a confirmation committed first makes the racing supersede take the
--     correction lane -> the photo STAYS on the confirmed source (item 1);
--   * a supersede committed first makes the racing confirmation re-read the
--     row and be REFUSED with a structured error (item 3).

create or replace function public.journal_entry_confirmations_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_superseded uuid;
  v_deleted    timestamptz;
begin
  select superseded_by, deleted_at
    into v_superseded, v_deleted
    from public.journal_entries
   where id = new.entry_id
   for key share;
  if not found then
    raise exception 'entry_not_found' using errcode = 'P0002';
  end if;
  if v_deleted is not null then
    raise exception 'entry_deleted' using errcode = '42P10';
  end if;
  if v_superseded is not null then
    raise exception 'entry_superseded' using errcode = '55000';
  end if;
  return new;
end $$;

drop trigger if exists journal_entry_confirmations_guard
  on public.journal_entry_confirmations;
create trigger journal_entry_confirmations_guard
  before insert on public.journal_entry_confirmations
  for each row execute function public.journal_entry_confirmations_guard();

-- Defense in depth: the direct-insert RLS policy also refuses stale targets
-- (the trigger remains the race-proof guarantee).
drop policy if exists journal_entry_confirmations_insert
  on public.journal_entry_confirmations;
create policy journal_entry_confirmations_insert on public.journal_entry_confirmations for insert
  with check (
    confirmer_id = auth.uid()
    and exists (select 1 from public.journal_entries je
                 join public.engagement_contexts ec on ec.id = je.engagement_context_id
                where je.id = journal_entry_confirmations.entry_id
                  and je.superseded_by is null
                  and je.deleted_at is null
                  and manages_organization(ec.organization_id))
  );

-- Clean stale statuses in the interactive confirmation RPCs (bodies from
-- 20260530140000 verbatim + the stale check; apply_learning_auto_confirmation
-- is covered by the guard trigger).

create or replace function public.review_journal_entry(
  p_entry_id uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_org uuid; v_worker uuid; v_eng uuid; v_role text; v_action text; v_enabled boolean;
  v_superseded uuid; v_deleted timestamptz;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected','changes_requested') then return 'invalid_decision'; end if;

  select ec.organization_id, je.worker_id, coalesce(ec.journal_review_enabled, false),
         je.superseded_by, je.deleted_at
    into v_org, v_worker, v_enabled, v_superseded, v_deleted
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where je.id = p_entry_id;
  if not found then return 'entry_not_found'; end if;
  -- Stale-confirmation refusal (owner-hold v4 items 2/3): a superseded or
  -- deleted entry can no longer be confirmed. The BEFORE INSERT guard
  -- trigger on journal_entry_confirmations is the hard serialization point;
  -- this check returns the clean status in the common (non-racing) case.
  if v_deleted is not null then return 'entry_deleted'; end if;
  if v_superseded is not null then return 'entry_superseded'; end if;
  if v_org is null then return 'entry_not_org_scoped'; end if;
  if not (public.is_admin() or public.manages_organization(v_org)) then return 'not_authorized'; end if;
  if not v_enabled then return 'review_not_enabled'; end if;

  select ec.id, ec.relationship_slug into v_eng, v_role
  from public.engagement_contexts ec
  where ec.profile_id = uid and ec.organization_id = v_org and ec.status = 'active'
    and ec.relationship_slug in ('manager','owner','external_manager') limit 1;
  if v_eng is null then return 'no_reviewer_engagement'; end if;

  v_action := case p_decision when 'approved' then 'confirm'
                              when 'rejected' then 'reject'
                              else 'request_changes' end;

  insert into public.journal_entry_confirmations
    (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
  values (p_entry_id, uid, v_eng, v_role,
    jsonb_build_object('action', v_action, 'decision', p_decision,
      'note', nullif(btrim(coalesce(p_note,'')), '')));

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'review_journal_entry', 'journal_entries', p_entry_id,
    jsonb_build_object('decision', p_decision, 'organization_id', v_org, 'worker_id', v_worker));
  return p_decision;
end $$;

create or replace function public.confirm_entry_and_verify_skills(
  p_entry_id uuid, p_skill_ids uuid[], p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_org uuid; v_worker uuid; v_eng uuid; v_role text; v_enabled boolean; v_n int;
  v_superseded uuid; v_deleted timestamptz;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_skill_ids is null or array_length(p_skill_ids, 1) is null then return 'no_skills'; end if;

  select ec.organization_id, je.worker_id, coalesce(ec.journal_review_enabled, false),
         je.superseded_by, je.deleted_at
    into v_org, v_worker, v_enabled, v_superseded, v_deleted
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where je.id = p_entry_id;
  if not found then return 'entry_not_found'; end if;
  -- Stale-confirmation refusal (owner-hold v4 items 2/3): a superseded or
  -- deleted entry can no longer be confirmed. The BEFORE INSERT guard
  -- trigger on journal_entry_confirmations is the hard serialization point;
  -- this check returns the clean status in the common (non-racing) case.
  if v_deleted is not null then return 'entry_deleted'; end if;
  if v_superseded is not null then return 'entry_superseded'; end if;
  if v_org is null then return 'entry_not_org_scoped'; end if;
  if not (public.is_admin() or public.manages_organization(v_org)) then return 'not_authorized'; end if;
  if not v_enabled then return 'review_not_enabled'; end if;

  -- Every confirmed skill must actually belong to this worker.
  if exists (
    select 1 from unnest(p_skill_ids) sid
    where not exists (select 1 from public.worker_skills ws
                       where ws.worker_id = v_worker and ws.skill_id = sid)
  ) then return 'skill_not_owned'; end if;

  select ec.id, ec.relationship_slug into v_eng, v_role
  from public.engagement_contexts ec
  where ec.profile_id = uid and ec.organization_id = v_org and ec.status = 'active'
    and ec.relationship_slug in ('manager','owner','external_manager') limit 1;
  if v_eng is null then return 'no_reviewer_engagement'; end if;

  -- 1) record the confirmation (append-only) against the reviewer's engagement
  insert into public.journal_entry_confirmations
    (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
  values (p_entry_id, uid, v_eng, v_role,
    jsonb_build_object('action','confirm','decision','approved',
      'skills_confirmed', to_jsonb(p_skill_ids),
      'note', nullif(btrim(coalesce(p_note,'')), '')));

  -- 2) THE PROOF: flip the confirmed declared skills to verified
  update public.worker_skills
     set verified = true, verified_by = uid, verified_at = now(),
         source = 'manager_confirmed', confidence_bin = 'green', updated_at = now()
   where worker_id = v_worker and skill_id = any(p_skill_ids)
     and (verified is distinct from true);
  get diagnostics v_n = row_count;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'confirm_entry_and_verify_skills', 'journal_entries', p_entry_id,
    jsonb_build_object('organization_id', v_org, 'worker_id', v_worker,
      'skills_confirmed', to_jsonb(p_skill_ids), 'skills_newly_verified', v_n));
  return 'verified:' || v_n::text;
end $$;

-- Shared read set: stale rows are not reviewable (owner-hold v4 P1 —
-- inbox/queue/dashboard counts consume this RPC without extra filtering).

create or replace function public.reviewable_journal_entry_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  return query
    select je.id
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    where ec.organization_id is not null
      -- Stale rows are no longer reviewable (owner-hold v4 follow-through):
      -- every confirmation path now refuses superseded/deleted entries, so
      -- the shared read set must exclude them or the inbox/queue/counts show
      -- permanently-broken cards.
      and je.superseded_by is null
      and je.deleted_at is null
      and coalesce(ec.journal_review_enabled, false) is true
      and (public.is_admin() or public.manages_organization(ec.organization_id))
      and not exists (select 1 from public.journal_entry_confirmations c where c.entry_id = je.id);
end $$;

revoke all on function public.reviewable_journal_entry_ids() from public;
grant execute on function public.reviewable_journal_entry_ids() to authenticated;

revoke all on function public.review_journal_entry(uuid, text, text) from public;
grant execute on function public.review_journal_entry(uuid, text, text) to authenticated;
revoke all on function public.confirm_entry_and_verify_skills(uuid, uuid[], text) from public;
grant execute on function public.confirm_entry_and_verify_skills(uuid, uuid[], text) to authenticated;

-- == 3. One coherent authorization source for storage reads (owner-hold P1) ==
-- The org-manager storage policy now resolves the CANONICAL metadata row by
-- storage_path (UNIQUE) and authorizes through its CURRENT entry - identical
-- scope to journal_entry_photos_select_org_manager, before and after any
-- move/engagement change. The historical entry id embedded in the path is
-- provenance only, never authorization. Worker-owner and admin policies from
-- 20260612091000 are unchanged (profile_id is immutable on move).

drop policy if exists "journal-entry-photos org manager select"
  on storage.objects;
create policy "journal-entry-photos org manager select"
  on storage.objects for select
  using (
    bucket_id = 'journal-entry-photos'
    and auth.uid() is not null
    and exists (
      select 1
        from public.journal_entry_photos p
        join public.journal_entries je on je.id = p.entry_id
        join public.engagement_contexts ec on ec.id = je.engagement_context_id
       where p.storage_path = storage.objects.name
         and public.manages_organization(ec.organization_id)
    )
  );

-- == 4. Photo rows cannot be repointed by the owner ==
-- WITH CHECK + a column-restricted UPDATE grant: a worker may only change
-- upload_status (remove/replace lifecycle), never entry_id / profile_id /
-- storage_path - so metadata-resolved authorization cannot be redirected.

drop policy if exists journal_entry_photos_update on public.journal_entry_photos;
create policy journal_entry_photos_update on public.journal_entry_photos for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

revoke update on public.journal_entry_photos from authenticated;
grant update (upload_status) on public.journal_entry_photos to authenticated;

-- == 4b. Cutover quiesce + one-time backfill (owner-hold v4 item 5) ==
-- Ordering is deliberate and deadlock-safe: every child-table DDL above
-- (confirmations trigger/policy, storage policy, photos policy) has already
-- taken ACCESS EXCLUSIVE locks on those tables — in-flight OLD-body writers
-- (register: photos -> entries FK; confirmations: confirmations -> entries
-- FK) acquire children BEFORE the parent, and so do we. Old supersedes lock
-- the parent entry first and then READ confirmations — the one writer shape
-- with the opposite order; a racing one can deadlock this apply in a
-- sub-second window, which aborts cleanly under the transaction-wide
-- lock_timeout set at the top (runbook: retry the apply once). Taking
-- journal_entries EXCLUSIVE LAST waits for every other in-flight legacy
-- writer (including legacy photo registrations, which queue behind the
-- photos ACCESS EXCLUSIVE) and blocks new writers until commit.
-- The backfill is idempotent; the deploy runbook may re-run it once
-- post-deploy as a belt-and-braces sweep.

lock table public.journal_entries in exclusive mode;

-- == 1b. One-time repair: photos stranded by supersedes completed between ==
-- the W0 production deploy and this migration (Codex rev2 P1). Follow each
-- ACTIVE stranded photo's supersede chain to its LIVE, non-deleted tip and
-- move the metadata there — but ONLY when the tip has no active photo of its
-- own (never create a second active attachment; a colliding stranded row
-- stays where it is, honestly historical). Idempotent: a repaired chain has
-- no stranded active rows left, so a re-run matches nothing.

with recursive chain as (
  select p.id as photo_id, je.id as entry_id, je.superseded_by,
         array[je.id] as path
    from public.journal_entry_photos p
    join public.journal_entries je on je.id = p.entry_id
   where p.upload_status in ('uploading','uploaded')
     and je.superseded_by is not null
     -- A source that acquired confirmations (via the pre-trigger paths)
     -- keeps its evidence — same doctrine as the RPCs' correction lane.
     and not exists (select 1 from public.journal_entry_confirmations cc
                      where cc.entry_id = je.id)
  union all
  -- Explicit cycle detection: legitimate writers keep this graph acyclic,
  -- but the apply must terminate even against adversarially pre-positioned
  -- pointer cycles. A node already on the traversal path is never revisited,
  -- so a cycle simply never yields a live tip and its photos stay put.
  select c.photo_id, n.id, n.superseded_by, c.path || n.id
    from chain c
    join public.journal_entries n on n.id = c.superseded_by
   where not (n.id = any(c.path))
),
live_tip as (
  select c.photo_id, c.entry_id as live_entry_id
    from chain c
    join public.journal_entries tip on tip.id = c.entry_id
   where c.superseded_by is null
     and tip.deleted_at is null
),
-- Exactly ONE photo may land on each tip (oldest wins) — two stranded rows
-- converging on the same tip must not both pass the snapshot-time collision
-- check and break the 1-active-photo invariant.
pick as (
  select distinct on (l.live_entry_id) l.photo_id, l.live_entry_id
    from live_tip l
    join public.journal_entry_photos pp on pp.id = l.photo_id
   order by l.live_entry_id, pp.created_at asc, pp.id asc
)
update public.journal_entry_photos p
   set entry_id = l.live_entry_id,
       updated_at = now()
  from pick l
 where p.id = l.photo_id
   and p.entry_id <> l.live_entry_id
   and not exists (
     select 1 from public.journal_entry_photos q
      where q.entry_id = l.live_entry_id
        and q.upload_status in ('uploading','uploaded')
        and q.id <> p.id
   );

-- == 1c. LEGACY journal_entry_supersede: full photo-continuity parity ==
-- (owner-hold #2 P1). The 9-arg legacy RPC stays executable for older
-- deployed callers and rollback builds; without the move, any legacy call
-- AFTER the one-time backfill would strand its active photo on the hidden
-- predecessor. It now carries the identical W0 lock + stale-rejection body
-- PLUS the same gated photo move as v2 — same entry row lock, so every
-- concurrency, authorization, correction-lane and removed/failed-row
-- invariant is shared with v2.

create or replace function public.journal_entry_supersede(
  p_old_entry_id          uuid,
  p_engagement_context_id uuid,
  p_entry_type_slug       text,
  p_profession_id         uuid,
  p_original_text         text,
  p_original_language     char(2),
  p_hash_self             text,
  p_visibility_scope      text,
  p_metrics               jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id         uuid;
  v_old_confirmed     int;
  v_new_entry_id      uuid;
  v_row               jsonb;
  v_old_deleted_at    timestamptz;
  v_old_superseded_by uuid;
  v_old_project_id    uuid;
  v_old_correction_of uuid;
begin
  select worker_id, deleted_at, superseded_by, project_id, correction_of
    into v_worker_id, v_old_deleted_at, v_old_superseded_by, v_old_project_id,
         v_old_correction_of
    from public.journal_entries
    where id = p_old_entry_id
    for update;

  if v_worker_id is null then
    raise exception 'entry_not_found' using errcode = 'P0002';
  end if;
  if v_old_deleted_at is not null then
    raise exception 'cannot_supersede_deleted' using errcode = '42P10';
  end if;
  if not public.owns_worker(v_worker_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if v_old_superseded_by is not null then
    raise exception 'entry_superseded' using errcode = '55000';
  end if;

  select count(*) into v_old_confirmed
    from public.journal_entry_confirmations
    where entry_id = p_old_entry_id;

  if v_old_confirmed > 0 and exists (
    select 1 from public.journal_entries c
     where c.correction_of = p_old_entry_id
       and c.deleted_at is null
       and c.superseded_by is null
  ) then
    raise exception 'entry_superseded' using errcode = '55000';
  end if;

  insert into public.journal_entries (
    worker_id, engagement_context_id, entry_type_slug, profession_id,
    original_text, original_language, hash_prev, hash_self,
    visibility_scope, correction_of, project_id
  )
  values (
    v_worker_id, p_engagement_context_id, p_entry_type_slug, p_profession_id,
    p_original_text, p_original_language,
    (select hash_self
       from public.journal_entries
      where worker_id = v_worker_id
        and deleted_at is null
      order by created_at desc
      limit 1),
    p_hash_self, p_visibility_scope,
    case when v_old_confirmed > 0 then p_old_entry_id
         else v_old_correction_of end,
    v_old_project_id
  )
  returning id into v_new_entry_id;

  if jsonb_typeof(p_metrics) = 'array' then
    for v_row in select * from jsonb_array_elements(coalesce(p_metrics, '[]'::jsonb))
    loop
      insert into public.journal_entry_metrics (
        entry_id, metric_slug, value_text, value_numeric, unit_slug, source
      )
      values (
        v_new_entry_id,
        v_row->>'metric_slug',
        nullif(v_row->>'value_text', ''),
        case
          when v_row ? 'value_numeric' and v_row->>'value_numeric' is not null
            then (v_row->>'value_numeric')::numeric
          else null
        end,
        nullif(v_row->>'unit_slug', ''),
        coalesce(v_row->>'source', 'worker_input')
      );
    end loop;
  end if;

  -- Photo evidence continuity (W1 rev6 — owner-hold #2): the LEGACY RPC gets
  -- the SAME in-transaction metadata move as v2, so an older deployed caller
  -- can never strand an active photo on the hidden predecessor. Storage
  -- objects untouched; confirmed originals (correction lane) keep theirs.
  if v_old_confirmed = 0 then
    update public.journal_entry_photos
       set entry_id = v_new_entry_id,
           updated_at = now()
     where entry_id = p_old_entry_id
       and upload_status in ('uploading','uploaded');
  end if;

  if v_old_confirmed = 0 then
    update public.journal_entries
       set superseded_by = v_new_entry_id,
           updated_at = now()
     where id = p_old_entry_id
       and superseded_by is null;
    if not found then
      raise exception 'entry_superseded' using errcode = '55000';
    end if;
  end if;

  return v_new_entry_id;
end;
$$;

revoke all on function public.journal_entry_supersede(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb
) from public;
grant execute on function public.journal_entry_supersede(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb
) to authenticated;


-- == 5. Grants (function surface unchanged in shape) ==

revoke all on function public.journal_entry_supersede_v2(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb, text[], text[]
) from public;
grant execute on function public.journal_entry_supersede_v2(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb, text[], text[]
) to authenticated;

revoke all on function public.register_journal_entry_photo(uuid, uuid, text, text, bigint, text) from public;
grant execute on function public.register_journal_entry_photo(uuid, uuid, text, text, bigint, text) to authenticated;

commit;
