# Launch matrix — 2026-09-09 · independent safety and readiness audit

Owner directive: *recover the actual state, audit it independently, then
continue toward one simple, safe, coherent product a real person, company,
agency and institution can use.* This window treated the previous handoff as
claims to verify, not as ground truth. Every row names its evidence level.

`node .github/scripts/product-truth.mjs` was run first, as the contract
requires: 105 capabilities registered, 17 human-UI-proven, 29 live journey
links, 11 honestly broken or unbuilt, 6 open owner decisions.

---

## 0. STATE RECOVERED

| | |
|---|---|
| `origin/main` | `33d47f68` — *fix(readiness): what the product says, what a brigade can say, and one real action (#1679)* |
| Production build (`/api/health`) | `33d47f68`, region `dub1`, auth 242 ms, db 258 ms, `ok: true` |
| **MAIN_PRODUCTION_MATCH** | **YES** |
| #1677 / #1678 / #1679 | MERGED as `86ea5102` / `5b717879` / `33d47f68` (read from GitHub, not from the handoff) |
| CI on `33d47f68` | Quality Gates, Mobile, E2E Smoke, CodeQL — all success |
| Production migration ledger head | `20260909061411_20260904120000_first_party_supply_representation_v1` (applied today) |
| Latest Vercel production deployment | Ready, 4 min build, **later than** the `SUPPLY_FEED_BEARER_TOKEN` variable (variable created ~1 h before, deployment ~30 min before this audit) |
| Owner-gated PRs, verified still open and unapplied | #1648, #1646, #1641, #1577, #1421 and the older RED drafts (#1475, #1440, #1436, #1433, #1430, #1426, #1266) |
| Production data | 56 profiles / 56 workers · 17 organizations · 20 customer requests · 40 journal entries · 49 professions · 1 programme · 1 cohort · 0 cohort members |

Local branch on entry was `main`, clean. A feature branch was cut for the one
fix below; nothing else was changed.

---

## 1. SECURITY / PRIVACY / AUTHORIZATION / DATA INTEGRITY

Two independent reads, both bounded to production-critical paths: a code
review of `apps/web` at `33d47f68` (auth, admin-client callers, public
surfaces, secrets, import provenance, FAILED-as-EMPTY) and the Supabase
security advisor on the live project.

### 1.1 Verdicts

| area | verdict | evidence |
|---|---|---|
| SECURITY_CRITICAL | **PASS** | no P0/P1 in code review; guards 849 files / 15,082 tests green on `main` |
| AUTHORIZATION_RLS | **PASS** | every `createAdminClient` caller (19 files) re-checks superadmin / ownership / verified e-mail / signature before use; workspace switch requires membership; no table in `public` with RLS off; the one `SECURITY DEFINER` view is the recorded, load-bearing one |
| PRIVACY | **PASS** | person page selects no e-mail / phone / document; `worker_documents` SELECT is owner-or-admin only; supply feed emits opaque `actorRef` + scope, no identity columns; no `/api/public/*`, no public people route |
| SECRET_EXPOSURE | **NO** | only `*.env.example` tracked; no key-shaped strings in the tree; no `NEXT_PUBLIC_` secret; admin client is `server-only`; callbacks never log codes or tokens |
| DATA_INTEGRITY | **PASS after fix** | import pipeline keeps `source_*`, `actor_*`, `import_session_id`, org resolved only from the caller's memberships; three FAILED-as-EMPTY reads found and fixed (§4) |

### 1.2 What the advisor says (401 findings, all in `public`)

| level | lint | count | reading |
|---|---|---|---|
| ERROR | `security_definer_view` on `worker_absence_scheduling` | 1 | **accepted, do not "fix"** — recorded 2026-09-01; flipping it returns zero rows to managers |
| WARN | `authenticated_security_definer_function_executable` | 384 | structural: the whole RPC surface; authorization lives inside each body |
| WARN | `anon_security_definer_function_executable` | 9 | the 8 recorded public reads + `public_plans_v1`, which is on `lib/security/anon-secdef-allowlist.ts` |
| WARN | `function_search_path_mutable` | 2 | `usage_cost_events_forbid_mutation`, `usage_cost_events_forbid_truncate` — trigger guards; hygiene, not exposure |
| WARN | `auth_leaked_password_protection` | 1 | HaveIBeenPwned check is OFF in Auth (dashboard setting, owner) |
| INFO | `rls_enabled_no_policy` | 4 | sealed tables incl. `vacancy_import_cursors`, `worker_display_name_backfill_20260805` |

No `rls_disabled_in_public`, no `exposed_auth_users`, no `policy_exists_rls_disabled`.

### 1.3 Findings kept as information (not defects)

* `middleware.ts` trusts an unverified JWT `exp` to skip a GoTrue round-trip —
  by design and documented; the dashboard layout runs a real `getUser()` and
  RLS governs data.
* `lib/supply-bridge/feed-read.ts` is deliberately not `server-only` so the
  operator script runs the identical decision code; it holds no client.
* The chat's generic fallback line after a thrown profile read is honest but
  does not name the failure. Left as is.

---

## 2. FIRST-PARTY SUPPLY FEED — `/api/internal/supply-feed/first-party-v1`

Probed on production after the `33d47f68` deployment.

| probe | result |
|---|---|
| SUPPLY_FEED_NO_AUTH | **401** `{"ok":false,"reason":"unauthorized"}` |
| SUPPLY_FEED_WRONG_AUTH (bad bearer) | **401** `unauthorized` |
| `Authorization: Basic …` | **401** |
| custom token header | **401** |
| SUPPLY_FEED_CORRECT_AUTH | **NOT_TESTED** — the token is a Sensitive production variable and was deliberately not read, minted or handled by this window |
| Is the secret present in the running deployment? | **YES, inferred**: `lib/api/supply-feed-auth.ts` answers `not_configured` while the variable is unset or shorter than 32 bytes; production answers `unauthorized`, which only the configured branch returns |
| SUPPLY_FEED_ROWS | **0, VERIFIED EMPTY** — read directly: `first_party_supply_declarations` 0 rows, granted `partner_supply_representation` consents 0, `first_party_supply_feed_v1()` returns 0 rows; the function has EXECUTE for `service_role` only |
| FAILED_READ_CAN_BECOME_ZERO | **NO** — a failed read answers 503 with no body and no `x-feed-rows` (`feed-read.ts`, route) |

**REDEPLOY_REQUIRED = NO.** The old claim is stale; the variable predates the
current deployment.

No worker was created and no consent was granted to make this testable.

---

## 3. HUMAN UI — what a person actually sees

### 3.1 Anonymous, in a real browser, on production (EN)

Each sentence was typed into the landing box and submitted with the
"Understand" button. The interpretation line and the door were read back
from the rendered page.

| sentence | product's reading | door |
|---|---|---|
| I am a welder | "You are talking about your work and professional path." | worker signup, sentence carried |
| I am looking for work | "You are looking for work. We will show opportunities that fit your profession and place." | worker signup |
| I have 3 years of experience as a welder | work and professional path | worker signup |
| I want to upload my old work history | work and professional path (**#1678 verified**: a person, not a company) | worker signup |
| We want to upload our old work data | "You are talking as an employer or a company — about people, projects or needs." | company signup |
| We need 20 welders | "You need workers. We will write down the need — which people, how many, where and from when — and look for the right ones." | company signup |
| We need workers | same demand reading | company signup |
| We need an electrician tomorrow in Vilnius | same demand reading | company signup |
| We have 20 welders available | "You have people or capacity free. We will record the offer so those who need it can find it." | supply door |
| Find a project for our crew | people or capacity free (**#1679 verified**: brigade supply routes as supply) | supply door |

Ten of ten correct, including the nearest-opposite pairs (need vs have,
my history vs our data). No fluent wrong answer.

Also read back on the landing: the 17-market list names Georgia, Belgium,
France, Spain, Austria, Switzerland and the United States; the map line
says "markets, not today's activity"; the four doors (worker / employer /
agency / school-college-university) are present; the pricing contradiction
of the previous window is gone.

### 3.2 What could NOT be walked by a human hand in this window

* **Lithuanian landing sentences.** The same form on `/lt` did not render its
  answer. Diagnosis from the page itself: `document.visibilityState ===
  "hidden"`, React hydrated, input value set — the known hidden-tab render
  stall (memory: `network-hydration-raf-hidden-tab`), a walk artefact, not a
  product defect. LT sentences remain PROD_PROVEN by the 2026-09-06 walks.
* **Every signed-in surface.** Minting a one-time sign-in link for an E2E
  identity was refused by the session's permission classifier, and typing a
  password into the browser is prohibited for an agent. No signed-in browser
  walk was run. The person page after #1679, the company workspace, the
  agency workspace and the institution surface are therefore
  **NOT HUMAN_UI_PROVEN** in this window (they remain PROD_PROVEN by earlier
  Playwright walks).

**HUMAN_UI_PROVEN = PARTIAL** — anonymous entry YES (EN), signed-in NO.

### 3.3 The one thing that unblocks it

Open the Browser pane, sign in once with any `e2e-*@labourmarket.ai`
identity (or your own), and say so. The signed-in walk then runs in the same
browser: person profile → work history import → company need → agency supply
→ institution programme, each with its nearest opposite.

---

## 4. FIXED IN THIS WINDOW — one PR, one journey

`fix(honesty): a failed read is not an empty record` (branch
`fix/cc/failed-read-is-not-empty-record`). The journey is *what the product
tells a person about their own record*; three reads told them something was
absent when the read had failed (SEP-7: UNKNOWN ≠ ZERO ≠ FAILED).

| read | what it said on failure | now |
|---|---|---|
| `lib/journal/review-queue.ts` — `journal_entries` | "Nothing to review right now" to a manager | thrown; the quick inbox renders a named *could not be read* state; chat and opening brief already treat a thrown read as unknown |
| `lib/conversation/worker-activity.ts` — `workers` | `hasWorkerProfile: false` → the chat said "This account has no worker profile" to a real worker | read moved outside the swallow-all `try`; thrown; every caller already degrades a thrown read honestly (first screen hides its block, chat falls back, brief adds no line) |
| `dashboard/profile/page.tsx` — `worker_skills`, `engagement_contexts` | the person's own profile with zero skills, no work history, CV cards "not filled" | one notice names the state; the section cards are withheld; nothing is invented and nothing else changes. Saving skills is upsert/insert-only, so no wipe hazard existed |

Copy in the five active locales (lt/en/ru/nl/de). No migration, no RLS, no
grant, no data change. Typecheck, lint, migration-safety (no migrations) and
the product gate in PR context all pass; the full guard suite result is in the
PR.

Left alone on purpose: `notifications/event-emitters.ts` (retries next run),
the feature-detected reads in `match-subject.ts` (asserted by
`match-facts-honesty.test.ts`), `verified-cv.ts` and `assist.ts` (lower
blast, named in the review, not user-claims of completeness).

---

## 5. ACTOR READINESS

Evidence order used: HUMAN_UI (this window) > PROD_PROVEN (earlier walks,
re-verified against live rows today) > CODE_PROVEN.

| actor | state | what holds it there |
|---|---|---|
| PERSON_READY | **PARTIAL** | landing → correct door HUMAN_UI-proven today; signup → onboarding → conversation → journal → confirmation PROD_PROVEN (2026-09-06); person page rendering after #1679 not human-walked; e-mail delivery to a real inbox still G-1 (owner) |
| COMPANY_READY | **PARTIAL** | demand sentence → door HUMAN_UI-proven; need → candidates → confirm loop PROD_PROVEN; office professions still free text until #1577 (owner); worker board needs a VERIFIED company (G-14, owner click) |
| AGENCY_READY | **PARTIAL** | supply sentence → door HUMAN_UI-proven (#1679 route); D5 agency chain PROD_PROVEN; brigade-as-unit assignment NOT_BUILT (register); worker-board leak fix #1588 RED |
| INSTITUTION_READY | **NO** | chain built and rendered (2 training providers, 1 programme, 1 cohort, outcomes read wired) but **0 cohort members ever**, and the one programme is permanently mis-pointed — `education_programs` has exactly one policy (`SELECT`), only `create_education_program_v1` exists, and the live row has `target_profession_slug = NULL`. **#1648 is the blocker and its premise still holds.** |

**SAFE_TO_INVITE_WORKERS = YES** (with G-1 e-mail delivery confirmed by the owner once).
**SAFE_TO_INVITE_COMPANIES = YES** for trades; office professions read as free text until #1577.
**SAFE_TO_INVITE_AGENCIES = YES** for individual supply; not for whole-brigade placement.
**SAFE_TO_INVITE_INSTITUTIONS = NO** until #1648 is applied and one real cohort is walked.

---

## 6. OWNER GATES — verified, none resolved by this window

### #1648 — an institution can correct a programme it created — **OWNER_DECISION_REQUIRED**

Re-verified on production today: `education_programs` policies =
`education_programs_select` only; functions matching `education_program` =
`create_education_program_v1` only; 1 programme, `target_profession_slug`
NULL. The PR's CI is fully green (quality, migration-safety, e2e-smoke,
mobile, CodeQL); it is 7 commits behind `main` (one update-branch away).

The migration `20260908120000_education_program_correction_v1` adds ONE
`SECURITY DEFINER` function `update_education_program_v1(uuid, text, text,
text, text)`: organization taken from the row (never from the caller), one
refusal for "no such programme" and "not yours", `manages_organization` +
`training_provider` role required, slugs validated against the active
`professions` / `education_types` catalogues, `organization_id`, `created_by`
and `id` not updatable. Grants: revoked from `public` and `anon`, executable by
`authenticated`. Rollback file paired. No policy loosened, nothing to `anon`.

**Exact action:** say *"Apply #1648"*. The agent then updates the branch,
applies via Supabase MCP `apply_migration`, merges, and the institution walk
becomes possible. Until then, do not invite a school.

### `live.clock.badge` — **OWNER_DECISION_REQUIRED (bounded)**

`messages/en.json` `live.clock.badge` = "Northern & Baltic Europe" (lt:
"Šiaurės ir Baltijos Europa"). The landing's own market band names 17
markets including Georgia and the United States. `live` is in
`FROZEN_LANDING_NAMESPACES` (`lib/guards/landing-freeze.ts`), so the copy
cannot be changed without a recorded freeze regeneration. The `marketPlaceholder`
"e.g. Baltic / EU" is a form placeholder, not a claim, and needs nothing.

**Proposed:** one namespace-hash regeneration replacing the badge with a
coverage-neutral label in the three frozen locales (lt/en/ru), nothing else in
the frozen set. **Exact action:** say *"Regenerate the freeze for
live.clock.badge"* with the wording you want, or leave it.

### Cross-person qualifications — **UNAVAILABLE, exact gap named**

Searched every function, view and RPC in the migrations and the player-card /
matching / CV layers. **No authorization-safe projection of another person's
documents or qualifications exists.** `worker_documents` is owner-or-admin;
`owns_worker_document_v1` is strict owner; `agency_pool_docs_readiness()` is
the only cross-person read and it answers counts only, for the caller's own
consented agency roster, with no document type. `can_view_worker` gates
exactly `workers`, `worker_skills`, `worker_professions`, `worker_languages`.

Not built, and RLS was not widened. The minimal missing capability, should the
owner want it:

```
worker_qualification_summary_v1(p_worker_id uuid)
  returns (document_type_slug text, category text, verification text, is_valid_now boolean)
  security definer, set search_path = public
  where public.can_view_worker(p_worker_id) [and status = 'ready']
  revoke from public, anon; grant execute to authenticated
```

Deliberately never returned: file path, storage path, filename, notes, dates
(only the derived boolean), country, ids, holder name. Open policy question for
the owner: `can_view_worker` alone, or also the worker-held
`docs_aggregate_consent` switch (the s6 precedent chose consent for a weaker
disclosure).

### #1577 — professions catalogue — **OWNER_DECISION_REQUIRED, still valid**

Live: `professions` = 49 rows; the employer form's `WORK_CATEGORIES` = 44
slugs (43 trades + general). The two lists are different questions (work type
vs profession). The landing's "most in demand" names Teacher and Sales
assistant, which an employer can only reach as general work. #1577 seeds 9
office professions (→ 58) with paired rollback and apply-before-merge
sequencing. Nothing changed.

### Others

#1646 (subject answers back), #1641 (EVID-6 / EVID-2), #1421 (lifecycle
machinery), #1588 (worker board leak): exactly where they were; none applied,
none merged. `MKT-7`, `GOV-1`, `PER-11`, `ORG-2`, `EVID-2`, `EVID-6` remain
open in `product-truth`.

---

## 7. BLOCKERS

**P0_BLOCKERS:** none found.

**P1_BLOCKERS:**
1. Institution: #1648 unapplied (owner) — a programme can never say what it
   trains for.
2. Signed-in HUMAN_UI proof: needs one owner sign-in in the Browser pane
   (§3.3).
3. E-mail delivery to a real inbox (G-1) — unproven, owner.

**P2 (reported, not fixed):** `verified-cv.ts` and `assist.ts` degrade to
empty/zero on read failure; Auth leaked-password protection is off; two
trigger functions have a mutable `search_path`; `/for-agencies` still
understates coverage in copy.

---

## 8. FINAL MATRIX

```
CURRENT_MAIN_SHA              33d47f68
CURRENT_PRODUCTION_SHA        33d47f68
MAIN_PRODUCTION_MATCH         YES

SECURITY_CRITICAL             PASS
AUTHORIZATION_RLS             PASS
PRIVACY                       PASS
SECRET_EXPOSURE               NO
DATA_INTEGRITY                PASS (three FAILED-as-EMPTY reads fixed in this window's PR)

SUPPLY_FEED_NO_AUTH           401
SUPPLY_FEED_WRONG_AUTH        401
SUPPLY_FEED_CORRECT_AUTH      NOT_TESTED (secret not handled; configured state inferred from the reason code)
SUPPLY_FEED_ROWS              0 (VERIFIED EMPTY by direct read)
FAILED_READ_CAN_BECOME_ZERO   NO
REDEPLOY_REQUIRED             NO

HUMAN_UI_PROVEN               PARTIAL (anonymous landing EN: 10/10; signed-in: not walked)
PERSON_READY                  PARTIAL
COMPANY_READY                 PARTIAL
AGENCY_READY                  PARTIAL
INSTITUTION_READY             NO

#1648                         OWNER_DECISION_REQUIRED (premise re-verified today; branch rebased onto a0b8abf7, packet in §10)
G-1_EMAIL_DELIVERY            UNKNOWN — 0 real e-mail signups since confirmation went on; no delivery evidence exists yet (§11)
CROSS_PERSON_QUALIFICATIONS   UNAVAILABLE — no safe projection exists; spec in §6
LIVE_CLOCK_BADGE              OWNER_DECISION_REQUIRED (frozen namespace; bounded regeneration)
#1577                         OWNER_DECISION_REQUIRED (49 live vs 58 seeded; still valid)

SAFE_TO_INVITE_WORKERS        YES (after G-1 once)
SAFE_TO_INVITE_COMPANIES      YES (trades)
SAFE_TO_INVITE_AGENCIES       YES (individual supply)
SAFE_TO_INVITE_INSTITUTIONS   NO
```

---

## 9. NEXT_SMALLEST_ACTIONS

1. Owner: *"Apply #1648"* — then the agent walks a real cohort with the E2E
   institution before any school is invited.
2. Owner: sign in once in the Browser pane so the signed-in human walk can run
   (§3.3).
3. Owner: confirm one real e-mail delivery (G-1).
4. Agent, after 1: institution end-to-end walk with nearest opposites; then
   `INSTITUTION_READY` is re-scored from evidence, not from the register.
5. Agent: extend the FAILED-as-EMPTY fix class to `verified-cv.ts` only if
   the owner wants the export surface covered before launch week.

Nothing in this window touched a migration, an RLS policy, a grant or a
production row. No owner decision was resolved by an agent.

---

## 10. #1648 — OWNER DECISION PACKET (after the 2026-09-09 rebase)

State on 2026-09-09 after #1680: `main` = production = `a0b8abf7`. The
#1648 branch was **8 commits behind** and its two migration-count ratchets
conflicted with the supply bridge (277). It was rebased onto `a0b8abf7`,
the ratchets moved 277 → 278 (recounted from the tree: 278 files), and the
result was force-pushed to the same PR branch as `913198a8`. It is still a
**draft** with `needs-human-gate`, **no auto-merge**, **not applied**.

| field | answer |
|---|---|
| WHAT EXACTLY CHANGES | ONE new function `public.update_education_program_v1(uuid, text, text, text, text)` (SECURITY DEFINER, `search_path = public`), one server action, one edit form rendered on every programme card, copy in 5 locales. Nothing else in the schema is touched. |
| WHY IT IS NEEDED | `education_programs` has one policy (SELECT) and one writer (`create_…`). The single live programme has `target_profession_slug = NULL`, so its employer-demand direction reads "no direction" forever and no actor can correct it. Verified live today: function absent, policy list unchanged, row unchanged. |
| WHO GAINS WRITE AUTHORITY | A signed-in user who `manages_organization(v_org)` **where `v_org` is read from the programme row**, and only if that organization holds `organization_roles.role_slug = 'training_provider'`. |
| WHAT THEY CAN WRITE | `name`, `target_profession_slug`, `education_type_slug`, `description` of a programme their own organization created. Slugs are validated against the ACTIVE `professions` / `education_types` catalogues (49 / 9 rows today). |
| WHAT THEY CANNOT WRITE | `organization_id`, `created_by`, `id` (not in the UPDATE list) — a programme cannot be moved or re-attributed; nobody else's programme (org comes from the row, one refusal for "not found" and "not yours"); nothing on any other table. |
| RLS / SECURITY EFFECT | No policy added, changed or loosened. No grant to `anon` or `public` (both revoked by name); EXECUTE to `authenticated` only. The function re-checks `auth.uid()` and the two authorization predicates itself. |
| DATA MIGRATION EFFECT | None at apply time — no row is read or written by the migration. Rows change only when an authorized manager submits the form. |
| ROLLBACK / RECOVERY | `supabase/rollbacks/20260908120000_education_program_correction_v1.down.sql` drops the one function; corrections already made stay as ordinary column values. Complete inverse; prefer fixing forward. |
| TEST EVIDENCE | Guard `education-program-correction-v1.test.ts` (11 assertions: org from the row, three refusals mirror the create path, slug validation against the same catalogues, only four fields updatable, anon/public revoked by name, complete inverse, RED acknowledgement is not an approval, form rendered for every programme, empty direction explained). After the rebase: those 5 guard files pass locally (148 tests), typecheck passes, `migration-safety` STRUCTURAL-GREEN with the 4 expected RED findings (secdef function, grant/revoke, UPDATE in body ×2) acknowledged, not waived. CI on `913198a8` is running at write time. |
| CONCURRENCY / LEDGER | Version `20260908120000` is NOT in the production ledger (head `20260909061411_…`). No other open PR touches `education_programs`, the education functions, or the same version. The only file overlap with `main` since the branch point was the three ratchet guards and the five message catalogues; resolved. |
| RECOMMENDATION | **APPLY.** Smallest possible writer, same authorization shape as the create path it mirrors, additive, reversible, no policy change. It is the one decision between an institution and a correct programme. |

**Exact owner sentence:** `Apply #1648`. On that sentence only: update-branch if
`main` moved again, `apply_migration` via Supabase MCP from the branch head,
read back `update_education_program_v1` exists + policies unchanged, then
mark ready and merge. Nothing else rides along.

---

## 11. G-1 — real e-mail delivery: status and the smallest action

Facts (read today, no mail generated):

* Auth mail leaves production through **Resend custom SMTP**
  (`smtp.resend.com:465`, sender `noreply@labourmarket.ai`, domain verified —
  owner-verified 2026-09-02). Confirmation is required (`mailer_autoconfirm =
  false`).
* Since confirmation went on (2026-09-02 12:40 UTC): **0 real e-mail/password
  signups** (all real accounts are Google), so **no delivery evidence exists**
  — not a failure, an absence of measurement. One unconfirmed `e2e-*` signup
  is residue (its mail bounced, as expected for a non-mailbox).
* No Resend credential is available to an agent (nothing mail-related in
  Vercel env), so provider acceptance / delivery events cannot be read from
  here. Only the Supabase auth log (`user_confirmation_requested`) is visible,
  and that is SENT, not DELIVERED.

**Status: UNKNOWN.** SENT is provable from the auth log; ACCEPTED /
DELIVERED / BOUNCED need either the Resend dashboard or a real inbox.

**Smallest exact owner action (2 minutes):** sign up on
`https://labourmarket.ai/lt/auth/signup` with one real mailbox you can open
(a Hostinger `@labourmarket.ai` box or a personal one), then either click the
link or just say "the mail arrived at hh:mm". The agent then reads the auth
log for that signup (SENT) and records DELIVERED from your word; if nothing
arrives in 10 minutes, the agent reads the auth log for the send attempt and
you check the Resend dashboard for the bounce reason.

Also owner-only, from the same audit: turn on **leaked-password protection**
in Supabase Auth (dashboard toggle; no code).

---

## 12. HUMAN WALK SCRIPT — for the owner's return (execute in this window)

Ground rules: production only; ordinary human path; the owner signs in
themselves; for every screen the questions are *what is this, what can I do,
where do I click, what happens next*. A capability a normal user cannot find
is a defect even if the backend has it. Each defect is captured as route ·
context · intent · expected · actual · screenshot · severity · smallest fix.

**A. Anonymous (5 min)** — landing in LT and EN: understand it in 10 seconds;
type "Esu suvirintojas" / "Ieškau darbo" / "Turime 20 suvirintojų" / "Ieškome
projekto savo brigadai" / "Reikia 6 montuotojų kitą savaitę" / "Atstovauju
agentūrai" / "Atstovauju kolegijai"; check each reading and door; nearest
opposites (need vs have; my history vs our data); language switch over the
map; mobile width once; sign up / log in.

**B. Person (10 min)** — first screen after login: is the sentence carried?
dashboard: what is it telling me? profile: WHO / WHAT I DO / WHAT I DID /
evidence / qualifications / where / when available / services / actions;
CV and history import ("Noriu įkelti savo seną darbo istoriją" → does it land
on MY import, not a company one?); Work Journal entry → recognized skills →
"who can confirm this?"; availability + preferred countries; jobs/matching
for my profession; messages/notifications; log out.

**C. Company (10 min)** — enter the company context (chip, not a second
account); "Reikia 20 suvirintojų nuo spalio Vilniuje" → is the need written
down with role, headcount, place, date, and what happens next?; own workforce
/ people; project/team/work planning; "Norime įkelti savo senus darbo
duomenis" → organization import as ORGANIZATION; candidates for my need;
confirm a worker's journal entry (quick inbox, incl. the new *could not be
read* state only if it ever shows).

**D. Agency (7 min)** — enter as agency (door + context); represent workforce;
"Turime laisvų 7 elektrikų nuo pirmadienio" → supply, not demand; see client
demand; offer people to a need; client/workforce lists; the agency is never
treated as a plain employer.

**E. Institution (7 min, after #1648 is applied)** — enter as
school/college; programme (create, then CORRECT its profession — the #1648
path); cohort; add a learner; learner's practice/evidence; outcomes read;
employer demand for the programme's profession; what the institution cannot
see about a student (privacy boundary).

**F. Cross-cutting (5 min)** — language selector on every surface; one mobile
pass of dashboard + profile + need form; notifications bell; three empty
states and one error/unknown state read as sentences, not as zero; context
switching back and forth; navigation names match what the pages do; one
visual language (typography, cards, buttons, status, forms).
