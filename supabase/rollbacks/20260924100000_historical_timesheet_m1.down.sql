-- DOWN for 20260924100000_historical_timesheet_m1
-- Historical timesheet import PR-3 (design §14, "ROLLBACK for M1").
--
-- REFUSES while any new column holds a value: a historical project, a keyed
-- customer row, a record's project / row provenance, a session's byte hash
-- or a staged row's resolution state would be destroyed by dropping the
-- column, and evidence is never dropped to undo a schema change. When every
-- new column is NULL on every row, it drops, in reverse dependency order:
-- the 13 restrictive policies, the 3 indexes, the constraints and the 13 new
-- columns, and restores the two event_type CHECKs to their original lists
-- under their original CREATE TABLE names (*_event_type_check).
--
-- It also refuses while an event already carries one of the two widened
-- values ('decided' / 'source_preserved'): restoring the narrower CHECK
-- would fail on those rows, and they are append-only history.
--
-- Apply via Supabase MCP apply_migration, never db push.

begin;

do $hist_m_one_down_guard$
declare
  v_n bigint;
begin
  select count(*) into v_n from public.projects
   where historical_key is not null or created_session_id is not null;
  if v_n > 0 then
    raise exception 'REFUSED: % projects row(s) carry historical_key / created_session_id — a historical project would be lost', v_n;
  end if;

  select count(*) into v_n from public.project_clients
   where customer_key is not null or customer_code is not null
      or customer_kind is not null or created_session_id is not null;
  if v_n > 0 then
    raise exception 'REFUSED: % project_clients row(s) carry customer identity — a keyed customer would be lost', v_n;
  end if;

  select count(*) into v_n from public.organization_evidence_records
   where project_id is not null or source_row_index is not null or row_origin is not null;
  if v_n > 0 then
    raise exception 'REFUSED: % organization_evidence_records row(s) carry project / row provenance — evidence is never dropped', v_n;
  end if;

  select count(*) into v_n from public.evidence_import_sessions
   where source_bytes_sha256 is not null;
  if v_n > 0 then
    raise exception 'REFUSED: % evidence_import_sessions row(s) carry source_bytes_sha256 — preservation binding would be lost', v_n;
  end if;

  select count(*) into v_n from public.evidence_import_rows
   where row_origin is not null or customer_label is not null or customer_code is not null
      or customer_key is not null or project_id is not null;
  if v_n > 0 then
    raise exception 'REFUSED: % evidence_import_rows row(s) carry resolution state', v_n;
  end if;

  select count(*) into v_n from public.evidence_import_events where event_type = 'decided';
  if v_n > 0 then
    raise exception 'REFUSED: % evidence_import_events row(s) are decided — the narrower CHECK cannot be restored', v_n;
  end if;

  select count(*) into v_n from public.organization_evidence_events where event_type = 'source_preserved';
  if v_n > 0 then
    raise exception 'REFUSED: % organization_evidence_events row(s) are source_preserved — the narrower CHECK cannot be restored', v_n;
  end if;
end $hist_m_one_down_guard$;

-- ── M1i ── the 13 restrictive policies ───────────────────────────────────────
drop policy if exists hist_p9_projects_update       on public.projects;
drop policy if exists hist_p9_projects_insert       on public.projects;
drop policy if exists hist_p8_import_events_insert  on public.evidence_import_events;
drop policy if exists hist_p7_clients_delete        on public.project_clients;
drop policy if exists hist_p7_clients_update        on public.project_clients;
drop policy if exists hist_p7_clients_insert        on public.project_clients;
drop policy if exists hist_p6_parties_insert        on public.organization_evidence_parties;
drop policy if exists hist_p4_events_insert         on public.organization_evidence_events;
drop policy if exists hist_p3_rows_delete           on public.evidence_import_rows;
drop policy if exists hist_p3_rows_update           on public.evidence_import_rows;
drop policy if exists hist_p3_rows_insert           on public.evidence_import_rows;
drop policy if exists hist_p2_sessions_insert       on public.evidence_import_sessions;
drop policy if exists hist_p1_records_insert        on public.organization_evidence_records;

-- ── M1h ── organization_evidence_events.event_type: original list, original name
alter table public.organization_evidence_events
  drop constraint if exists organization_evidence_events_event_type_chk;
alter table public.organization_evidence_events
  drop constraint if exists organization_evidence_events_event_type_check;
alter table public.organization_evidence_events
  add constraint organization_evidence_events_event_type_check
  check (event_type in (
    'attested','attestation_withdrawn',
    'independently_verified','verification_withdrawn',
    'withdrawn','reinstated','disputed','corrected'));

-- ── M1g ── evidence_import_events.event_type: original list, original name
alter table public.evidence_import_events
  drop constraint if exists evidence_import_events_event_type_chk;
alter table public.evidence_import_events
  drop constraint if exists evidence_import_events_event_type_check;
alter table public.evidence_import_events
  add constraint evidence_import_events_event_type_check
  check (event_type in (
    'created','rows_submitted','previewed','committed',
    'rolled_back','reinstated','failed'));

-- ── M1f ── evidence_import_rows
alter table public.evidence_import_rows
  drop constraint if exists evidence_import_rows_row_origin_chk;
alter table public.evidence_import_rows drop column if exists project_id;
alter table public.evidence_import_rows drop column if exists customer_key;
alter table public.evidence_import_rows drop column if exists customer_code;
alter table public.evidence_import_rows drop column if exists customer_label;
alter table public.evidence_import_rows drop column if exists row_origin;

-- ── M1e ── evidence_import_sessions
alter table public.evidence_import_sessions
  drop constraint if exists evidence_import_sessions_source_bytes_sha256_chk;
alter table public.evidence_import_sessions drop column if exists source_bytes_sha256;

-- ── M1d ── organization_evidence_records
drop index if exists public.organization_evidence_records_project_idx;
alter table public.organization_evidence_records
  drop constraint if exists organization_evidence_records_row_origin_chk;
alter table public.organization_evidence_records
  drop constraint if exists organization_evidence_records_project_fk;
alter table public.organization_evidence_records drop column if exists row_origin;
alter table public.organization_evidence_records drop column if exists source_row_index;
alter table public.organization_evidence_records drop column if exists project_id;

-- ── M1c ── project_clients
drop index if exists public.project_clients_customer_key_uidx;
alter table public.project_clients
  drop constraint if exists project_clients_project_scope;
alter table public.project_clients
  drop constraint if exists project_clients_created_session_fk;
alter table public.project_clients
  drop constraint if exists project_clients_customer_kind_chk;
alter table public.project_clients drop column if exists created_session_id;
alter table public.project_clients drop column if exists customer_kind;
alter table public.project_clients drop column if exists customer_code;
alter table public.project_clients drop column if exists customer_key;

-- ── M1b ── work_objects
alter table public.work_objects
  drop constraint if exists work_objects_org_scope;

-- ── M1a ── projects
drop index if exists public.projects_historical_key_uidx;
alter table public.projects
  drop constraint if exists projects_historical_requires_session;
alter table public.projects
  drop constraint if exists projects_created_session_fk;
alter table public.projects
  drop constraint if exists projects_org_scope;
alter table public.projects drop column if exists created_session_id;
alter table public.projects drop column if exists historical_key;

commit;
