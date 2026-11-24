-- ════════════════════════════════════════════════════════════════════════
-- 0017 — Seed missing platform productivity_units + add an atomic
--        create_journal_entry_full RPC so the save loop can never leave
--        a half-written entry behind.
--
-- Why this migration:
--   The 0013 work-journal seed only inserted three slugs into the
--   `productivity_units` registry:
--     - square_meters
--     - square_meters_per_day
--     - box_per_day
--
--   But `apps/web/components/app/journal-entry-composer.tsx` has always
--   listed hours / minutes / days / meters / pieces / kilograms / packages
--   in its picker, and `messages/{locale}/productivity-units.json` carries
--   localized labels for every one of them. When a worker confirmed any
--   time-only suggestion (or any non-m² quantity), the journal save
--   action posted a `journal_entry_metrics` row with `unit_slug='hours'`
--   (etc.) — and the FK to `productivity_units(slug)` silently rejected
--   it.
--
--   Pre-PR #61 the failure was masked by the action's generic catch
--   ("Nepavyko išsaugoti"). PR #61 surfaced the real FK error per failure
--   code, which exposed this long-latent gap.
--
--   This migration closes the seed AND adds an atomic RPC so a future
--   schema/grant slip can never again leave the user with a "ghost" entry
--   that has no metric rows.
--
-- Safety:
--   - Additive only — does not drop or rewrite any existing schema, and
--     does not remove any existing rows.
--   - Seed uses `on conflict (slug) do nothing` so it is idempotent.
--   - The RPC is `security invoker` (the default): RLS still applies and
--     a worker still cannot insert a row for someone else's worker_id.
--   - No service_role bypass.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Seed the platform time / count / length / mass units ───────────────
insert into public.productivity_units (slug, category, scope, parent_unit_slug, conversion_factor) values
  ('hours',     'time',   'platform', null, null),
  ('minutes',   'time',   'platform', 'hours', 0.0166666667), -- 1/60
  ('days',      'time',   'platform', 'hours', 24),
  ('meters',    'length', 'platform', null, null),
  ('pieces',    'count',  'platform', null, null),
  ('kilograms', 'mass',   'platform', null, null),
  ('packages',  'count',  'platform', null, null)
on conflict (slug) do nothing;

-- ── 2. Atomic journal save RPC ───────────────────────────────────────────
--
-- `metrics` is a jsonb array of objects with shape:
--   {
--     metric_slug:   text,
--     value_text:    text | null,
--     value_numeric: numeric | null,
--     unit_slug:     text | null,
--     source:        text  -- 'worker_input' | 'ai_extracted' | 'manager_corrected'
--   }
--
-- All inserts run inside the function's implicit transaction. Any error in
-- the journal_entries insert OR in any of the journal_entry_metrics rows
-- aborts the whole thing — the entry never lands without its metrics, and
-- a missing unit_slug FK surfaces as a clean exception the caller can
-- render verbatim.

create or replace function public.create_journal_entry_full(
  p_worker_id             uuid,
  p_engagement_context_id uuid,
  p_entry_type_slug       text,
  p_profession_id         uuid,
  p_original_text         text,
  p_original_language     char(2),
  p_hash_prev             text,
  p_hash_self             text,
  p_visibility_scope      text,
  p_metrics               jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_entry_id uuid;
  v_row       jsonb;
begin
  insert into public.journal_entries (
    worker_id,
    engagement_context_id,
    entry_type_slug,
    profession_id,
    original_text,
    original_language,
    hash_prev,
    hash_self,
    visibility_scope
  )
  values (
    p_worker_id,
    p_engagement_context_id,
    p_entry_type_slug,
    p_profession_id,
    p_original_text,
    p_original_language,
    p_hash_prev,
    p_hash_self,
    p_visibility_scope
  )
  returning id into v_entry_id;

  if jsonb_typeof(p_metrics) = 'array' then
    for v_row in select * from jsonb_array_elements(coalesce(p_metrics, '[]'::jsonb))
    loop
      insert into public.journal_entry_metrics (
        entry_id,
        metric_slug,
        value_text,
        value_numeric,
        unit_slug,
        source
      )
      values (
        v_entry_id,
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

  return v_entry_id;
end;
$$;

revoke all on function public.create_journal_entry_full(
  uuid, uuid, text, uuid, text, char(2), text, text, text, jsonb
) from public;

grant execute on function public.create_journal_entry_full(
  uuid, uuid, text, uuid, text, char(2), text, text, text, jsonb
) to authenticated;
