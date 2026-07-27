# SECURITY DEFINER Authorization Audit (I-02) — 2026-07-27

Consolidated report of the full-catalog authorization audit of the production
`SECURITY DEFINER` function surface (199 functions, dumped 2026-07-27 via
`pg_get_functiondef`, batches 01–10). Five parallel auditor slices produced the
per-batch verdict tables reproduced verbatim in the appendix; this section
consolidates the outcome.

Audit reference: **I-02 (2026-07-27)** — the NULL-flip authorization-bypass
class and the wider per-function authorization review.

## Summary

**199 functions audited.** Verdicts:

| Verdict | Count |
|---|---|
| CONFIRMED_SAFE_WITH_EVIDENCE | 180 |
| FALSE_POSITIVE_WITH_EVIDENCE | 6 |
| NEEDS_FIX | 12 (2 P1 + 10 P2) |
| NEEDS_MANUAL_REVIEW | 1 |

- **2 P1 — dormant NULL-flip authorization bypass** (`respond_team_enquiry_v1`,
  `save_team_details_v1`): guards of the form
  `if not (is_admin() or v_owner = uid or manages_organization(...))` where
  `v_owner` holds `organizations.owner_profile_id` — **nullable**,
  `on delete set null` (`supabase/migrations/0013_work_journal_m1.sql:35`).
  When the owner column is NULL, `v_owner = uid` evaluates to NULL, the whole
  negated OR-guard evaluates to NULL, and plpgsql skips the deny branch — any
  authenticated caller passes. Dormant today (0 production orgs with NULL
  owner) but structurally reachable at any time via profile deletion.
  **Fixed by migration `20260727170000_null_safe_owner_guards_v1.sql`**
  (DRAFT, needs-human-gate; paired rollback in `supabase/rollbacks/`).
- **10 P2 — defense-in-depth backlog** (table below). Not fixed in this
  migration; each has a concrete suggested fix in its batch report.
- **1 NEEDS_MANUAL_REVIEW** (`add_org_member`): the *consent model* — an org
  owner/manager can attach any worker as an active `employee` engagement with
  no acceptance step by the worker, which then satisfies `can_view_worker`'s
  engagement branch and bypasses the discoverability-consent gate. Documented
  as intended (`20260530140000:17`); **owner decision needed** on the
  privacy-consent tension. (Independent of this, the function's NULL-flip
  guard defect *is* fixed by the migration.)
- **6 FALSE_POSITIVE_WITH_EVIDENCE**: functions initially flagged for "no
  auth.uid() reference" whose authorization in fact runs through verified
  null-safe helpers (`owns_worker`, `caller_manages_defect`,
  `can_manage_project`) — refuted with evidence in the batch tables.

## Coordinator sweep — NULL-flip fix set widened from 2 to 6

The two P1s established the defect *class*. A systematic sweep of all 10 batch
dumps for the same shape (a variable holding a **nullable** owner column
compared with `=` inside a negated IF OR-guard) widened the fix set:

| Function | Batch:line | Sweep disposition |
|---|---|---|
| `respond_team_enquiry_v1` | batch-07:647 | P1 (audit finding F-1) |
| `save_team_details_v1` | batch-08:576–579 | P1 (audit finding F-2) |
| `add_org_member` | batch-01:477 | widened — same guard shape (batch-01 table records only the consent NEEDS_MANUAL_REVIEW; the guard defect was caught in the sweep) |
| `get_team_capability_summary_v1` | batch-04:349–351 | widened — reclassified from CONFIRMED_SAFE in the batch-03/04 table |
| `grant_org_manager` | batch-04:471 | widened — reclassified from CONFIRMED_SAFE; highest impact of the set (NULL-owner org would let any caller mint an active `manager` engagement, which `manages_organization()` then honors platform-wide) |
| `create_invitation_v1` | batch-03:322–325 | widened — found while authoring the migration; reclassified from CONFIRMED_SAFE (org-typed invitations for a NULL-owner org) |

All six are recreated with the guard changed to
`(v_owner is not null and v_owner = uid)` in
`supabase/migrations/20260727170000_null_safe_owner_guards_v1.sql`. Comparisons
inside plain WHERE clauses (`where o.owner_profile_id = auth.uid()`) and
EXISTS-based guards (e.g. `set_business_public_profile_v1`) are fail-closed and
were verified NOT affected. Deny-style `<> uid` guards were checked against
column nullability: every such column (`booking_requests.owner_id`,
`invitations.inviter_profile_id`, `service_offering_requests.provider_id` /
`buyer_id`, `team_enquiries.owner_id`, `contact_disclosure_requests.owner_id`,
`contracts.owner_id`, `proposals.owner_id`, `marketplace_listings.owner_id`) is
NOT NULL — evidence in the batch tables.

## P2 backlog (10 items — NOT fixed by this migration)

| # | Function (batch) | Defect (one line) | Suggested fix |
|---|---|---|---|
| 1 | `create_contract_v1` (03/04) | Client-supplied `p_proposal_id`/`p_project_id`/`p_customer_request_id` inserted with no ownership gate — cross-tenant link pollution + FK existence oracle | Add auth null check; gate project via `can_manage_project`, request via `customer_requests.profile_id = auth.uid()`, proposal via `proposals.owner_id = auth.uid()` |
| 2 | `create_proposal_v1` (03/04) | Same untrusted-link pattern (`p_customer_request_id`, `p_project_id`), no auth null check | Same as #1 |
| 3 | `has_employer_data_disclosure` (03/04) | No caller gate — any authenticated user can probe a third party's consent state (boolean oracle) | Require standing: self, recipient-org owner/manager, or `is_admin()` |
| 4 | `issue_asset_v1` (05/06) | Target `p_worker_id`/`p_project_id` not org-bounded — fabricated "issued" assignment appears in a foreign worker's UI | Require worker actively linked to the asset's org; project must pass `can_manage_project` or share the asset's org |
| 5 | `list_booking_engagement_workers_v1` (05/06) | `c.profile_id is not distinct from auth.uid()` — NULL=NULL matches orphaned companies (latent anon-leak class, same shape as the PR #845 P0) | Use `=` (NULL-propagating) or add an explicit `auth.uid() is null` guard |
| 6 | `mark_agency_can_offer` (05/06) | Unbounded `p_note` + no rate limit writing into another tenant's `customer_requests.payload` | Cap note at 500, add daily cap; consider a dedicated owner-scoped table |
| 7 | `project_position_salary_avg` (05/06) | 2-sample average lets an assigned worker difference out a single colleague's exact salary midpoint | Require ≥3 samples (or ≥2 excluding the caller) for non-manager callers |
| 8 | `propose_booking_request` (05/06) | Missing `can_view_worker` gate (availability harvesting + contact channel for non-discoverable workers); v3 rate limits bypassable by calling v1 directly | Add `can_view_worker(p_worker_id)` to v1; move v3 caps into v1 or revoke direct EXECUTE on v1 |
| 9 | `transfer_asset_assignment_v1` (09/10) | Transfer targets not tenant-checked — cross-tenant row injection into a foreign worker's visible dataset (borders P1) | Require new worker linked to the asset's org; new project must pass `can_manage_project` or share the asset's org |
| 10 | `submit_company_need_public_v1` (09/10) | Anon-reachable intake with no rate limit / dedupe / volume cap — unbounded ~8KB inserts | In-function caps (per-contact 24h + global open-intake ceiling) plus an edge rate limit |

## Cross-cutting observations

- Helper predicates (`is_admin`, `owns_company`, `owns_agency`, `owns_worker`,
  `manages_organization`, `can_manage_project`, `caller_manages_*`,
  `is_conversation_participant`) were verified from live definitions in every
  slice: all key on `auth.uid()` inside `exists(...)` and fail closed on NULL.
- `is_admin()` ignores `profile_roles.is_active` — deactivating an admin role
  row does not revoke admin (flagged batch-01/02; no verdict change).
- Pre-authz "not found" existence oracles recur across the catalog (batch
  09/10 list); all keys are unguessable v4 UUIDs — cosmetic convergence on the
  unified `not_found` pattern recommended.
- `send_work_instruction{,_to_project}`: conversation-reuse lookup lacks a
  `revoked_at is null` filter (integrity, not cross-tenant — batch-07/08 O-1).
- Grant posture at audit time: EXECUTE `authenticated`-only for all functions
  except the deliberately anon-allowlisted `submit_company_need_public_v1`;
  live anon-secdef CI gate green (PR #871 evidence).

---

# Appendix — per-batch verdict tables (verbatim auditor reports)

---

# SECURITY DEFINER Audit — batch-01.sql + batch-02.sql (40 functions)

Auditor slice: batch-01 (20 fns) + batch-02 (20 fns). All functions: `SET search_path TO 'public'` confirmed pinned; no dynamic SQL anywhere in either batch; EXECUTE granted to `authenticated` only (anon revoked per secdef hardening, live gate green).

Helpers verified (definitions read, not trusted blind):
- `is_admin()` — profiles.active_role='admin' OR profile_roles role='admin'. NULL-safe (auth.uid()=NULL matches nothing). NOTE (cross-cutting, owned by batch-04): the profile_roles branch does NOT filter `is_active`, so deactivating an admin role row via `is_active=false` would not revoke admin.
- `owns_company(c)` / `owns_agency(a)` / `owns_worker(w)` — `x.profile_id = auth.uid()` existence checks; NULL auth.uid() → false. Safe.
- `manages_organization(org)` — active engagement_context with slug in (manager, owner, external_manager). Safe.
- `can_manage_project(p)` — owns_company(p.company_id) OR manages_organization(p.organization_id) OR is_admin. Safe.
- `worker_profile_discoverable(p)` — latest consent event granted AND current version; coalesce(...,false). Safe.
- `is_employer()` — active_role in (company, agency), coalesce false. Safe.
- `reviewable_journal_entry_ids()` — auth null-guard; per-entry manages_organization/is_admin; excludes superseded/deleted. Safe.
- `caller_manages_worker(w)` — active company/agency link owned by caller. Safe.

Refuted hypotheses (checked against schema, not assumed):
1. `accept_invitation_by_id_v1` — `lower(v_token_row.invited_email) <> v_email` would be a NULL trap (NULL <> x → NULL → falls through to accept) IF invited_email could be NULL. Refuted: `invitations.invited_email` is `text not null check (regex)` (20260712200000_canonical_invitations_v1.sql:51-53). Cannot be NULL or ''.
2. `accept_agency_client_connection_v1` — an email-less JWT (v_email='') could match an empty invited_email. Refuted: `agency_client_connections.invited_email` is `not null` + email regex (20260723180000_agency_real_client_bridge_v1.sql:53-55); '' can never be stored.

## Verdict table

| # | Function | Verdict | Sev | Evidence (one line) |
|---|----------|---------|-----|---------------------|
| 1 | accept_agency_client_connection_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; owns_company(p_client_company_id); invite matched on caller's own JWT email (NOT NULL+regex column); uniform 'not_found' kills probing; FOR UPDATE; same-company blocked; mutation scoped to that one invite row |
| 2 | accept_agency_worker_invitation | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; email taken from caller's OWN profile row; pending invite matched on that email; NULL email → NULL comparison → no_invitation (fails closed); writes only caller's own link |
| 3 | accept_company_worker_invitation | CONFIRMED_SAFE_WITH_EVIDENCE | - | identical pattern to #2 on company_worker_invitations; fails closed on NULL email; self-scoped writes |
| 4 | accept_invitation_by_id_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; `v_email=''` guard + email match against NOT NULL regex-checked invited_email (NULL trap refuted, see above); mismatch returns identical 'not_found'; FOR UPDATE; engagement created only for uid |
| 5 | accept_invitation_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | - | token-bearer design: sha256(token) lookup, possession of secret token IS the credential (deliberate); auth required; expiry/status enforced; relationships created only for uid |
| 6 | acknowledge_asset_assignment_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | - | assigned-worker-only via workers.profile_id=auth.uid() exists-check (NULL uid → false → exception); status gate issued→acknowledged; single-row mutation. Nit: 'not found' vs 'not authorized' error split is a UUID existence oracle — negligible (unguessable v4 UUIDs) |
| 7 | acknowledge_demand_interest | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; NULL-safe owner check `v_owner is null or v_owner <> uid`; status whitelist; worker's 'withdrawn' immutable; update keyed to (request, worker) + status<>withdrawn |
| 8 | add_defect_correction_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | - | caller_manages_defect → can_manage_project(d.project_id) (helper verified); NULL uid fails closed; input whitelists + length caps; writes scoped to that defect |
| 9 | add_org_member | NEEDS_MANUAL_REVIEW | - | Org-side authz is solid (is_admin OR org owner OR manages_organization), but there is NO consent/relationship check on the TARGET worker: an org manager can attach ANY worker_id as an active 'employee' engagement, which then satisfies can_view_worker's engagement branch — bypassing the worker_profile_discoverable consent gate for a worker who never accepted (contrast: invitation flow requires acceptance; assign_worker_to_project requires caller_manages_worker). Documented as intended ("owner brings a worker into the org", 20260530140000:17) — owner decision needed on the privacy-consent tension |
| 10 | add_pilot_participant_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard + is_admin() hard gate before any read/write; joined_via whitelist; audit-logged |
| 11 | add_project_handover_entry_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; can_manage_project OR is_admin; type/status whitelist, 1000-char cap, 500-entry cap; insert scoped to that project |
| 12 | add_project_stage_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | - | can_manage_project gate (NULL uid fails closed); length caps; insert scoped to project |
| 13 | add_role | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; role whitelist EXCLUDES 'admin' (no self-escalation); every write keyed to uid / profile_id=uid only |
| 14 | admin_list_worker_privacy_states | CONFIRMED_SAFE_WITH_EVIDENCE | - | `and public.is_admin()` in WHERE → non-admin gets zero rows; returns only profile_id + consent-state enum |
| 15 | admin_privacy_readiness_counts | CONFIRMED_SAFE_WITH_EVIDENCE | - | is_admin gate up front; returns aggregate counts only, no row-level data |
| 16 | admin_set_company_verification | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard + is_admin; status whitelist; audit-logged; scoped single-row update |
| 17 | admin_set_market_rate_average | CONFIRMED_SAFE_WITH_EVIDENCE | - | `uid is null or not is_admin` fails closed; country/status/rate whitelists; audit-logged |
| 18 | admin_set_worker_document_verification | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard + is_admin; decision whitelist; event row records before/after; scoped update |
| 19 | agency_pool_docs_readiness | CONFIRMED_SAFE_WITH_EVIDENCE | - | scoped to caller's OWN agency (a.profile_id=uid); workers filtered by docs_aggregate_consent=true (explicit consent gate); returns counts only, no document content |
| 20 | agency_worker_engagement_links | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; owns_agency OR is_admin else empty set; returns only worker ids already linked to caller's agency |
| 21 | apply_learning_auto_confirmation | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; FOR UPDATE serialization vs manual reject; live manages_organization/is_admin on item's org; policy-enabled + scope + threshold gates; org/worker re-derived from source entry (mismatch → refuse); skill-ownership check; active reviewer engagement required; conditional terminal update |
| 22 | asset_open_assignment_for_caller | CONFIRMED_SAFE_WITH_EVIDENCE | - | boolean-only helper, self-scoped via workers.profile_id=auth.uid(); NULL uid → false |
| 23 | assign_agency_worker_role | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; owns_agency OR is_admin; link-existence check; journal_review_enabled=true hard-refused and forced false on write; role whitelist; audit-logged |
| 24 | assign_company_worker_role | CONFIRMED_SAFE_WITH_EVIDENCE | - | identical pattern to #23 on company_workers; owns_company gate |
| 25 | assign_worker_to_project | CONFIRMED_SAFE_WITH_EVIDENCE | - | requires can_manage_project AND (caller_manages_worker OR booking-engagement) unless admin — both project-side AND worker-side relationship proven; NULL uid fails closed |
| 26 | batch_review_exceptions | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; entry set intersected with reviewable_journal_entry_ids() (per-entry manager/admin gate, verified); returns only entry_id + exception slug |
| 27 | caller_has_booking_engagement_for_project | CONFIRMED_SAFE_WITH_EVIDENCE | - | explicit `auth.uid() is not null` + `is not distinct from` comparisons (NULL-safe by construction); inner join on companies forces non-null company_id |
| 28 | caller_manages_asset | CONFIRMED_SAFE_WITH_EVIDENCE | - | delegates to manages_organization(a.organization_id) (verified); NULL uid → false |
| 29 | caller_manages_defect | CONFIRMED_SAFE_WITH_EVIDENCE | - | delegates to can_manage_project(d.project_id) (verified); NULL uid → false |
| 30 | caller_manages_worker | CONFIRMED_SAFE_WITH_EVIDENCE | - | active company/agency link AND owns_company/owns_agency (both verified auth.uid()-keyed); NULL uid → false |
| 31 | can_access_match | CONFIRMED_SAFE_WITH_EVIDENCE | - | boolean-only; access iff caller is the match's worker or the demand's company owner; NULL uid → false. Note (functional, not security): projects with NULL company_id drop out of the join, denying even legitimate parties |
| 32 | can_manage_project | CONFIRMED_SAFE_WITH_EVIDENCE | - | owns_company OR manages_organization OR is_admin, all verified NULL-safe; NULL org/company ids simply fail the branch |
| 33 | can_view_worker | CONFIRMED_SAFE_WITH_EVIDENCE | - | every branch is either self, admin, consent-gated (is_employer + worker_profile_discoverable), or an existing active relationship (company/agency link, org engagement, project assignment). Design-sound; see #9 for the one path that can mint such a relationship unilaterally |
| 34 | cancel_worker_absence_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | - | assigned-worker-only via workers.profile_id=auth.uid(); status whitelist; single-row update. Same negligible UUID existence-oracle nit as #6 |
| 35 | close_stale_learning_review_items | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; per-row `is_admin OR manages_organization(q.organization_id)` inside the UPDATE's WHERE — non-managers close zero rows; only stale (superseded/deleted-source) pending items transition; audit-logged |
| 36 | company_worker_engagement_links | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; owns_company OR is_admin else empty set; returns only own-company worker ids |
| 37 | complete_onboarding | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; role whitelist excludes 'admin'; every insert/update keyed to uid; profession insert FK-constrained and self-scoped |
| 38 | confirm_entry_and_verify_skills | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; org derived from the ENTRY (not caller input); is_admin/manages_organization; stale-entry refusal + BEFORE INSERT guard trigger as hard stop; review_enabled gate; per-skill ownership check; active reviewer engagement required; audit-logged |
| 39 | confirm_worker_card | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; update strictly `where profile_id = uid` |
| 40 | contact_demand_owner_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | - | auth null-guard; row returned ONLY when caller holds their own active interest signal (`and s.ok` closes the existence oracle); owner id/title NULLed unless demand open + company verified + not-self; all comparisons `is distinct from` (NULL-safe) |

## Counts

- CONFIRMED_SAFE_WITH_EVIDENCE: 39
- NEEDS_MANUAL_REVIEW: 1 (add_org_member)
- NEEDS_FIX: 0
- FALSE_POSITIVE_WITH_EVIDENCE: 0 (2 refuted hypotheses documented above, never raised as findings)

## Cross-cutting observations (not verdicts for this slice)

1. `is_admin()` (batch-04 scope) ignores `profile_roles.is_active` — admin revocation by deactivation would not revoke. Flag to batch-04 auditor.
2. SECURITY DEFINER is warranted for all 40: each either performs a cross-table authorization decision RLS cannot express (invitation/email matching, org-manager writes into worker-owned rows, verification flips) or is a STABLE predicate helper used by RLS policies themselves. None could be SECURITY INVOKER without breaking the RLS model.
3. Error-message asymmetry ('not found' vs 'not authorized') in acknowledge_asset_assignment_v1 / cancel_worker_absence_v1 is a theoretical UUID existence oracle; v4 UUIDs make it non-exploitable. Optional polish: unify to the 'not_found' pattern used by the invitation functions.

---

# SECURITY DEFINER Authorization Audit — batch-03 + batch-04 (40 functions)

Auditor slice: batch-03.sql (20 fns) + batch-04.sql (20 fns). All functions pin `search_path=public`, none use dynamic SQL, EXECUTE granted to `authenticated` (anon revoked per 20260727125759 secdef hardening). Helper predicates verified against live definitions: `is_admin()`, `owns_company(c)`, `owns_agency(a)`, `manages_organization(org)`, `can_manage_project(p)`, `caller_manages_defect(d)`, `is_conversation_participant(c)` — every one keys on `auth.uid()` inside an `exists(...)`, so NULL uid collapses to `false` (null-safe deny).

| Function | Verdict | Severity | Evidence (one line) |
|---|---|---|---|
| conversation_counterpart_identities(uuid[]) | CONFIRMED_SAFE_WITH_EVIDENCE | — | Every returned row gated by `is_conversation_participant(cp.conversation_id)` (auth.uid()-keyed, null-safe); only counterpart name of caller's own direct 2-party conversations; DEFINER warranted to bypass profiles RLS for counterpart name. |
| conversation_source_context(uuid[]) | CONFIRMED_SAFE_WITH_EVIDENCE | — | All rows gated by `is_conversation_participant(c.id)`; returns only source titles of conversations the caller participates in — participant is a legitimate party to the source object. |
| create_agency_client_connection_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Explicit `auth.uid()` null check; caller must own the agency company (`companies.profile_id = v_uid`) AND `company_type='staffing_agency'`; email regex-validated; insert scoped to owned agency. |
| create_asset_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Gated by `manages_organization(p_organization_id)` (null-safe, active manager/owner engagement); insert scoped to that org; asset_type whitelist. |
| create_contract_v1 | NEEDS_FIX | P2 | `p_proposal_id`/`p_project_id`/`p_customer_request_id` inserted with NO ownership validation — caller can link their contract to another tenant's project/proposal/request (link pollution + FK-error existence oracle); impact bounded because contracts SELECT is strictly owner-scoped (20260718190000). Also no explicit auth null check (covered only by NOT NULL owner_id + authenticated-only grant). |
| create_finance_record_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check; link IDs re-authorized server-side (`can_manage_project`, `owns_company`); amount digits-only ≤1e11; status whitelist; 2000-row abuse cap; row owned by caller. |
| create_follow_up_task_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check + `is_admin()` gate before any read/write; subject existence checks admin-only so no enumeration exposure. |
| create_invitation_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check; org-typed invites require admin/org-owner/`manages_organization`; project invites require `can_manage_project`; token_hash format-pinned; per-user open-invite (100) and daily (30) rate caps; audit-logged. |
| create_marketplace_listing_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Org/project links re-authorized (`manages_organization`/`can_manage_project`); kind/category whitelists; no explicit auth null check but `owner_id NOT NULL` (20260718210000) + authenticated-only EXECUTE makes null-uid insert fail closed. |
| create_pilot_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check + `is_admin()` gate; audit-logged. |
| create_proposal_v1 | NEEDS_FIX | P2 | Same defect as create_contract_v1: `p_customer_request_id`/`p_project_id` accepted untrusted with no `can_manage_project`/ownership gate (contrast create_finance_record_v1 which gates links); impact bounded by owner-scoped proposals SELECT policy; no explicit auth null check. |
| create_team_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check; requires owning a non-team organization (or admin); 20-team cap; created org owned by caller; audit-logged. |
| create_work_task_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check; project link re-checked via `can_manage_project` ("client value never trusted"); 200 open-task cap; row owned by caller. |
| current_profile_discoverability_consent() | CONFIRMED_SAFE_WITH_EVIDENCE | — | Query hard-scoped `e.user_id = auth.uid()`; null uid → no rows → `not_set`; returns only caller's own consent state. |
| decline_agency_client_connection_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check; UPDATE keyed on `lower(invited_email) = lower(auth.jwt()->>'email')` AND status='pending' — only the invitee's verified JWT email can decline; missing email → '' matches nothing. |
| decline_invitation_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth required; row located by sha256(token) — 256-bit capability token is the authorization (invite-link model); state transition pending→declined only; audit-logged. |
| delete_contract_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check; owner fetched then `is distinct from auth.uid()` (null-safe) before delete; delete keyed by id after owner check. |
| delete_defect_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | `caller_manages_defect` → `can_manage_project(defect.project_id)` (owner/org-manager/admin, null-safe); missing defect → helper false → exception. |
| delete_marketplace_listing_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check; owner_id compared `is distinct from auth.uid()`; silent no-op on missing row (no oracle beyond RLS). |
| delete_project_budget_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Budget's project resolved server-side then `can_manage_project` gate (null-safe deny); missing row → silent return. |
| delete_project_stage_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Identical pattern to delete_project_budget_v1: server-resolved project + `can_manage_project` gate. |
| delete_proposal_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check; owner check `is distinct from auth.uid()` before delete. |
| end_company_worker_engagement_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check; may_end = `owns_company(e.company_id)` OR caller is the engaged worker (`workers.profile_id = uid`); update guarded again by `status='active'`. |
| end_worker_project_assignment | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check; requires `can_manage_project(pid)` or `is_admin()`; update scoped to (project, worker, active). |
| expire_contact_disclosure_requests_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | `v_uid is null or not is_admin()` → not_authorized; system sweep is admin-only; change-logged per row. |
| expire_stale_booking_requests_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Admin-only (null-safe); staleness window bounds 1–365; batch-limited 500; per-row event log. |
| expire_stale_team_enquiries_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Admin-only (null-safe); batch-limited 500; audit-logged. |
| get_invitation_preview_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth required; row located only by sha256 of the possession-proving invite token (capability model); returned fields are the invite's own content intended for the token holder. |
| get_public_business_listings_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Designed-public read: rows only where org `public_profile_enabled = true` AND listing `status='active'`; limit 50. |
| get_public_business_profile_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Designed-public read gated on `public_profile_enabled = true`; returns only the org's deliberately public fields (public_tagline, public_contact_email/phone). |
| get_public_business_services_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Public-profile-gated; exposes only `status='active'` service offerings of the opted-in org's owner (offerings are marketplace-visible by design). |
| get_team_capability_summary_v1 | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check; org must be type 'team' AND caller admin/owner/`manages_organization`; returns aggregates only (counts per skill, limit 30). |
| grant_employer_data_disclosure | CONFIRMED_SAFE_WITH_EVIDENCE | — | Consent event written only for `user_id = auth.uid()` (self-consent); caller must be a worker; version/hash pinned against stale text; field whitelist (7 fields, deduped); recipient org + context existence validated. |
| grant_org_manager | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check; only admin or the org's `owner_profile_id` can grant; operations_role whitelist; scope limited to caller's own org; audit-logged. |
| grant_profile_discoverability_consent | CONFIRMED_SAFE_WITH_EVIDENCE | — | Self-scoped consent (`user_id = auth.uid()`); version/hash pinned; locale/source validated. |
| has_employer_data_disclosure | NEEDS_FIX | P2 | No caller gate at all: any authenticated user can probe the consent state of an arbitrary `p_worker_profile` for any (org, context) tuple — third-party consent metadata oracle; mitigated by needing 3 unguessable UUIDs and boolean-only return; it is an RLS/server helper so grant is needed, but should verify caller is the worker, the recipient-org owner, or admin. |
| invite_agency_worker | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check + `owns_agency` gate; email regex; lookups scoped to caller's own agency roster (no foreign-email oracle beyond own links). |
| invite_company_worker | CONFIRMED_SAFE_WITH_EVIDENCE | — | Auth null check + `owns_company` gate; identical safe pattern to invite_agency_worker. |
| is_admin() | CONFIRMED_SAFE_WITH_EVIDENCE | — | Self-scoped predicate on `auth.uid()`; null uid → false; reveals nothing about others; DEFINER needed to read profile_roles under RLS. |
| is_conversation_participant | CONFIRMED_SAFE_WITH_EVIDENCE | — | Self-scoped predicate (`cp.profile_id = auth.uid()`, revoked excluded); null-safe; reveals only caller's own membership. |

## Totals
- CONFIRMED_SAFE_WITH_EVIDENCE: 37
- NEEDS_FIX: 3 (all P2)
- NEEDS_MANUAL_REVIEW: 0
- FALSE_POSITIVE_WITH_EVIDENCE: 0

## NEEDS_FIX detail

### create_contract_v1 — P2 (defense-in-depth)
Defect: inserts client-supplied `p_proposal_id`, `p_project_id`, `p_customer_request_id` without any ownership/authorization check, unlike the sibling `create_finance_record_v1` which gates every link. An authenticated user can (a) attach their contract to another tenant's project/request/proposal (cross-tenant link pollution that any future project-scoped join or report could surface), and (b) use FK success/failure as an existence oracle for those UUIDs. No auth.uid() null check (fails closed only via `owner_id NOT NULL` + authenticated-only grant).
Fix: add `if auth.uid() is null then raise ...`; gate `p_project_id` with `public.can_manage_project(p_project_id)`, `p_customer_request_id` with an owner check on `customer_requests.profile_id = auth.uid()`, and `p_proposal_id` with `proposals.owner_id = auth.uid()` before insert.

### create_proposal_v1 — P2 (defense-in-depth)
Defect: identical pattern — `p_customer_request_id` and `p_project_id` inserted untrusted, no auth null check.
Fix: same as create_contract_v1 (null check + `can_manage_project` + customer_request ownership gate).

### has_employer_data_disclosure — P2 (defense-in-depth)
Defect: no caller authorization whatsoever — any authenticated user can call it with any worker profile UUID + org UUID + context to learn whether that worker granted employer-data disclosure (third-party consent-state oracle). Exposure is small (boolean, requires knowing three UUIDs) but it discloses another user's privacy decision to parties with no standing.
Fix: restrict result to callers with standing: `p_worker_profile = auth.uid()` OR caller owns/manages `p_recipient_organization_id` OR `is_admin()`; internal SECDEF callers (contact_disclosure flows) are unaffected since they run as definer or re-check standing themselves.

---

# SECURITY DEFINER Authorization Audit — batch-05.sql + batch-06.sql (40 functions)

Auditor slice: batch-05 (20 fns) + batch-06 (20 fns). Live production definitions.
Date: 2026-07-27. All functions: `SET search_path TO 'public'` (dim 6 = YES for all), no dynamic SQL (dim 7 = NONE for all), owner postgres, EXECUTE granted to `authenticated`; anon reach revoked by ledger migrations 20260722160000 (`secdef_anon_reach_revoke_v1`) + 20260727120000 (`secdef_public_grant_hygiene_v1`), and the live anon-secdef CI gate passes (PR #871 evidence).

## Helper predicates verified (not credited blindly)

| Helper | Location | Anchored on auth.uid()? | Null-safe? |
|---|---|---|---|
| `owns_worker(w)` | batch-06 | YES (`workers.profile_id = auth.uid()`) | YES (null uid → exists=false) |
| `owns_company(c)` / `owns_agency(a)` | batch-06 | YES | YES |
| `is_admin()` | batch-04 | YES (`profiles.active_role='admin'` OR `profile_roles.role='admin'` for auth.uid()) | YES |
| `manages_organization(org)` | batch-05 | YES (active `engagement_contexts` row, relationship in manager/owner/external_manager) | YES |
| `caller_manages_asset(p)` | batch-02 | YES (via `manages_organization(assets.organization_id)`) | YES |
| `can_manage_project(p)` | batch-02 | YES (owns_company OR manages_organization OR is_admin) | YES |
| `can_view_worker(w)` | batch-02 | YES (own / admin / employer+discoverable / active link / engagement / assignment) | YES |
| `is_conversation_participant(c)` | batch-04 | YES (`conversation_participants.profile_id = auth.uid()`, revoked_at null) | YES |
| `has_employer_data_disclosure(...)` | batch-04 | NO auth.uid() — pure consent-data predicate; only used behind admin gate or self-scoped queries in this slice | n/a |
| `demand_structured_v2_public(jsonb)` | migration 20260711330000 | n/a — IMMUTABLE pure whitelist projection (enum/regex/type-checked field-by-field); never returns raw payload | n/a |
| `contact_disclosure_log_change(...)` | migration 20260716120000 | No gate — internal event/audit writer; EXECUTE revoked from public/anon/authenticated (only reachable inside SECDEF bodies) | n/a |
| `lmc_admin_grant_existing_v1(...)` | migration 20260720190000 | Compares recorded `actor_profile_id` to passed actor; with `conflict_on_foreign=false` returns ONLY `{'foreign_actor':true}` (no key-existence/recipient leak pre-admin-gate); EXECUTE revoked from public | YES |

Schema facts verified: `invitations.inviter_profile_id` is **NOT NULL** (20260712200000); `companies.profile_id` is **NULLABLE** (`on delete set null`, 0001); `asset_assignments` SELECT RLS includes **the assigned worker** (20260718180000); `booking_requests` SELECT RLS includes **owner AND the worker** (20260613100100).

## Legend

Dims: (1) caller-auth null-safety, (2) ownership, (3) org/tenant boundary, (4) role/permission, (5) NULL-safe comparisons, (8) IDOR/BOLA, (9) cross-tenant leak in RETURNS, (10) mutation scope, (11) SECDEF necessity. Dims 6 (search_path pinned = Y) and 7 (dynamic SQL = none) omitted from the table — uniform for all 40.

## Batch-05

| # | Function | 1 | 2 | 3 | 4 | 5 | 8 | 9 | 10 | 11 | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `is_conversation_participant_path` | Y (delegates; null uid → false) | via participant row | Y | n/a | Y | N | bool only | none | Y (storage RLS helper) | CONFIRMED_SAFE_WITH_EVIDENCE |
| 2 | `is_employer()` | Y (coalesce false) | self row | self | n/a | Y | N | bool only | none | Y (RLS helper) | CONFIRMED_SAFE_WITH_EVIDENCE |
| 3 | `issue_asset_v1` | Y (caller_manages_asset false on null) | asset: Y | **asset only — target project/worker NOT bounded** | asset-org manager | Y | partial | uuid only | writes own-org assignment but FK targets unbounded | Y | **NEEDS_FIX (P2)** |
| 4 | `journal_entry_restore` | Y (owns_worker false on null → not_owner) | Y (owns_worker on entry's worker) | Y | owner | Y (explicit null worker → not_found) | N | void | own entry only | Y (RLS bypass needed for locked-row flow) | FALSE_POSITIVE_WITH_EVIDENCE |
| 5 | `journal_entry_soft_delete` | Y (same chain) | Y | Y | owner | Y | N | void | own entry only | Y | FALSE_POSITIVE_WITH_EVIDENCE |
| 6 | `journal_entry_supersede` (legacy) | Y (owns_worker null-safe; no explicit uid check — fails closed anyway) | Y | Y | owner | Y | N | uuid | own worker's rows only | Y | FALSE_POSITIVE_WITH_EVIDENCE |
| 7 | `journal_entry_supersede_v2` | Y (explicit `auth.uid() is null` + owns_worker) | Y | Y | owner | Y | N | uuid | own worker's rows; slug whitelist + taxonomy validation | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 8 | `list_agency_offer_progress_v1` | Y (owns_company false on null → 0 rows) | Y (`owns_company(o.agency_company_id)`) | Y | agency owner | Y | N | own offers + derived stage of own candidates only | none | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 9 | `list_agency_offered_candidates_for_request_v1` | Y | Y (`customer_requests.profile_id = auth.uid()`) | Y | demand owner | Y | N | offers targeted at caller's own demand (by design) | none | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 10 | `list_booking_engagement_workers_v1` | **N — `is not distinct from auth.uid()` matches NULL=NULL** | see defect | see defect | company owner | **N** | N | worker names — gated by defective predicate | none | Y | **NEEDS_FIX (P2)** |
| 11 | `list_invitations_for_me_v1` | Y (explicit raise) | Y (JWT email, server-set claim) | Y | invitee | Y (empty email → empty list) | N | own pending invitations only | none | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 12 | `list_my_contact_disclosure_requests_v1` | Y (explicit) | Y (`workers.profile_id = v_uid`) | Y | worker self | Y | N | requests targeting caller only | none | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 13 | `list_my_team_enquiries_v1` | Y (explicit) | Y (`owner_id = uid`) | Y | enquiry owner | Y | N | own enquiries + target team availability (product surface) | none | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 14 | `list_open_demand_for_agencies` | Y (explicit) | agency row required | marketplace-by-design | agency | Y | N | submitted-demand summary, no PII/contact fields | none | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 15 | `list_open_demand_for_workers` | Y (explicit) | worker row required | verified companies only | worker | Y | N | whitelist projection (`demand_structured_v2_public` verified field-by-field) | none | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 16 | `list_shared_requests_for_agency_v1` | Y (owns_company null-safe) | Y | Y (active share + active connection) | agency owner | Y | N | requests explicitly shared with caller's agency | none | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 17 | `list_team_enquiries_for_my_teams_v1` | Y (explicit) | Y (team owner or manages_organization) | Y | team owner/manager | Y | N | enquiries into caller's teams | 'viewed' events self-scoped | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 18 | `lmc_admin_grant_v1` | Y (explicit) | n/a | n/a | **is_admin() for all NEW grants**; pre-gate replay path returns only the RECORDED actor's own committed grant (verified interpreter; foreign key existence not leaked) | Y | N | own/admin data only | admin-gated ledger writes, capped, idempotent, audited | Y (reads auth.users) | CONFIRMED_SAFE_WITH_EVIDENCE |
| 19 | `manages_organization` | Y | self engagement row | Y | n/a | Y | N | bool only | none | Y (RLS helper) | CONFIRMED_SAFE_WITH_EVIDENCE |
| 20 | `mark_agency_can_offer` | Y (explicit) | agency row required | **writes another tenant's `customer_requests.payload`** (by design, but unbounded) | agency | Y | partial | payload append visible to demand owner | **unbounded p_note, no rate limit** | Y | **NEEDS_FIX (P2)** |

## Batch-06

| # | Function | 1 | 2 | 3 | 4 | 5 | 8 | 9 | 10 | 11 | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 21 | `mark_booking_requests_seen` | Y (null → no-op) | self upsert | self | n/a | Y | N | void | own row only | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 22 | `mark_invitation_delivery_v1` | Y (explicit) | Y (`inviter_profile_id <> uid` refuse; column NOT NULL so `<>` cannot null-bypass — verified DDL) | Y | inviter | Y (given NOT NULL) | N | text status only | own invitation only | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 23 | `mark_service_requests_seen` | Y (null → no-op) | self upsert | self | n/a | Y | N | void | own row | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 24 | `owns_agency` | Y | Y | Y | n/a | Y | N | bool | none | Y (RLS helper) | CONFIRMED_SAFE_WITH_EVIDENCE |
| 25 | `owns_company` | Y | Y | Y | n/a | Y | N | bool | none | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 26 | `owns_worker` | Y | Y | Y | n/a | Y | N | bool | none | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 27 | `profile_role` | Y (null → null) | self row | self | n/a | Y | N | own role only | none | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 28 | `project_position_salary_avg` | Y (explicit) | n/a | Y (project-scoped) | admin / project manager / **any active assigned worker** | Y | N | **2-sample avg → exact colleague-salary differencing by a peer** | none | Y | **NEEDS_FIX (P2)** |
| 29 | `propose_booking_request` | Y (explicit) | demand: Y | **worker visibility NOT checked** | demand owner | Y | **partial — availability snapshot of ANY worker uuid** | snapshot readable back via own-row RLS | writes row visible to targeted worker; **no rate limit (v3 bypass)** | Y | **NEEDS_FIX (P2)** |
| 30 | `propose_booking_request_v3` | Y (explicit) | delegates to v1 (all v1 gates apply) | see v1 | demand owner + open/daily caps | Y | see v1 | uuid | rate-limited wrapper | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 31 | `propose_contact_disclosure_request_v1` | Y (explicit) | Y (demand + org ownership) | Y (`can_view_worker` verified) | owner/manager | Y | N | uuid/status | field whitelist, caps, dedupe, audited | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 32 | `propose_team_enquiry_v1` | Y (explicit) | Y (company org authority when supplied) | Y (own-team refusal; contact-detail scrubbing) | authenticated | Y (null team owner cannot bypass an authz gate — own-team check is a refusal, not a grant) | N | uuid/outcome | caps + audit | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 33 | `provision_agency_worker_engagement_context` | Y (explicit) | Y (owns_agency OR is_admin) | Y (worker must be linked via `agency_workers` with admin ops-role) | owner/admin | Y | N | text status | creates 'employee' context (no manage powers — `manages_organization` requires manager/owner/external_manager) | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 34 | `provision_company_worker_engagement_context` | Y (explicit) | Y (owns_company OR is_admin) | Y (via `company_workers`) | owner/admin | Y | N | text status | same as #33 | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 35 | `record_personal_data_disclosure` | Y (explicit null + admin) | n/a | consent-scoped (grant row match on org+context) | **is_admin()** | Y | N | uuid only | disclosure categories validated ⊆ consented `selected_fields` | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 36 | `record_pilot_outcome_v1` | Y (explicit) | n/a | pilot/participant existence checked | **is_admin()** | Y | N | uuid/outcome | admin-scoped, audited | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 37 | `register_conversation_message_attachment` | Y (explicit) | Y (message author = uid) | Y (participant check + `conversation/uid/` path prefix) | author+participant | Y | N | uuid | own message; mime/size whitelist; 5-cap | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 38 | `register_customer_request_attachment` | Y (explicit) | Y (request owner or admin) | Y (`uid/request/` path prefix) | owner/admin | Y | N | uuid | own request; whitelists | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 39 | `register_journal_entry_photo` | Y (explicit) | Y (entry owner via workers join, FOR UPDATE) | Y (path prefix) | owner | Y | N | uuid | own entry; 1-photo race-proof cap | Y | CONFIRMED_SAFE_WITH_EVIDENCE |
| 40 | `remove_pilot_participant_v1` | Y (explicit) | n/a | pilot-scoped | **is_admin()** | Y | N | text | admin-scoped soft-remove, audited | Y | CONFIRMED_SAFE_WITH_EVIDENCE |

## Verdict counts

- CONFIRMED_SAFE_WITH_EVIDENCE: **32**
- NEEDS_FIX: **5** (all P2)
- NEEDS_MANUAL_REVIEW: **0**
- FALSE_POSITIVE_WITH_EVIDENCE: **3** (journal_entry_soft_delete, journal_entry_restore, journal_entry_supersede — flagged for "no auth.uid() reference", but authorization runs through `owns_worker()`, which is auth.uid()-anchored and null-safe; verified end-to-end)

## NEEDS_FIX detail

### 1. `issue_asset_v1` — P2 (cross-org reference injection / worker-visible spam)
Caller must manage the ASSET (`caller_manages_asset` → `manages_organization`, verified), but `p_project_id` and `p_worker_id` are accepted with **no org-boundary validation** — only FK existence. A manager of org A can insert an `asset_assignments` row targeting **any worker on the platform**; `asset_assignments` SELECT RLS (20260718180000) explicitly grants the assigned worker visibility, so the targeted worker sees a fabricated "issued" assignment from a foreign org. Same for foreign `project_id`. No check that the asset isn't already assigned.
**Fix:** require the worker to be actively linked to the asset's org (`company_workers`/`agency_workers`/engagement context) and the project to satisfy `can_manage_project(p_project_id)` or share the asset's `organization_id`; optionally refuse when `assets.availability = 'assigned'`.

### 2. `list_booking_engagement_workers_v1` — P2 (NULL-unsafe comparison, latent anon leak class)
Gate is `c.profile_id is not distinct from auth.uid()`. `companies.profile_id` is **nullable** (`on delete set null`, 0001_initial_schema.sql). For a NULL `auth.uid()` (anon/ownerless contexts), `NULL IS NOT DISTINCT FROM NULL` = TRUE → every active engagement of every **orphaned** company (owner deleted) is returned with worker display names. Currently unreachable because anon EXECUTE was revoked (20260722160000/20260727120000) and `authenticated` always carries a sub claim — hence P2 defense-in-depth, not P0. But this is the exact defect class of the PR #845 P0, and `is not distinct from` here is strictly weaker than `=`.
**Fix:** change to `c.profile_id = auth.uid()` (NULL-propagating, fails closed) or add an explicit `auth.uid() is null` guard.

### 3. `mark_agency_can_offer` — P2 (unbounded write into another tenant's row)
Any agency may append a marker into **another tenant's** `customer_requests.payload -> agency_offers` (intended marketplace feature), but: `p_note` has **no length cap** (contrast: every other note field in this slice caps at 500) and there is **no rate limit** across requests — an agency can stamp every submitted request platform-wide, growing foreign rows' jsonb without bound and pushing arbitrary text (note, marked_at) into the demand owner's payload, which downstream surfaces may render.
**Fix:** cap note (`left(...,500)`), add a daily cap analogous to `propose_booking_request_v3`, and consider moving markers to a dedicated owner-scoped table instead of mutating the counterparty's payload.

### 4. `project_position_salary_avg` — P2 (2-sample salary differencing by a peer worker)
Access is granted to admin, project managers, **and any worker with an active assignment on the project**. The aggregate suppresses output only below 2 samples. With exactly 2 salary-bearing workers in a profession — one being the caller — the caller subtracts their own known midpoint from the returned average and recovers the **exact salary midpoint of the single colleague**. Profession filtering makes 2-sample cells common.
**Fix:** for non-manager callers require `count >= 3` (or exclude the caller's own row and require >= 2 others); managers/admin may keep the 2-sample threshold if salary visibility for managers is an accepted product rule.

### 5. `propose_booking_request` — P2 (worker-visibility gate missing + rate-limit bypass)
Checks demand ownership but **not** `can_view_worker(p_worker_id)` (contrast `propose_contact_disclosure_request_v1`, which does). Any authenticated user who creates a `customer_request` can, for **any worker uuid**: (a) persist a `readiness_snapshot` (availability_status, available_from, preferred_countries, verified-skill count, document count) readable back through their own-row RLS — harvesting availability data for non-discoverable workers; (b) create a 'proposed' booking row that the targeted worker sees (booking_requests SELECT RLS includes the worker) — a contact/spam channel bypassing discoverability. Additionally, v1 remains directly executable by `authenticated`, so the open-proposal (10) and daily (30) caps that exist **only in the v3 wrapper** are bypassable.
**Fix:** add `can_view_worker(p_worker_id)` to v1; move the v3 rate limits into v1 (or revoke `authenticated` EXECUTE on v1 and keep it callable only via v3).

## Cross-cutting observations (no verdict change)

- `register_customer_request_attachment`: when an **admin** registers an attachment on someone else's request, `expected_prefix` is built from the admin's uid, not the owner's — a functional quirk (storage-path convention mismatch), not a security defect.
- `list_open_demand_for_agencies` exposes submitted demand summaries from ALL customers (no verified-company filter), whereas the worker board filters to verified companies. No PII in the projection; flagged as an intentional-design question for the owner, not a defect.
- `lmc_admin_grant_v1` pre-admin-gate replay path is doctrine-documented (revoked admin may acknowledge their own committed grant); verified that a foreign caller learns nothing (interpreter returns only `{'foreign_actor':true}` and the conflict is raised **after** the live admin gate).

---

# SECURITY DEFINER Authorization Audit — batch-07.sql + batch-08.sql (40 functions)

Auditor slice: batch-07 (20 fns) + batch-08 (20 fns). Live production definitions.
Date: 2026-07-27. All functions: `SET search_path TO 'public'` pinned, no dynamic SQL, owner postgres, EXECUTE granted to `authenticated`.

## Helper predicates verified (evidence)

| Helper | Location | Logic | NULL-uid behavior |
|---|---|---|---|
| `is_admin()` | batch-04 | EXISTS profiles.active_role='admin' OR profile_roles role='admin' keyed on `auth.uid()` | false (fail closed) |
| `owns_company(c)` | batch-06 | EXISTS companies.id=c AND profile_id=auth.uid() | false |
| `owns_agency(a)` | batch-06 | EXISTS agencies.id=a AND profile_id=auth.uid() | false |
| `manages_organization(org)` | batch-05 | EXISTS engagement_contexts profile_id=auth.uid(), org match, status='active', slug in (manager,owner,external_manager) | false |
| `can_manage_project(p)` | batch-02 | EXISTS projects → owns_company OR manages_organization OR is_admin | false |
| `caller_manages_asset(a)` | batch-02 | EXISTS assets → manages_organization(a.organization_id) | false |
| `caller_manages_worker(w)` | batch-02 | EXISTS company_workers(active)+owns_company OR agency_workers(active)+owns_agency | false |
| `contact_disclosure_log_change` | repo 20260716120000 (audit logger, EXECUTE revoked from authenticated; internal only) | insert-only event+audit rows | n/a |
| `batch_review_exceptions` | batch-02 | read-only, scoped to `reviewable_journal_entry_ids()` (admin/org-manager gated) | raises 42501 |

Schema nullability evidence (repo `supabase/migrations/`):
- `booking_requests.owner_id` **NOT NULL** (20260613100100:34)
- `invitations.inviter_profile_id` **NOT NULL** (20260712200000:58)
- `service_offering_requests.provider_id` **NOT NULL** + `buyer_id <> provider_id` check + partial unique `(offering_id, buyer_id) where status='sent'` (20260627145318:46,56,59-61)
- `organizations.owner_profile_id` **NULLABLE, `on delete set null`** (0013_work_journal_m1.sql:35) ← root of the two NEEDS_FIX findings

## Per-function verdicts

Legend for the 11 dimensions: (1) auth null-safety, (2) ownership, (3) org/tenant boundary, (4) role/permission, (5) NULL-safe comparisons, (6) search_path pinned, (7) dynamic SQL, (8) IDOR/BOLA, (9) cross-tenant leak in RETURNS, (10) mutation scope, (11) SECDEF necessity. "OK" = satisfied / fail-closed; "n/a" = dimension not applicable.

### batch-07.sql

| # | Function | Verdict | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | Evidence / notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `remove_self_declared_work_history_v1(p_id)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK `ec.profile_id = uid` in DELETE WHERE | OK only `organization_id is null` rows | n/a | OK | OK | none | OK (own rows only) | scalar status only | own non-primary self-declared rows; FK-restrict guards journaled history | justified (RLS write-by-RPC) |
| 2 | `remove_worker_language_v1(p_lang)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK worker resolved via `profile_id = uid` | OK self-only | n/a | OK | OK | none | OK | boolean only | own worker_languages rows | justified |
| 3 | `report_defect_v1(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK via `can_manage_project` (fail-closed on NULL uid) | OK | OK project-scoped via owns_company/manages_organization/is_admin | OK | OK | OK | none | OK | uuid of own insert | insert into defects for managed project, enum-validated, reporter_id=auth.uid() | justified |
| 4 | `request_service_offering(p_offering_id, p_message)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | n/a (marketplace intent) | OK provider bound server-side from offering | OK active-offering + not-self checks | OK (`provider_id` NOT NULL) | OK | none | OK: only ACTIVE offerings targetable; provider_id denormalized server-side | uuid only | one open request per buyer/offering enforced by partial unique index (spam bounded) | justified |
| 5 | `request_worker_absence_v1(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK (EXISTS w.profile_id=auth.uid(), NULL uid → false → raise) | OK own worker only | OK | n/a | OK | OK | none | OK | uuid only | insert own absence, status forced 'requested', enums validated | justified |
| 6 | `request_worker_document_verification(p_document_id)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK worker→profile_id=uid positive check | OK | n/a | OK | OK | none | minor uuid-existence oracle ('not found' vs 'not your document') — negligible, uuids unguessable | text status | flips own doc to 'pending' only from 'ready'; event logged | justified |
| 7 | `requester_identities_for_provider(p_request_ids)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK (`r.provider_id = auth.uid()` → empty set on NULL) | OK provider-scoped in WHERE | OK | n/a | OK | OK | none | OK array filtered per-row | returns buyer full_name only for OWN incoming requests (intended disclosure) | read-only | justified (profiles read across RLS) |
| 8 | `reschedule_booking_proposal_v1(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK `br.owner_id <> uid` — safe: owner_id NOT NULL | OK | n/a | OK (NOT NULL col) | OK | none | OK | text | only own 'proposed' booking; dates validated; event logged | justified |
| 9 | `resend_invitation_v1(p_invitation_id, p_new_token_hash)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK `v_inviter <> uid` — safe: inviter_profile_id NOT NULL | OK | n/a | OK (NOT NULL col) | OK | none | OK | text status | own pending invitation only; token_hash format-validated (^[0-9a-f]{64}$); resend cap 10; audit-logged | justified |
| 10 | `respond_booking_request(p_booking_id, p_decision)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK positive EXISTS (worker.profile_id=uid) | OK | n/a | OK | OK | none | OK | text | addressed worker only, 'proposed' state only, overlap guard | justified |
| 11 | `respond_booking_request_v2(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK | OK same positive check | OK | n/a | OK | OK | none | OK | text | as v1 + validated decline reasons (enum + 500 cap) | justified |
| 12 | `respond_booking_request_v3(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK | OK same positive check; engagement creation requires demand owner = br.owner_id (server-derived) | OK company resolved from demand owner's companies, ambiguity → no-op | n/a | OK (`is distinct from` used) | OK | none | OK | jsonb (decision + engagement outcome slug only) | engagement insert idempotent via `on conflict (source_booking_id) do nothing` | justified |
| 13 | `respond_contact_disclosure_request_v1(p_id, p_decision)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK positive EXISTS subject-worker check | OK | n/a | OK | OK | none | OK | jsonb status only | 'created'→accepted/declined/expired only, `for update` lock, audited via revoked-from-authenticated logger | justified |
| 14 | `respond_service_offering_request(p_id, p_decision, p_note)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK `v_provider <> uid` — safe: provider_id NOT NULL | OK | n/a | OK (NOT NULL col) | OK | none | OK | text | provider-only, 'sent'→terminal only | justified |
| 15 | `respond_team_enquiry_v1(p_enquiry_id, p_decision)` | **NEEDS_FIX (P1)** | OK explicit | **DEFECT** | **DEFECT** | partial (manages_organization OK) | **DEFECT: `not (v_team_owner = uid or manages_organization(...))` is NULL when `organizations.owner_profile_id` IS NULL → guard skipped** | OK | none | any authenticated user can accept/decline enquiries of an owner-less team org | text | writes team_enquiries.status + events + audit_logs | justified |
| 16 | `return_asset_v1(p_assignment_id, ...)` | CONFIRMED_SAFE_WITH_EVIDENCE (special-attention item) | OK via `caller_manages_asset` (auth-anchored, NULL uid → false → raise) | OK | OK org boundary via manages_organization(assets.organization_id); NULL org → false (fail closed) | OK | OK | OK | none | OK | void | active assignment → 'returned' + asset availability, condition enum-validated | justified |
| 17 | `review_journal_entries_batch(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | delegated | OK per-entry via `review_journal_entry` (org-manager/admin) | OK | OK (dedup/NULL-strip of ids) | OK | none | OK per-entry outcome codes only | outcome slugs | batch cap 100, exception-acknowledgement gate, audit-logged | justified |
| 18 | `review_journal_entry(p_entry_id, ...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | n/a (reviewer role) | OK `is_admin() or manages_organization(v_org)`; NULL org → 'entry_not_org_scoped' first (fail closed) | OK reviewer engagement (manager/owner/external_manager, active) required | OK | OK | none | OK | text codes | refuses superseded/deleted entries; insert confirmation + audit | justified |
| 19 | `review_worker_absence_v1(p_absence_id, p_decision)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK via `caller_manages_worker` (auth-anchored; no explicit null check needed) | OK | OK company/agency ownership required | OK | OK | OK | none | OK | void | 'requested'→approved/rejected only, reviewed_by=auth.uid() | justified |
| 20 | `reviewable_journal_entry_ids()` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit early-return | n/a | OK rows gated per-org by `is_admin() or manages_organization(...)` | OK | OK | OK | none | OK returns only entry uuids the caller may review | read-only | n/a | justified (shared read set for review UX + batch fn) |

### batch-08.sql

| # | Function | Verdict | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | Evidence / notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 21 | `revoke_agency_client_connection_v1(p_connection_id)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK `owns_company` either side **inside UPDATE WHERE** (0 rows → 'not_found') | OK | n/a | OK (`client_company_id is not null` guarded) | OK | none | OK | text | soft revoke + cascading share revoke, both scoped by connection_id | justified |
| 22 | `revoke_conversation_participant(p_conversation_id, p_profile_id)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK creator-or-admin; NULL created_by → 'conversation_not_found' (fail closed) | OK | OK is_admin alt path verified | OK | OK | none | OK | text | cannot revoke creator; audit-logged | justified |
| 23 | `revoke_invitation_v1(p_invitation_id)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK `v_inviter <> uid and not is_admin()` — safe: inviter NOT NULL | OK | OK admin alt | OK (NOT NULL col) | OK | none | OK | text | pending→revoked only, audit-logged | justified |
| 24 | `save_company_setup(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK all writes `where profile_id = uid` | OK self-tenant only | n/a (self-grants 'company' profile_role — by design onboarding) | OK | OK | none | OK | uuid | cannot self-set 'verified' (preserved only if already verified); statuses limited to needs_checks/active_unverified/pending_verification | justified |
| 25 | `save_company_setup_v2(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK same self-scope | OK | n/a | OK | OK | none | OK | uuid | v1 + company_type enum + countries FK-table validation | justified |
| 26 | `save_customer_request(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK select requires `profile_id = uid` (raises otherwise); update WHERE re-checks `(profile_id = uid or is_admin())` | OK | OK admin-only statuses (in_review/needs_followup/approved/closed) coerced to 'submitted' for non-admin; submitted→draft downgrade blocked | OK | OK | none | OK | uuid | title/status validated; non-admin cannot un-submit | justified |
| 27 | `save_customer_setup(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK upsert keyed `profile_id = uid` | OK | n/a (self-grants 'customer' role — onboarding by design) | OK | OK | none | OK | uuid | enums validated | justified |
| 28 | `save_demand_draft(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK draft resolved by `profile_id = uid` | OK | n/a | OK | OK | none | OK | uuid | kind enum validated; one draft per kind updated in place | justified |
| 29 | `save_self_declared_work_history_v1(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK inserts only own `organization_id = null` rows | OK cannot attach to any org | n/a | OK (`is not distinct from` for dates) | OK; `extensions.digest` schema-qualified | none | OK | uuid | 60-row abuse cap, closed relationship enum, idempotent | justified |
| 30 | `save_team_details_v1(p_org_id, ...)` | **NEEDS_FIX (P1)** | OK explicit | **DEFECT** | **DEFECT** | partial (is_admin/manages_organization OK) | **DEFECT: `not (is_admin() or v_owner = uid or manages_organization(...))` is NULL when `organizations.owner_profile_id` IS NULL → guard skipped** | OK | none | any authenticated user can overwrite team_details of an owner-less team org | text | upsert team_details + audit log | justified |
| 31 | `save_worker_availability_prefs(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK worker via `profile_id = uid` | OK | n/a | OK | OK | none | OK | uuid | enum/range validation | justified |
| 32 | `save_worker_availability_prefs_v2(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK same | OK | n/a | OK | OK | none | OK | uuid | + pay basis / licence whitelist `<@` check | justified |
| 33 | `save_worker_card(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK `where profile_id = uid` | OK | n/a | OK coalesce-merge | OK | none | OK | timestamptz | self-only | justified |
| 34 | `save_worker_language_v1(p_lang, p_level)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK self worker | OK | n/a | OK | OK | none | OK | uuid | closed lang/level enums | justified |
| 35 | `save_worker_opportunity_v1(p_request_id, p_note)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK self worker | OK | n/a | OK | OK | none | minor existence oracle on customer_requests uuids (open vs not); no fields copied; uuids unguessable — accepted by design comment | uuid | 200-save cap, note 500 cap | justified |
| 36 | `send_work_instruction(p_worker_profile_id, ...)` | CONFIRMED_SAFE_WITH_EVIDENCE (P2 observation, see below) | OK explicit | OK instruct-authority = active company_workers+owns_company OR active agency_workers+owns_agency OR is_admin | OK | OK | OK | OK | none | OK worker resolved from profile id; invalid uuid text raises on cast | uuid (msg id) | body capped 10k; creates/reuses direct conversation. **Observation (P2, defense-in-depth): conversation-reuse join has no `revoked_at is null` filter — a sender whose participant grant was revoked can still inject messages into that conversation via this path.** Not cross-tenant: sender must still hold live employment authority over the worker. | justified |
| 37 | `send_work_instruction_to_project(...)` | CONFIRMED_SAFE_WITH_EVIDENCE (same P2 observation) | OK explicit | OK active project_worker_assignment AND `can_manage_project(pid)` (or admin) | OK project org boundary via can_manage_project | OK | OK | OK | none | OK | uuid | same revoked-participant observation as #36 | justified |
| 38 | `set_agency_worker_journal_review(...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK `owns_agency or is_admin` | OK link existence + org/engagement preconditions before enable | OK operations_role whitelist (company_admin/agency_admin) | OK (`is not true` used) | OK | none | OK | text codes | boolean flag on own agency_workers row only; audit-logged | justified |
| 39 | `set_booking_response_deadline_v1(p_booking_id, p_deadline)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK explicit | OK `br.owner_id <> uid` — safe: owner_id NOT NULL | OK | n/a | OK (NOT NULL col) | OK | none | OK | date | own 'proposed' booking only; past-date rejected; event logged | justified |
| 40 | `set_business_public_profile_v1(p_org_id, ...)` | CONFIRMED_SAFE_WITH_EVIDENCE | OK: no explicit null check, but guard is `manages_organization(...) OR EXISTS(owner_profile_id = auth.uid())` — both false (never NULL) on NULL uid/NULL owner → raises (fail closed; contrast with #15/#30 where the owner value is compared as a variable) | OK | OK | OK | OK EXISTS-based (NULL-safe) | OK | none | OK | void | slug format + uniqueness enforced when enabling; field length caps | justified |

## Findings requiring action

### F-1 — `respond_team_enquiry_v1` — NEEDS_FIX, P1 (conditional)
- **Defect (batch-07.sql:647):** `if not (v_team_owner = uid or public.manages_organization(e.team_org_id)) then return 'not_allowed';` — `v_team_owner` comes from `organizations.owner_profile_id`, which is **nullable** (`on delete set null`, 0013_work_journal_m1.sql:35). When it is NULL and the caller does not manage the org: `NULL = uid` → NULL; `NULL OR false` → NULL; `NOT NULL` → NULL; plpgsql treats NULL as false → the `not_allowed` return is **skipped** and execution falls through to the state machine.
- **Impact:** any authenticated user (other than the enquiry sender) can accept/decline/expire a team enquiry addressed to an owner-less team org — a cross-tenant write to `team_enquiries`, `team_enquiry_events`, `audit_logs`. Precondition: the team org's owner profile was deleted (guaranteed reachable via the FK's `on delete set null`) or was never set.
- **Fix:** make the guard fail closed: `if not (public.manages_organization(e.team_org_id) or (v_team_owner is not null and v_team_owner = uid)) then return 'not_allowed'; end if;` (or `coalesce(v_team_owner = uid, false)`).

### F-2 — `save_team_details_v1` — NEEDS_FIX, P1 (conditional)
- **Defect (batch-08.sql:576-579):** `if not (public.is_admin() or v_owner = uid or public.manages_organization(p_org_id)) then return 'not_allowed';` — same NULL-flip: with `organizations.owner_profile_id` NULL and a non-admin non-manager caller, the expression evaluates NULL → guard skipped.
- **Impact:** any authenticated user can create/overwrite the `team_details` row (availability, deployable size, destination countries, note) of an owner-less team org — cross-tenant write, publicly surfaced wherever team availability is shown. Same precondition as F-1.
- **Fix:** `if not (public.is_admin() or public.manages_organization(p_org_id) or (v_owner is not null and v_owner = uid)) then return 'not_allowed'; end if;`
- **Systemic note:** audit all other functions comparing `organizations.owner_profile_id` as a plain variable equality inside a negated OR-guard. `set_business_public_profile_v1` (#40) shows the safe pattern (EXISTS-based) and needs no change.

### O-1 — `send_work_instruction` / `send_work_instruction_to_project` — P2 observation (no verdict change)
Conversation-reuse lookup joins `conversation_participants` without `revoked_at is null`, so a sender revoked from a direct conversation (via `revoke_conversation_participant`) can still write instruction messages into it while being unable to read it. Real authorization (active employment link / project management) still gates the action, so this is integrity/consistency, not cross-tenant access. Fix if desired: add `and p1.revoked_at is null and p2.revoked_at is null` to the lookup (falls through to creating a fresh conversation).

## Verdict counts

| Verdict | Count |
|---|---|
| CONFIRMED_SAFE_WITH_EVIDENCE | 38 |
| NEEDS_FIX | 2 (both P1, NULL-flip on nullable `organizations.owner_profile_id`) |
| NEEDS_MANUAL_REVIEW | 0 |
| FALSE_POSITIVE_WITH_EVIDENCE | 0 |

Special-attention list intersection with this slice: only `return_asset_v1` — CONFIRMED_SAFE_WITH_EVIDENCE (`caller_manages_asset` → `manages_organization(assets.organization_id)`, auth-anchored, fail closed on NULL uid and NULL org).

---

# SECURITY DEFINER Authorization Audit — batch-09.sql + batch-10.sql (39 functions)

Auditor slice: batch-09 (20 fns) + batch-10 (19 fns). Live production definitions.
Date: 2026-07-27.

## Helper predicates verified (evidence base)

All helpers are `STABLE SECURITY DEFINER, search_path=public`, and **null-safe**: with
`auth.uid() = NULL` every `exists(...)` predicate is false, so every caller is denied.

| Helper | Location | Logic (verified) |
|---|---|---|
| `is_admin()` | batch-04.sql:650 | `profiles.active_role='admin'` OR `profile_roles.role='admin'` for `auth.uid()` |
| `owns_company(c)` | batch-06.sql:68 | `companies.id=c AND profile_id=auth.uid()` |
| `manages_organization(org)` | batch-05.sql:1132 | active `engagement_contexts` row for `auth.uid()` with slug in (`manager`,`owner`,`external_manager`) |
| `can_manage_project(p)` | batch-02.sql:502 | project exists AND (`owns_company` OR `manages_organization` OR `is_admin`) |
| `caller_manages_defect(d)` | batch-02.sql:455 | defect exists AND `can_manage_project(d.project_id)` |
| `caller_manages_asset(a)` | batch-02.sql:445 | asset exists AND `manages_organization(a.organization_id)` |
| `contact_disclosure_log_change` | migrations/20260716120000:168 | insert-only event+audit logger; EXECUTE revoked from public/anon/authenticated |

NOT NULL constraints verified in repo migrations: `booking_requests.owner_id`,
`service_offering_requests.buyer_id`, `contact_disclosure_requests.owner_id`,
`team_enquiries.owner_id`, `contracts.owner_id`, `proposals.owner_id`,
`marketplace_listings.owner_id` (all `uuid not null references profiles(id)`),
`engagement_contexts.relationship_slug` (`text not null`, 0013_work_journal_m1.sql:89).
Therefore the `owner_id <> uid` / `v_slug <> 'employee'` comparisons cannot silently
pass on NULL.

Grant posture: per secdef-inventory.json, `anon_exec=false` for all 39 functions
**except** `submit_company_need_public_v1` (deliberately allowlisted for anon in
`20260722160000_secdef_anon_reach_revoke_v1.sql`; its intake table has RLS enabled
with no anon/authenticated read policy).

## Dimension legend

1 = caller-auth null-safety · 2 = ownership · 3 = org/tenant boundary · 4 = role/permission ·
5 = NULL-safe comparisons · 6 = search_path pinned · 7 = dynamic SQL (none anywhere) ·
8 = IDOR/BOLA · 9 = cross-tenant leak in RETURNS · 10 = mutation scope · 11 = SECDEF necessity.
OK = passes; n/a = dimension not applicable; ⚠ = finding (see Notes).

## Batch-09

| Function | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | Verdict | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| set_company_worker_journal_review | OK explicit `uid is null` raise | OK `owns_company(p_company_id)` or admin | OK link row must exist for that company; org resolved from `legacy_company_id` | OK enable requires operations_role in (company_admin, agency_admin) + active employee engagement | OK (`is not true` idioms) | OK | none | OK — company_id is caller-owned | returns status text only | UPDATE limited to the one (company_id, worker_id) link row + audit insert | Justified (crosses company_workers/workers/organizations RLS) | CONFIRMED_SAFE_WITH_EVIDENCE | Textbook: audited both directions, state-transition guarded. |
| set_contract_status_v1 | OK explicit null raise | OK `owner_id is distinct from auth.uid()` deny | OK owner-scoped | n/a | OK `is distinct from` + owner NOT NULL | OK | none | OK not-found vs not-owner distinguishable but only via caller's own probe of random uuids (existence oracle on contracts is low value; contracts carry no guessable ids) | void | status+updated_at only, whitelist statuses | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| set_defect_status_v1 | OK via `caller_manages_defect` → null-safe chain (anon ⇒ false ⇒ raise) | OK project-manager scope | OK defect→project→company/org | OK manager/admin via can_manage_project | OK | OK | none | OK | void | status (whitelisted) + assignee + updated_at on the one defect | Justified | FALSE_POSITIVE_WITH_EVIDENCE | Flagged "no auth.uid()"; refuted: caller_manages_defect(batch-02:455)→can_manage_project(batch-02:502) both deny NULL uid. Minor note: `p_assignee_profile_id` not validated as a project member — manager can point assignee at any profile uuid; affects only the manager's own defect (integrity, not authz). |
| set_docs_aggregate_consent | OK explicit null raise | OK worker row resolved from `profile_id = uid` | OK self-scoped | n/a | OK `coalesce(p_enabled,false)` | OK | none | OK no id parameter at all | status text | one own workers row + audit insert | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| set_engagement_journal_review | OK explicit null raise | n/a | OK `manages_organization(v_org)` or admin on the engagement's org | OK manager/owner/external_manager | OK — `v_slug <> 'employee'` is safe because relationship_slug is NOT NULL (0013:89) | OK | none | ⚠ minor: 'engagement_not_found' vs 'not_authorized' leaks existence of an engagement uuid + whether it is org-scoped/employee-typed before the authz check; uuids unguessable, low value | status text | one engagement row + audit insert | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | Pre-authz shape probes are an oracle only for someone already holding a foreign engagement uuid. |
| set_finance_record_status_v1 | OK explicit null raise | OK in UPDATE WHERE: `created_by=uid` OR admin OR `owns_company(company_id)` | OK via owns_company | OK | OK trim/nullif/whitelist; uuid cast guarded by exception handler | OK | none | OK unified 'not_found' for missing vs unauthorized (explicitly no existence leak) | status text | status+paid_at+updated_at on one row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| set_follow_up_task_status_v1 | OK explicit null raise | n/a | n/a | OK `is_admin()` hard gate before any table touch | OK | OK | none | OK | status text | one follow_up_tasks row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| set_learning_review_item_status | OK explicit null raise | n/a | OK live `manages_organization(v_org)` re-check on the item's org (no stored-flag trust) | OK manager/admin; only approved/rejected settable | OK | OK | none | OK 'item_not_found' before authz is an oracle only for held uuids; queue ids not enumerable | status text | queue row decision + stale-close path; FOR UPDATE locking on both queue and source entry | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | Race-hardened (queue→entry lock order, FOR UPDATE vs soft-delete race documented in-body). |
| set_marketplace_listing_status_v1 | OK explicit null raise | OK owner `is distinct from` deny | OK owner-scoped | n/a | OK + owner NOT NULL (20260718210000:28) | OK | none | OK | void | status+updated_at, whitelist | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| set_pilot_status_v1 | OK explicit null raise | n/a | n/a | OK `is_admin()` hard gate | OK | OK | none | OK | status text | one pilots row + audit insert, FOR UPDATE | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| set_project_budget_status_v1 | OK via `can_manage_project` (anon ⇒ false ⇒ raise) | OK | OK budget→project→company/org | OK manager/admin | OK | OK | none | ⚠ minor: 'budget not found' vs 'not authorized' distinguishes existence of a budget uuid pre-authz; unguessable uuids | void | status+updated_at, whitelist (draft/approved) | Justified | FALSE_POSITIVE_WITH_EVIDENCE | Flagged "no auth.uid()"; refuted — can_manage_project is null-safe (batch-02:502). |
| set_project_budget_v1 | OK via `can_manage_project` | OK | OK | OK | OK amount/category whitelisted+bounded, note capped 500 | OK | none | OK project id is the authz subject itself | returns own new/updated row id | upsert one (project, category) budget row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| set_proposal_status_v1 | OK explicit null raise | OK owner `is distinct from` deny; owner NOT NULL | OK | n/a | OK | OK | none | OK | void | status machine fields on one row, whitelist, reason capped 1000 | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| set_work_task_status_v1 | OK explicit null raise | OK WHERE: creator OR assignee OR admin OR project manager | OK via can_manage_project | OK | OK; uuid cast exception-guarded | OK | none | OK unified 'not_found' (explicit no-existence-leak comment) | status text | status+resolved_at+updated_at on one row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| set_worker_operational_status | OK explicit null raise | n/a | OK requires can_manage_project(pid) AND worker actively assigned to that project, OR admin | OK | OK casts guarded by nullif; status whitelist | OK | none | ⚠ minor: 'No such worker' raised for arbitrary profile uuid **before** the authz check — any authenticated user can test whether a profile uuid has a worker row (uuid-knowledge required) | returns upserted row id (own scope) | upsert one (project, worker) operational-status row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | Recommend (cosmetic): move worker lookup after authz or unify error. |
| share_request_with_agency_v1 | OK explicit null raise | OK connection's client company owned by caller; request must be caller's own row (`profile_id = v_uid`) | OK active connection required | n/a | OK | OK | none | OK explicitly no foreign-request probe | returns share id (own) | insert/reuse one share row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| submit_agency_candidate_offer_v1 | OK explicit null raise | OK owns agency company of the share's connection | OK share+connection must both be active; company must be staffing_agency; worker must be active roster member of that agency | OK | OK note trimmed/capped 500 | OK | none | OK all foreign keys resolved server-side from the share (client cannot forge connection/request) | returns offer id | idempotent insert/re-bind of one offer row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | Re-offer provenance re-bind is correctly handled. |
| submit_company_need_public_v1 | ⚠ NO auth check — **by design** (anon-allowlisted public intake form) | n/a | n/a | n/a | OK all inputs trimmed/whitelisted/length-capped; country/locale/urgency whitelists; email regex | OK | none | OK write-only; returns only the fresh row id; intake table RLS-enabled with no anon/authenticated SELECT policy (20260707120000) | id of own submission only | single insert into company_need_public_intakes | Justified (table is RLS-locked; SECDEF is the only write path) | NEEDS_FIX (P2) | No rate limit / abuse cap anywhere in the function: unauthenticated internet can insert unbounded rows (~8KB description each). See detail below. |
| submit_demand_request | OK explicit null raise | OK inserts with `profile_id = uid` only | OK self | n/a | OK kind whitelisted | OK | none | OK | returns own id | insert own customer_requests row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | Note (hygiene, not authz): `p_title`, `p_need_summary`, `p_payload` have no length/size caps (cf. capped siblings submit_help_request_v1/submit_privacy_request_v1) — storage-abuse vector for an authenticated user. |
| submit_help_request_v1 | OK explicit null raise | OK own rows; linked demand must be caller's own | OK self | n/a | OK type whitelist, note cap 500, open-cap 10 | OK | none | OK 'demand_not_owned' only confirms non-ownership of a held uuid | returns own id | insert own customer_requests row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |

## Batch-10

| Function | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | Verdict | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| submit_privacy_request_v1 | OK explicit null raise | OK self (`profile_id = uid`) | OK self | n/a | OK type whitelist, note cap 500, open-cap 3 | OK | none | OK | returns own id | insert own customer_requests row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| transfer_asset_assignment_v1 | OK via `caller_manages_asset` (null-safe, anon ⇒ raise) | OK asset must be in caller's managed org | ⚠ **new target not tenant-checked**: `p_new_worker_id` / `p_new_project_id` accepted from any tenant | OK org-manager gate on the *asset* | OK | OK | none | ⚠ see dim 3 | returns new assignment id | closes old row, inserts one new assignment for own asset | Justified | NEEDS_FIX (P2) | Cross-tenant row injection into a foreign worker's view — detail below. Same gap exists in `issue_asset_v1` (outside this slice; flag to owning batch). |
| unsave_worker_opportunity_v1 | OK explicit null raise | OK deletes only `worker_id = own worker` rows | OK self | n/a | OK | OK | none | OK | boolean (own row removed) | delete own saved-opportunity row(s) for one request | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| unshare_request_v1 | OK explicit null raise | OK UPDATE..FROM requires `owns_company(c.client_company_id)` | OK connection-bound | n/a | OK `client_company_id is not null` guarded explicitly | OK | none | OK unified 'not_found' | status text | revoke one active share row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| update_finance_record_v1 | OK explicit null raise | OK WHERE: creator OR admin OR company owner | OK owns_company | OK | OK all fields bounded/regex-validated; casts exception-guarded | OK | none | OK unified 'not_found' (explicit comment) | status text | bounded fields + updated_at only; type/status/links immutable | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| update_marketplace_listing_v1 | OK explicit null raise | OK owner `is distinct from` deny; owner NOT NULL | OK | n/a | OK whitelists + length caps on every field | OK | none | OK | void | own listing fields + updated_at | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| update_project_stage_v1 | OK via `can_manage_project` (null-safe) | OK | OK stage→project→company/org | OK manager/admin | OK coalesce-preserving partial update; status whitelist; blocked_reason invariant enforced | OK | none | ⚠ minor: 'stage not found' vs 'not authorized' pre-authz existence oracle on stage uuids | void | one project_stages row, bounded fields | Justified | FALSE_POSITIVE_WITH_EVIDENCE | Flagged "no auth.uid()"; refuted — can_manage_project null-safe (batch-02:502). |
| update_work_task_v1 | OK explicit null raise | OK WHERE: creator OR assignee OR admin OR project manager | OK | OK | OK bounded fields; casts exception-guarded | OK | none | OK unified 'not_found' | status text | title/description/priority/due_at/updated_at on one row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| upsert_worker_document | OK explicit null raise | OK worker resolved from `profile_id = uid`; admin branch deliberately raises (no admin write path yet) | OK self | OK | OK status/country whitelists; document type must exist+active; date casts (unguarded cast would surface as 22P02 to caller — cosmetic) | OK | none | OK | returns own row id | upsert own worker_documents row + event log with before/after | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| upsert_worker_readiness_item | OK explicit null raise | n/a | OK can_manage_project + worker actively assigned to that project, OR admin | OK | OK status whitelist | OK | none | ⚠ minor: same pre-authz 'No such worker' oracle as set_worker_operational_status | returns row id | upsert one (project,worker,item) readiness row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| withdraw_agency_candidate_offer_v1 | OK explicit null raise | OK WHERE `owns_company(o.agency_company_id)` | OK agency-scoped | n/a | OK | OK | none | OK boolean only, no row echo | boolean | one offer → withdrawn (only from 'offered') | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| withdraw_booking_request | OK explicit null raise | OK `br.owner_id <> uid` deny — safe: owner_id NOT NULL (20260613100100:34) and br.id null-checked first | OK | n/a | OK | OK | none | ⚠ minor: 'Booking not found' vs authz error distinguishes existence of a booking uuid | status text | one booking → withdrawn (only from 'proposed') + event row | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| withdraw_booking_request_v2 | OK explicit null raise | OK same as v1 | OK | n/a | OK reason whitelist, note cap 500 | OK | none | same minor oracle as v1 | status text | same as v1 + reason fields in event | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| withdraw_contact_disclosure_request_v1 | OK returns not_authenticated | OK `owner_id <> v_uid` deny; owner NOT NULL (20260716120000:62); FOR UPDATE | OK | n/a | OK | OK | none | ⚠ minor: not_found vs not_authorized existence oracle; also 'not_open' leaks current status of a foreign row **only after** ownership passes — no, status returned only when owner matches? No: status branch is after owner check ⇒ fine. Oracle limited to existence | jsonb ok/error | one row created→withdrawn + logged via revoked-EXECUTE helper | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | Verified `contact_disclosure_log_change` is insert-only and not callable directly by clients. |
| withdraw_employer_data_disclosure | OK returns not_authenticated | OK every read/write keyed on `user_id/worker_user_id = v_uid` | OK self + explicit (recipient org, context) match required before writing | n/a | OK context_type whitelist, source length 1–60 | OK | none | OK 'no_matching_permission' only reflects caller's own consent history | jsonb | append consent event + revoke own disclosure rows | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| withdraw_profile_discoverability_consent | OK returns not_authenticated | OK self (`user_id = v_uid`) | OK self | n/a | OK source length check | OK | none | OK | jsonb | append own consent event (append-only ledger; withdraw-without-grant is harmless — latest-event-wins model) | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| withdraw_service_offering_request | OK explicit null raise | OK `v_buyer <> uid` deny; buyer_id NOT NULL (20260627145318:47); found-check precedes | OK buyer-scoped | n/a | OK | OK | none | ⚠ minor: not_found/not_buyer/not_pending三-way oracle — 'not_pending' is only reached after buyer check ⇒ leak limited to existence | status text | one request sent→withdrawn | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | |
| withdraw_team_enquiry_v1 | OK explicit null raise | OK `e.owner_id <> uid` deny; owner NOT NULL (20260716131000:68); FOR UPDATE | OK | n/a | OK | OK | none | OK not_found vs not_allowed oracle (existence only) | status text | one enquiry created→withdrawn/expired + event + audit rows | Justified | CONFIRMED_SAFE_WITH_EVIDENCE | Lazy-expiry path runs only for the owner. |
| worker_profile_discoverable | OK — pure predicate; anon gets deterministic false-ish data only via own call (anon_exec=false anyway) | n/a | n/a | n/a | OK `coalesce(...,false)` | OK | none | ⚠ minor: consent-status oracle — any authenticated user holding a profile uuid can ask "is this profile a discoverable worker?"; this is the *designed* discoverability gate (used inside `can_view_worker` RLS), and answering it is the feature | boolean only | read-only | Justified (must read RLS-locked privacy_consent_events from within RLS policies) | CONFIRMED_SAFE_WITH_EVIDENCE | Correctly requires consent version to match the *current* consent text version. |

## Verdict counts

| Verdict | Count |
|---|---|
| CONFIRMED_SAFE_WITH_EVIDENCE | 34 |
| FALSE_POSITIVE_WITH_EVIDENCE | 3 (set_defect_status_v1, set_project_budget_status_v1, update_project_stage_v1 — the "no auth.uid()" flags) |
| NEEDS_FIX | 2 (both P2) |
| NEEDS_MANUAL_REVIEW | 0 |

## NEEDS_FIX detail

### 1. transfer_asset_assignment_v1 — P2 (borders P1)

**Defect (tenant-boundary, dimension 3):** the caller must manage the *asset's* org
(`caller_manages_asset`), but the transfer **targets** are not validated at all:
`p_new_worker_id` may be any worker in any tenant and `p_new_project_id` any project in
any tenant (`transfer target required` only checks NOT-both-NULL). The function then
inserts an `asset_assignments` row with `status='issued'` pointing at that foreign
worker/project. Because `asset_assignments_select` RLS
(supabase/migrations/20260718170000_assets_logistics.sql:81-86) grants SELECT to
`workers w where w.id = worker_id and w.profile_id = auth.uid()`, and `assets_select`
(:66-76) grants the assigned worker SELECT on the asset row itself, an org manager can
inject an "asset issued to you" row (including a 500-char free-text `note`) directly
into an unrelated tenant's worker UI. Not a read or modification of foreign data
(hence P2, not P1), but it is a cross-tenant write into another tenant's visible
dataset and a spam/social-engineering channel.

**Fix:** before insert, require the new worker to be linked to the asset's org (e.g.
active `engagement_contexts`/`company_workers` row for that org) and the new project to
satisfy `can_manage_project(p_new_project_id)` for the caller (or
`project.organization_id = asset.organization_id`). Apply the identical fix to
`issue_asset_v1` (same file, same gap — outside this slice; hand to the batch owning it).

### 2. submit_company_need_public_v1 — P2

**Defect (abuse hardening, dimensions 1/10):** the function is intentionally
anon-executable (allowlisted in 20260722160000_secdef_anon_reach_revoke_v1.sql) and its
authorization posture is otherwise correct (write-only, all 18 inputs whitelisted or
length-capped, intake table RLS-locked with no client read path, returns only the fresh
id). However there is **no rate limit, dedupe, or volume cap of any kind** — sibling
authenticated intakes cap open rows (submit_help_request_v1: 10, submit_privacy_request_v1: 3)
but the one function the anonymous internet can call has none. Unbounded anon inserts of
up-to-~8KB descriptions = table-flooding/DoS and junk-lead poisoning of the ops queue.

**Fix:** add an in-function cap (e.g. reject when > N rows with `status='new'` from the
same normalized contact_email/company_name in 24h, plus a global open-intake ceiling)
and/or enforce an edge rate limit (WAF/turnstile) in front of the RPC. Keep the RPC cap
even if an edge limit exists — the RPC is directly reachable via PostgREST.

## Cross-cutting observations (no verdict impact)

- **Pre-authz existence oracles** (raise/return "not found" before the permission
  check) appear in: set_engagement_journal_review, set_project_budget_status_v1,
  update_project_stage_v1, set_worker_operational_status, upsert_worker_readiness_item,
  withdraw_booking_request{,_v2}, withdraw_contact_disclosure_request_v1,
  withdraw_service_offering_request, withdraw_team_enquiry_v1, set_contract_status_v1,
  set_marketplace_listing_status_v1, set_proposal_status_v1. All keys are random uuids,
  so the oracle is only useful to someone who already holds a foreign uuid; the newer
  finance/work-task RPCs show the better unified-'not_found' pattern to converge on.
- **'No such worker' probe** (set_worker_operational_status, upsert_worker_readiness_item)
  additionally maps profile-uuid → has-worker-row for any authenticated caller.
- **Unbounded inputs** in submit_demand_request (`p_title`, `p_need_summary`,
  `p_payload` jsonb) — authenticated-only storage abuse; recommend caps matching its
  siblings.
- **set_defect_status_v1** accepts any profile uuid as assignee (own-defect integrity
  only).
