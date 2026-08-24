# SYNTHETIC PRODUCTION QA ACCOUNTS — multi-organization proof package (v2)

Supersedes and extends the 2026-07-31 single-account package (v1, preserved
verbatim at `prod-qa-account-v1-2026-07-31.md`). v1 authorised ONE
passwordless worker identity for the READ-ONLY `EMPLOYEE_BETA_PRODUCTION_GATE`.
That account was never provisioned, and the product has since moved: the
M-P0-1…M-P0-8 multi-organization structural train is applied and merged
(`docs/architecture/MULTI_ORGANIZATION_STRUCTURAL_TRAIN.md`), and the W1–W22
recount (`docs/program/W1_W22_CURRENT_STATE_MATRIX.md`) names "PROD_QA
accounts unprovisioned" as the ONE cross-cutting blocker holding the
production-proof half of **W6, W7, W8, W11 and W12**.

This v2 package converts the single-identity read-only design into a
three-identity, marked-and-bounded **production write proof**: one owner
approval, one 16-step journey, five W rows gain their authenticated
production evidence.

## Status

```text
PROVISIONED: NO — owner decision pending (see the ONE question at the end)
```

## Production facts (verified 2026-08-06, read-only)

| Fact | Value | Why it matters |
|---|---|---|
| `experience_records` | 0 rows | W6 has never been written to by anyone in prod |
| `booking_requests` | 0 rows | the marketplace loop has never closed once; W12's race guard is live but unexercised |
| `engagement_contexts` | 46 rows | real engagements exist — QA must not touch any of them |
| `service_offering_requests` | 1 row | real user data exists — zero-contact rule is live, not theoretical |
| `organizations` / `company_memberships` | 10 / 10 | multi-org schema is real and populated |
| PROD_QA accounts | none exist | v1 was never provisioned |
| Billing | no live billing; `billing_customers`/`billing_subscriptions` exist (legacy v1); `billing_subjects`/`stripe_webhook_events` absent | entitlement reads fail closed to FREE (42703 feature-detect); QA runs on FREE and never touches billing |

Consequence worth stating plainly: because `experience_records` and
`booking_requests` are at zero, **the QA journey's rows will be the first
rows ever in those tables**. That is the point — and it is also why the
marker + retention policy below is strict: these rows will be trivially
identifiable forever.

## 1. The synthetic cast

Three identities, three organizations. Names are unmistakably synthetic
Lithuanian stand-ins; none collides with a real person or a registered
company name.

### Identities

| Handle | Email (allowlisted, exact-equality) | Synthetic name | Role metadata | Purpose |
|---|---|---|---|---|
| `PROD_QA_OWNER` | `qa.owner+multiw@labourmarket.ai` | `QA Ona Savininkė (test)` | `company`, locale `lt` | owns Org A **and** Org B — the multi-org actor |
| `PROD_QA_MANAGER` | `qa.manager+multiw@labourmarket.ai` | `QA Marius Vadybininkas (test)` | `company`, locale `lt` | owns unrelated Org C; accepts a `manager` governance membership in Org A |
| `PROD_QA_WORKER` | `qa.worker+multiw@labourmarket.ai` | `QA Vytas Darbininkas (test)` | `worker`, locale `lt` | engaged by A and B — the cross-company calendar subject |

**Addressing scheme.** Plus-addressing on the owner-controlled
`labourmarket.ai` mailboxes, exactly the v1 precedent
(`qa.worker+goal3@labourmarket.ai`). The `+multiw` tag names this
authorisation, so a leaked address is self-describing. No third-party domain
is invented. Before provisioning, the owner confirms the three base
mailboxes (`qa.owner@`, `qa.manager@`, `qa.worker@`) route to a mailbox the
owner controls — or aliases all three to one box. Note the mailboxes are a
formality: signup email confirmation is OFF in production
(`components/app/signup-form.tsx`), provisioning sets `email_confirm: true`,
and sessions are minted via admin `generateLink` + `verifyOtp`
(`scripts/prod-qa-mint-session.ts`) — **no email is ever actually sent, and
no password ever exists** for any of the three identities.

### Organizations

| Handle | Legal name (as entered) | Owner | Purpose |
|---|---|---|---|
| Org A | `QA-SYNTHETIC Alfa (testinis subjektas)` | PROD_QA_OWNER | primary employer context: demand, booking, engagement, project, experience |
| Org B | `QA-SYNTHETIC Beta (testinis subjektas)` | PROD_QA_OWNER | second context of the SAME owner: context-switch proof + cross-company conflict |
| Org C | `QA-SYNTHETIC Gama (testinis subjektas)` | PROD_QA_MANAGER | unrelated organization: invisibility/isolation proof (OWNER must never see or stamp C) |

All three are created through the real product path
(`/dashboard/start/company`, `save_company_setup_v3`, `?new=1` for the
second organization) — creating them is itself part of the proof (M-P0-2's
production first use).

### Guard extension (code slice, ships before the run)

`lib/testing/prod-qa-guard.ts` currently allowlists exactly one identity by
equality. The extension adds the two new addresses to
`PROD_QA_IDENTITIES` (three equality entries, still never prefix/pattern),
and `scripts/prod-qa-provision.ts` gains a `--identity <handle>` selector
that maps ONLY to the three hard-coded addresses. Everything else about the
v1 design is kept verbatim: hard-coded allowlist, passwordless,
`--i-understand-production` friction, idempotency, `--revoke` ban path,
two-guards-never-merged doctrine, no route/server-action ever importing the
guard. The v1 `qa.worker+goal3@` entry is REMOVED at the same time (its
authorisation is superseded by this package) unless the owner says keep it.

## 2. Required properties

| Property | How it is honoured |
|---|---|
| **Synthetic names, no real PII** | names above only; no photos, no phone numbers, no addresses, no CV uploads with real content; free-text bodies (demand, journal, experience) are prefixed `[QA-SYNTHETIC]` and contain no real facts about anyone |
| **No billing** | nothing in the journey touches billing; no `billing_subjects` schema exists in prod, so entitlements fail closed to FREE; FREE-tier rate limits (`lib/limits/request-rate-limits.ts`) are accepted as-is — the journey fits inside them, and hitting a limit is reported, never worked around |
| **Minimal search discoverability** | PROD_QA_WORKER **never** calls `grant_profile_discoverability_consent`; no org ever calls `set_business_public_profile_v1` (no public business listing); the ONE unavoidable public exposure is the open demand row (step 4) — see the named risk there |
| **QA marker convention** | auth: `app_metadata.qa_synthetic = true` + `qa_purpose: "labourmarket.ai production multi-W write proof (W6/W7/W8/W11/W12) — owner approval 2026-08-…"` + `qa_provisioned_by: "owner"`; data: every org `legal_name` and every free-text body carries the `QA-SYNTHETIC` prefix; the three profile ids and three organization ids are recorded in the evidence file at provisioning time — they are the canonical exclusion keys |
| **Analytics QA attribution / exclusion** | see the dedicated section below |
| **Cleanup policy** | at journey end: open QA demand is closed/fulfilled (never left visible to real workers), bookings are terminal, engagements ended (step 12 for A; B ended in cleanup), projects completed or archived, no dangling actionable QA row remains on any real user's surface |
| **Retention policy** | product rows are **RETAINED as marked QA state** (default): analytics rows are append-only by design (no UPDATE policy, no-mutation triggers — deleting them would break the very append-only property M-P0-8 pinned), and the product rows are the audit trail of the proof. Accounts are `--revoke`-banned after the run (sessions die, rows survive). Hard deletion of rows or accounts stays owner-only via the Supabase dashboard; the agent deletes nothing |
| **Zero contact with real users** | QA identities never invite, message, book, shortlist, contact-disclose or respond to any non-QA identity; if a REAL user expresses interest in the QA demand, they receive no reply and the demand is closed immediately — that event is reported to the owner verbatim |
| **Zero real company claims** | org names are self-evidently fake; no real company name, brand, registration code or address is entered anywhere; `admin_set_company_verification` is never invoked for a QA org |

### Analytics attribution and exclusion (post M-P0-8 / #1031)

The attribution seam is `apps/web/lib/telemetry/analytics-attribution.ts`:
ONE server-side resolver that `lib/telemetry/server-funnel.ts` invokes for
**every** server-emitted funnel event, stamping the reserved metadata keys
`workspace_type`, `organization_id`, `org_role`, `billing_subject`
(allowlisted in `funnel-events.ts:FunnelMetadata`; call sites cannot
fabricate them). `profile_id` on every `pilot_events` row is derived
server-side from `auth.getUser()` (`lib/telemetry/actions.ts`) — never
caller-supplied.

Therefore every QA-generated analytics row is **identifiable by
construction, with zero schema or code change**:

```sql
-- QA rows, exactly:
profile_id IN (<3 QA profile ids>)
OR metadata->>'organization_id' IN (<3 QA org ids>)
```

Policy this package adopts:

1. **Identifiability is the guaranteed floor** — the six ids are recorded in
   the evidence file at provisioning time, before the first write.
2. **Exclusion is a follow-up slice, not a precondition**: the admin metrics
   readers (`lib/admin/pilot-metrics.ts`) currently have no QA filter. A
   small `NOT IN (qa ids)` exclusion (ids sourced from one constants module
   next to the guard) is the first follow-up after the run. Until it lands,
   any owner reading of pilot metrics for the run window must mentally
   subtract the QA rows — the run window and ids are in the evidence file
   precisely so that is mechanical.
3. No new metadata key (`qa_synthetic`) is added to the allowlist — the id
   allowlist is stronger (server-derived, unforgeable) and needs no code.

## 3. The 16-step journey (surfaces, actors, constraints)

Sessions: minted per-identity via `scripts/prod-qa-mint-session.ts`
(magic-link OTP, 1-hour expiry, re-mint per run); driven through the real
product UI (Playwright storage states, same mechanism as the local W-proof
specs). Every step names its real surface. The whole journey is expected to
fit one owner-supervised session.

| # | Step | Actor | Surface / mechanism | Known constraints |
|---|---|---|---|---|
| 1 | **Owner + manager auth** | OWNER, MANAGER | provision (`prod-qa-provision.ts` ×3) → mint sessions → `/lt/dashboard`; OWNER creates Org A at `/dashboard/start/company`, then Org B via `?new=1` (`save_company_setup_v3`); MANAGER creates Org C; OWNER invites MANAGER into A (`membership_invite_v1`), MANAGER accepts (`membership_accept_v1`) | M-P0-2: creating B must not rename A; invite/accept = M-P0-4 slice-2 commands' first production use |
| 2 | **Worker auth** | WORKER | mint session → `/onboarding` (role `worker`) → `/lt/dashboard` | no discoverability consent granted |
| 3 | **Organization context switching** | OWNER | workspace chips (`role-switcher.tsx`): Personal → A → B; durable pointer = httpOnly cookie + `profiles.active_organization_id` | M-P0-5: with 2 orgs and no pointer the context fails closed to a chooser — asserted; C must never appear in OWNER's switcher |
| 4 | **Demand creation** | OWNER (workspace = A) | `/dashboard/company` → demand form → `save_demand_draft_v2` / `submit_demand_request_v2` stamping `organization_id = A` (M-P0-6, applied) | **NAMED RISK — the one real-user-visible moment**: an open demand appears in real workers' `/dashboard/opportunities`. Mitigation: title starts `[QA-SYNTHETIC — nereaguoti / test]`, the open window is minutes not days, closed in cleanup. Owner accepts this residual exposure in the approval below |
| 5 | **Worker interest / application** | WORKER | `/dashboard/opportunities` → the QA demand → `acknowledge_demand_interest` | worker-side read leg of the org demand spine in prod |
| 6 | **Contact / booking** | OWNER (A) ↔ WORKER | `propose_contact_disclosure_request_v1` from `?result=candidates`; WORKER `respond_contact_disclosure_request_v1`; booking via `propose_booking_request_v3` | booking inherits `organization_id` from the demand — first production firing of the M-P0-6 trigger |
| 7 | **Acceptance** | WORKER | `/dashboard/bookings` → accept (`respond_booking_request_v3`) | **first `booking_requests` acceptance in production ever**; schedule the booking to START within the session (same-day short window) — W6 eligibility is conservative |
| 8 | **Cross-company calendar conflict** | OWNER (B) + WORKER | OWNER switches to B, proposes an OVERLAPPING booking; WORKER attempts accept → refusal `23P01`; calendar at `/dashboard/planning` | the §5 local journey's PASS 11, now in prod; both bookings show their inherited organizations |
| 9 | **Engagement** | OWNER (A) | `/dashboard/company` workers section → `provision_company_worker_engagement_context` (workspace-derived, M-P0-3) | the 46 real engagement rows are never touched |
| 10 | **Project assignment** | OWNER (A) | `/dashboard/projects` → create project → `assign_worker_to_project`; operations centre at `/dashboard/projects/[id]/operations` | W11 constraint on record: operations page reachable **only by deep link** (F7) — the proof deep-links and says so honestly |
| 11 | **Project completion** | OWNER (A) | project page → `set_project_status_v1` → completed | prod's 5 real projects (all `draft`) untouched |
| 12 | **Engagement ending** | OWNER (A) | the ONE shared end path `lib/engagements/end-engagement.ts` | a B engagement (if provisioned for step 8's realism) must remain ACTIVE — the §5 PASS 9 invariant, now in prod |
| 13 | **Experience submission** | OWNER (A) about WORKER | the interaction IS the entry point (`lib/trust/experience-entry.ts`): `?result=experiences` → invitation for the completed interaction → `submit_experience_record` | **first `experience_records` row in production ever**. Note: the W6 author-subject slice (organization subjects + author side) is owner-gated in its own PR; if applied before this run, the same journey also proves the org-subject direction — otherwise worker-subject only, org-subject in a follow-up run |
| 14 | **Moderation** | owner's existing superadmin identity | `/dashboard/admin` control room, experience moderation band | **no QA account is ever granted admin** |
| 15 | **Response** | WORKER (subject) | published experience → `experience-response-form.tsx` → `submit_experience_response`; optional dispute leg if the owner wants it | count-only reputation asserted: no stars, no score, no trust % |
| 16 | **Cleanup-or-retained-QA-state** | OWNER + owner | close/fulfil the demand; terminal-state all bookings; end the B engagement; complete/archive projects; record the six QA ids + run window in the evidence file; owner runs `prod-qa-provision.ts --revoke` per identity | retained-QA-state is the default; accounts banned, rows kept |

Evidence: per-step screenshots + the emitted funnel events queried back land
in `docs/audits/evidence/premium-rebuild/prod-qa-multi-w-run/`.

## 4. What each W gets proven, by which steps

| W | Production proof gained | Steps |
|---|---|---|
| **W6 — experience domain** | first real `experience_records` write; full lifecycle submitted → moderated → published → responded; count-only surfaces on real prod rows | 7, 13, 14, 15 |
| **W7 — employee journey** | worker auth + onboarding → opportunities → interest → booking accept → experience response, all authenticated in prod | 2, 5, 7, 8, 15 |
| **W8 — employer journey** | workspace-derived employer context in prod: org creation, membership invite/accept, org-stamped demand, candidates → contact → booking, roster engagement | 1, 3, 4, 6, 9 |
| **W11 — project lifecycle** | first real project run: create → assign → operations centre → complete | 10, 11 |
| **W12 — calendar & conflicts** | first `booking_requests` rows ever; the applied concurrency guard exercised in prod incl. the cross-company overlap refusal | 7, 8 |

Cross-cutting: steps 1/3 give M-P0-2/-3/-4/-5 their first production browser
use; every event is the M-P0-8 attribution seam's first production exercise
with multi-org rows behind it.

## 5. What must ship in code before the run (no owner gate to WRITE it; owner gate to RUN)

1. `prod-qa-guard.ts`: three-identity equality allowlist (+ removal of the
   superseded `+goal3` entry); refusal tests extended.
2. `prod-qa-provision.ts`: `--identity` selector over the three hard-coded
   handles; updated `qa_purpose`; still idempotent, still `--revoke`-capable.
3. `prod-qa-mint-session.ts`: same selector; per-identity gitignored states.
4. A journey spec (`tests/e2e/prod-multi-w-journey.spec.ts`) walking steps
   1–16 with per-step screenshots, pointed at `https://labourmarket.ai`
   with `E2E_NO_SERVER=1`.
5. Evidence file scaffold: run window, six QA ids, per-step PASS/FAIL, the
   named residual risk (step 4) outcome.

All v1 safety pins stay: no session-mint route or server action, no
Auth/RLS/grant changes, no key material in output, guards never merged.

## 6. The one owner question

> **Do you approve provisioning the three synthetic identities
> (`qa.owner+multiw@`, `qa.manager+multiw@`, `qa.worker+multiw@labourmarket.ai`)
> and running the 16-step authenticated WRITE journey against production
> `https://labourmarket.ai` exactly as specified above — QA-marked synthetic
> data only, retained-and-banned afterwards, moderation via your existing
> superadmin, accepting the one named residual exposure (the minutes-long
> `[QA-SYNTHETIC]` demand row visible to real workers)?**
>
> Scope of a "yes": exactly the above. It does NOT cover billing/Stripe in
> any form, admin grants to QA accounts, contact with any real user, any
> schema/RLS/Auth change, or reuse of these accounts for anything beyond
> this journey and its re-runs. "No" or silence leaves production untouched
> and the five W rows honestly `local ✔ / prod pending`.

## Verdict

```text
PROD_QA_MULTI_W_PROOF_PACKAGE_READY_PENDING_OWNER_APPROVAL
```

---

## Preservation note (hygiene pass 2026-08-24, closing #1042)

PR #1042 (multi-W production journey) is closed as SUPERSEDED for its 149-file
code diff (the defects it found are already canonical on main: the
fresh-organization-owner-membership gate, and the booking engagement-bridge
`ambiguous_company` invariant + guard + human-gate doc). Its production-QA
journey log is preserved on the branch ref `feat/prod-qa-multi-w-journey-v1`;
detailed row-level evidence stays in the private Internal Brain (AGENTS.md).

**Outcome re-verified read-only against production 2026-08-24:** the experience
surface has real records in production (non-zero) — so the "experience_records
0 rows" line at the top of this file is **stale**; the account was provisioned
and a multi-W journey executed. The primary status line is left for a reviewer
holding the #1042 branch to reconcile fully; this note records that the "0 rows"
claim is not current truth.

The refuted #1049 claim is dropped, not preserved: project-completion control
DOES exist on main (`components/app/workspace/project-result.tsx` `LifecycleControls`
→ `setProjectStatusAction` → `set_project_status_v1`).
