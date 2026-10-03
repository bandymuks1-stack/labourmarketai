-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260712100000 — voice_journal_jobs v1 (Voice Work Journal programme,
-- master goal v1 §Outcome B; gap map
-- docs/launch/voice-work-journal-gap-map-v1.md §3.4).
--
-- IMPORTANT: the migration-activation authorization of 2026-07-11 covered
-- ONLY the seven pre-existing packs (#730/#720/#721/#723/#722/#708/#714).
-- This NEW voice migration is NOT covered — it ships as a decision pack and
-- waits for its own explicit owner approval.
--
-- PROBLEM: voice recording → transcription → review needs a persistent,
-- owner-scoped job record for status, transcript versioning, provenance,
-- idempotency (one journal entry per confirmed job), disclosure-version
-- proof, and retention/deletion truth. Without it the voice flow is
-- session-only: no history, no cross-device resume, no deletion ledger.
--
-- SOLUTION (smallest honest slice): ONE table + THREE gated write RPCs.
--
--   1. voice_journal_jobs — one row per recording job:
--      status uploaded → processing → completed | failed | cancelled
--      (browser-side recording states never touch the DB); language;
--      transcript (raw) + transcript_edited (worker's reviewed version);
--      audio_storage_path (private bucket, owner-prefixed) + audio_deleted_at
--      (retention truth); idempotency_key unique per worker;
--      disclosure_version the worker acknowledged BEFORE recording;
--      journal_entry_id set exactly once at confirmation (idempotency:
--      a confirmed job cannot produce a second entry); error_code bounded,
--      NEVER raw provider output.
--   2. RLS SELECT: owning worker only (+ is_admin()). No employer path of
--      any kind — voice jobs are private processing state, not evidence.
--   3. Writes RPC-only (no insert/update/delete policies; direct DML
--      revoked): create_voice_journal_job_v1 (disclosure ack required),
--      set_voice_journal_job_result_v1 (transcript/failure; re-checks
--      ownership; only from processing), confirm_voice_journal_job_v1
--      (stamps journal_entry_id once; edited transcript persisted),
--      cancel+delete via delete_voice_journal_job_v1 (worker's right to
--      erase: clears transcript columns, stamps audio_deleted_at; the
--      storage object itself is removed by the owning app path).
--
-- ABUSE BOUNDS: ≤20 active (non-terminal) jobs per worker; transcript
-- ≤ 60k chars; idempotency_key ≤ 128; language closed set; error_code
-- closed set; NO free text beyond the transcript itself.
--
-- RETENTION: audio_expires_at default now() + 30 days; the app deletes the
-- storage object at confirmation or expiry and stamps audio_deleted_at —
-- this table records the truth, no scheduler is installed by this migration.
--
-- COMPATIBILITY / BACKFILL: none — new table, no existing readers (the
-- voice UI degrades honestly via 42P01 until applied).
--
-- ROLLBACK: paired supabase/rollbacks/20260712100000_voice_journal_jobs_v1.down.sql
-- (drops the four functions and the table; voice rows live ONLY here).
--
-- POST-APPLY VERIFICATION:
--   As a worker: select create_voice_journal_job_v1('idem-1','lt','2026-07-11.v1','<path>');
--   select * from voice_journal_jobs;                  -- 1 own row, status uploaded
--   As another user: select * from voice_journal_jobs; -- 0 rows
--   + APPLIED_LEDGER.md row.
--
-- TIER: owner-gated (new RLS-bearing table + SECURITY DEFINER functions +
-- grants are RED-class). needs-human-gate — the OWNER applies manually.
-- ============================================================================

begin;

create table if not exists public.voice_journal_jobs (
  id                 uuid primary key default gen_random_uuid(),
  worker_id          uuid not null references public.workers(id) on delete cascade,
  status             text not null default 'uploaded'
                       check (status in ('uploaded','processing','completed','failed','cancelled')),
  language           text not null default 'auto'
                       check (language in ('auto','lt','en','ru','nl','de','pl','lv','et','da','no','sv','fi')),
  transcript         text check (transcript is null or char_length(transcript) <= 60000),
  transcript_edited  text check (transcript_edited is null or char_length(transcript_edited) <= 60000),
  audio_storage_path text check (audio_storage_path is null or char_length(audio_storage_path) <= 500),
  audio_deleted_at   timestamptz,
  audio_expires_at   timestamptz not null default (now() + interval '30 days'),
  idempotency_key    text not null check (char_length(idempotency_key) between 8 and 128),
  disclosure_version text not null check (char_length(disclosure_version) between 1 and 40),
  journal_entry_id   uuid references public.journal_entries(id) on delete set null,
  error_code         text check (error_code is null or error_code in
                       ('too_large','too_long','bad_mime','undecodable','engine_failed',
                        'unavailable','timeout','internal')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (worker_id, idempotency_key)
);

create index if not exists vjj_worker_created_idx
  on public.voice_journal_jobs (worker_id, created_at desc);

alter table public.voice_journal_jobs enable row level security;

-- Private processing state: owning worker (and admin) ONLY. Never employers.
drop policy if exists vjj_select on public.voice_journal_jobs;
create policy vjj_select on public.voice_journal_jobs
  for select to authenticated
  using (
    exists (select 1 from public.workers w
             where w.id = worker_id and w.profile_id = auth.uid())
    or public.is_admin()
  );

-- No insert/update/delete policies — writes are RPC-only.

create or replace function public.create_voice_journal_job_v1(
  p_idempotency_key    text,
  p_language           text,
  p_disclosure_version text,
  p_audio_storage_path text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  w_id uuid;
  v_idem text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_lang text := coalesce(nullif(trim(coalesce(p_language, '')), ''), 'auto');
  v_disc text := nullif(trim(coalesce(p_disclosure_version, '')), '');
  v_path text := nullif(trim(coalesce(p_audio_storage_path, '')), '');
  row_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_idem is null or char_length(v_idem) < 8 or char_length(v_idem) > 128 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;
  if v_lang not in ('auto','lt','en','ru','nl','de','pl','lv','et','da','no','sv','fi') then
    raise exception 'Invalid language' using errcode = '22023';
  end if;
  -- The worker must have acknowledged the external-processing disclosure
  -- BEFORE any audio leaves the browser; the acknowledged version is pinned.
  if v_disc is null or char_length(v_disc) > 40 then
    raise exception 'Disclosure acknowledgement required' using errcode = '22023';
  end if;
  if v_path is null or char_length(v_path) > 500 then
    raise exception 'Invalid audio path' using errcode = '22023';
  end if;

  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  -- Owner-prefix contract, same as journal photos: <profile_id>/...
  if position(uid::text || '/' in v_path) <> 1 then
    raise exception 'Audio path outside owner prefix' using errcode = '42501';
  end if;

  if (select count(*) from public.voice_journal_jobs v
       where v.worker_id = w_id
         and v.status in ('uploaded','processing')) >= 20 then
    raise exception 'Too many open voice jobs' using errcode = '22023';
  end if;

  insert into public.voice_journal_jobs as vjj
      (worker_id, status, language, audio_storage_path, idempotency_key, disclosure_version)
  values (w_id, 'uploaded', v_lang, v_path, v_idem, v_disc)
  on conflict (worker_id, idempotency_key)
  do update set updated_at = now()
  returning vjj.id into row_id;

  return row_id;
end;
$$;

create or replace function public.set_voice_journal_job_result_v1(
  p_job_id     uuid,
  p_transcript text,
  p_error_code text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_tr text := nullif(p_transcript, '');
  v_err text := nullif(trim(coalesce(p_error_code, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_tr is not null and char_length(v_tr) > 60000 then
    raise exception 'Transcript too long' using errcode = '22023';
  end if;
  if v_err is not null and v_err not in
       ('too_large','too_long','bad_mime','undecodable','engine_failed',
        'unavailable','timeout','internal') then
    raise exception 'Invalid error code' using errcode = '22023';
  end if;
  if (v_tr is null) = (v_err is null) then
    raise exception 'Exactly one of transcript or error required' using errcode = '22023';
  end if;

  update public.voice_journal_jobs vjj
     set status     = case when v_tr is not null then 'completed' else 'failed' end,
         transcript = v_tr,
         error_code = v_err,
         updated_at = now()
   where vjj.id = p_job_id
     and vjj.status in ('uploaded','processing')
     and exists (select 1 from public.workers w
                  where w.id = vjj.worker_id and w.profile_id = uid);

  if not found then
    return 'not_found';
  end if;
  return 'updated';
end;
$$;

create or replace function public.confirm_voice_journal_job_v1(
  p_job_id            uuid,
  p_transcript_edited text,
  p_journal_entry_id  uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_edit text := nullif(p_transcript_edited, '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_edit is not null and char_length(v_edit) > 60000 then
    raise exception 'Transcript too long' using errcode = '22023';
  end if;
  if p_journal_entry_id is null then
    raise exception 'Journal entry required' using errcode = '22023';
  end if;

  -- Idempotent confirmation: only a completed job WITHOUT a linked entry can
  -- confirm — one voice job can never create two journal entries. The entry
  -- itself must belong to the same worker (canonical-path re-check).
  update public.voice_journal_jobs vjj
     set journal_entry_id  = p_journal_entry_id,
         transcript_edited = v_edit,
         updated_at        = now()
   where vjj.id = p_job_id
     and vjj.status = 'completed'
     and vjj.journal_entry_id is null
     and exists (select 1 from public.workers w
                  where w.id = vjj.worker_id and w.profile_id = uid)
     and exists (select 1 from public.journal_entries je
                  where je.id = p_journal_entry_id and je.worker_id = vjj.worker_id);

  if not found then
    return 'not_confirmable';
  end if;
  return 'confirmed';
end;
$$;

create or replace function public.delete_voice_journal_job_v1(
  p_job_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Worker's right to erase processing data: transcripts cleared, audio
  -- deletion stamped (the app removes the storage object), job closed.
  -- The confirmed journal entry (if any) is canonical worker data and is
  -- governed by the journal lifecycle, not deleted here.
  update public.voice_journal_jobs vjj
     set status            = case when vjj.status in ('completed','failed') then vjj.status else 'cancelled' end,
         transcript        = null,
         transcript_edited = null,
         audio_deleted_at  = coalesce(vjj.audio_deleted_at, now()),
         updated_at        = now()
   where vjj.id = p_job_id
     and exists (select 1 from public.workers w
                  where w.id = vjj.worker_id and w.profile_id = uid);

  if not found then
    return 'not_found';
  end if;
  return 'deleted';
end;
$$;

grant select on public.voice_journal_jobs to authenticated;
revoke insert, update, delete on public.voice_journal_jobs from authenticated;

revoke all on function public.create_voice_journal_job_v1(text, text, text, text) from public;
grant execute on function public.create_voice_journal_job_v1(text, text, text, text) to authenticated;
revoke all on function public.set_voice_journal_job_result_v1(uuid, text, text) from public;
grant execute on function public.set_voice_journal_job_result_v1(uuid, text, text) to authenticated;
revoke all on function public.confirm_voice_journal_job_v1(uuid, text, uuid) from public;
grant execute on function public.confirm_voice_journal_job_v1(uuid, text, uuid) to authenticated;
revoke all on function public.delete_voice_journal_job_v1(uuid) from public;
grant execute on function public.delete_voice_journal_job_v1(uuid) to authenticated;

commit;
