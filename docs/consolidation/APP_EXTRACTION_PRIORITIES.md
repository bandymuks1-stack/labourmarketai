# APP_EXTRACTION_PRIORITIES

Docs-only. 2026-10-03, against `origin/main` `5933d507e`. No building, no duplicate logic: every target below reuses an existing RPC, core module or route, or names the smallest new seam. **U** = not verified in this pass.

**Method and limits.** Read: `lib/*` module listings, action file heads (`lib/auth/actions.ts`, `lib/booking/booking-actions.ts`, `lib/agreements/agreements-actions.ts`, `lib/work-hours/allocations-actions.ts`, `lib/communication/actions.ts`), per-directory counts of `"use server"` files, `.rpc(` and `.from(` calls, a scan of action files that write tables directly (65 `insert/update/upsert/delete` calls in 33 `*actions.ts` files), and the import list of `lib/capabilities/*` and `app/api/mcp` (what the MCP surface already reuses). Not done: no RLS or live-DB query, no browser walk, no read of every action. Prior art: `docs/consolidation/ARCHITECTURE_MATRIX_APPS_DESIGN.md` section 2 and `docs/APP_READINESS_MAP.md` (measured 2026-08-28, partly stale).

**Classes.**
- `APP_READY`: the business rule lives in a DB RPC or a framework-free core module that a non-web caller (bearer REST, MCP) already uses or can call unchanged.
- `APP_EXTRACTION_REQUIRED`: at least one rule (limit, state guard, validation, notification, disclosure) lives only in a server action or component, so a second client would bypass or re-implement it.
- `WEB_ONLY_BY_DESIGN`: depends on cookies, redirects, Stripe-hosted pages, file download or browser-only UX, and no second client needs it.

**What a second client can reach today** (existing, not new): bearer REST `POST /api/workers/[workerId]/skills`, `/api/professions/[professionId]/skills`, `/api/cv/extract`, `/api/documents/file/[fileId]` (bearer **U**); MCP at `/api/mcp` over `lib/capabilities/*`, whose cores are `journal-write-core`, `journal-list-core`, `demand-lifecycle`, `create-project-core`, `work-card-core`, `communication-core`/`direct-conversation-core`, `organization-evidence/import-core`, `organization-people/ingest-core`, `capacity-core`, `confirmation-token`. `lib/api/api-identity.ts` already maps `Authorization: Bearer` to the same domain as the cookie. The target pattern below is therefore always: move the rule into a `*-core.ts` or an RPC, keep the server action as a thin wrapper, expose through a capability or an `/api/*` route using `api-identity`.

## Priority order and summary

| # | Area | Class | Why this order |
|---|---|---|---|
| 1 | auth/session | APP_EXTRACTION_REQUIRED (bearer exists; onboarding trapped) | Every client needs it first. |
| 2 | identity/profile | APP_READY for read/skills/CV; APP_EXTRACTION_REQUIRED for profession and profile writes | Gate for all other areas. |
| 3 | market discovery | APP_EXTRACTION_REQUIRED (interest/search); public read WEB_ONLY | Core worker loop. |
| 4 | messaging | APP_READY (send/open via core); inbox reads and rate caps U | Already on MCP. |
| 5 | booking/agreement | APP_EXTRACTION_REQUIRED | Most rules trapped in actions. |
| 6 | projects | APP_EXTRACTION_REQUIRED (writes mostly RPC; create has core) | Employer loop. |
| 7 | tasks | APP_EXTRACTION_REQUIRED (small) | Thin, mostly RPC. |
| 8 | calendar | APP_EXTRACTION_REQUIRED (read models only) | No write path outside tables. |
| 9 | Journal | APP_READY for write/confirm; APP_EXTRACTION_REQUIRED for skill pipeline | Mobile composer exists. |
| 10 | evidence | APP_READY via MCP; import/dispute actions web-only | Capability family exists. |
| 11 | Learning | APP_EXTRACTION_REQUIRED | Few callers, low risk. |
| 12 | notifications | APP_EXTRACTION_REQUIRED | Needed for push. |
| 13 | LMC | APP_READY (server-side only by design) | DB-enforced. |
| 14 | entitlements/billing | entitlements APP_READY; checkout/portal/webhook WEB_ONLY_BY_DESIGN | Stripe-hosted. |

## 1. auth/session

- Class: **APP_EXTRACTION_REQUIRED**.
- Already portable: bearer identity mapping (`lib/api/api-identity.ts`: malformed/invalid bearer, same domain as cookie); `packages/client-core` `session`/`transport`.
- Trapped: `lib/auth/actions.ts` (440 lines). `completeOnboarding` (line 71) holds the role allow-list (`ONBOARDING_ROLES`, `ROLE_ORDER`, primary/extras split), the profession closed-set filter (`PROFESSION_SLUGS`), the self-declared profession parse, the input-language rule (`recordableInputLanguage`) and the profile-shell ensure, with five direct writes to `profiles`/related tables. `switchActiveRole` (372) and `addRole` (407) hold role-switch rules. Also `lib/auth/post-login-destination.ts` and `dashboard-role-decision.ts` (pure, good) feed redirects that are web-only.
- Minimal target: reuse the existing `complete_onboarding` RPC for the write; move validation and normalisation into a framework-free `lib/auth/onboarding-core.ts` (pure input to RPC args); expose `POST /api/onboarding` through `api-identity`. Role switch: active role as an RPC or a documented client header, not a cookie-only server action (**U** how the active role is stored).
- WEB_ONLY parts: OAuth callback, logout route, consent screens (`oauth-consent-actions.ts`).

## 2. identity/profile

- Class: **APP_READY** for profile read, skill write, CV import (`profile.get`, `living_cv.skills.get`, `/api/workers/[workerId]/skills`, `/api/cv/extract`); **APP_EXTRACTION_REQUIRED** for the rest.
- Trapped: `lib/worker/actions.ts` (profession set/add/remove, 7 direct writes; `setPrimaryProfession`, `addWorkerDirection`, `addOwnProfession`, `removeOwnProfession`); `lib/worker/worker-education-actions.ts`, `worker-achievements-actions.ts` (3 writes each), `profile-text-actions.ts`; `lib/profile/avatar-actions.ts` (+ `avatar-upload.ts`), `cv-section-import-actions.ts` (2 writes), `claim-catalog-promotion-actions.ts`, `stated-skill-actions.ts`, `profile-skill-claims-actions.ts`; `lib/privacy/discoverability-actions.ts` and `contact-disclosure-actions.ts` (consent decisions as actions; DB policy depth **U**).
- Minimal target: for each direct `.from(...).insert/update/delete`, add or reuse an RPC (`set_primary_profession`-style) and a `*-core.ts` validator; reuse `work-card-core` and `worker-core` (`lib/data/worker-core`) which MCP already imports. Discoverability and contact disclosure: one RPC per decision so RLS, not the action, is the gate; expose via the capability registry as draft-then-confirm (the pattern in #2119).

## 3. market discovery

- Class: **APP_EXTRACTION_REQUIRED** for apply/interest and search; public job read is **WEB_ONLY_BY_DESIGN** (SEO pages).
- Already portable: MCP `interest.express_draft/confirm` (`lib/opportunities/interest`), `candidate.search`, `demand.*`, `lib/opportunities/opportunity-fit.ts` (pure).
- Trapped: `lib/opportunities/vacancy-interest-actions.ts` and `interest-actions.ts` (the web path is a separate implementation from the MCP path; parity **U**), `saved-actions.ts`, `saved-search-actions.ts`, `lib/marketplace/worker-opportunities-actions.ts`; `lib/market/market-explanation-actions.ts` (rate limit in the action); `lib/scouting/*` (1 action, 10 `.from` calls, filtering in TS).
- Minimal target: make `lib/opportunities/interest.ts` the single implementation and have the two actions call it (no third path); wrap saved-search and saved-opportunity in the same core; rate limit moves to `lib/limits/request-rate-limits.ts` or an RPC. `/api/dashboard-search` stays blocked until domain helpers accept the caller's client (per the matrix).

## 4. messaging

- Class: **APP_READY** for open and send (`lib/communication/communication-core.ts`, `direct-conversation-core.ts`; the web actions `createConversation` and `sendMessage` in `lib/communication/actions.ts` are thin wrappers over `createConversationCore` and `sendMessageCore`; MCP `message.send_*`, `conversation.list/get`). Rate caps live in `lib/communication/rate-caps.ts` (inside the core, **U** that every path hits it).
- Class **APP_EXTRACTION_REQUIRED** for the chat layer: `lib/conversation` has 45 `"use server"` files and no `.rpc(` calls (intent routing, goal state, confirmation rules in TS), e.g. `lib/conversation/dispatch.ts`, `action-registry.ts`, `conversation-goal.ts`, `company-executors.ts`. MCP reuses `executor-contract`, `action-registry`, `confirmation-token`, so the executor layer is already the shared seam.
- Minimal target: no new module. Rule: any new chat executor goes behind `executor-contract` and a capability id, not a new action. Read paths (`markConversationRead`, inbox list) to be checked for a core (**U**). `joinConversationAsAdmin` stays admin web.

## 5. booking/agreement

- Class: **APP_EXTRACTION_REQUIRED** (highest density of trapped rules).
- Trapped in `lib/booking/booking-actions.ts` (864 lines): `proposeBookingAction` (line 201) holds the workspace gate (`resolveEmployerCompanyContext`), entitlement gate (`hasFeature("booking_requests")`), the request budget (10 open proposals and 30 per 24h per company via `evaluateRequestBudget`/`COMPANY_REQUEST_LIMITS`, counted from `booking_requests`), the "already accepted, do not re-propose" guard, role resolution from the need (`readNeedRole`), v3-to-v1 RPC fallback, funnel event and the worker notification (`notifyBooking`). The file's own comment says the DB-side rule is "a separate, owner-gated migration" (so the accepted-booking rule is not in the RPC). `respondBookingAction` (319), `withdrawBookingAction` (479), `rescheduleBookingAction` (540), `setBookingDeadlineAction` (581) follow the same shape; `lib/booking/engagement-invariant.ts`, `booking-state.ts` are pure.
- Trapped in `lib/agreements/agreements-actions.ts` (420 lines): field validation (title, counterparty and org-number length limits, UUID checks, "workerId only for employment_related"), then the `create_agreement_v1` RPC; update, status, approval-submit, amendment, document and signature-evidence actions.
- Minimal target: extract `lib/booking/propose-core.ts` (gates, budget, accepted-guard, role resolution) taking the supabase client and returning a typed outcome; the action and a new capability both call it. Move the budget and accepted-guard into `propose_booking_request_v3` (RED-class migration, owner channel). Agreements: move the validation constants and checks into `lib/agreements/agreements-model.ts` (already exists) and call from both the action and a capability; RPCs already own the write.
- Notifications fired from the action (`notifyBooking`) must move into the core or the RPC, or a bearer caller will not notify the worker.

## 6. projects

- Class: **APP_EXTRACTION_REQUIRED**, moderate. Writes are mostly RPC (17 `.rpc(` vs 9 action files); `create-project-core.ts` is already shared with MCP (`project.create_*`, `project.status_set_*`, `projects.list`).
- Trapped: `lib/projects/actions.ts`, `operations-actions.ts`, `stages-actions.ts`, `team-assignment-actions.ts`, `project-admin-actions.ts`, `handover-passport-actions.ts`; `lib/company/project-context-actions.ts` (1 direct write); assignment pre-checks in `assignment-precheck-core.ts` (pure, good). Readiness and progress models are pure.
- Minimal target: expose stage, assignment and end-assignment via capabilities that call the existing RPCs; no new tables. `project-context-actions.ts` direct write becomes an RPC.

## 7. tasks

- Class: **APP_EXTRACTION_REQUIRED**, small. `lib/tasks/task-actions.ts` calls RPCs (`update_work_task_v2` with v1 fallback, `assign_work_task_v1`, `reopen_work_task_v1`, dependency add/remove); pure cores exist (`create-task-core.ts`, `set-task-status-core.ts`) and are used by chat (`task-chat-actions.ts`). `task-approval-actions.ts:135` reads `work_tasks` directly before the approval RPC.
- Minimal target: expose create, status, assign, reopen, dependency, approval through capabilities calling the existing cores and RPCs; move the pre-read in `task-approval-actions.ts` into the RPC. MCP currently covers project create and status only.

## 8. calendar

- Class: **APP_EXTRACTION_REQUIRED** (reads are pure models; writes are elsewhere).
- Where logic lives: pure models in `lib/planning/*` (`planning-model.ts`, `workload-model.ts`, `roster-timeline-model.ts`, `temporal-reality.ts`); `lib/planning/calendar-result.ts` is the one `"use server"` file (a loader). `lib/conversation/capacity-core.ts` and `availability-day.ts` feed chat and MCP `workforce.availability` (read-only). Reservations: `lib/tasks/task-reservation.ts`, `lib/planning/worker-reservation.ts`.
- Minimal target: read-only `GET` over the existing loader via `api-identity`, reusing the models; no write path to build (planning is derived). Reservation write goes through the tasks RPC (area 7). Actor parity for agency is unproven (**U**).

## 9. Journal

- Class: **APP_READY** for write, list, confirm, work intelligence (`journal-write-core.ts`, `journal-list-core.ts`, DB `create_journal_entry_full`, `review_journal_entry` RPC; MCP `journal.*`; mobile composer in `apps/mobile`). **APP_EXTRACTION_REQUIRED** for the skill pipeline.
- Trapped: `lib/journal/skill-pipeline-actions.ts` (899 lines, 6 direct writes to `journal_entry_metrics`, `worker_skills`, `profile_skill_claims`; confirm/reject candidate, ambiguous choice, name or dismiss fragment, reprocess history); `journal-entry-skills-actions.ts`; `journal-ai-suggestions-actions.ts` (rate limit in the action); `quick-confirm-actions.ts`; `work-time-plausibility-actions.ts` (plausibility only in the action layer, **U**); `confirm-actions.ts` `applyApprovalSkillEffects`.
- Minimal target: split `skill-pipeline-actions.ts` into a `skill-pipeline-core.ts` (the 6 writes behind one RPC per decision, as `confirm_entry_and_verify_skills` already does for approval); plausibility check moved to a pure function in `work-time-plausibility.ts` called by core and action. Do not add a second journal write path.

## 10. evidence

- Class: **APP_READY** via MCP for draft-then-confirm attest/withdraw and import (`evidence.*` 14 capabilities, `evidence-import-capabilities.ts`, `organization-evidence/import-core`). **WEB_ONLY** UI: timeline and strip components. Trapped but small: `lib/organization-evidence/import-actions.ts`, `dispute-actions.ts`, `competency-signal-actions.ts`, `roster-link-actions.ts` (4 action files, 49 `.from` calls in the directory), `lib/journal/task-evidence-actions.ts`.
- Minimal target: dispute and competency-signal become capabilities calling the same RPC the action calls; `lib/evidence/evidence-tier.ts`, `provenance.ts` (pure) stay the single tier logic.

## 11. Learning

- Class: **APP_EXTRACTION_REQUIRED**. `lib/learning/learning.ts` (a `"use server"` file, 331 lines) holds `listVisibleReviewItems` (direct `learning_review_queue` read), `setReviewItemStatus` (RPC), `setAutoConfirmPolicy` (direct `learning_policy_settings` write at ~line 289), `applyAutoConfirmation` (RPC). `lib/education/program-actions.ts`, `lib/training/training-actions.ts`. Pure models: `learning-compass-model.ts`, `signal-queue-plan.ts`.
- Minimal target: `setAutoConfirmPolicy` moves into an RPC (it is a policy write with authorization in TS); list reads go through a core taking a client. Education programmes are immutable and RPC-written (memory), so they are mostly ready. Whole area is low traffic (**U** usage).

## 12. notifications

- Class: **APP_EXTRACTION_REQUIRED** (needed for push and any native inbox). `lib/notifications/events-actions.ts` (mark read, mark all read), `preferences-actions.ts` (`setNotificationPreferenceAction`), 23 `.from(` calls and no `.rpc(` in the directory; emitters (`event-emitters.ts`, `email-dispatch.ts`, `weekly-digest-emitter.ts`) are server-side and run from actions (see booking above) and cron (`app/api/cron/*`).
- Minimal target: read list, mark-read and preference set as `GET`/`POST` routes over `api-identity` calling one core each; emission stays server-side but must be moved out of actions into the cores that perform the business write (otherwise a bearer caller silently skips it, the `NOTIFICATION_UNDELIVERED` class).

## 13. LMC

- Class: **APP_READY**, server-side by design. Ledger and spend are DB `lmc_*` SECURITY DEFINER, service-role only (`supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql`, `20260828090000_lmc_spend_compensation_v1.sql`); `lib/lmc/compensation.ts` is a typed RPC wrapper (`lmc_compensate_spend_v1`), `lmc-account.ts` reads the caller's own account (`readOwnLmcAccount`). No action files, so no trapped UI rules.
- Gaps (**U**): whether `readOwnLmcAccount` is reachable by bearer; LMC billing model open (`docs/consolidation/LMC_BILLING_MODEL.md`). Do not expose spend to any client; spend stays a server-initiated debit.

## 14. entitlements/billing

- Entitlements: **APP_READY.** `lib/billing/effective-entitlements.ts` (`getEffectiveEntitlements`, `hasFeature`), `entitlements-v1.ts`, `plans.ts`, `open-needs-gate.ts` and about 19 pure modules; an API caller can use them if they receive the caller's client (the current `hasFeature` reads the cookie session, so a bearer path needs the client passed in, **U**).
- Checkout, portal, webhook, reconcile: **WEB_ONLY_BY_DESIGN** (`app/api/billing/{test-checkout,portal,webhook,reconcile}`; cookie or webhook; Stripe-hosted; `PAYMENTS_ENABLED` is false and the `no-live-payments` guard blocks live keys). Admin grants: `lib/admin/billing-actions.ts` (3 direct writes) is admin-web.
- Minimal target: make `hasFeature` accept an injected client (one signature change) so booking, demand and capability cores can enforce entitlements without the cookie.

## Cross-cutting rules (apply to every area)

1. **Rate limits in actions.** Present in `lib/booking/booking-actions.ts`, `lib/company/team-brigade-actions.ts`, `team-enquiry-actions.ts`, `lib/instructions/actions.ts`, `lib/invitations/actions.ts`, `lib/journal/journal-ai-suggestions-actions.ts`, `lib/language-feedback/actions.ts`, `lib/market/market-explanation-actions.ts`, `lib/privacy/contact-disclosure-actions.ts`, `lib/profile/cv-ai-structuring-actions.ts` (from a grep for rate-limit helpers; each file's exact placement **U**). A bearer or MCP caller bypasses them unless the limit sits in the core or DB. Shared helpers already exist: `lib/limits/request-rate-limits.ts`, `lib/security/rate-limit.ts`, `lib/security/ai-action-throttle.ts`.
2. **Notifications and funnel events fired in actions** are lost for other clients (booking is the proven case; others **U**).
3. **Direct table writes in actions** (33 files listed by the scan; top: `lib/worker/actions.ts` 7, `lib/journal/skill-pipeline-actions.ts` 6, `lib/auth/actions.ts` 5, `lib/candidates/actions.ts` 3, `lib/work-hours/allocations-actions.ts` 3, `lib/workspace/pins-actions.ts` 3, `lib/worker/worker-education-actions.ts` 3, `worker-achievements-actions.ts` 3, `lib/admin/billing-actions.ts` 3) bypass any single RPC rule. `lib/work-hours/allocations-actions.ts` is the one case that is partly justified (append-only correction writes `correction_of` then stamps `superseded_by`); it still needs the pair in one RPC to be atomic (**U** whether it is atomic today).
4. **Workspace staleness gate** (`refuseStaleWorkspace`, `displayedWorkspaceOf`) is a web-form concept; a client sends the organization explicitly (already the MCP pattern, `employer-company-context`).
5. **Do-not-duplicate.** Extraction means moving the rule behind one core or RPC and making the web action a wrapper. It never means a second implementation for the app. The doctrine, the owner execution principle (decision 0016) and RED-class migration rules in `CLAUDE.md` apply: any DB-side move is an additive migration and the booking rule move is owner-gated.
6. **Open owner decision.** Distribution scope for mobile (ARCH-6) decides how far down this list to go; the transport status gate `DOMAIN_TRANSPORT_STATUS` in `packages/client-core/src/transport.ts` is pinned by a guard and must change in the same PR as any new bearer route.
