# Owner action sheet — FINAL COMPLETION (consolidated 2026-09-02, evening)

Every engineering item that could be executed without the owner has been executed (register §1). Target
states are defined in the register §3a: **CORE_PRODUCT_READY** → **COMMERCIAL_LAUNCH_READY** → **REAL_USERS**.
The acceptance definition is not weakened: state 1 is never called state 2.

For every action: exact screen/action · exact value or decision where derivable · time · cost · reversible ·
**what happens automatically after** (the agent continues without a new prompt).

## DO NOW — required to unlock the next execution frontier

| # | Gate | Screen / action | Value / decision (already derived) | Time | Cost | Reversible | Automatically after |
|---|---|---|---|---|---|---|---|
| 1 | **G-1** | **Nothing to configure** — SMTP via the existing Resend team `bandymuks1` is live (owner-verified 2026-09-02). Do the ONE acceptance test in [`email-delivery-gate.md`](../human-gates/email-delivery-gate.md) → "The one real-inbox test": phone, private browser, `https://labourmarket.ai/lt/signup`, one fresh real address, open the mail, land signed in | keep the existing team; do not transfer the domain; do not rotate credentials | 3 min | €0 | n/a | agent reads the auth + Resend evidence (delivered / opened / confirmed), closes G-1, marks Train A complete |
| 2 | **Batch** G-12 + G-15 + G-13 + #1440 | Reply: **"Apply batch 2026-09-02: 1430, 1436, 1426, 1440"** (or a subset) — [`migration-approval-batch-2026-09-02.md`](../human-gates/migration-approval-batch-2026-09-02.md) re-verified against prod today: exact SQL, blast radius, rollback, compatibility, tests, no newer conflict | approve as listed | 3 min | €0 | yes (each has a verbatim rollback) | agent applies via Supabase MCP in order, runs the rolled-back DB proof per item, marks PRs ready, re-probes K2 (RLS), re-runs the F4 accept-invitation chain, checks worker-board attribution |
| 3 | **G-14** | Sign in as the ONE admin account (`su***@gmail.com` — the only `profile_roles.role='admin'`; the owner's `bandymuks1@` account is NOT admin) → `https://labourmarket.ai/lt/dashboard/admin/company-verification` → **E2E Walker UAB** → *Verified*. Alternative: grant admin to your own account first (one owner-only SQL row in `profile_roles`) | set `verification_status = 'verified'` on company `b16e3a86-…` | 2 min | €0 | yes (set back to unverified) | agent runs `h2-demand-board-proof.mjs`: employer demand → worker board (attributed to E2E Walker UAB) → interest → employer sees it = the last M leg; register M → PROVEN |
| 4 | **G-16** | Reply on PR #1433: **"Approved: add 1433 to waiver public-acquisition-route-jobs."** — genuinely owner-gated: the waiver file records that earlier approvals are "NOT a general authority to self-approve future waivers", and the gate models a pre-auth public route as a workspace surface (a constitution category, not process wording) | one line | 1 min | €0 | yes | agent adds the number, CI goes green, auto-merge; JSON-LD (AEO) + the last J3 fix reach prod |

After 1–4 (with the batch applied) the register can declare **CORE_PRODUCT_READY** — nothing then stops an
unfamiliar person from registering, confirming, working and being seen.

## DO BEFORE COMMERCIAL LAUNCH

| # | Gate | Screen / action | Value / decision | Time | Cost | Reversible | Automatically after |
|---|---|---|---|---|---|---|---|
| 5 | **G-7** | Reply on PR #1441: **"Set A"** (recommended: the only owner-confirmed table, #754; feature-based, no metering needed) or an amended table | Set A: workers FREE / AI PLUS €9.99 / VIP MEDIA €24.99 · companies FREE / LAUNCH €99 · agencies €99.99 / €249.99 / €499.99 · LMC 1 = €1 | 2 min | €0 | prices can change later | agent flips `PRICING_READINESS_STATE` to `owner_confirmed` on #1441 and fills `plans.price_eur_monthly` |
| 6 | **G-8** | Stripe (live): products/prices of the table, **Stripe Tax on**, webhook `https://labourmarket.ai/api/billing/webhook` (checkout.session.completed, customer.subscription.*, invoice.*, charge.refunded, charge.dispute.*); Vercel production env: `PAYMENTS_ENABLED=true BILLING_PROVIDER=stripe STRIPE_MODE=live STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY STRIPE_PRICE_* STRIPE_LIVE_ACTIVATION=approved-by-owner`; then approve #1441 | the live path is already built and inert (D3) | 30 min | Stripe fees on real charges only | yes: remove the token → `stripe_live_blocked` | agent proves on prod: checkout → subscription → webhook → entitlement → renewal / cancel / failure (test clocks first, then the smallest live charge + refund) → idempotency replay → customer-visible state; register D → PROVEN |
| 7 | **G-2** | LinkedIn + Meta developer apps per [`social-providers-gate.md`](../human-gates/social-providers-gate.md); paste credentials into Supabase Auth providers | only the console actions that cannot be done from the repo | 45 min + app review | €0 | yes | agent runs the social-auth matrix on prod for each enabled provider (Google already PRODUCTION_PROVEN) |
| 8 | **I2 (one real decision)** | Inner-page navigation: **(A, recommended)** keep the finder-first shell and add a persistent compact workspace strip (3–4 role-aware anchors + the finder) under the header on inner pages — evidence `i1-production-ux-walk` (back-arrow-only chrome reads as dead ends at 1440 px); **(B)** finder-only as today. The other two I2 items were implementation-level and are DONE (#1439: role-aware chips; stale RUOŠIAMA label removed); the Rexora footer stays by the owner directive of 2026-07-14 | A | 5 min | €0 | yes | agent builds A as one bounded PR through the canonical nav registry (no new surface) |
| 9 | **L3 / L2** | Vercel dashboard → Deployments → promote the previous production deployment once and back (rollback drill, `observability-v1.md` §4); optional free external monitor on `/api/health` (the internal GitHub probe every 15 min is live from #1439) | — | 15 min | €0 | yes | agent records the drill timing in the register; L → PROVEN |

After 5–9: **COMMERCIAL_LAUNCH_READY**.

## SAFE TO DEFER AFTER LAUNCH

| # | Gate | Action | Why deferrable | Time |
|---|---|---|---|---|
| 10 | **G-3 / G-4 / G-5 / G-6** (#1421) | Approve the DB lifecycle pack (retention dry-run, 2 unused indexes, ESCO locale scope) | serving already excludes expired vacancies (B1); 795 MB is footprint, not a measured capacity blocker | 10 min |
| 11 | **G-9** | Approve the cleanup pack for the tagged test residue (`e2e-*@labourmarket.ai`: 6 identities, 1 company/org, their rows) | isolated + tagged; excluded from metrics; no real user can meet it | 5 min |
| 12 | **G-10** inherited RED drafts | classified below — no ambiguous bucket left | — | per PR |

### G-10 classification (inherited drafts)

| PR | Content | Class | Action |
|---|---|---|---|
| #1046 | worker-board org attribution | **REQUIRED_FOR_LAUNCH → SUPERSEDED by #1440** (current-equivalent port, in the batch) | close #1046 after #1440 applies |
| #1045 | founder admin-grant path (service_role column grants) | **POST_LAUNCH** — the admin path works through the existing admin account; a second admin is one owner SQL row | keep as draft |
| #1266 | ai_runs de-linking (privacy retention of the profile FK) | **DO BEFORE COMMERCIAL LAUNCH** (privacy hygiene for real users; no product dependency) | rebase + apply with the next batch |
| #1355 | ESCO canonical linkage (67 rows, 3-language proof) | **POST_LAUNCH** (vocabulary widening) | keep as draft |
| #883 | assistant transcript persistence | **POST_LAUNCH** (stacked on the extracted #879; product value unproven) | keep as draft |
| #740 | voice journal jobs | **POST_LAUNCH** (voice input path; E2 chat/file/XLSX/MCP paths proven) | keep as draft |
| #895 | canonical commercial system v1 (catalogue.ts) | **SUPERSEDED** by the three-registry model on main | REJECT/CLOSE |
| #896, #897 | financial safety layer / Business Health Engine | **POST_LAUNCH** (observe real usage first; the cost ledger is live) | keep as drafts |
| #1421 | DB lifecycle pack | **SAFE TO DEFER** (item 10) | approve later |
