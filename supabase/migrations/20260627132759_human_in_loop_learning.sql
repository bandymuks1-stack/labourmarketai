-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push` (repo filenames don't match the prod ledger versions).
--
-- W6 — Human-in-loop learning model (Phase 1). Additive only: 3 NEW tables plus
-- ONE SECURITY DEFINER RPC. No existing table is altered; no existing row is
-- mutated at apply time.
--
-- Honesty invariants (doctrine §7, silent-trust):
--   * Learning NEVER verifies. The learning tables store SIGNALS (observations)
--     and SUGGESTIONS (review-queue items) only. The string `verified = true` is
--     written in exactly ONE place — the existing confirmation spine — and W6
--     reuses it via the one RPC below; it never writes `verified` elsewhere.
--   * The optional company-manager auto-confirmation policy is DEFAULT OFF. When
--     enabled by a manager, it does not let "learning" confirm anything: the
--     confirmer is always a LIVE, re-validated human manager (auth.uid()), and
--     the enabling manager + policy + rule + source signal are recorded in the
--     confirmation scope and the audit log. It reuses the SAME spine writes a
--     manual confirmation makes (journal_entry_confirmations + worker_skills +
--     audit_logs), gated by the SAME live checks (manages_organization + the
--     engagement-context journal_review_enabled flag).
--   * Default-closed RLS. Worker sees only their own rows (transparency); an org
--     manager sees only their org's rows (manages_organization); admin via
--     is_admin(). NO anon/public grants, NO using(true), NO broad cross-company
--     SELECT.
--   * No payment, no fake data, no seed rows.
--
-- ROLLBACK: supabase/rollbacks/20260627132759_human_in_loop_learning.down.sql
-- (guarded drops — refuse to drop a non-empty table; the safe "stop" lever is to
--  set learning_policy_settings.enabled = false, which halts future
--  auto-confirmations without dropping data).
-- ============================================================================

-- @human-gate-approved
begin;

-- ── 1. learning_policy_settings — company-manager policy, DEFAULT OFF ─────────
-- One policy row per (organization, kind). `enabled` defaults to false; turning
-- it on requires an explicit manager write that records enabled_by + enabled_at.
create table if not exists public.learning_policy_settings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  policy_kind     text not null check (policy_kind in ('auto_confirm_journal_skill')),
  enabled         boolean not null default false,
  -- scope: which workers the policy applies to. An EMPTY scope ('{}') confirms
  -- NOTHING (the RPC treats missing scope as out_of_scope). Shapes:
  --   {"all_org_workers": true}  |  {"worker_ids": ["<uuid>", ...]}
  scope           jsonb not null default '{}'::jsonb,
  -- rule: thresholds that must be met. Phase 1 requires {"min_confidence": <int>}.
  -- A missing min_confidence means NOTHING passes (the RPC returns threshold_not_met).
  rule            jsonb not null default '{}'::jsonb,
  enabled_by      uuid references public.profiles(id) on delete set null,
  enabled_at      timestamptz,
  disabled_by     uuid references public.profiles(id) on delete set null,
  disabled_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, policy_kind)
);

-- ── 2. learning_signals — append-only observed facts ─────────────────────────
-- A signal is an OBSERVATION about a worker derived from a real in-scope event.
-- proposed_outcome/confidence are SUGGESTION metadata only — never a confirmation.
create table if not exists public.learning_signals (
  id                 uuid primary key default gen_random_uuid(),
  subject_worker_id  uuid not null references public.workers(id) on delete cascade,
  subject_skill_id   uuid references public.skills(id) on delete set null,
  organization_id    uuid references public.organizations(id) on delete set null,
  actor_id           uuid references public.profiles(id) on delete set null,
  source             text not null check (source in (
                       'journal_entry','manager_confirmation','manager_rejection',
                       'service_offering','booking_activity','profile_edit',
                       'skill_claim','evidence_attachment','human_review_outcome')),
  source_object_type text check (source_object_type is null or char_length(source_object_type) <= 80),
  source_object_id   uuid,
  signal_kind        text not null check (signal_kind in (
                       'skill_evidence','skill_candidate','activity','correction')),
  proposed_outcome   jsonb,
  confidence_score   integer not null default 0 check (confidence_score between 0 and 100),
  confidence_bin     text not null default 'red' check (confidence_bin in ('red','yellow','green')),
  created_at         timestamptz not null default now()
  -- append-only: intentionally NO updated_at, and NO update/delete policy below.
);
create index if not exists learning_signals_subject_idx
  on public.learning_signals (subject_worker_id, created_at desc);
create index if not exists learning_signals_org_idx
  on public.learning_signals (organization_id, created_at desc);

-- ── 3. learning_review_queue — human-reviewable suggestions (mutable status) ──
-- A queue item is a SUGGESTION for a manager. status='approved' marks INTENT
-- only; the real confirmation is produced by the spine RPC and linked back via
-- produced_confirmation_id. For Phase-1 auto-confirmation the item must carry the
-- source journal_entry_id + subject_skill_id (the verify path is journal-based).
create table if not exists public.learning_review_queue (
  id                       uuid primary key default gen_random_uuid(),
  signal_id                uuid references public.learning_signals(id) on delete set null,
  subject_worker_id        uuid not null references public.workers(id) on delete cascade,
  subject_skill_id         uuid references public.skills(id) on delete set null,
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  journal_entry_id         uuid references public.journal_entries(id) on delete cascade,
  suggestion_kind          text not null check (suggestion_kind in ('confirm_skill','review_skill','dismiss')),
  proposed_action          jsonb,
  status                   text not null default 'pending'
                             check (status in ('pending','approved','rejected','superseded','auto_actioned')),
  reviewed_by              uuid references public.profiles(id) on delete set null,
  reviewed_at              timestamptz,
  review_note              text check (review_note is null or char_length(review_note) <= 2000),
  produced_confirmation_id uuid references public.journal_entry_confirmations(id) on delete set null,
  policy_id                uuid references public.learning_policy_settings(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists learning_review_queue_org_status_idx
  on public.learning_review_queue (organization_id, status, created_at desc);
create index if not exists learning_review_queue_worker_idx
  on public.learning_review_queue (subject_worker_id, created_at desc);

-- ── 4. RLS — default-closed, owner/org-scoped ────────────────────────────────
alter table public.learning_policy_settings enable row level security;
alter table public.learning_signals         enable row level security;
alter table public.learning_review_queue    enable row level security;

-- learning_policy_settings: org managers + admin only (no worker access).
drop policy if exists learning_policy_settings_select on public.learning_policy_settings;
create policy learning_policy_settings_select on public.learning_policy_settings
  for select to authenticated
  using (public.manages_organization(organization_id) or public.is_admin());

drop policy if exists learning_policy_settings_insert on public.learning_policy_settings;
create policy learning_policy_settings_insert on public.learning_policy_settings
  for insert to authenticated
  with check (public.manages_organization(organization_id) or public.is_admin());

drop policy if exists learning_policy_settings_update on public.learning_policy_settings;
create policy learning_policy_settings_update on public.learning_policy_settings
  for update to authenticated
  using (public.manages_organization(organization_id) or public.is_admin())
  with check (public.manages_organization(organization_id) or public.is_admin());

-- learning_signals: worker sees own (transparency); org manager sees org scope;
-- admin all. INSERT only by someone with scope over the subject. Append-only:
-- NO update/delete policy.
drop policy if exists learning_signals_select on public.learning_signals;
create policy learning_signals_select on public.learning_signals
  for select to authenticated
  using (
    public.owns_worker(subject_worker_id)
    or (organization_id is not null and public.manages_organization(organization_id))
    or public.is_admin()
  );

drop policy if exists learning_signals_insert on public.learning_signals;
create policy learning_signals_insert on public.learning_signals
  for insert to authenticated
  with check (
    public.owns_worker(subject_worker_id)
    or (organization_id is not null and public.manages_organization(organization_id))
    or public.is_admin()
  );

-- learning_review_queue: worker may SELECT own (transparency) but NOT review;
-- only an org manager/admin may insert and update (review). NO delete.
drop policy if exists learning_review_queue_select on public.learning_review_queue;
create policy learning_review_queue_select on public.learning_review_queue
  for select to authenticated
  using (
    public.owns_worker(subject_worker_id)
    or public.manages_organization(organization_id)
    or public.is_admin()
  );

drop policy if exists learning_review_queue_insert on public.learning_review_queue;
create policy learning_review_queue_insert on public.learning_review_queue
  for insert to authenticated
  with check (public.manages_organization(organization_id) or public.is_admin());

drop policy if exists learning_review_queue_update on public.learning_review_queue;
create policy learning_review_queue_update on public.learning_review_queue
  for update to authenticated
  using (public.manages_organization(organization_id) or public.is_admin())
  with check (public.manages_organization(organization_id) or public.is_admin());

-- ── 5. Grants — to `authenticated` only (never anon/public). RLS still gates
--    every row; the grant just permits the verb at the role level. No DELETE
--    grant on signals/queue (append-only / supersede-by-status).
grant select, insert, update on public.learning_policy_settings to authenticated;
grant select, insert          on public.learning_signals         to authenticated;
grant select, insert, update  on public.learning_review_queue    to authenticated;

-- ── 6. apply_learning_auto_confirmation — the ONE delegated-authority RPC ─────
-- Converts an ELIGIBLE pending review item into a REAL confirmation by reusing
-- the existing spine. It does NOT let learning confirm: the confirmer is the
-- LIVE caller (auth.uid()), re-validated as an active org manager; the policy and
-- its enabling manager are recorded. Every guard the manual path enforces is
-- re-checked here at fire time (policy enabled, scope, threshold, live authority,
-- engagement-context journal_review_enabled, skill ownership). On any failure it
-- returns a tagged string and writes nothing.
create or replace function public.apply_learning_auto_confirmation(p_review_item_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid          uuid := auth.uid();
  v_worker     uuid; v_skill uuid; v_org uuid; v_entry uuid; v_signal uuid; v_status text; v_kind text;
  v_policy_id  uuid; v_enabled boolean; v_scope jsonb; v_rule jsonb; v_enabled_by uuid;
  v_min_conf   int;  v_sig_score int;
  v_eorg       uuid; v_eworker uuid; v_review_enabled boolean;
  v_eng        uuid; v_role text; v_conf_id uuid; v_n int;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  -- Load the review item.
  select subject_worker_id, subject_skill_id, organization_id, journal_entry_id,
         signal_id, status, suggestion_kind
    into v_worker, v_skill, v_org, v_entry, v_signal, v_status, v_kind
  from public.learning_review_queue where id = p_review_item_id;
  if not found then return 'item_not_found'; end if;
  if v_status <> 'pending' then return 'not_pending'; end if;
  if v_kind <> 'confirm_skill' then return 'unsupported_kind'; end if;
  if v_entry is null or v_skill is null then return 'item_incomplete'; end if;

  -- Live authority of the CALLER over the item's org (no stored-flag trust).
  if not (public.is_admin() or public.manages_organization(v_org)) then return 'not_authorized'; end if;

  -- Policy must exist for this org and be ENABLED.
  select id, enabled, scope, rule, enabled_by
    into v_policy_id, v_enabled, v_scope, v_rule, v_enabled_by
  from public.learning_policy_settings
  where organization_id = v_org and policy_kind = 'auto_confirm_journal_skill';
  if not found or v_enabled is not true then return 'policy_disabled'; end if;

  -- Scope check. Empty/missing scope confirms NOTHING.
  if not (
       coalesce((v_scope->>'all_org_workers')::boolean, false)
       or (v_scope ? 'worker_ids' and (v_scope->'worker_ids') ? v_worker::text)
     ) then
    return 'out_of_scope';
  end if;

  -- Threshold check. Missing min_confidence => nothing passes.
  v_min_conf := nullif(v_rule->>'min_confidence', '')::int;
  if v_min_conf is null then return 'threshold_not_met'; end if;
  select confidence_score into v_sig_score from public.learning_signals where id = v_signal;
  if v_sig_score is null or v_sig_score < v_min_conf then return 'threshold_not_met'; end if;

  -- Re-derive org/worker and the journal_review_enabled gate from the SOURCE
  -- entry (same gate the manual spine uses).
  select ec.organization_id, je.worker_id, coalesce(ec.journal_review_enabled, false)
    into v_eorg, v_eworker, v_review_enabled
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where je.id = v_entry;
  if not found then return 'entry_not_found'; end if;
  if v_eorg is distinct from v_org then return 'org_mismatch'; end if;
  if v_eworker is distinct from v_worker then return 'worker_mismatch'; end if;
  if not v_review_enabled then return 'review_not_enabled'; end if;

  -- The skill must actually belong to this worker.
  if not exists (select 1 from public.worker_skills ws
                  where ws.worker_id = v_worker and ws.skill_id = v_skill) then
    return 'skill_not_owned';
  end if;

  -- The caller must have an ACTIVE reviewer engagement in this org.
  select ec.id, ec.relationship_slug into v_eng, v_role
  from public.engagement_contexts ec
  where ec.profile_id = uid and ec.organization_id = v_org and ec.status = 'active'
    and ec.relationship_slug in ('manager','owner','external_manager')
  limit 1;
  if v_eng is null then return 'no_reviewer_engagement'; end if;

  -- 1) REAL confirmation (append-only). action='auto_confirm' makes it honest;
  --    the policy + enabling manager + rule + source signal are recorded.
  insert into public.journal_entry_confirmations
    (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
  values (v_entry, uid, v_eng, v_role,
    jsonb_build_object(
      'action','auto_confirm', 'decision','approved',
      'skills_confirmed', to_jsonb(array[v_skill]),
      'policy_id', v_policy_id, 'policy_enabled_by', v_enabled_by,
      'rule', v_rule, 'source_signal_id', v_signal,
      'review_item_id', p_review_item_id))
  returning id into v_conf_id;

  -- 2) THE PROOF — same write as the manual path.
  update public.worker_skills
     set verified = true, verified_by = uid, verified_at = now(),
         source = 'manager_confirmed', confidence_bin = 'green', updated_at = now()
   where worker_id = v_worker and skill_id = v_skill
     and (verified is distinct from true);
  get diagnostics v_n = row_count;

  -- 3) Audit (real event, attributes both the live confirmer and the policy).
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'auto_confirm_via_learning_policy', 'journal_entries', v_entry,
    jsonb_build_object('organization_id', v_org, 'worker_id', v_worker, 'skill_id', v_skill,
      'policy_id', v_policy_id, 'policy_enabled_by', v_enabled_by,
      'review_item_id', p_review_item_id, 'skills_newly_verified', v_n));

  -- 4) Close the queue item.
  update public.learning_review_queue
     set status = 'auto_actioned', reviewed_by = uid, reviewed_at = now(),
         produced_confirmation_id = v_conf_id, policy_id = v_policy_id, updated_at = now()
   where id = p_review_item_id;

  return 'auto_confirmed:' || v_n::text;
end $$;

revoke all on function public.apply_learning_auto_confirmation(uuid) from public;
grant execute on function public.apply_learning_auto_confirmation(uuid) to authenticated;

commit;
