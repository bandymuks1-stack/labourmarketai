-- ════════════════════════════════════════════════════════════════════════
-- 0014_journal_security_hardening.sql — PR #10b hardening delta
--
-- Implements docs/handoffs/TASK-PR10B-0014-HARDENING-SPEC.md on top of the REAL
-- journal model shipped in 0013_work_journal_m1.sql. ADDITIVE / non-destructive:
-- CREATE TABLE / ADD COLUMN / ADD CONSTRAINT / CREATE FUNCTION / CREATE TRIGGER /
-- CREATE POLICY / GRANT only. No DROP TABLE, no destructive ALTER, no data loss.
-- The single policy change is a NARROWING (journal_entries insert → closed only).
--
-- Scope (PR #10b / 0014): feature-flag lock, audit on confirm/reject/revoke,
-- reject/revoke ledger on journal_entry_confirmations, original_language CHECK,
-- proof_of_work scaffold, and direct-INSERT compensating controls #1,#2,#5,#6,#7.
-- Entry↔skill-link controls #3/#4 are LEFT TO PR #11 (that table does not exist).
--
-- Executor decisions (flagged for review — keep the live M1 flow working without
-- any apps/web change, per the task's "no apps/web work" rule):
--   • journal_entry_confirmations KEEPS its existing direct-INSERT policy. The
--     manager confirm/reject path (apps/web/lib/journal/confirm-actions.ts) still
--     works. Audit is enforced in the DB via an AFTER INSERT trigger that fires
--     for BOTH the current direct path AND the new SECURITY DEFINER RPCs, so no
--     audit can be forgotten regardless of write path. Revoking the direct
--     INSERT policy + cutting the app over to the RPC is a PAIRED follow-up
--     (needs an apps/web change) — intentionally deferred here.
--   • `kind` is DERIVED from confirmation_scope->>'action' by a BEFORE INSERT
--     trigger, so existing app inserts (which carry the action in jsonb)
--     populate the new column consistently. No hard `reason` CHECK at table
--     level (the app may send a blank reason); reason-required is enforced
--     inside the reject/revoke RPCs only.
--   • original_language values are constrained to the doctrine §2.4 set
--     (en,lt,lv,et,nl,de,da,no,sv,pl) — note da/sv, NOT dk/se.
--
-- Verification: supabase CLI was NOT available in the authoring environment, so
-- `supabase db reset` and the RLS/RPC test matrix were NOT run. DI must run them
-- locally / on a staging-copy DB before the production db push (see PR body).
--
-- Manual DOWN script at the very bottom (commented). Forward-only (db push).
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ────────────────────────────────────────────────────────────────────────
-- Shared append-only guard helpers (defense-in-depth; §3.1)
-- ────────────────────────────────────────────────────────────────────────
create or replace function public.reject_update()
returns trigger language plpgsql as $$
begin raise exception 'append_only_no_update'; end $$;

create or replace function public.reject_delete()
returns trigger language plpgsql as $$
begin raise exception 'append_only_no_delete'; end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 1. feature_flags — lock public_proof_link / client_report (spec §5.1)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.feature_flags (
  flag_key    text primary key,
  is_enabled  boolean not null default false,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);

alter table public.feature_flags enable row level security;
create policy feature_flags_select on public.feature_flags for select using (true);
create policy feature_flags_write  on public.feature_flags for all
  using (is_admin()) with check (is_admin());
grant select on public.feature_flags to authenticated;

insert into public.feature_flags (flag_key, is_enabled, description) values
  ('visibility.public_proof',  false, 'Enables public_proof_link visibility on journal_entries. Default OFF until proof-link feature ships.'),
  ('visibility.client_report', false, 'Enables client_report visibility on journal_entries. Default OFF until customer-reports feature ships.')
on conflict (flag_key) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- 2. original_language CHECK — doctrine §2.4 locale set (spec §5.2)
-- ════════════════════════════════════════════════════════════════════════
-- NOT VALID first (won't block on legacy rows), then VALIDATE (existing M1 data
-- is lt/en — both in the set). If VALIDATE fails, a legacy row must be corrected.
alter table public.journal_entries
  add constraint journal_entries_original_language_chk
  check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl')) not valid;
alter table public.journal_entries
  validate constraint journal_entries_original_language_chk;

-- ════════════════════════════════════════════════════════════════════════
-- 3. journal_entry_confirmations — decision ledger (spec §5.3, DI-decided)
-- ════════════════════════════════════════════════════════════════════════
alter table public.journal_entry_confirmations
  add column if not exists kind   text not null default 'confirm'
       check (kind in ('confirm','reject','revoke')),
  add column if not exists reason text;

-- BEFORE INSERT: derive kind/reason from confirmation_scope so the existing
-- direct-insert app path stays consistent without any apps/web change.
create or replace function public.jec_derive_kind()
returns trigger language plpgsql as $$
declare v_action text := new.confirmation_scope->>'action';
begin
  if v_action in ('confirm','reject','revoke') then
    new.kind := v_action;
  end if;
  if new.reason is null then
    new.reason := new.confirmation_scope->>'reason';
  end if;
  return new;
end $$;

-- AFTER INSERT: write audit_logs for confirm/reject/revoke (gap #2). Fires for
-- BOTH the current direct path and the new RPCs → audit cannot be forgotten.
create or replace function public.jec_audit_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (
    auth.uid(),
    case new.kind when 'reject' then 'entry_rejected'
                  when 'revoke' then 'confirmation_revoked'
                  else 'entry_confirmed' end,
    'journal_entry_confirmations', new.id,
    jsonb_build_object(
      'entry_id', new.entry_id, 'confirmer_id', new.confirmer_id,
      'kind', new.kind, 'scope', new.confirmation_scope, 'server_time', now())
  );
  return new;
end $$;

drop trigger if exists trg_jec_derive on public.journal_entry_confirmations;
create trigger trg_jec_derive before insert on public.journal_entry_confirmations
  for each row execute function public.jec_derive_kind();

drop trigger if exists trg_jec_audit on public.journal_entry_confirmations;
create trigger trg_jec_audit after insert on public.journal_entry_confirmations
  for each row execute function public.jec_audit_insert();

-- Append-only (spec §5.7): block UPDATE/DELETE for all roles.
drop trigger if exists trg_jec_no_update on public.journal_entry_confirmations;
create trigger trg_jec_no_update before update on public.journal_entry_confirmations
  for each row execute function public.reject_update();
drop trigger if exists trg_jec_no_delete on public.journal_entry_confirmations;
create trigger trg_jec_no_delete before delete on public.journal_entry_confirmations
  for each row execute function public.reject_delete();

-- ════════════════════════════════════════════════════════════════════════
-- 4. audit_logs — append-only hardening (spec §5.7)
-- ════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_audit_no_update on public.audit_logs;
create trigger trg_audit_no_update before update on public.audit_logs
  for each row execute function public.reject_update();
drop trigger if exists trg_audit_no_delete on public.audit_logs;
create trigger trg_audit_no_delete before delete on public.audit_logs
  for each row execute function public.reject_delete();

-- ════════════════════════════════════════════════════════════════════════
-- 5. proof_of_work — scaffold (spec §5.6); RLS default-deny, no client write
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.proof_of_work (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.journal_entries(id) on delete cascade,
  file_type   text not null,
  file_path   text not null,
  file_name   text,
  caption     text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id)
);
create index if not exists idx_proof_of_work_entry on public.proof_of_work(entry_id);

alter table public.proof_of_work enable row level security;
-- SELECT inherits the parent entry's visibility; no INSERT/UPDATE/DELETE policy
-- in M1 (upload flow is M2, via a future RPC). Default-deny for writes.
create policy proof_of_work_select on public.proof_of_work for select using (
  exists (
    select 1 from public.journal_entries je
     where je.id = proof_of_work.entry_id
       and (owns_worker(je.worker_id) or is_admin()
            or exists (select 1 from public.engagement_contexts ec
                        where ec.id = je.engagement_context_id
                          and manages_organization(ec.organization_id)))
  )
);
grant select on public.proof_of_work to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 6. journal_entries — direct-INSERT compensating controls (spec §5.8)
-- ════════════════════════════════════════════════════════════════════════

-- #1 BEFORE INSERT validation (functionally equivalent to the RPC path).
create or replace function public.je_validate_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() then
    return new;  -- admin / definer maintenance bypass
  end if;
  if not owns_worker(new.worker_id) then
    raise exception 'not_entry_owner';
  end if;
  if new.profession_id is not null and not exists (
    select 1 from public.professions p where p.id = new.profession_id and p.is_active
  ) then
    raise exception 'profession_inactive_or_missing';
  end if;
  if not exists (
    select 1 from public.engagement_contexts ec
     where ec.id = new.engagement_context_id and ec.profile_id = auth.uid()
  ) then
    raise exception 'engagement_context_not_owned';
  end if;
  if new.original_language not in ('en','lt','lv','et','nl','de','da','no','sv','pl') then
    raise exception 'invalid_original_language';
  end if;
  if new.visibility_scope <> 'closed' then
    raise exception 'direct_insert_must_be_closed';  -- exposure only via set_entry_visibility
  end if;
  return new;
end $$;

-- #2 AFTER INSERT audit (DB-enforced; gap #2).
create or replace function public.je_audit_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), 'entry_created', 'journal_entries', new.id,
    jsonb_build_object(
      'worker_id', new.worker_id, 'profession_id', new.profession_id,
      'engagement_context_id', new.engagement_context_id,
      'visibility_scope', new.visibility_scope, 'server_time', now()));
  return new;
end $$;

-- #5 BEFORE UPDATE guard: block direct visibility_scope changes; exposure /
-- de-exposure must go through set_entry_visibility (which sets the bypass flag).
create or replace function public.je_guard_visibility()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.visibility_scope is distinct from old.visibility_scope
     and current_setting('app.bypass_visibility_guard', true) is distinct from 'on' then
    raise exception 'use_set_entry_visibility_rpc';
  end if;
  return new;
end $$;

drop trigger if exists trg_je_validate_insert on public.journal_entries;
create trigger trg_je_validate_insert before insert on public.journal_entries
  for each row execute function public.je_validate_insert();

drop trigger if exists trg_je_audit_insert on public.journal_entries;
create trigger trg_je_audit_insert after insert on public.journal_entries
  for each row execute function public.je_audit_insert();

drop trigger if exists trg_je_guard_visibility on public.journal_entries;
create trigger trg_je_guard_visibility before update on public.journal_entries
  for each row execute function public.je_guard_visibility();

drop trigger if exists trg_je_no_delete on public.journal_entries;
create trigger trg_je_no_delete before delete on public.journal_entries
  for each row execute function public.reject_delete();

-- #6 RLS: narrow direct INSERT to own-worker + closed only (no loosening).
drop policy if exists journal_entries_insert on public.journal_entries;
create policy journal_entries_insert on public.journal_entries for insert
  with check (owns_worker(worker_id) and visibility_scope = 'closed');

-- ════════════════════════════════════════════════════════════════════════
-- 7. SECURITY DEFINER RPCs (spec §4, DI-approved names)
-- ════════════════════════════════════════════════════════════════════════

-- confirm_journal_entry — entry-specific AND skill-specific (skills in jsonb,
-- consistent with the existing confirmation_scope model; no new table). Client
-- source is scaffolded but locked in M1.
create or replace function public.confirm_journal_entry(
  p_entry_id  uuid,
  p_skill_ids uuid[] default array[]::uuid[],
  p_source    text   default 'manager',
  p_note      text   default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_org uuid; v_eng uuid; v_role text;
begin
  if v_actor is null then raise exception 'auth_required'; end if;
  if p_source = 'client' then raise exception 'client_confirmation_locked'; end if;
  if p_source <> 'manager' then raise exception 'invalid_source'; end if;

  select ec.organization_id into v_org
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
   where je.id = p_entry_id;
  if v_org is null then raise exception 'entry_has_no_org_context'; end if;

  select ec.id, ec.relationship_slug into v_eng, v_role
    from public.engagement_contexts ec
   where ec.profile_id = v_actor and ec.organization_id = v_org
     and ec.status = 'active'
     and ec.relationship_slug in ('manager','owner','external_manager')
   limit 1;
  if v_eng is null then raise exception 'not_authorized_to_confirm'; end if;

  insert into public.journal_entry_confirmations
    (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role,
     confirmation_scope, kind, reason)
  values (p_entry_id, v_actor, v_eng, v_role,
     jsonb_build_object('action','confirm',
       'skills_confirmed', coalesce(to_jsonb(p_skill_ids), '[]'::jsonb)),
     'confirm', p_note);
  -- audit_logs row written by the AFTER INSERT trigger (jec_audit_insert).
end $$;

-- reject_journal_entry — reason required.
create or replace function public.reject_journal_entry(p_entry_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_org uuid; v_eng uuid; v_role text;
begin
  if v_actor is null then raise exception 'auth_required'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'reason_required'; end if;

  select ec.organization_id into v_org
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
   where je.id = p_entry_id;
  if v_org is null then raise exception 'entry_has_no_org_context'; end if;

  select ec.id, ec.relationship_slug into v_eng, v_role
    from public.engagement_contexts ec
   where ec.profile_id = v_actor and ec.organization_id = v_org
     and ec.status = 'active'
     and ec.relationship_slug in ('manager','owner','external_manager')
   limit 1;
  if v_eng is null then raise exception 'not_authorized_to_reject'; end if;

  insert into public.journal_entry_confirmations
    (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role,
     confirmation_scope, kind, reason)
  values (p_entry_id, v_actor, v_eng, v_role,
     jsonb_build_object('action','reject','reason',p_reason), 'reject', p_reason);
end $$;

-- revoke_entry_confirmation — append-only revocation of a prior confirmation.
create or replace function public.revoke_entry_confirmation(p_confirmation_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_entry uuid; v_org uuid; v_eng uuid; v_role text;
begin
  if v_actor is null then raise exception 'auth_required'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'reason_required'; end if;

  select entry_id into v_entry from public.journal_entry_confirmations where id = p_confirmation_id;
  if v_entry is null then raise exception 'confirmation_not_found'; end if;

  select ec.organization_id into v_org
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
   where je.id = v_entry;
  if v_org is null then raise exception 'entry_has_no_org_context'; end if;

  select ec.id, ec.relationship_slug into v_eng, v_role
    from public.engagement_contexts ec
   where ec.profile_id = v_actor and ec.organization_id = v_org
     and ec.status = 'active'
     and ec.relationship_slug in ('manager','owner','external_manager')
   limit 1;
  if v_eng is null then raise exception 'not_authorized_to_revoke'; end if;

  insert into public.journal_entry_confirmations
    (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role,
     confirmation_scope, kind, reason)
  values (v_entry, v_actor, v_eng, v_role,
     jsonb_build_object('action','revoke','revokes',p_confirmation_id,'reason',p_reason),
     'revoke', p_reason);
end $$;

-- set_entry_visibility — exposure (flag-gated) AND de-exposure to closed.
create or replace function public.set_entry_visibility(p_entry_id uuid, p_scope text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_worker uuid; v_flag boolean;
begin
  if v_actor is null then raise exception 'auth_required'; end if;
  if p_scope not in ('closed','team','org','client_report','public_proof_link') then
    raise exception 'invalid_scope';
  end if;

  select worker_id into v_worker from public.journal_entries where id = p_entry_id;
  if v_worker is null then raise exception 'entry_not_found'; end if;
  if not owns_worker(v_worker) then raise exception 'not_entry_owner'; end if;

  -- de-exposure to 'closed' is always allowed; exposed scopes are flag-gated.
  if p_scope in ('public_proof_link','client_report') then
    select is_enabled into v_flag from public.feature_flags
      where flag_key = case p_scope
        when 'public_proof_link' then 'visibility.public_proof'
        else 'visibility.client_report' end;
    if not coalesce(v_flag, false) then
      raise exception 'visibility_feature_locked: %', p_scope;
    end if;
  end if;

  perform set_config('app.bypass_visibility_guard', 'on', true);  -- transaction-local
  update public.journal_entries
     set visibility_scope = p_scope, updated_at = now()
   where id = p_entry_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_actor, 'entry_visibility_changed', 'journal_entries', p_entry_id,
    jsonb_build_object('visibility_scope', p_scope, 'server_time', now()));
end $$;

-- RPC grants: not callable by anon; authenticated only.
revoke all on function public.confirm_journal_entry(uuid, uuid[], text, text)  from public;
revoke all on function public.reject_journal_entry(uuid, text)                 from public;
revoke all on function public.revoke_entry_confirmation(uuid, text)            from public;
revoke all on function public.set_entry_visibility(uuid, text)                 from public;
grant execute on function public.confirm_journal_entry(uuid, uuid[], text, text) to authenticated;
grant execute on function public.reject_journal_entry(uuid, text)               to authenticated;
grant execute on function public.revoke_entry_confirmation(uuid, text)          to authenticated;
grant execute on function public.set_entry_visibility(uuid, text)              to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — run by hand or via git revert of the merge):
--   begin;
--   drop function if exists public.set_entry_visibility(uuid, text);
--   drop function if exists public.revoke_entry_confirmation(uuid, text);
--   drop function if exists public.reject_journal_entry(uuid, text);
--   drop function if exists public.confirm_journal_entry(uuid, uuid[], text, text);
--   drop trigger if exists trg_je_validate_insert on public.journal_entries;
--   drop trigger if exists trg_je_audit_insert    on public.journal_entries;
--   drop trigger if exists trg_je_guard_visibility on public.journal_entries;
--   drop trigger if exists trg_je_no_delete       on public.journal_entries;
--   drop function if exists public.je_validate_insert();
--   drop function if exists public.je_audit_insert();
--   drop function if exists public.je_guard_visibility();
--   -- restore the original (pre-0014) insert policy:
--   drop policy if exists journal_entries_insert on public.journal_entries;
--   create policy journal_entries_insert on public.journal_entries for insert
--     with check (owns_worker(worker_id));
--   drop trigger if exists trg_jec_derive     on public.journal_entry_confirmations;
--   drop trigger if exists trg_jec_audit      on public.journal_entry_confirmations;
--   drop trigger if exists trg_jec_no_update  on public.journal_entry_confirmations;
--   drop trigger if exists trg_jec_no_delete  on public.journal_entry_confirmations;
--   drop function if exists public.jec_derive_kind();
--   drop function if exists public.jec_audit_insert();
--   alter table public.journal_entry_confirmations drop column if exists kind, drop column if exists reason;
--   drop trigger if exists trg_audit_no_update on public.audit_logs;
--   drop trigger if exists trg_audit_no_delete on public.audit_logs;
--   alter table public.journal_entries drop constraint if exists journal_entries_original_language_chk;
--   drop table if exists public.proof_of_work cascade;
--   drop table if exists public.feature_flags cascade;
--   -- reject_update/reject_delete are shared helpers; drop only if unused elsewhere:
--   -- drop function if exists public.reject_update();
--   -- drop function if exists public.reject_delete();
--   commit;
-- ════════════════════════════════════════════════════════════════════════
