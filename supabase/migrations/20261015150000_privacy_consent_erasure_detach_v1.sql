-- 20261015150000 — GDPR erasure no longer dies on the consent ledger (#856)
--
-- THE DEFECT: `privacy_consent_events.user_id` → profiles(id) ON DELETE
-- CASCADE, while `privacy_consent_events_append_only` raises on EVERY delete
-- and update. Deleting any user who ever granted or withdrew a consent cascades
-- into the ledger, the trigger raises P0001, and the whole delete aborts — so
-- every consenting user is un-erasable, from the app and from the dashboard
-- (GDPR Art. 17 gap). Measured on prod 2026-10-15: 35 ledger rows.
--
-- THE RULE KEPT: the ledger is the proof of lawfulness and stays append-only
-- for 6 years (docs/legal/deletion-process-design-v1.md E2: "detach identity,
-- KEEP the append-only events — never edited"). Rows are never deleted.
--
-- THE CHANGE (additive; nothing is dropped):
--   1. Two columns: `erased_subject_id` (a RANDOM uuid minted per erasure —
--      groups one former subject's rows, cannot be reversed to the person)
--      and `erased_at`. `user_id` becomes nullable; a CHECK makes every row
--      either attached (user_id set, no tombstone) or detached (no user_id,
--      tombstone + time) — never both, never neither.
--   2. The append-only trigger allows exactly ONE mutation: the one-way detach
--      of a row whose user_id equals the transaction-local GUC
--      `lm.privacy_erasure_subject`, changing user_id → null and stamping the
--      tombstone, every other column byte-identical. DELETE stays refused for
--      every role. Only the table owner holds UPDATE (authenticated: SELECT;
--      anon/service_role: nothing), so the GUC alone opens nothing — the one
--      caller with both is the SECURITY DEFINER function below.
--   3. `erase_user_account_v1(p_user_id)` — ONE transaction: detach the
--      ledger, then delete auth.users (cascade → profiles → children). Any
--      remaining blocker (a NO ACTION FK on profiles, a disclosure-ledger row)
--      raises and rolls the WHOLE erasure back: never half-erased.
--      EXECUTE: service_role only — it is wired behind the human-reviewed
--      account-deletion request flow, never self-serve.
--
-- NOT IN v1 (named, not hidden): `personal_data_disclosures` (0 rows on prod)
-- and the 66 NO ACTION foreign keys onto profiles. The function refuses with
-- the exact reason instead of working around them.
--
-- Rollback: supabase/rollbacks/20261015150000_privacy_consent_erasure_detach_v1.down.sql
-- RED class (SECURITY DEFINER + grant + auth.users delete): owner-gated.

begin;

alter table public.privacy_consent_events
  add column if not exists erased_subject_id uuid,
  add column if not exists erased_at timestamptz;

alter table public.privacy_consent_events
  alter column user_id drop not null;

alter table public.privacy_consent_events
  drop constraint if exists pce_subject_attached_or_detached;
alter table public.privacy_consent_events
  add constraint pce_subject_attached_or_detached check (
    (user_id is not null and erased_subject_id is null and erased_at is null)
    or (user_id is null and erased_subject_id is not null and erased_at is not null)
  );

comment on column public.privacy_consent_events.erased_subject_id is
  'Set only by erase_user_account_v1: a random uuid per erased subject (non-reversible). The row keeps proving that consent was granted/withdrawn, when, under which text version; it no longer names a person.';

create or replace function public.privacy_ledger_block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_subject text := nullif(current_setting('lm.privacy_erasure_subject', true), '');
begin
  -- The ONE permitted mutation: the sanctioned erasure detach (#856).
  if tg_op = 'UPDATE'
    and tg_table_name = 'privacy_consent_events'
    and v_subject is not null
    and old.user_id is not null
    and old.user_id::text = v_subject
    and old.erased_subject_id is null
    and new.user_id is null
    and new.erased_subject_id is not null
    and new.erased_at is not null
    and (to_jsonb(new) - 'user_id' - 'erased_subject_id' - 'erased_at')
        = (to_jsonb(old) - 'user_id' - 'erased_subject_id' - 'erased_at')
  then
    return new;
  end if;
  raise exception 'privacy ledger is append-only: % on % is not allowed', tg_op, tg_table_name
    using errcode = 'raise_exception';
end;
$$;

create or replace function public.erase_user_account_v1(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject uuid := gen_random_uuid();
  v_detached integer := 0;
  v_disclosures integer := 0;
begin
  if p_user_id is null then
    raise exception 'erase_user_account_v1: user id is required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'erase_user_account_v1: no such user' using errcode = 'P0002';
  end if;

  select count(*) into v_disclosures
  from public.personal_data_disclosures
  where worker_user_id = p_user_id or disclosed_by = p_user_id;
  if v_disclosures > 0 then
    raise exception 'erase_user_account_v1: % disclosure-ledger row(s) reference this user; the disclosure detach is not part of v1', v_disclosures
      using errcode = 'P0001';
  end if;

  perform set_config('lm.privacy_erasure_subject', p_user_id::text, true);
  update public.privacy_consent_events
     set user_id = null, erased_subject_id = v_subject, erased_at = now()
   where user_id = p_user_id;
  get diagnostics v_detached = row_count;
  perform set_config('lm.privacy_erasure_subject', '', true);

  -- cascade: auth.users → profiles → every ON DELETE CASCADE child. A NO
  -- ACTION reference raises here and the whole call rolls back.
  delete from auth.users where id = p_user_id;

  return jsonb_build_object(
    'erased', true,
    'consent_events_detached', v_detached,
    'erased_subject_id', case when v_detached > 0 then v_subject else null end
  );
end;
$$;

revoke all on function public.erase_user_account_v1(uuid) from public;
revoke all on function public.erase_user_account_v1(uuid) from anon;
revoke all on function public.erase_user_account_v1(uuid) from authenticated;
grant execute on function public.erase_user_account_v1(uuid) to service_role;

comment on function public.erase_user_account_v1(uuid) is
  'Sanctioned GDPR erasure (#856): detaches the consent ledger to a random tombstone, then deletes auth.users in ONE transaction. service_role only, behind the human-reviewed deletion request. Raises (and rolls back) on any remaining reference.';

commit;
