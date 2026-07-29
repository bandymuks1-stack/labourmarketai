# Labourmarket.ai — Delivery Loops v1

**Date:** 2026-07-22
**Derived from:** AUDIT LOOPs 0–7 (`docs/audits/labourmarketai-*-v1.md`)
**Baseline HEAD:** `664b9ab9` (main, clean tree)

> **Execution rule.** One loop = one clearly defined outcome. A single PR may never mix a
> large UX redesign, a database migration, a LIVE Stripe change, an AI-model change, broad
> refactoring, or a new commercial model. Each loop below is sized so that it can be
> reviewed, verified in production, and rolled back on its own.

**Ordering rule.** Loops are ordered by the priority register
(`docs/audits/labourmarketai-priority-register-v1.md`). Do not start a loop whose
dependencies are unmet. Do not open a second loop in the same file cluster in parallel.

---

## LOOP L0 — Anonymous authorization bypass (P0, SECURITY)

**Problem.** Seven `SECURITY DEFINER` RPCs are executable by the `anon` role *and* their
ownership check is NULL-unsafe, so an unauthenticated caller passes it. Verified in
production against the live function definitions and by rolled-back probes.

**Evidence.**
```
delete_contract_v1 · delete_proposal_v1 · delete_marketplace_listing_v1
set_contract_status_v1 · set_proposal_status_v1 · set_marketplace_listing_status_v1
update_marketplace_listing_v1
```
all satisfy `has_function_privilege('anon', oid, 'EXECUTE') = true` **and** contain
`if v_owner <> auth.uid() then raise exception 'not authorized'`. For `anon`,
`auth.uid()` is NULL, `v_owner <> NULL` evaluates to NULL, PL/pgSQL treats NULL as
false, the exception never fires, and the `UPDATE`/`DELETE` proceeds with definer
privileges. Live proof (rolled back, zero rows left):
`set_listing_status=NO_ERROR status_now=closed`.

Root cause of the exposure: 161 migrations contain only 4 `revoke execute` statements;
`GRANT EXECUTE … TO authenticated` was used without `REVOKE EXECUTE … FROM PUBLIC`, so
PostgreSQL's default `PUBLIC` grant survives on 54 functions.

**Desired outcome.** No unauthenticated caller can invoke any RPC that was not explicitly
designed for `anon`; and no ownership check can be defeated by a NULL identity.

**Scope.**
1. `REVOKE EXECUTE … FROM PUBLIC` on all 54 affected `SECURITY DEFINER` functions.
2. Re-grant `EXECUTE` to `authenticated` where intended; leave the 4 intentionally-public
   functions (`submit_company_need_public_v1`, `get_public_business_profile_v1`,
   `get_public_business_listings_v1`, `get_public_business_services_v1`) explicitly
   granted to `anon`.
3. Harden the check itself in the 7 exploitable functions **and** the latent 8th
   (`conversation_counterpart_identities`, same bug, not anon-reachable today):
   `if auth.uid() is null or v_owner is distinct from auth.uid() then raise …`.
4. Add `if v_owner is null` / explicit-caller guards to the 3 `create_*_v1` functions
   that have no authorization logic at all.

**Non-goals.** No new features. No RLS policy rewrite. No change to the 19 functions that
already fail closed via `if not exists(...)`.

**Files/components.** New migration `supabase/migrations/<ts>_secdef_grant_hardening_v1.sql`
+ paired `supabase/rollbacks/<same>.down.sql`. Source migrations to correct:
`20260718190000_commercial_crm.sql:120,137,173,184`,
`20260718210000_marketplace_listings.sql:125,148,159`.

**Data/migration impact.** Grant + function-body changes only. No table, column, or row is
touched. Classified **RED** by `migration-safety` (contains `GRANT`/`REVOKE` and
`SECURITY DEFINER`) → draft PR + `needs-human-gate` label + explicit owner approval, per
`AGENTS.md`.

**Security/privacy impact.** Removes a live unauthenticated write path. Strictly
restrictive; nothing is widened.

**Acceptance criteria.**
1. `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')` returns **4**, and those 4 are the intended public ones.
2. Re-running the rolled-back anon probe against each of the 7 returns an explicit
   authorization refusal, not `NO_ERROR`.
3. No `SECURITY DEFINER` function in `public` compares identity with `<>`/`!=` against
   `auth.uid()` — assert via a catalog query in a guard test.
4. `docs/APPLIED_LEDGER.md` lines 34/36/82/84/88 are corrected — they currently claim
   "authenticated only, no anon", which was false.

**Test plan.** Catalog assertions above as a repeatable SQL script; per-function
rolled-back `DO $$ … RAISE EXCEPTION $$` probes as `anon` and as a non-owner
`authenticated` user; existing suite must stay green.

**Production verification.** Run the catalog query and the 7 probes against prod after
apply; record output in the task log per `AGENTS.md` §Migrations (d).

**Rollback.** Paired `.down.sql` restoring prior grants and function bodies. Note the
rollback re-opens the hole — it is for structural failure only.

**Owner gate.** **YES — RED migration.** Owner approves and the apply is recorded.

**Definition of Done.** Acceptance 1–4 verified against production, output recorded,
ledger corrected, guard test in CI.

> **Blast radius today is zero** — `contracts`, `proposals` and `marketplace_listings` all
> hold 0 rows. The path arms itself the moment the first real record is created. Fix
> before any commercial pilot writes data.

---

## LOOP L1 — Signup consent & privacy notice (P0 candidate, LEGAL)

**Problem.** The signup form presents no privacy policy, no terms, and no consent
control, although both documents exist and return 200. Personal data is collected at that
moment (GDPR Art. 13 requires the notice *then*).

**Evidence.** Full accessibility-tree capture of `/lt/auth/signup` — the form contains
only: heading, Google button, email, password, repeat password, submit, login link.

**Desired outcome.** No account can be created without the privacy notice and terms being
presented, and the acceptance being recorded.

**Scope.** Add linked notice + acceptance to both registration paths (email/password *and*
Google). Write a consent event using the **existing** `privacy_consent_purposes` /
`privacy_consent_events` machinery (already in production, append-only by trigger, and
already gating `workers` RLS — do not build a second consent system).

**Non-goals.** No redesign of the auth pages. No new consent taxonomy. No cookie banner
(that is L2).

**Files.** `apps/web/app/[locale]/auth/signup/*`, the signup form component,
`messages/{lt,en,ru}.json`, a new guard test.

**Data/migration impact.** None expected — verify the two consent tables and their write
RPC cover registration; if a new purpose slug is required, that is an additive registry
insert and becomes a separate owner-gated step.

**Acceptance criteria.** (1) Privacy + terms linked and reachable from signup in lt/en/ru.
(2) A consent event row is written on registration. (3) A guard test fails if the signup
form renders without both links. (4) Same for the Google path.

**Test plan.** Guard test asserting both links render; integration test asserting a consent
row is written; manual lt/en/ru check.

**Production verification.** Owner (or a disposable account) registers once; confirm one
`privacy_consent_events` row and both links visible.

**Rollback.** Revert the PR — purely additive UI.

**Owner gate.** Confirm the legal wording. **Also required first:** confirm whether
`/onboarding` already captures consent (not observable in this audit). If it does, this
becomes P1 "notice presented too late" and the scope shrinks to moving it earlier.

**Definition of Done.** All four acceptance criteria green; legal wording owner-approved.

---

## LOOP L2 — Cookie consent + honest retention copy (P0/P1, LEGAL)

**Problem.** Analytics and a `sessionStorage` identifier fire for anonymous visitors with
no cookie consent mechanism, while the cookie policy page states the opposite. Separately,
journal copy promises 30-day voice retention and a delete control that do not exist:
`pg_cron` is not installed, there is no CI/Vercel cron, and three expiry RPCs have zero
callers.

**Desired outcome.** What the product does and what the product says about data are the
same thing.

**Scope.** (a) Consent gate before any non-essential analytics/identifier fires, or remove
the non-essential tracking. (b) Correct every retention/deletion promise in product copy to
match reality, **or** implement the scheduler. Choose per promise — do not ship copy that
outruns the system.

**Non-goals.** No new analytics vendor. No erasure implementation (that is L6).

**Acceptance criteria.** No non-essential cookie/identifier is set before consent; the
cookie policy matches observed behaviour; no UI promises a retention period or delete
control that no code enforces.

**Owner gate.** Legal wording; decision on whether to keep the analytics at all.

**Rollback.** Revert; both halves are additive/copy.

---

## LOOP L3 — Honest landing metrics (P1, TRUST)

**Problem.** Four hero counters are hardcoded placeholders with synthetic ▲▼ deltas.
Displayed 312 worker profiles vs **27** real; 47 opportunities vs **17** real.

**Evidence.** `apps/web/components/app/market-counters.tsx:8-10` — *"No real data — the
motion is the point (the values are governed placeholders)."* Values from
`apps/web/content/placeholders.ts`; delta computed by differencing the hardcoded cycle
(`market-counters.tsx:38-43`).

**Desired outcome.** No number on a public page is invented.

**Scope.** Replace with live counts (with an as-of date) or remove the block. Prefer real
small numbers — for a pilot they read as credible, not weak.

**Non-goals.** No landing redesign. Do not touch the EU statistics section (it is a
strength).

**Acceptance criteria.** (1) No public page renders a value originating from
`placeholders.ts`. (2) A guard test fails if `market-counters` renders a non-live value.
(3) If real counts are shown, an as-of date is shown.

**Rollback.** Revert — presentational only. **Owner gate:** none (removing a false claim
does not need approval). Effort **S**.

---

## LOOP L4 — Sector breadth v1 (P1, CONVERSION + POSITIONING)

**Problem.** All 39 public work types are manual labour; the escape hatch is labelled
*"Kita / pagalbinis darbas"* (**auxiliary** work). **31 of 49 professions (63%) already in
the production database are unreachable from any public surface** — including
`software_developer`, `teacher`, `office_administrator`, `receptionist`, `recruiter`,
`translator`, `sales_assistant`. Independently, LOOP 4 measured the data itself as
construction-first: **94 of 153 skills (61.4%)** and **18 of 49 professions (36.7%)** are
construction; healthcare has 3 skills and 1 profession, education 2, creative 1, IT 4.

**Desired outcome.** A non-manual employer or worker can represent themselves without
choosing "other".

**Scope.** (1) Extend `WORK_CATEGORIES` to cover the professions the DB already holds,
adding IT & digital, healthcare & medicine, education & training, office & administration,
finance & accounting, sales & customer service, engineering & technical, creative & media.
(2) Rewrite the landing sector list so at least half the visible examples are non-manual.
(3) Relabel the catch-all to a neutral "Kita". (4) Make `professions` the single source of
truth, or add a CI guard asserting parity.

**Non-goals.** No skill-lexicon expansion (that is L7 — much larger). No ESCO wiring (L8).
No migration.

**Files.** `apps/web/lib/taxonomy/work-categories.ts`, landing sector copy,
`messages/{lt,en,ru}.json`, a new parity guard test.

**Data/migration impact. NONE** — `profession` is stored as a free string (`z.string()`),
stated at `work-categories.ts:11-15`. Fully backward compatible; existing slugs unchanged.

**Acceptance criteria.** (1) Every slug in `professions` is selectable in the need form and
worker intake. (2) A guard test fails when `professions` gains a slug absent from the
taxonomy. (3) Accountant / nurse / software developer / teacher needs are expressible
without "Kita".

**Rollback.** Revert — config + copy only. **Owner gate:** none for the taxonomy; the
landing copy rewrite should be owner-reviewed as positioning text. Effort **S**.

---

## LOOP L5 — Matching promise alignment (P1, TRUST) — copy first, engine later

**Problem.** Three public surfaces disagree. Landing: *"Realių įgūdžių ir darbo poreikių
atitiktys."* Pricing: *"Čia dar nėra automatinės darbo biržos ir automatinio parinkimo —
atranką koordinuoja žmogus."* `/match-preview`: inputs are one trade + country + date +
accommodation + transport + languages — **no skills field exists**.

**Scope (L5a, do now, effort XS).** Make the landing page tell the pricing page's truth.
"Human-curated matching during early access, built on real skill records" is accurate and
more credible than an automation claim the product cannot demonstrate.

**Scope (L5b, later, effort L — separate loop, do not mix).** Feed confirmed
`worker_skills` / `profile_skill_claims` / journal evidence into the match and show
per-factor explanations. Prerequisites surfaced by LOOP 4: Haversine distance is dead code
(no read layer sets lat/lng/radius, so geography is country string equality); documents /
permits / visas are never scored at all despite cross-border EU labour being the core use
case; language is a hard eligibility block with no proportionality gate (a nationality-proxy
discrimination risk that must be addressed in the same loop).

**Acceptance criteria (L5a).** No public page promises automatic or skills-based matching
that the engine does not perform.

**Owner gate.** Positioning copy. **Rollback.** Revert.

---

## LOOP L6 — Skill provenance honesty (P1, TRUST + DATA INTEGRITY)

**Problem.** Three related defects found by LOOP 4:
1. `apps/web/lib/.../skill-pipeline.ts:483-500` **auto-writes `worker_skills`** for exact
   and synonym lexicon hits with no confirmation, stamped `source:'self_declared'` — a
   false provenance claim. A nursing-medication entry auto-persisted `elderly-care`.
2. The confidence dot is decorative: `confidence_bin` is a hardcoded `"yellow"`; all 33
   production rows have `confidence_score = 0` and `last_recompute_at = NULL`, yet 13
   render green/amber on the CV.
3. The CV provenance badge renders **raw i18n keys** — `journal.cv.verified` /
   `journal.cv.declared` exist in none of the 12 locales; the guard only checks a third
   key, so CI stays green.

This directly violates the repo's own doctrine (`AGENTS.md`: *no fake verification, no
fake AI*).

**Desired outcome.** Every skill shown carries a truthful provenance and a truthful
confidence, or none is shown.

**Scope.** Stop auto-persisting unconfirmed recognitions, or persist them in an explicitly
"suggested / unconfirmed" state that the worker confirms (the confirm/correct/reject
pattern already exists elsewhere in the product). Either compute `confidence_score`
honestly or remove the confidence dot. Add the two missing i18n keys and widen the guard.

**Acceptance criteria.** No `worker_skills` row is created without an explicit user act, or
its state is visibly "unconfirmed". No confidence indicator renders from a hardcoded bin.
No raw i18n key renders anywhere on the CV, asserted by a guard covering **all** provenance
keys in **all** shipped locales.

**Owner gate.** Decide whether existing auto-created rows are corrected or grandfathered —
this touches real worker data (33 rows). **Rollback.** Revert code; a data correction needs
its own reversible step.

---

## LOOP L7 — GDPR erasure + retention execution (P1, LEGAL)

**Problem.** Erasure is **PARTIAL** — request intake exists, but there is zero deletion
code and no storage-object cleanup would run even on a manual cascade. Retention is
**DOCUMENTED_ONLY** — `pg_cron` is not installed, no CI/Vercel cron exists, and three
expiry RPCs have no callers.

**Scope.** Implement a real erasure path (DB rows + storage objects + a verifiable
completion record) and a real scheduler for the expiry RPCs.

**Non-goals.** Do not widen any RLS policy. Do not delete anything outside the subject's
own data.

**Acceptance criteria.** A test subject's erasure request results in verified removal
across every table and bucket holding their data, evidenced by a post-run query; the
retention RPCs are invoked on a schedule and their effect is observable.

**Data/migration impact.** HIGH — destructive by design. **Owner gate: YES, mandatory.**
Must be exercised against a disposable account only. Never run against real pilot users
without explicit per-run approval.

**Rollback.** Deletion is irreversible — this loop ships behind an explicit dry-run mode
first, reporting what *would* be deleted, and only then a live mode.

---

## LOOP L8 — Commercial contract coherence (P1, LAUNCH BLOCKER)

**Problem.** Seven plan names are live in production across **two disjoint catalogues**
with zero shared slugs (DB `free/business/agency/enterprise` vs code
`free_worker/worker_plus/company_pilot/agency_pilot/admin_internal`), all four DB plans
have `price_eur_monthly = NULL`, and the only real prices on the site are five
AI-automation packages at €600–€1,900 that map to no plan, no entitlement, no Stripe
price and no terms. Terms of Service declare that UAB "Nonstop Group" sells and invoices
but contain **no price, payment, renewal, cancellation, refund or consumer-withdrawal
clause**, while €900+ packages are advertised.

**Scope.** One plan taxonomy, one source of truth, one page. Reconcile or remove the
AI-automation package pricing. Add the missing commercial clauses to the Terms.

**Non-goals.** **No LIVE Stripe change. No flag flip. No payment activation.** Payments
being off is currently a *protection* — LOOP 5 verified four independent blocks and that
the chain has never run (all billing tables 0 rows).

**Acceptance criteria.** Exactly one plan set renders publicly; every advertised price maps
to a defined entitlement and a Terms clause; no price is advertised without payment,
cancellation and withdrawal terms.

**Owner gate.** **YES — pricing, legal text, and the decision on whether the AI-automation
packages belong on this domain at all.**

---

## LOOP L9 — Entitlement enforcement (P2, prerequisite for any paid launch)

**Problem.** Enforcement is effectively zero: 12 of 19 feature keys have no check; the
single billing gate (`booking_requests`) is bypassed by `if (!ctx.enforced) return true`
and `enforced` is never true; two parallel entitlement engines exist and
`gateFeature`/`gateFeatureBySlug` have zero non-test callers. **Turning Stripe on today
would not create a paid product** — it would take money and grant nothing.

Also fix the two defects LOOP 5 found: Stripe `paused` → `past_due` → entitled grace (a
paused subscription keeps paid access indefinitely), and the UNIQUE
`(owner_id, plan_key, provider)` vs upsert `onConflict (provider, provider_subscription_id)`
mismatch that makes re-subscription after cancellation error into a swallowed HTTP 200
(paid-but-not-entitled, invisible in Stripe).

**Owner gate.** Must complete **before** any payment activation. Sequence: L8 → L9 → then
and only then a commercial gate decision.

---

## LOOP L10 — Field examples & onboarding comprehension (P2, CONVERSION)

**Problem.** 2 of 9 free-entry fields on the employer need form carry a concrete example,
and the field that determines output quality — the free-text description feeding the draft
generator — has none. Onboarding is described in abstractions ("Pradėkite erdvę", "Kurkite
tapatybę") and nothing concrete is visible before registration.

**Scope.** A worked example under the description field (strong vs weak, contrasted);
short examples on the remaining 7 fields; step names rewritten as concrete actions with
time estimates. Reuse the existing clearly-labelled-example pattern
(`messages/lt.json:4255` `conceptNote`).

**Acceptance criteria.** Every free-entry field has a placeholder or helper example; the
description field has an expandable worked example in lt/en/ru.

**Owner gate.** None. **Effort S.** Highest comprehension gain per hour after L3/L5a.

---

## LOOP L11 — Supabase Auth hardening (P2) — owner-only, ~15 minutes

Enable leaked-password protection (HaveIBeenPwned) and reduce OTP expiry below one hour in
the Supabase dashboard. Currently the app enforces cosmetic complexity (8+, uppercase,
digit, special) while `Password1!` — present in every breach corpus — is accepted. MFA is
also unenrollable (0 factors across 27 users).

**This is pure configuration, no code, no deploy, and it is the single best
value-per-minute item in the audit.** **Owner gate: YES** (dashboard access).

---

## LOOP L12 — Anonymous PII intake abuse protection (P2)

Public intake, `/api/leads` (service-role, RLS-bypassing) and `/api/waitlist` accept
unbounded anonymous PII, and **no captcha or honeypot exists anywhere in the repo**. Also
fix `waitlist_insert_anon` (`rls_policy_always_true`) and the `organizations_select
USING (true)` policy that lets any authenticated user read every organization's contact
email and phone, ignoring `public_profile_enabled`.

---

## LOOP L13 — Repo & queue hygiene (P2/P3)

Reconcile `CLAUDE.md` vs `AGENTS.md` (they give opposite production-migration
instructions); correct the stale `docs/DEPLOYMENT.md` (it claims the database is empty and
unmigrated); commit a `.env.example` (the documented bootstrap references a file that does
not exist); close or rebase the 8 stale audit/plan PRs and resolve the 2 conflicting ones
(#831, #798); make `audit_logs` genuinely append-only (two schema comments claim it is; no
blocking trigger exists and an `updated_at` BEFORE UPDATE trigger does); add a dependency
audit step to CI (currently 0 critical / 5 high / 3 moderate / 1 low, with `sharp` and
`postcss` reaching production).

---

---

## LOOP L14 — Outbound notification channel (P1, promoted by owner directive 2026-07-22)

**Problem.** **The product has no way to tell anyone that anything happened.** No email, no
push, no SMS exists anywhere in the codebase. `sendMessage` performs no outbound call, and
repo guards actively *forbid* mail/push SDKs. Invitation email is code-complete but
unconfigured, so its delivery state is permanently `not_sent` — in practice the product is
manual link-sharing.

**Evidence.** LOOP 3 §7–§8. Corroborating scale: **22 shipped, navigation-linked modules
hold zero production rows**; `conversations` = 2; canonical `invitations` = 0 rows while the
legacy `company_worker_invitations` holds 4.

**Why this outranks further UX work.** Every one of those 22 modules requires a human to
discover that something changed. A booking request, a message, an invitation, a confirmed
skill and a demand match are all *events addressed to an absent person*. Without a channel,
no amount of interface improvement can produce a second session, and no funnel metric can
show retention because no mechanism exists that could create it.

**Desired outcome.** One reliable, consented outbound channel carrying a small number of
genuinely event-driven notifications — nothing more.

**Scope.**
1. Choose and configure one transactional email provider. Wire the **existing**
   invitation email first — it is already written and only lacks configuration, so it is
   the cheapest possible proof the channel works end to end.
2. Add a minimal, explicitly-chosen event set. Candidates, in order of evidenced value:
   invitation received · new message in a conversation · demand-interest acknowledged ·
   booking/enquiry response. **Not** a digest, **not** marketing, **not** a notification
   for every table.
3. Per-user notification preferences and a working unsubscribe, wired to the existing
   consent machinery (`privacy_consent_purposes` / `privacy_consent_events`).
4. Honest delivery state: record sent/failed and surface it. Never display `sent` for
   something that was not sent — the repo already has the `not_sent` vocabulary for this.

**Non-goals.** Push and SMS (later, if email proves the loop). Marketing email of any kind.
Any outbound message to a person who has not consented. Bulk or scheduled sends.

**Data/migration impact.** Likely a small additive notification-log table plus preference
storage → owner-gated migration. Design it so the channel works before the table exists
(degrade honestly), consistent with how the rest of the codebase handles unapplied
migrations.

**Security/privacy impact.** HIGH and must be designed first, not retrofitted: email
addresses leaving the system, consent basis per notification type, unsubscribe honoured
server-side, no PII in subject lines, no enumeration oracle in delivery errors. Coordinate
with **L1/L2** — consent must exist before the first send.

**Acceptance criteria.** (1) A real invitation reaches a real inbox, with a recorded
delivery state. (2) A user can turn each notification type off and it stops. (3) No
notification is sent without a consent basis. (4) No UI displays a delivery state that
did not occur.

**Test plan.** Provider sandbox for unit/integration; one end-to-end send to an owner-
controlled address; guard test that no send path bypasses the preference check.

**Production verification.** One real invitation delivered end to end, evidenced.

**Rollback.** Feature-flag the channel off; the product returns to today's behaviour.

**Owner gate.** **YES** — new external provider, new secret, and the first outbound
messages the product has ever sent. Also confirm the sender domain/DKIM.

**Definition of Done.** A real human receives a real notification about a real event, with
consent recorded and an unsubscribe that works.

---

## Sequencing

**Owner-set order (2026-07-22): security → fake metrics → signup legal notice →
notifications.**

```
NOW (owner-gated, minutes)      L11
NOW (P0)                        L0 ──► L1 ──► L2
THEN (P1, cheap, no gates)      L3 ──► L5a ──► L4 ──► L10
THEN (P1, first NEW capability) L14  ◄── outbound notifications
THEN (P1, needs decisions)      L6 ──► L8 ──► L7
LATER (P2)                      L9 ──► L12 ──► L13
MUCH LATER (P1 engine work)     L5b (evidence-weighted matching)
```

**L14 is the first new capability built.** Everything before it removes an untruth or
closes a legal/security gap; L14 is the first thing that adds something the product does
not have. Nothing else new is built until a real notification reaches a real person.

L3, L5a, L4 and L10 are all **S/XS effort, no migration, no owner gate** and together
address every piece of tester feedback. They should ship as four small PRs in one week.

**Do not** begin L5b, ESCO wiring, or lexicon expansion until the pilot has enough real
users for the result to be measurable — see
`docs/plans/labourmarketai-30-60-90-day-plan-v1.md`.
