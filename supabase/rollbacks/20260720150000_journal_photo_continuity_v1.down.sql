-- ============================================================================
-- Rollback for 20260720150000_journal_photo_continuity_v1.sql
--
-- Restores the W0 journal_entry_supersede_v2 body verbatim (from
-- 20260720100000_journal_atomic_supersede_v1.sql, ledger 20260720035240) —
-- i.e. removes the photo-continuity move. Photo metadata rows already moved
-- remain with their live entries; storage objects were never touched.
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

-- Grants unchanged in shape; re-issued to keep this file self-contained.
revoke all on function public.journal_entry_supersede_v2(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb, text[], text[]
) from public;
grant execute on function public.journal_entry_supersede_v2(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb, text[], text[]
) to authenticated;

commit;
