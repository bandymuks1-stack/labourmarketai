-- ============================================================================
-- Rollback for 20260720150000_journal_photo_continuity_v1.sql (revision 2)
--
-- Restores, verbatim:
--   1. journal_entry_supersede_v2 - the applied W0 production body
--      (ledger 20260720035240); the W0 integrity fix is NOT reverted.
--   2. register_journal_entry_photo - the 20260612091000 body (no entry lock).
--   3. RETAINS the metadata-resolving storage policy and the tightened
--      UPDATE policy/grant (reverting them would recreate metadata/object
--      authorization divergence for rows already moved — see below).
-- Photo metadata rows already moved stay with their live entries; storage
-- objects were never touched.
-- ============================================================================

begin;

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
  uid             uuid := auth.uid();
  resolved_id     uuid;
  cleaned_name    text := nullif(trim(coalesce(p_file_name, '')), '');
  cleaned_mime    text := lower(nullif(trim(coalesce(p_mime_type, '')), ''));
  cleaned_path    text := nullif(trim(coalesce(p_storage_path, '')), '');
  expected_prefix text;
  entry_owner     uuid;
  existing_count  integer;
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

  -- Caller must own the journal entry (workers.profile_id chain).
  select w.profile_id into entry_owner
    from public.journal_entries je
    join public.workers w on w.id = je.worker_id
   where je.id = p_entry_id;
  if entry_owner is null then
    raise exception 'Entry not found' using errcode = '42704';
  end if;
  if entry_owner <> uid then
    raise exception 'Entry not owned' using errcode = '42501';
  end if;

  -- FREE-TIER LIMIT: one photo per entry. Honest, server-enforced. More
  -- photos are a future VIP/Pro feature; nothing here fakes that tier.
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

-- DELIBERATELY RETAINED (Codex rev2 P1 on this rollback): the
-- metadata-resolving org-manager storage policy and the tightened
-- journal_entry_photos UPDATE policy/column grant are NOT reverted. After any
-- cross-context move the immutable object path still embeds the ORIGINAL
-- entry id; restoring path-segment authorization would re-expose objects to
-- the old organization and deny the current one (metadata/object
-- divergence). The metadata-resolved policy stays coherent with rows wherever
-- they are, with or without the move logic, so retaining it is the only
-- rollback that cannot leak. The behavioral change (photo move + serialized
-- registration) IS fully reverted by the function restores above.

revoke all on function public.journal_entry_supersede_v2(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb, text[], text[]
) from public;
grant execute on function public.journal_entry_supersede_v2(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb, text[], text[]
) to authenticated;

revoke all on function public.register_journal_entry_photo(uuid, uuid, text, text, bigint, text) from public;
grant execute on function public.register_journal_entry_photo(uuid, uuid, text, text, bigint, text) to authenticated;

-- Restore the W0-hardened LEGACY journal_entry_supersede (no photo move) —
-- behavioral revert only; authorization stays metadata-coherent via the
-- retained storage policy.

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

-- Owner-hold v4 reverts: remove the confirmation guard trigger, restore the
-- 20260530140000 RPC bodies and the 0013 direct-insert policy verbatim.

drop trigger if exists journal_entry_confirmations_guard
  on public.journal_entry_confirmations;
drop function if exists public.journal_entry_confirmations_guard();

create or replace function public.review_journal_entry(
  p_entry_id uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_org uuid; v_worker uuid; v_eng uuid; v_role text; v_action text; v_enabled boolean;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected','changes_requested') then return 'invalid_decision'; end if;

  select ec.organization_id, je.worker_id, coalesce(ec.journal_review_enabled, false)
    into v_org, v_worker, v_enabled
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where je.id = p_entry_id;
  if not found then return 'entry_not_found'; end if;
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
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_skill_ids is null or array_length(p_skill_ids, 1) is null then return 'no_skills'; end if;

  select ec.organization_id, je.worker_id, coalesce(ec.journal_review_enabled, false)
    into v_org, v_worker, v_enabled
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where je.id = p_entry_id;
  if not found then return 'entry_not_found'; end if;
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

revoke all on function public.review_journal_entry(uuid, text, text) from public;
grant execute on function public.review_journal_entry(uuid, text, text) to authenticated;
revoke all on function public.confirm_entry_and_verify_skills(uuid, uuid[], text) from public;
grant execute on function public.confirm_entry_and_verify_skills(uuid, uuid[], text) to authenticated;

drop policy if exists journal_entry_confirmations_insert
  on public.journal_entry_confirmations;
create policy journal_entry_confirmations_insert on public.journal_entry_confirmations for insert
  with check (
    confirmer_id = auth.uid()
    and exists (select 1 from public.journal_entries je
                 join public.engagement_contexts ec on ec.id = je.engagement_context_id
                where je.id = journal_entry_confirmations.entry_id
                  and manages_organization(ec.organization_id))
  );

-- Restore the 20260530140000 reviewable_journal_entry_ids verbatim.

create or replace function public.reviewable_journal_entry_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  return query
    select je.id
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    where ec.organization_id is not null
      and coalesce(ec.journal_review_enabled, false) is true
      and (public.is_admin() or public.manages_organization(ec.organization_id))
      and not exists (select 1 from public.journal_entry_confirmations c where c.entry_id = je.id);
end $$;

revoke all on function public.reviewable_journal_entry_ids() from public;
grant execute on function public.reviewable_journal_entry_ids() to authenticated;

commit;
