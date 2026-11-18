-- ROLLBACK of 20261023132610_journal_evidence_integrity_v1
--
-- Reverses the triggers, the verifier, the two bypass predicates, the
-- audit_logs guard and the storage policy change, and drops the
-- `hash_version` column. Rows written while the
-- forward migration was live keep their server-computed hashes (they are
-- valid sha256 strings like any other); only the version marker is lost,
-- which is why this down script warns rather than refuses.

do $$
begin
  if exists (select 1 from public.journal_entries where hash_version = 2) then
    raise warning 'journal_evidence_integrity_v1 rollback: % version-2 rows exist; their hashes stay, the version marker is dropped',
      (select count(*) from public.journal_entries where hash_version = 2);
  end if;
end $$;

drop trigger if exists audit_logs_truncate_guard_v1 on public.audit_logs;
drop trigger if exists audit_logs_immutable_guard_v1 on public.audit_logs;
drop function if exists public.audit_logs_immutable_guard_v1();

-- restore the pre-migration photo delete policy (20260612091000) verbatim
drop policy if exists "journal-entry-photos owner delete" on storage.objects;
create policy "journal-entry-photos owner delete" on storage.objects
  for delete
  using (
    bucket_id = 'journal-entry-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop function if exists public.verify_journal_chain_v1(uuid);

drop trigger if exists journal_entries_truncate_guard_v1 on public.journal_entries;
drop trigger if exists journal_entries_evidence_guard_v1 on public.journal_entries;
drop function if exists public.journal_entries_truncate_guard_v1();
drop function if exists public.journal_entries_evidence_guard_v1();

drop trigger if exists journal_entries_chain_v1 on public.journal_entries;
drop function if exists public.journal_entries_chain_v1();

drop function if exists public.journal_evidence_guard_bypassed_v1();
drop function if exists public.journal_evidence_erasure_executing_v1();

alter table public.journal_entries drop column if exists hash_version;
