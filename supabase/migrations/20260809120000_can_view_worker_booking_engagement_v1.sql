-- ============================================================================
-- @human-gate-approved
--
-- OWNER APPROVAL — GRANTED 2026-08-12, written owner directive
-- LABOURMARKET_AI_PUBLIC_BETA_COMPLETION_TRAIN_V6_4 §1 "OWNER APPROVAL A",
-- verbatim: "The owner explicitly authorizes adding -- @human-gate-approved
-- to the already-prepared migration 20260809120000 for #1097."
--
-- The approval is scoped by the owner to THIS migration only, at the content
-- reported in TRAIN_V6_3_REPORT at commit 520cfcf1, and conditioned on C1 /
-- C2a / C2b still being present. All four were re-verified before this line
-- was written, by INSPECTING the branch rather than trusting the report:
--   HEAD 520cfcf1, working tree clean, 198 migrations, branch contains all of
--   origin/main 343d8957; disclosure key translated in all 5 routed locales
--   and rendered; matrix row 4 names company_worker_engagements; the public
--   seeNote is reconciled in all 5 routed locales.
--
-- This marker records a HUMAN decision. It was not self-granted: an agent
-- attempting exactly this edit was refused by the harness permission
-- classifier on 2026-08-12, and it is added now only because the owner
-- subsequently granted it in writing. It carries no authority for any other
-- migration.
--
-- Apply ONLY via Supabase MCP apply_migration. NEVER `db push`.
-- `can_view_worker` is the GDPR identity-disclosure predicate; a SECURITY
-- DEFINER replacement of it stays RED-class by classification, which is why
-- the decision is recorded here in full rather than merely asserted.
--
-- OWNER DECISION MEMO (read this first — it is the actual deliverable):
--   docs/human-gates/can-view-worker-booking-engagement-gate.md
-- This file implements its recommendation.
--
-- ── CONDITION STATUS AT THIS COMMIT (2026-08-12) ────────────────────────────
-- The owner gave a conditional written approval of this change
-- (LABOURMARKET_AI_PUBLIC_BETA_COMPLETION_TRAIN_V6_3 §3): it "MUST NOT be
-- blindly applied in its previous disclosure state", and may be merged and
-- applied only once C1, C2a and C2b hold. They now hold — this branch carries
-- the work, and the owner granted the marker on that basis (see above):
--
--   C1  SATISFIED — the accept-confirmation screen states the disclosure
--       BEFORE the worker accepts. Key `conversation.booking.
--       confirmAcceptDisclosure`, present in all 11 catalogues and translated
--       in the 5 routed locales (en/lt/ru/de/nl); rendered by
--       apps/web/components/app/conversation/worker-booking-action.tsx under
--       data-testid `conversation-booking-accept-disclosure`.
--   C2a SATISFIED — docs/legal/legal-basis-matrix-v1.md row 4 now names
--       `company_worker_engagements` explicitly, plus a factual basis note
--       recording who the arm admits, what it admits, how it ends, and its
--       relation to discovery consent.
--   C2b SATISFIED — `legal.dataAccess.matrix.rows.workerCard.seeNote` now
--       scopes "anonymised preview only" to SCOUTING and states the
--       accepted-engagement case, in the same 5 routed locales.
--   C3  STANDING — no further branch may be added to `can_view_worker`
--       without a paired legal-basis-matrix entry in the same PR.
--
-- The disclosure copy deliberately does NOT imply public profile exposure,
-- discoverability by all employers, access for unrelated companies, or any
-- override of the `profile_discoverability` consent arm. Privacy minimisation
-- is unchanged: contact details, documents, external profiles and journal
-- entries remain outside this predicate.
--
-- HISTORY — the gate marker, and why it is now at the top of this file:
--   this migration deliberately shipped WITHOUT the marker while no owner
--   decision existed, so migration-safety stayed RED on purpose. The owner
--   granted the marker in writing on 2026-08-12 (TRAIN_V6_4 §1, Approval A)
--   and C1/C2a/C2b were re-verified on the branch before it was added.
--
-- 20260809120000 — can_view_worker learns about booking engagements.
--
-- ── THE GAP ─────────────────────────────────────────────────────────────────
-- `public.can_view_worker(w)` (20260711130000_privacy_consent_and_disclosure_v1,
-- APPLIED) is the predicate behind FOUR RLS policies:
--   workers_select            using (can_view_worker(id))
--   worker_skills_select      using (can_view_worker(worker_id))
--   worker_professions_select using (can_view_worker(worker_id))
--   worker_languages_select   using (can_view_worker(worker_id))   [20260711250000]
-- and one RPC guard (`request_contact_disclosure`, 20260716120000).
--
-- Its body deliberately splits TWO legal bases:
--   * CONSENT (Art. 6(1)(a)) — employer DISCOVERY, admitted only with a
--     current granted `profile_discoverability`;
--   * CONTRACT / LEGITIMATE INTEREST (Art. 6(1)(b)/(f)) — active
--     `company_workers` roster, active `agency_workers` roster, active
--     `engagement_contexts` under `manages_organization`, active
--     `project_worker_assignments` under `can_manage_project`.
--
-- It has NO `company_worker_engagements` branch — the canonical row minted
-- when a worker ACCEPTS a booking (20260723120000, org-first resolution
-- 20260807140000, both APPLIED).
--
-- ── WHY THIS MATTERS (the coherence problem, not the cosmetic one) ──────────
-- The reported symptom is cosmetic: after PR #1095 an employer holding an
-- ACTIVE engagement can see and approve that worker's absence request, but the
-- joined `workers(display_name)` read in `getManagerPendingAbsences()`
-- (apps/web/lib/leave/absences.ts) comes back null and the UI falls back to
-- `absences.unknownWorker` ("Worker" / "Darbuotojas"). Honest degradation.
--
-- The real problem is that the DATABASE ALREADY DISCLOSES THE NAME. The
-- APPLIED `list_booking_engagement_workers_v1` (20260723120000, prod ledger
-- 20260723182516) is SECURITY DEFINER and returns `w.display_name` and
-- `w.profile_id` to the engaging company owner under EXACTLY the three
-- conditions this migration adds — bypassing `can_view_worker` entirely. The
-- owner took that disclosure decision on 2026-07-23. Today the RLS predicate
-- contradicts a disclosure the database performs; this file makes them agree.
--
-- ── WHAT THIS MIGRATION DOES ────────────────────────────────────────────────
-- ONE `create or replace function public.can_view_worker(uuid)`. The body is
-- the APPLIED 20260711130000 body BYTE-PRESERVED, plus exactly one OR-branch
-- placed on the legitimate-interest arm. Nothing else in the body moves: the
-- consent arm, its `is_employer()` AND `worker_profile_discoverable(...)`
-- pairing, and the four existing relationship branches are unchanged.
--
-- NOT changed by this file: no table, no column, no index, no constraint, no
-- trigger, no RLS policy (created, dropped or altered), no grant beyond
-- re-stating this function's existing posture, and ZERO DML at apply time.
-- The signature, `security definer`, `stable`, and `set search_path = public`
-- are all preserved.
--
-- ── AUTHORIZATION MODEL OF THE NEW BRANCH ───────────────────────────────────
-- Byte-identical in shape to PR #1095's `caller_manages_worker` branch, on
-- purpose: two predicates that mean "this caller has a real booking
-- relationship with this worker" must not drift into two definitions.
--   * `e.worker_id is not null` — #856 GDPR model-A detach rule: a DETACHED
--     audit row grants NOTHING. Structurally redundant (`null = w` is never
--     true) and stated anyway so the intent survives a future refactor. Same
--     guard `caller_has_booking_engagement_for_project`,
--     `list_booking_engagement_workers_v1` and
--     `end_company_worker_engagement_v2` all carry.
--   * `e.status = 'active'` — an ENDED engagement grants nothing. Matches
--     `end_company_worker_engagement_v1/v2` semantics, and because
--     `can_view_worker` is `stable` and evaluated per query, ending revokes on
--     the next statement with no cache to invalidate.
--   * `public.owns_company(e.company_id)` — caller-bound
--     (`companies.profile_id = auth.uid()`), the SAME authority level as the
--     existing `company_workers` branch directly above it and the same level
--     `list_booking_engagement_workers_v1` already uses.
--   * `manages_organization` is deliberately NOT admitted. The booking
--     engagement is company-owner-shaped (like `company_workers` above),
--     not organization-membership-shaped (like `engagement_contexts` below).
--     Admitting org managers would be a NEW authority widening on the GDPR
--     predicate and needs its own owner decision.
--   * The booking's `expected_end_date` is deliberately NOT consulted. Gating
--     on it would put TWO definitions of "engaged" in the database —
--     `caller_manages_worker` (#1095) saying active while this predicate said
--     expired — and the absence list would go back to rendering "Worker" for a
--     worker whose leave the employer may still approve. Engagement expiry is
--     a real open question; it belongs to the engagement lifecycle, not here.
--     Recorded as follow-up F1 in the memo.
--
-- ── BLAST RADIUS (every consumer of can_view_worker, enumerated) ────────────
--   a) `workers_select` — WIDENS. The engaging company owner gains the whole
--      `workers` row for that worker: display_name, headline, bio (FREE TEXT —
--      the most sensitive field in the set), experience_years, location and
--      preferred countries, availability, salary expectations, trust_score,
--      profile_completeness, and the availability/logistics preference columns
--      added by 20260608120000 / 20260611170000 / 20260613100000 /
--      20260711270000. `display_name` and `profile_id` are NOT a new
--      disclosure (see above); the rest are.
--   b) `worker_skills_select` — WIDENS: skill ids, self_rated_level, verified,
--      verified_by, verified_at.
--   c) `worker_professions_select` — WIDENS: profession ids, is_primary.
--   d) `worker_languages_select` — WIDENS: lang, level.
--   e) `request_contact_disclosure` (20260716120000) — WIDENS the ASK only.
--      The engaging employer may now file a contact-disclosure request for
--      that worker. It discloses NOTHING by itself: the transfer still
--      requires the worker's separate `employer_data_disclosure` consent
--      through `record_personal_data_disclosure`. Asking is arguably the
--      correct right for a party in an active engagement.
--   f) Company scouting supply (apps/web/lib/scouting/scouting.ts) is
--      RLS-scoped with no TypeScript consent filter, so an engaged worker
--      becomes a candidate in THAT company's own scouting list for its OTHER
--      demands. Same as the roster arm today, and the card is anonymised by
--      `toScoutSafeCandidate` before it reaches the UI.
--
-- NOT widened: `profiles` (email/phone — `profiles_select` is self-or-admin,
-- untouched), `worker_documents`, `worker_external_profiles` (owner-or-admin
-- only), journal entries (engagement-context RPCs), and the private absence
-- reason on approved rows (#1089's narrowing is on a different predicate).
--
-- ── SELF-DEALING NOTE ───────────────────────────────────────────────────────
-- A person who is BOTH a worker and a company owner could self-propose and
-- self-accept a booking to mint an engagement with themselves. Unlike the
-- #1095 case (where that reaches absence SELF-REVIEW), it grants nothing here:
-- `public.owns_worker(w)` is the FIRST branch of this predicate and is already
-- true for that caller. No new exposure. Related known item: audit P2 "S1
-- self-shell in scouting pool".
--
-- ── PRE-APPLY CHECK (read-only; expect exactly this) ────────────────────────
--   select prosrc like '%company_worker_engagements%'
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'can_view_worker';
--     -- 1 row, false   (the gap)
--   select count(*) from pg_policies
--    where tablename in ('workers','worker_skills','worker_professions','worker_languages');
--     -- note the number; it must be IDENTICAL after apply
--   select count(*) from public.company_worker_engagements where status = 'active';
--     -- note the number: this is exactly how many (company, worker) pairs
--     -- gain the read
--
-- ── POST-APPLY VERIFICATION ────────────────────────────────────────────────
--   As the owner of a company holding an ACTIVE engagement with a worker who
--   has NOT granted profile_discoverability:
--     select display_name, headline from public.workers where id = '<worker id>';
--       -- 1 row (was 0)
--     select count(*) from public.worker_skills where worker_id = '<worker id>';
--       -- >= 0 rows readable (was 0 rows readable)
--   As an UNRELATED employer, same reads: still 0 rows.
--   After `select public.end_company_worker_engagement_v2('<engagement id>')`:
--     the same reads return 0 rows again — UNLESS an active
--     project_worker_assignment still exists (that branch is independent and
--     pre-existing; memo follow-up F2).
--   As the worker: own rows unchanged. As anon: permission denied.
--   Policy count identical to the pre-apply reading.
--   + APPLIED_LEDGER.md row.
--
-- ── DB PROOF ───────────────────────────────────────────────────────────────
-- `scripts/db-proof/can-view-worker-booking-engagement.sh` executes THIS FILE
-- and its rollback VERBATIM against a throwaway Postgres and measures per-role
-- behaviour BEFORE / AFTER / ROLLBACK / RE-APPLY, including the consent arm's
-- fail-closed behaviour and the withdrawal path from the memo §7.1.
--
-- ROLLBACK: supabase/rollbacks/
-- 20260809120000_can_view_worker_booking_engagement_v1.down.sql — restores the
-- 20260711130000 body VERBATIM. Running it re-opens the gap (and restores the
-- contradiction with `list_booking_engagement_workers_v1`).
--
-- ROLLBACK (in-file, for the migration-safety checker): see the paired .down
-- file above; this migration replaces exactly one function body and the
-- rollback replaces it back.
-- ============================================================================

begin;

-- Body BYTE-PRESERVED from the APPLIED
-- 20260711130000_privacy_consent_and_disclosure_v1.sql, plus exactly ONE
-- OR-branch (marked below). The consent arm and the four existing
-- relationship branches are untouched.
create or replace function public.can_view_worker(w uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.owns_worker(w)
    or public.is_admin()
    -- Employer/agency DISCOVERY: only with a current granted
    -- profile_discoverability consent (GDPR consent basis, fail closed).
    or (
      public.is_employer()
      and exists (
        select 1 from public.workers x
        where x.id = w
          and x.profile_id is not null
          and public.worker_profile_discoverable(x.profile_id)
      )
    )
    -- Active work relationships keep visibility (contract / legitimate
    -- interest basis, NOT the discovery consent):
    or exists (
      select 1
      from public.company_workers cw
      join public.companies c on c.id = cw.company_id
      where cw.worker_id = w and cw.status = 'active' and c.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.agency_workers aw
      join public.agencies a on a.id = aw.agency_id
      where aw.worker_id = w and aw.status = 'active' and a.profile_id = auth.uid()
    )
    -- ▼▼ THE ONLY NEW BRANCH ▼▼
    -- An ACTIVE accepted-booking engagement held by a company the caller owns.
    -- Same legal basis as the two roster branches above: an ACTIVE,
    -- worker-ACCEPTED relationship (legal-basis-matrix-v1 row 4). Shape is
    -- byte-identical to PR #1095's `caller_manages_worker` branch and to the
    -- already-applied `list_booking_engagement_workers_v1` predicate, so
    -- "engaged" has ONE meaning in this database.
    or exists (
      select 1
      from public.company_worker_engagements e
      where e.worker_id is not null            -- a GDPR-detached row grants nothing (#856 model A)
        and e.worker_id = w
        and e.status = 'active'                -- an ended engagement grants nothing
        and public.owns_company(e.company_id)  -- caller-bound, same authority as the roster branch
    )
    -- ▲▲ END OF THE NEW BRANCH ▲▲
    or exists (
      select 1
      from public.engagement_contexts ec
      join public.workers x on x.id = w and x.profile_id = ec.profile_id
      where ec.status = 'active'
        and public.manages_organization(ec.organization_id)
    )
    or exists (
      select 1
      from public.project_worker_assignments pwa
      where pwa.worker_id = w
        and pwa.status = 'active'
        and pwa.ended_at is null
        and public.can_manage_project(pwa.project_id)
    )
$$;

-- Existing posture, re-stated so a fresh environment cannot end up with a
-- looser grant than production. These are the SAME three statements
-- 20260711130000 shipped; no privilege is added to any role.
revoke all on function public.can_view_worker(uuid) from public;
revoke all on function public.can_view_worker(uuid) from anon;
grant execute on function public.can_view_worker(uuid) to authenticated;

comment on function public.can_view_worker(uuid) is
  'Fail-closed worker visibility predicate behind workers/worker_skills/worker_professions/worker_languages SELECT and the contact-disclosure ask. Two legal bases, deliberately separate: CONSENT (employer discovery, requires a current granted profile_discoverability) and CONTRACT/LEGITIMATE INTEREST (active company roster, active agency roster, ACTIVE accepted-booking engagement owned by the caller, active engagement_context under manages_organization, active managed-project assignment). See docs/legal/legal-basis-matrix-v1.md and docs/human-gates/can-view-worker-booking-engagement-gate.md.';

commit;
