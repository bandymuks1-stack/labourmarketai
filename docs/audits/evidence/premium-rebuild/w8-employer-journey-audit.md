> **HISTORICAL, POINT-IN-TIME AUDIT — DO NOT UPDATE IN PLACE.**
> Audit date **2026-08-02** · base commit `380c3679` · source: untracked working file in the `labourmarketai-w8-audit` worktree (never committed until now).
> Findings are frozen exactly as written and were **not** re-scored against later work.
> Closed since this audit: **P0-1** by PR #978 (`578eb3e2`).
> Current state → [post-merge production readiness baseline 2026-08-03](../../post-merge-production-readiness-baseline-2026-08-03.md).
> Restored to `main` on 2026-08-03 (docs-only, content unaltered).

---

# W8 — EMPLOYER JOURNEY: READ-ONLY AUDIT

Audited read-only at `380c3679` (`origin/main`, W6 slice 2 merged; **PR #974 /
W6 slice 3 deliberately NOT in the base**). Worktree
`C:\Users\Mano\Documents\labourmarketai-w8-audit`, branch
`audit/w8-employer-journey`, created from `origin/main`.

Classification: `FULL` · `PARTIAL` · `STUB` · `DEAD` · `MISLEADING` ·
`MISSING` · `BLOCKED_BY_W6` · `OWNER_GATED`.

> **The canonical matrix wins.** `apps/web/lib/legal/permission-matrix.ts` and
> `w4-permission-matrix.md` remain authoritative for worker-identity fields.
> This document is the employer-side addendum plus the mismatch findings.

---

## 0. The one-sentence verdict

The employer's **write spine is real and honestly gated** (demand → recognition
→ confirm → match → shortlist → contact → booking → assignment, every step
server-authorized, no fabricated scores, no fake publish); the employer's
**context and surface layer is not** — the active organization is decorative,
the chat can reach 1 of 9 employer actions, and the employer's real working set
lives in the wide module chrome that W3 was supposed to retire.

---

## 1. The employer journey, step by step

| # | Step | State | Where it really happens |
|---|---|---|---|
| 1 | Login | `FULL` | `middleware.ts:83` (`/dashboard`,`/onboarding`,`/cv`), `dashboard/layout.tsx:91` |
| 2 | Organization create / select | `PARTIAL` | create: `/dashboard/start/company` → **legacy `companies` (1:1)**; select: `WorkspaceChip` → **canonical `organizations`** — two models, see §5 P0-1 |
| 3 | Need stated in chat | `PARTIAL` | `intent-router.ts:220` `need-workers` → `openForm("company.create-demand")` (employer identity only) |
| 4 | Need structured | `PARTIAL` | chat form collects 5 fields, **no structured fields** → `structured:false`; structuring happens later via `confirmRecognizedNeedAction` or the admin workbench |
| 5 | Candidates received | `PARTIAL` in route / **`MISSING` in chat** | `runFindWorkers()` is an honest dead end (`workflows.ts:419` `scoutingNotInWorkspaceYet`, no chip, no link); real work is `/dashboard/company/scouting` |
| 6 | Candidate comparison | `PARTIAL` | ranked list + facet filters on the scouting page; no side-by-side compare view |
| 7 | Match explanation | `FULL` | `match-v1.ts` — need-context only, criterion-level why/gaps, no person score |
| 8 | Invitation | `FULL` (server) / `PARTIAL` (surface) | `propose_booking_request` RPC + `requestWorkerConversationAction`; chat cannot reach either |
| 9 | Planning | `PARTIAL` | `/dashboard/planning` is caller-centric; `/dashboard/company/planning` is a **capacity-gap zone, not a calendar** |
| 10 | Work starts | `PARTIAL` | booking accept → engagement bridge (v3 RPC, owner-gated; honest partial otherwise) |
| 11 | Work monitored | `PARTIAL` | `/dashboard/projects/[id]/operations` — owner-only via `callerCompanyId()` |
| 12 | Evidence + confirmation | `FULL` | `review_journal_entry` RPC (0034), gated by `manages_organization` — the **one** employer path that honours the org spine |
| 13 | Experience submitted | `BLOCKED_BY_W6` | only `lib/trust/experience-eligibility.ts` (pure contract, `OWNER_DECISION_GATED`, guard-pinned to zero importers) |
| 14 | Dispute / moderation | `BLOCKED_BY_W6` | **zero** `dispute` occurrences in `lib/`, `components/`, `app/` on main |
| 15 | Team collaboration | `MISSING` | no employer action checks org membership — see §5 P1-5 |
| 16 | Analytics | `MISSING` | no employer KPI surface exists |
| 17 | Return to chat | `PARTIAL` | `back-to-chat` exists in simple chrome only; the employer's surfaces are all in **full** chrome, which has no such control |

---

## 2. Surface matrix

| Surface | Chrome | Gate | State |
|---|---|---|---|
| `/dashboard` (chat) | conversation | auth | `FULL` |
| `/dashboard/company` (1,264 lines, ~20 sections) | **full** | `requireRoleOrRedirect("company")` | `PARTIAL` — de facto second dashboard |
| `/dashboard/company/scouting` (885 lines) | **full** | same | `FULL` (the real candidate surface) |
| `/dashboard/company/planning` | **full** | same | `PARTIAL` — workforce capacity, not a calendar |
| `/dashboard/company/projects/new` | **full** | same | `PARTIAL` |
| `/dashboard/candidates` | **full** | auth | `MISLEADING` — private drafts of **unregistered** people, not candidates |
| `/dashboard/talent` | **full** | `requireSuperadmin` | `DEAD` for employers — `"Sample · …"` preview fixtures |
| `/dashboard/people/[workerId]` | **full** | auth + `can_view_worker` RLS | `FULL` |
| `/dashboard/bookings` | **full** | auth | `FULL` (migration-gated) |
| `/dashboard/projects`, `…/[id]/operations` | **full** | `callerCompanyId()` | `PARTIAL` — owner-only |
| `/dashboard/planning` | panel | auth | `PARTIAL` — no crew view |
| `/dashboard/service-requests`, `/dashboard/services` | **full** | auth | `PARTIAL` — a **separate** need model |
| `/dashboard/inbox`, `/dashboard/communication` | full / panel | auth | `FULL` |

**Chrome finding.** `dashboard-chrome.tsx:33-51`: simple chrome covers only
`/dashboard` + `communication|planning|profile|journal`. Every employer surface
falls to `full`. `WorkspaceChip` is mounted **only** in `ConversationHeader`
(`conversation-header.tsx:74`) — so the employer has **no active-organization
indicator on any screen where they actually work**. The 5-item simple nav
(chat / journal / messages / calendar / profile) contains no employer item.

---

## 3. Permission matrix (employer actions)

| Action | Server authority | Org-scoped? | Chat-reachable? |
|---|---|---|---|
| create demand | `submit_demand_request` RPC, `profile_id` | ❌ | ✅ (only one) |
| confirm need | `demand-lifecycle.ts:56` `.eq("profile_id", user.id)` | ❌ | ❌ |
| close / reopen demand | same, + status transition guard | ❌ | ❌ |
| shortlist candidate | `demand_shortlist` `owner_id = auth.uid()` | ❌ | ❌ |
| contact worker | own demand + on shortlist + contactable + 30/24h budget | ❌ | ❌ |
| propose booking | RPC: `'Not your demand'` (42501); upsert = idempotent | ❌ | ❌ |
| assign worker | `assign_worker_to_project` RPC | ❌ | ❌ |
| review journal entry | `review_journal_entry` RPC → **`manages_organization`** | ✅ | ❌ |
| read org assets | `engagement_contexts` in (`manager`,`owner`,`external_manager`) | ✅ | ❌ |
| switch workspace | membership-validated app-side **and** DB trigger | ✅ | ✅ |

`requireRoleOrRedirect` (`lib/auth/require-role.ts:35-49`) checks **held roles
only** — never organization membership. That is correct for a role gate and
insufficient as an org gate; nothing else supplies one.

---

## 4. Data-leakage audit

| Check | Result |
|---|---|
| Employer A sees employer B's org data | **No leak.** Every employer read is `profile_id = auth.uid()` or `companies.profile_id`; `customer_requests` RLS `0028:70`. |
| Manager of org A sees org B's candidate actions | **No leak** — and no manager access to org A either (§5 P1-5). |
| Insufficient role can invite / confirm / dispute | **Blocked server-side.** Booking RPC `'Not your demand'`; shortlist owner-scoped; review RPC `manages_organization`; dispute does not exist. |
| Server action trusts a client workspace id | **No.** `dispatch.ts:287` resolves workspace from `getWorkspaceContext` server-side; `switchActiveOrganization` validates membership before writing the httpOnly cookie, and `validate_active_organization` re-checks at the DB. |
| RLS and server authorization agree | **Yes** on the demand→shortlist→booking→conversation chain (app checks are defence-in-depth over the same predicate). |
| Anonymous sees private candidate evidence | **No.** `can_view_worker` anon EXECUTE revoked; `middleware.ts:83` gates `/dashboard`. |
| Employer sees surplus `worker_skills` columns through product surfaces | **No** at render (tier chip only). DB-level column reach stays owner-gated item 10 — unchanged by W8. |

**One documentation drift, not an exposure (P2-1).** `w4-permission-matrix.md`
row 23 and owner-gated item 10 both state that `salary_min_eur` is *"BLOCKED at
render — the app never selects these columns."* That is false:
`lib/market/match-subject.ts:59` selects `salary_min_eur`, it flows through
`scout-safe-view.ts:86` → `worker-profile-visibility.ts:152`, and
`company/scouting/page.tsx:596` renders `rateFrom`. The render is deliberate
(`PROFILE_SAFE_PREVIEW_FIELDS`) and consent-covered ("pay expectation",
`consent-definitions.ts:87-96`) — so nothing leaks, but the owner gate's stated
reasoning is wrong and must be corrected before item 10 is decided.

---

## 5. Findings — P0 / P1 / P2

### P0-1 — `MISLEADING`: the active organization is decorative for the employer

* **Files:** `lib/company/company-setup.ts:154-157`, `lib/projects/projects.ts:127-139`, `lib/scouting/scouting.ts:82`, `lib/demand/demand-request.ts:326`, `lib/conversation/executor-contract.ts:23`
* **DB:** `customer_requests` has **no** `organization_id` (`0028_customer_requests.sql:38-59`); `demand_shortlist` is `owner_id`-keyed; `companies` is 1:1 per profile (`20260604120000:245`).
* **Visible effect:** `WorkspaceChip` offers a real, membership-validated switch between organizations. Switching changes the chip label, the accent hue and `resultContext` (`conversation-chat.tsx:1044`) — and **not one row of employer data**. Two orgs show identical demands, candidates, shortlists and bookings. The canonical rule *"darbdavys veikia aktyvios organizacijos kontekste"* is currently false.
* **Aggravating:** `dispatch.ts:281-291` resolves `ExecWorkspace` server-side and hands it to every executor; **no executor reads it** (`grep ctx.workspace` → 0 hits outside the type). The parameter documents an intent the code does not implement.
* **Minimal fix (no migration):** resolve the employer's company through the active workspace where `organizations.legacy_company_id` maps to it, and render `WorkspaceChip` in full chrome. **Real fix:** organization-scope the demand spine — migration, therefore `OWNER_GATED` + W9.
* **Test:** two owned orgs → create a demand in A → switch to B → the demand must not appear.

### P1-1 — `STUB`: 8 of 9 employer executors are unreachable from the chat

* **Files:** `lib/conversation/company-forms.ts:9-12`, `company-schemas.ts`, `company-executors.ts`
* Schema + executor + confirmation tier + dispatcher exist for `confirm-need`, `close/reopen-demand`, `shortlist-candidate`, `contact-worker`, `propose-booking`, `assign-worker`, `agency.invite-client`, `agency.propose-candidate`. Only `company.create-demand` has a form. The module says so honestly: *"the only employer action whose input is fully self-contained"*.
* **Blocker:** each needs a demand-id / worker-id picker read model.
* **Test:** every id in `COMPANY_ACTION_SCHEMAS` has either a `COMPANY_FORMS` spec or a recorded reason.

### P1-2 — `MISSING`: the employer's chat has no result surface

* **Files:** `lib/conversation/result-registry.ts:107-214`, `components/app/workspace/result-body.tsx:150-165`
* 9 result kinds; the only employer-context one is `project`. There is **no** `candidates`, `demand`, `shortlist` or `analytics` result — so every employer answer must be a route.
* **Worse, `project` is a dead end.** `canRenderInline("project","organization")` → `true` (`real` + context match) → `InlineResult` → `switch` `default` → `result-body-pending` text, and `onOpenFull` is offered **only** in the non-inline branch. Same for `journal`, `evidence`, `invoice` — 4 of 9 kinds render a pending stub with no way out.
* **Minimal fix:** make the `default` branch reuse the honest fallback (reason + "open full screen"), then add a `candidates` result.
* **Conflict:** both files are touched by PR #974 — see §8.

### P1-3 — `PARTIAL`: `runFindWorkers` stops at the workspace boundary

* **File:** `lib/ai-workspace/workflows.ts:387-426`
* Lists the employer's demands, then states `scoutingNotInWorkspaceYet` with **no chip and no link** (deliberately — a `link:` chip would leave the workspace, W4 finding A1). Step 5 of the journey therefore has no in-chat continuation; the employer must use the greeting chip `link:/dashboard/company/scouting`.
* **Fix:** depends on P1-2 (a `candidates` result to route the answer into).

### P1-4 — `MISLEADING`: chat demand creation reports less than it knows

* **Files:** `components/app/conversation/inline-action-form.tsx:98-137`, `company-forms.ts:27-76`
* Success renders a bare `"Saved"` + "Add another". No request id, no status, **no worker-visibility caveat** — that honest note (`workerVisibilityNote`: "until your company is verified, your needs stay private") exists only on `/dashboard/company`. No continuation to candidates.
* The form collects `description/role/location/teamSize/urgency` only — no `workType`/`country`/`skills`/`accommodation`/`transport` — so the row is `structured:false` and scouting immediately shows "needs structuring".
* `trackFunnel(..., role_context: "worker")` is hardcoded (`inline-action-form.tsx:103`) — employer demand creation is recorded as worker activity.

### P1-5 — `MISSING`: team collaboration inside the organization

* No employer action checks org membership. A manager of the employer's org cannot see, shortlist, contact, book or close **anything** — the demand belongs to the profile that typed it.
* The only two org-aware employer paths are `lib/assets/assets.ts:124-127` and journal review via `manages_organization` (`0013:109-118`).
* **Dependency:** needs an org-scoped demand model → migration → `OWNER_GATED` + W9.

### P1-6 — `MISSING`: employer analytics and attention

* No KPI surface. `SPINE_SIGNALS` (`lib/notifications/spine-signals.ts`) carries `bookingResponsesNew` and the service-request rows but **no** employer signal for interest on my demand or entries pending my review — `countReviewablePendingEntries` exists and is not wired into the spine. Interest signals are honestly excluded because no seen-model exists (documented in the module).

### P1-7 — `PARTIAL`: `callerCompanyId()` fails to empty, silently

* **File:** `lib/projects/projects.ts:127-139` — `.maybeSingle()` with the `error` destructure omitted. The `companies_profile_id_key` unique constraint is applied **conditionally** (`20260604120000:234-247` — only when no duplicates existed at apply time), so an environment with two rows returns `null` and projects, operations and the planning `project` source go quietly empty instead of failing closed.

### P1-8 — `MISLEADING`: `/dashboard/candidates` is not candidates

* Private drafts of unregistered people/providers, owner-scoped, honestly labelled *on the page* — but an employer looking for their candidates finds this route first. Rename or re-home.

### P2 findings

1. **W4 matrix / owner-gated item 10 stale on `salary_min_eur`** — see §4.
2. **`ExecWorkspace` is a dead parameter** — resolved, passed, never read.
3. **Two invocation paths for the same employer writes** — chat dispatcher (confirmation-token tier) vs route buttons calling the canonical action directly (`propose-booking-button.tsx:64`). Same authority underneath; asymmetric defence-in-depth.
4. **`/dashboard/talent`** — superadmin-only `"Sample · …"` fixtures. `DEAD` for the employer journey.
5. **Parallel need models.** Canonical: `customer_requests`. Also live: `service_offering_requests` (buyer↔provider, separate loop, unreachable from employer chat). Dormant/read-only: `job_demands` + `matches` (guard-neutralized by `matching-ui-neutralized.test.ts`) — note the market-map result reads `job_demands`, so the employer's own demand **never** appears on the market they are shown. Plus `team_enquiries`, `leads`, `pilot_drafts.buyer_request`, the public company-need intake.
6. **Planning is caller-centric.** No crew calendar, no per-worker availability view, no absence/holiday source for the employer. Double-booking is prevented server-side (`20260613100100:221` conflict guard on accept) but the employer cannot *see* the conflict surface. UTC day math throughout (`planning-model.ts:287`) — locale-safe, but no timezone model.

### What is genuinely `FULL`

Match explanation (need-context only, no global score, §19-compliant);
candidate anonymization (`toShortlistSafePreview` + `assertContactSafe` runtime
net); booking authorization and idempotency; contact-request gating (own demand
∧ shortlisted ∧ contactable ∧ rate budget); the derived 7-stage candidate
pipeline (no 7th enum); demand status-transition guard; workspace-switch
authorization; the "no publish action" refusal (`company-schemas.ts:112-125`) —
a state the platform does not have is not faked.

---

## 6. W6 dependencies

Section G is **entirely** `BLOCKED_BY_W6`. On `380c3679`:

* zero `experience_records` / `experience_responses` tables in `supabase/migrations/`;
* zero `dispute` occurrences in application code;
* the only artefact is `lib/trust/experience-eligibility.ts` — a pure contract
  (eligible interaction kinds, 7 factual dimensions, unordered outcome
  vocabulary, `submitted → in_moderation → published|rejected` with no
  shortcut, moderator-only transitions), marked `OWNER_DECISION_GATED` and
  guard-pinned (`lib/guards/experience-eligibility.test.ts:194`) to have **no**
  UI or storage importer.

PR #974 supplies the store, the actions (including `subjectType: "organization"`
— the org-as-subject case W8 needs), the moderation panel, the dispute form and
the `experiences` result.

> **Dependency defect to raise on #974 before it merges.** The PR widens the
> `experiences` result to `contexts: ["personal","organization","project"]`
> with the explicit reasoning that *"the AUTHOR side of this domain is normally
> an employer acting from inside their organization"* — yet the action that
> opens it, `worker.review-experiences`, is declared `allowedRoles: ["worker"]`.
> A company-only account can never surface the chip. The employer author side
> is therefore reachable only for dual-role accounts.

---

## 7. Recommended W8 slice plan

| Slice | Scope | Migration | Conflicts with #974 |
|---|---|---|---|
| **W8-1 — org context truth** | Resolve the employer's company through the active workspace via `organizations.legacy_company_id`; mount `WorkspaceChip` in full chrome; make `callerCompanyId` fail-closed and honest on a multi-row read; correct the W4 matrix row 23 + item 10 wording; fix the `role_context` telemetry label. | No | **No** |
| **W8-2 — honest result fallback** | `ResultBody`'s `default` branch reuses the reason + "open full screen" affordance, so `project` / `journal` / `evidence` / `invoice` stop dead-ending. | No | **Yes** (`result-body.tsx`) |
| **W8-3 — the candidates result** | New `candidates` result kind + read model over `runScouting`; `runFindWorkers` opens it instead of stating a dead end. | No | **Yes** (`result-registry.ts`, `result-body.tsx`, `messages/*.json`) |
| **W8-4 — employer chat reach** | Demand + candidate picker read model; inline forms for `shortlist-candidate`, `contact-worker`, `propose-booking`, `confirm-need`, `close/reopen-demand`; demand-created result states id + status + worker-visibility truth + the next step. | No | **Partial** (`action-registry.ts` if new ids are added — avoidable) |
| **W8-5 — employer attention** | Spine signals for entries-pending-my-review and demand-interest (the latter needs a seen model — currently deliberately deferred). | Likely | Low |
| **W8-6 — organization-scoped demand** | `organization_id` on the demand spine + membership-based RLS; team collaboration (§5 P1-5). | **Yes** | Low |
| **W8-7 — employer experience authoring** | Employer as experience author and as subject. | via #974 | **Blocked** |

---

## 8. File-conflict map vs PR #974 (`feat/cc/w6-slice3-experience-records`)

Computed with `git diff --name-only origin/main...feat/cc/w6-slice3-experience-records`.

**Hard conflicts** (a W8 slice touching these must land after #974):

```
apps/web/lib/conversation/result-registry.ts      # reputation → experiences, contexts widened
apps/web/lib/conversation/action-registry.ts      # + worker.review-experiences
apps/web/components/app/workspace/result-body.tsx # + case "experiences"
apps/web/lib/product-gate/behavior-model.ts
apps/web/lib/i18n/client-messages.ts
apps/web/messages/*.json                          # all 12 locales
```

**No conflict** (W8-1 lives entirely here):

```
apps/web/lib/company/company-setup.ts
apps/web/lib/company/active-organization.ts
apps/web/lib/projects/projects.ts
apps/web/components/app/dashboard-chrome.tsx
apps/web/app/[locale]/dashboard/layout.tsx
apps/web/lib/conversation/company-forms.ts
apps/web/lib/conversation/company-schemas.ts
apps/web/lib/conversation/company-executors.ts
apps/web/lib/scouting/**
docs/audits/evidence/premium-rebuild/w4-permission-matrix.md
```

---

## 9. Implementable independently (today, no owner gate, no W6/W9/W12)

1. W8-1 in full — org context resolution, chip in full chrome, fail-closed
   `callerCompanyId`, telemetry label.
2. Correcting the W4 matrix row 23 and owner-gated item 10 `salary_min_eur`
   claim (documentation only; no exposure change).
3. Chat demand-creation honesty: request id, real status, the
   `workerVisibilityNote` truth, and a continuation chip.
4. Either wiring `ExecWorkspace` into the executors that could use it, or
   deleting the parameter — the current state documents an unimplemented intent.
5. Re-homing or renaming `/dashboard/candidates`.

## 10. Must wait

| Deferred to | Items |
|---|---|
| **PR #974 (W6)** | every result-registry / action-registry / `result-body` / `messages/*.json` edit (W8-2, W8-3); the whole experience + dispute + moderation domain (journey steps 13–14) |
| **W9 Organizations** | organization-scoped demand spine, team collaboration, manager permissions (§5 P0-1 real fix, P1-5) |
| **W10 Marketplace** | reconciling `service_offering_requests` with `customer_requests`; whether the employer's demand should ever reach the market map (`job_demands`) |
| **W11 Projects** | project↔demand continuity, org-scoped project access |
| **W12 Calendar** | crew scheduling, per-worker availability, absence/holiday sources, the employer conflict view |
| **W13 Notifications** | employer spine signals (W8-5) |
| **W14 Analytics** | employer KPI surface |
| **W16 Commercial** | billing/Stripe surfaces — **noted only**, not audited as an implementation object, not to be changed |
| **Owner gate** | any migration: `organization_id` on the demand spine, column-level privileges (item 10), the seen model for interest signals |

---

## 11. Code-change confirmation

```
$ git -C C:/Users/Mano/Documents/labourmarketai-w8-audit status --porcelain
(empty at audit close, before this document was written)
$ git rev-parse HEAD
380c3679cb79b9f09d99ae4090b845447cd46efe
$ git rev-parse --abbrev-ref HEAD
audit/w8-employer-journey
```

No source file was created, edited, moved or deleted. No migration was written
or applied. Nothing was merged, deployed, committed or pushed. No Telegram
message was sent. Production was not touched. The only artefact of this audit is
this document, left **uncommitted and untracked**.

```text
W8_EMPLOYER_JOURNEY_READ_ONLY_AUDIT_COMPLETE
```
