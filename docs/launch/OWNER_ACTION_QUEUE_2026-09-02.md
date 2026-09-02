# Owner action queue — FINAL COMPLETION return (2026-09-02)

Every engineering item that could be executed without the owner has been executed (register §1). What
remains is blocked **exclusively** by the gates below, ordered by leverage. "Cost" is the owner's time.
Each line: screen / action · why · what it unlocks · cost · reversible.

| # | Gate | Screen / action | Why | Unlocks | Cost | Reversible |
|---|---|---|---|---|---|---|
| 1 | **G-1** | Supabase → Authentication → SMTP settings: enter a transactional provider (Resend / Postmark / SES) and set the confirmation template per `docs/human-gates/email-delivery-gate.md`; then register ONE real address and confirm it | the built-in mailer is rate-limited; until a real confirmation e-mail is proven, no unfamiliar person can finish registration — the only launch blocker of its class | Train A delivery leg; invitations by e-mail; every real user | 20 min + provider account | yes (revert SMTP) |
| 2 | **G-16** | Reply on PR #1433 approving the one-line waiver extension (`public-acquisition-route-jobs` += 1433) | the `/jobs` route is PR-scoped by the product gate on purpose; the PR carries the JSON-LD (AEO) and the last accessibility fix | Train K3 + J3 completion | 1 min | yes |
| 3 | **G-12** | Approve + apply RED draft #1430 via Supabase MCP `apply_migration` (SQL in the PR body) | closes the open P1: any signed-in user can read every company's contact columns today | K2-1 fix on prod | 5 min | yes (rollback restores the grant) |
| 4 | **G-15** | Approve + apply RED draft #1436 (SQL in the PR body) | invitation accept binds the organisation membership; without it every rostered worker needs a manual `add_org_member` before timesheets | worker self-service timesheets | 5 min | yes (previous body verbatim) |
| 5 | **G-13** | Approve + apply RED draft #1426 | the PLAN primitive (`work_plan_entries`) — who works where from D1 to D2; UI already merged, dormant until applied | Train F plan on prod | 5 min | yes (additive) |
| 6 | **G-14** | Admin → verify the bounded test employer `E2E Walker UAB` (one click / RPC) | the admin RPC refuses everyone else, even service_role; the only unproven leg of Train M (employer demand → worker board → interest → engagement) needs it | Train H2 + the last M leg | 2 min | yes |
| 7 | **G-4 / G-3 / G-5** | Approve the DB pack `docs/human-gates/db-lifecycle-gate.md` (RED draft #1421): retention run for 25,635 expired vacancies (dry-run first), drop 2 unused indexes, ESCO locale scope | 96.6 % of the 789 MB is import data; serving already excludes expired rows (B1), this is footprint only | Train B; postpones **G-6** (plan upgrade) | 10 min | dry-run + reversible; ESCO re-importable |
| 8 | **G-7 → G-8** | Confirm the ONE price table (`docs/human-gates/payments-price-table-gate.md`), then Stripe live keys + webhook secret + the RED PR that lifts the live block | production billing reads `stripe_live_blocked` by design; no test keys exist anywhere | Train D | 30 min + Stripe | keys rotate |
| 9 | **G-2** | LinkedIn + Meta developer apps per `docs/human-gates/social-providers-gate.md` | Google is live; the other providers have zero runtime config | Train C | 45 min + app review | yes |
| 10 | **G-9** | Approve the cleanup pack for `e2e-*@labourmarket.ai` (now 6 identities incl. the learner, + 1 test company/org) | hygiene; `pilot_events` FK needs a scoped migration | none (metrics stay clean either way: identities are tagged) | 5 min | n/a (deletion) |
| 11 | **G-10** | Approve / close the older RED drafts (#1355, #1266, #1046, #1045, #883, #740 voice) and the commercial PRs #895–#897 | inherited queue; #740 gates the voice input path | as listed | per PR | per PR |
| 12 | **L2 / L3** | Free external uptime monitor on `/api/health`; run the promote-previous-deployment drill once from the Vercel dashboard (`docs/operations/observability-v1.md` §4) | the agent's Vercel CLI is blocked; only the owner can prove the rollback path | Train L | 15 min | yes |
| 13 | **I2** | Three visible decisions: persistent inner nav vs finder-only; role-aware chip vocabulary; RUOŠIAMA label + Rexora footer | product-visible choices the doctrine leaves to the owner | Train I close | 10 min | yes |

After 1–6 the register can be flipped to **LAUNCH_READY** (the remaining rows are footprint, payments,
extra providers and hygiene — none stops a real user from registering, working and being seen).
