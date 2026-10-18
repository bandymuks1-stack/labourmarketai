# RED owner checkpoint — consolidated (2026-10-07)

One document, one approval request. Nothing below is applied. Every migration is RED class (`@human-gate-approved` is a risk *acknowledgement*, never an approval). Apply is **only** via Supabase MCP `apply_migration`, one migration at a time, with a production read-back after each — never `supabase db push`, never a blind batch.

Production truth at time of writing: main `1aa24f879` · production deployment `c57ef0707` (docs-only after #2172's `37e513385`) · production Supabase `gorgitwvdzxbnaxhrsrw` ledger current through `20261006192729`.

## 0. What approval means

Approving an item authorises, for that item only: (1) merging its PR/branch to `main`, and (2) applying its migration in the order below, each followed by read-back and a rollback rehearsal note. Items marked **needs code first** cannot merge on approval alone.

Release candidate: `integration/local-qa-2026-10-04` was refreshed on 2026-10-07 to `4f979bdf7` = integration + current main (`1aa24f879`). Verified on that tip: typecheck clean, lint 0 errors, `next build` exit 0, vitest outside `lib/guards` 687 files / 10,130 tests green, `lib/guards` green except the 4 known CRLF-checkout files (displayed-workspace-binding, public-business-profile, booking-atomic-double-booking, demand-lifecycle-colleague-r15), `migration-safety` = STRUCTURAL-GREEN, RISK-ACKNOWLEDGED (19 changed files, all human-gated, 70 acknowledged findings). Not run: `check-migration-parity.mts` (needs a live DB_URL).

## 1. Security verdict feeding the request

Read-only audit of production (advisors + grants + policies): **0 Critical, 0 High.** RLS on every public table; 5 storage buckets all private; 9 anon-executable SECURITY DEFINER functions = 8 deliberate public reads + 1 rate-limited public write (`submit_company_need_public_v1`, Low). One real **Medium**: v1 invitation doors (`accept_invitation_v1`, `accept_invitation_by_id_v1`, `decline_invitation_v1`) are still executable by any authenticated user → can exhaust/kill another person's multi-use link. Closed by item **A1** below. Low: `has_employer_data_disclosure`, `worker_profile_discoverable` (consent-state probe by uuid), `ai_runs_retention_health`. Auth setting "leaked password protection" is OFF (dashboard setting, owner action, not code).

## 2. Items (apply order = tier order)

Legend — SD = SECURITY DEFINER; "tighten/widen" refers to authorization surface. Rollback: every file has a `.down.sql` (guarded where it would destroy rows).

### Tier A — independent, low blast radius
| # | Migration / PR | Why needed (MASTER gap) | Security impact | Safety | Failure now | Approval ⇒ merge/apply? |
|---|---|---|---|---|---|---|
| A1 | `20261003151500_invitation_v1_doors_not_api_callable_v1` (on main via #2168) | Closes the Medium above — invitation identity boundary | REVOKE API EXECUTE on 3 SD v1 doors; no new grant; tightening | gr only (derived) | none | **Apply only** (already on main). Must come after the app that calls the v2/post-accept doors is deployed (it is). |
| A2 | #2148 `…150800_ai_runs_retention_classes_v2` (supersedes #1266) | ai_runs retention / privacy | SD: `redact_expired_ai_run_content` (service_role), `ai_runs_delink_subject` (service_role), `privacy_export_ai_runs_subject_v1` (authenticated); invoker policy fn; BEFORE UPDATE immutability trigger; data redaction DML; no policy change, no anon | sd,gr,trg,dml | CONFLICTING | Needs rebase (in RC); then yes |
| A3 | #2145 `…150000_org2_agency_capability_authority_v1` | org2: agency gates read organization capability, not `company_type` | Re-points 3 SD gates (`caller_agency_company_id`, `list_open_demand_for_agencies`, `mark_agency_can_offer`); replaces policy `job_demands_select`; revoke public/anon, grant authenticated | sd,gr,adp,dml | CONFLICTING; PR says re-read live `pg_get_functiondef`/`pg_policies` before apply | Needs rebase (in RC) + live-def re-read; then yes |
| A4 | #2078 `…200100_search_public_vacancy_previews_plan_v3` | Vacancy board perf (handyman 1,100→24 ms) | `CREATE OR REPLACE` of anon-reachable SD fn, same signature/grants/projection | sd | CONFLICTING | Needs rebase; then yes |
| A5 | #2052 `…163000_applicant_identity_v1` | Applicant name+photo to the demand owner only (lawful basis = application) | SD, revoke public/anon, grant authenticated | sd,gr | CONFLICTING | Needs rebase; then yes |
| A6 | #2016 `…140000_evidence_correction_integrity_v1` | Correction writer (insert-only) | CHECK constraint only | gated marker | quality: `historical-import-reality.test.ts` 4 failures; base #2012 now merged → retarget main | **Needs code first** |
| A7 | #2013 `…130000_organization_history_periods_v1` | One business history across a legal-entity change | new table; select/insert policies via `manages_organization`; grant select,insert | gr | quality: same test (1 failure); PR body flags conflict with an earlier governing record | **Needs code first** + the ruling named in the PR |
| A8 | #2029 `…160000_historical_timesheet_m3_source_preservation` | Import source file preserved through the document engine | SD `register_document_file_v1` replaced; DML on document tables | sd,gr,dml | CONFLICTING; PR is **not draft** though gated; dry-run script not executed | Convert to draft, run dry-run, rebase; then yes |

### Tier B — evidence / authority chain
| # | Migration / PR | Why needed | Security impact | Notes |
|---|---|---|---|---|
| B1 | #2157 `…151300_integrity_doors_v1` then `…20261005100000_roster_link_subject_answer_v1` | Integrity doors: journal attribution, skill self-verification block, roster link requires worker consent; subject can refuse/withdraw a link | 5 SD; **4 `alter policy` — all TIGHTENING** (`link_method='worker_confirmed'` added to evidence select/dispute/competency policies); triggers on 4 live tables; no anon | Proofs in PR: 110/0 + 28/0. In RC. **Must precede the cross-org signal RPC (§4).** |
| B2 | #2143 `…150500` → `…150550` → `…150555` | EVID-2: confirmation authority derives from the real work relationship (ADR 0018) | 23 SD fns; tables revoke public/anon + select to authenticated; **widening by design:** `storage.objects` select policy for counterparty photo reads, authority = active work relationship; append-only triggers | TRUNCATE default-ACL gap closed by B3 — apply B3 immediately after 150500 |
| B3 | #2164 `…100400_append_only_privilege_closure_v1` | Closes truncate/references/trigger ACL gap on 150500 + 150200 tables | grant/revoke + no-truncate triggers; no SD | **Needs code first:** CI fails `booking-engagement-end-v1` "only newly marked migration" guard (set must be updated); needs 150500 and 150200 first |
| B4 | #2161 `…100300` → `…100000` → `…100200` → (app live) `…100100` | Authority closure: LMC money functions service_role-only; `is_employer()` requires active management; hours integrity guard; conversation_participants insert limited to server | `lmc_*` 12 fns **remove authenticated EXECUTE** (tightening, breaks any client-side call — app must already be server-side); `is_employer()` replaced; 3 `alter policy` | **Needs code first:** control byte in a guard-source file (`no-control-bytes-in-guard-source`); **version `20261006100000` collides with #2166 (#2166 must renumber, e.g. `20261006120000`)** |

### Tier C — assignment chain (closes the team/brigade gaps)
| # | Migration / PR | Why needed | Security impact | Notes |
|---|---|---|---|---|
| C1 | #2086 `…150200_work_plan_entries_v2` | One-off planned work on the Calendar (PLAN source for collisions/override) | new table; 3 SD; select policy (org managers + the planned worker); revoke insert/update/delete from authenticated | Needs B3 for the full ACL closure |
| C2 | #2149 `…150600` → `…150700` | Team/brigade assignment as ONE canonical relationship (WRK-6); brigade matched/assigned as a unit; unit journal attribution | 13 SD; 150700 replaces 5 existing functions and `alter policy` on `project_stages_select`, `wt_select` — **widening**: team-assigned members read stages/tasks | Proof 83/0; order-independent with B1 (28/0). 150600 down refuses while rows exist |
| C3 | #2146 `…150100` → `…150900` → `…150950` | Immutable override receipt for kept calendar collisions (+ brigade basis) | `record_commitment_override_v1` SD, authenticated only; table FORCE RLS, select only; immutability + no-truncate triggers | 150900/150950 hard-require C2's `team_assignments` (they raise if absent) |

### Tier D — universal marketplace
| # | Migration / PR | Why needed | Security impact | Notes |
|---|---|---|---|---|
| D1 | #2124 `…150300` → `…150400` | One discovery index + subject registry + publish policy (services, goods, needs, training…) | `market_index_v1` view (security_invoker); SD v2 listing RPCs; **re-creates `marketplace_listings_select` and `service_offerings_discover_active` — both TIGHTER (expiry)**; 1 notice `rls-any-authenticated` (catalogue read) | 150400 changes the body of the one anon-reachable `get_public_business_listings_v1` (adds expiry filter only; optional) |
| D2 | #2151 `…151200_market_org_capabilities_for_visible_listings_v1` | Actor kind for visible listings | SD, authenticated, only for listings the caller can already see | Stacked on #2124 |
| D3 | `…151400_marketplace_v1_write_rpcs_closed_v1` | Close the weaker v1 write doors | REVOKE EXECUTE on 3 v1 RPCs | **Only after D1 and after the v2-calling app is deployed** |

### Tier E — commercial
| # | Migration / PR | Why needed | Security impact | Notes |
|---|---|---|---|---|
| E1 | #2166 `…org_storage_usage_v1`, `…email_send_ledger_v1` | 14-day Organization trial guard rails: per-org storage usage, per-org send reservation | 3 SD (`org_storage_used_bytes_v1`, `org_storage_journal_entry_org_v1` authenticated; `reserve_email_send_v1` service_role only); ledger table revoked from public/anon/authenticated | **Needs code first:** conflicting with main; 3 migration-count pins; CodeQL high `js/incomplete-url-substring-sanitization` at `apps/web/lib/email/durable-send-guard.test.ts:138` (test assertion → use a regex); renumber off `20261006100000`. App code touches no charging config (MKT-7 intact), reuses the existing subscription/Stripe store; trial not proven against real Stripe |

### Tier F — historical photos (new, this session)
| F1 | #2176 `20261007100000_evidence_record_media_link_v1` | Historical photos get a real, stated relationship to evidence record / work object / person / organization — no date-proximity guess | One new append-only table; `REVOKE ALL FROM public, anon`; `GRANT SELECT, INSERT TO authenticated`; select = managers OR (linked subject AND visibility='subject') OR admin; insert = manager AND `imported_by = auth.uid()`; no SD, no `using(true)`; no storage bucket/policy (bytes served by a later gated migration) | Verified against production: composite uniques, helpers, `work_objects` exist; target absent. **Needs code first:** 3 count pins +1 (booking-engagement-end allowlist, market-map-read-layer 346→347, product-readiness 346→347) — the auto-mode classifier refused that edit ("Security Test Removal"), so the edit is left for you to permit |

### Tier G — competency → qualification / recognised equivalence (owner gate P-3, legally significant)
| G1 | #1741's draft `20260915140000_competency_recognitions_v1` (to be ported onto main as its own clean RED PR; **not** the rest of #1741) | Closes the BROKEN journey link "demonstrated capability is recognised against a formal requirement" (J-INSTITUTION-OUTCOME). Table does not exist in prod; the reader `getOwnRecognitionRows` and pure model `lib/skills/recognition-model.ts` are already on main and degrade to `[]` | One table, RLS enabled+forced, anon nothing, authenticated SELECT only (subject, assessor-org managers, admin; employers cannot read), no write policies, append-only corrections (`supersedes_id`, `revoked_at`); 2 SD fns `record_competency_recognition_v1` / `revoke_competency_recognition_v1` (search_path public, revoke public/anon, grant authenticated) that require: assessor org holds `training_provider`, caller manages it, caller ≠ subject, assessor does not engage the subject as non-student, every cited journal entry belongs to the subject AND has a confirmation by someone other than the subject | **Four review nits to fix in the port:** `is_admin()` override on both functions; hardcoded `training_provider` string; `v_eid::uuid` cast without malformed-uuid guard (raises 22P02, should be 22023); "engaged as worker" test ignores statuses other than `active`. Needs code first (port + nits + count pins). GREEN companion (subject read surface + assessor server action behind honest `needs_migration`) is built separately and ships before approval |

*Learners → cohort needs no migration:* chain invite → accept → student context → `set_education_cohort_member_v1` exists end to end; production has 1 eligible accepted learner and 1 pending invite, nobody has assigned them (adoption). A learner-initiated join would need a new request RPC and is deliberately not proposed.

## 3. Housekeeping the checkpoint should know
- The refreshed integration branch **modifies two already-applied migrations** (clean-replay guards, production no-op): `20260830100000_esco_canonical_linkage_67` (+17 lines), `20260923114500_nonstop_org_consolidation_v1` (+13). Confirm intended; they must **not** be re-applied.
- Four never-applied old drafts (company_locations_v1, multi_source_talent_v1, dashboard_preferences_v1, demand_interest_seen_v1): tables absent in prod; the app references `company_locations`/`save_company_location_v1` — degradation to be verified.
- 9 production ledger rows have no repo file (hotfix drift) — to be reconciled by adding the files, not by DB change.
- **Gap with no migration anywhere:** *learners join a cohort* (cohort tables exist; no join path is carried by any RED PR). *Competency → qualification/recognition* exists only in old draft #1741 (`20260915140000_competency_recognitions_v1`). Both are product-code/RED-design work still to be done; they are not in the approval below.

## 4. RED design: cross-organization historical-history matching (not for apply)
Today employers scouting a worker cannot see another organization's history signals (policies admit the supplying org's managers, the linked subject, named party orgs, admin). To close the gap **without widening any table access**:
- Do **not** touch the select policies. Add one SECURITY DEFINER aggregate reader `match_history_signals_for_workers_v1(p_organization_id, p_worker_ids[])`, a new consent purpose `history_signal_sharing` (grant/withdraw through the existing append-only `privacy_consent_events`), and an append-only query log `history_signal_queries_v1` (definer-only, FORCE RLS, no policy).
- Preconditions: **#2157 applied** (so "linked" means worker-confirmed) and the owner accepts the consent purpose (reusing `profile_discoverability` alone is not recommended — it covers being found, not sharing history as a signal).
- Eligibility: caller holds a management role in the demand organization (`has_org_demand_access`, not `is_employer()`), has an open demand, is under the rate limit (30/hour, tunable); worker is linked via `link_method='worker_confirmed'`, `worker_profile_discoverable`, AND current `history_signal_sharing`; **foreign** history only; disputed/withdrawn/corrected records excluded.
- Output: exactly `(worker_id, skill_slug, band)`, bands `2-4 / 5-9 / 10+`, count floor ≥2 per (worker, skill) (optionally ≥2 source orgs). Labelled "history signal", never written to `worker_skills`, never "verified". Withdrawal of consent takes effect on the next call.
- **Explicitly not exposed:** raw records, original text, source facts, hours, dates, context labels, work objects/places, clients/projects, supplying organization id/name/role, roster names/external refs, credential references, exact counts, event history, the unlinked population, and the existence of history for non-consenting workers (indistinguishable from none).
- Grants: revoke from public, anon; execute to authenticated; `search_path = public, pg_temp`; rollback = drop function, drop log table (after archive/zero-row assertion), remove consent purpose only if no events reference it.
- Tests required before approval: anon → 42501; non-member / no open demand / over limit → 0 rows, no error; unlinked, `link_proposed`, `manager_link`, linked-without-consent, consent-withdrawn → absent; output columns exact, below-floor absent; table selects still return 0 for the employer; guard test (no anon/public grant, search_path pinned, no `using(true)`, rollback present, audit row per call).
- The matcher already accepts such signals as a labelled, non-authoritative input (`MatchSubject.historySignals`, #2171); only the cross-org source is missing.

## 5. The single approval requested
Approve, as one package with the order in §2:
1. **Apply A1 now** (closes the only Medium).
2. **Merge + apply** Tier A (A2–A5, then A6–A8 after their code fixes), Tier B, Tier C, Tier D, Tier E (renumbered), Tier F — each migration individually, with production read-back, in tier order, with the dependency gates in the Notes columns.
3. **Permit the mechanical +N re-sum of migration-count pins** in `booking-engagement-end-v1`, `market-map-read-layer-v1`, `product-readiness` (and the #2164 guard set) — the classifier blocks this class of edit for the agent; it is not a loosening, it is the count of migrations that exist.
4. **Close as superseded:** #2152, #2155, #2167 (contained in #2168); #2162, #2163 (merged as #2173); #895 (duplicates `plan-catalogue.ts`). Park #896, #897 (port the "unmeasured → null, never CLEAR" rule later).
5. Decide the one product input §4 needs: the consent purpose `history_signal_sharing`.
