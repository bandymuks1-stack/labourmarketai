-- 20260530150000 — one canonical demand intake (Phase 3 / Slice 3.1).
--
-- GOAL: exactly ONE way to express structured company/agency/buyer demand —
-- customer_requests — folding the parallel pilot_drafts draft path into it. No
-- third path. (leads stays as a DISTINCT pre-auth/founder-review funnel — see
-- §below + docs/PLATFORM_DOCTRINE; it is NOT structured demand.)
--
-- WHY a fold (not a new table): customer_requests is already the canonical,
-- live intake (customers + customer_request_attachments), with a full status
-- lifecycle that ALREADY includes 'draft'. pilot_drafts (0 rows) was a second
-- draft store. This migration makes customer_requests able to hold the same
-- per-type drafts, so the "express your need/offer" form writes the canonical
-- table.
--
-- TWO owner-scoped write paths land on this ONE intake:
--   • save_demand_draft     — the draft form (status='draft', upsert per kind);
--   • submit_demand_request — the pilot-request CTA (status='submitted'),
--                             repointed off the leads pre-auth funnel.
-- Both stamp `kind`; neither is a separate table or a separate demand model.
--
-- ADDITIVE + REVERSIBLE. No DROP/destructive change; pilot_drafts is left
-- untouched (retire in a later slice once nothing references it). The only new
-- write capability is two SECURITY DEFINER RPCs — needed because customer_requests
-- INSERT RLS is admin-only, so an owner writes their own demand through the gated
-- RPCs (owner-scoped inside), never a direct insert and never an RLS loosening.
--
-- 🟡 (touches the demand schema) → committed, queued for the gate, NOT applied.
-- Apply via MCP apply_migration after review. Never db push.

begin;

-- ── additive columns on the canonical intake ─────────────────────────────
-- kind: which front-door form produced this demand (folds pilot_drafts.draft_type).
alter table public.customer_requests
  add column if not exists kind text
  check (kind in ('company_request','agency_offer','buyer_request','customer_request'));
-- payload: per-type fields that have no dedicated column (mirrors the old
-- pilot_drafts.payload so the fold is lossless for every form type).
alter table public.customer_requests
  add column if not exists payload jsonb not null default '{}'::jsonb;
-- original_language: §2 author-content is multilingual — store the author's
-- language; translation-on-read for viewers is a later layer (infra is day-1).
alter table public.customer_requests
  add column if not exists original_language text;

-- One DRAFT per (profile, kind) so the form can upsert idempotently (parity
-- with the old pilot_drafts UNIQUE(profile_id, draft_type)). Partial: only
-- drafts are unique; a profile may have many submitted requests of a kind.
create unique index if not exists customer_requests_one_draft_per_kind
  on public.customer_requests (profile_id, kind)
  where status = 'draft';

-- ── save_demand_draft — the canonical structured-demand save (owner-scoped) ─
-- Upserts the signed-in user's DRAFT customer_request of a kind. SECURITY
-- DEFINER because customer_requests INSERT RLS is admin-only; authority is
-- enforced inside (acts only on auth.uid()'s own row). Returns the request id.
create or replace function public.save_demand_draft(
  p_kind text,
  p_title text,
  p_payload jsonb default '{}'::jsonb,
  p_original_language text default 'lt'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_kind not in ('company_request','agency_offer','buyer_request','customer_request') then
    raise exception 'invalid_kind';
  end if;

  select id into v_id from public.customer_requests
   where profile_id = uid and kind = p_kind and status = 'draft' limit 1;

  if v_id is not null then
    update public.customer_requests
       set title = coalesce(v_title, title),
           payload = coalesce(p_payload, '{}'::jsonb),
           original_language = coalesce(p_original_language, original_language),
           updated_at = now()
     where id = v_id;
  else
    insert into public.customer_requests
      (profile_id, kind, title, payload, original_language, status)
    values
      (uid, p_kind, coalesce(v_title, '—'), coalesce(p_payload, '{}'::jsonb),
       coalesce(p_original_language, 'lt'), 'draft')
    returning id into v_id;
  end if;

  return v_id;
end $$;

revoke all on function public.save_demand_draft(text, text, jsonb, text) from public;
grant execute on function public.save_demand_draft(text, text, jsonb, text) to authenticated;

-- ── submit_demand_request — the canonical SUBMIT path (owner-scoped) ────────
-- The dashboard pilot-request CTA expresses a real authenticated need ("hire
-- workers" / "agency partnership"). It must land on the canonical intake, NOT
-- on the leads pre-auth funnel. This RPC inserts a SUBMITTED customer_request
-- stamped with kind (so admin review can classify it) — owner-scoped SECURITY
-- DEFINER for the same reason save_demand_draft is: customer_requests INSERT RLS
-- is admin-only by design. Status is hard-pinned to 'submitted' (an owner can
-- never reach the admin-only review statuses through this path).
create or replace function public.submit_demand_request(
  p_kind text,
  p_title text,
  p_need_summary text default null,
  p_payload jsonb default '{}'::jsonb,
  p_original_language text default 'lt'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_kind not in ('company_request','agency_offer','buyer_request','customer_request') then
    raise exception 'invalid_kind';
  end if;

  insert into public.customer_requests
    (profile_id, kind, title, need_summary, payload, original_language, status)
  values
    (uid, p_kind, coalesce(v_title, '—'),
     nullif(btrim(coalesce(p_need_summary, '')), ''),
     coalesce(p_payload, '{}'::jsonb),
     coalesce(p_original_language, 'lt'), 'submitted')
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.submit_demand_request(text, text, text, jsonb, text) from public;
grant execute on function public.submit_demand_request(text, text, text, jsonb, text) to authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual — copy-paste). Fully reversible; pilot_drafts untouched.
-- ═══════════════════════════════════════════════════════════════════════════
--   begin;
--   drop function if exists public.submit_demand_request(text, text, text, jsonb, text);
--   drop function if exists public.save_demand_draft(text, text, jsonb, text);
--   drop index if exists public.customer_requests_one_draft_per_kind;
--   alter table public.customer_requests drop column if exists original_language;
--   alter table public.customer_requests drop column if exists payload;
--   alter table public.customer_requests drop column if exists kind;
--   commit;
