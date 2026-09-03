# NEW WINDOW HANDOFF — 2026-09-03 (final technical state of the A+B+C window)

> **Addendum (window 2, later on 2026-09-03):** the newest state is the
> "UPDATE — window 2" block at the top of `RESUME_CHECKPOINT_2026-09-03.md`.
> Two facts override §2 below: (1) the batch-B education tables were
> **unreadable in production** for every authenticated user (`42P17` policy
> recursion) — **fixed: RED batch D applied 13:04 UTC** (ledger
> `20260903130400`, #1457 merging); (2) the
> Lane A chain A4–A8 is PROD-PROVEN at the DB level (rolled back). #1458
> (student cohort view) is merged.

> Written at the close of the window that reviewed, applied, merged and
> deployed RED batch 2026-09-03 A+B+C. A new agent window starts from THIS
> file plus `OWNER_ACTION_QUEUE_2026-09-03.md` and `PILOT_LANES_2026-09-03.md`.
> It does NOT need the previous conversation and must NOT re-run the full
> product-vision audit (`docs/audits/FULL_PRODUCT_VISION_AUDIT_2026-09-03.md`
> is the record) or any proof listed as PROD VERIFIED below.

Canonical root `C:\Users\Mano\Documents\labourmarketai`, branch `main`,
Supabase project `gorgitwvdzxbnaxhrsrw`, production `https://labourmarket.ai`.

## 1. Production truth at hand-off (verified, not inferred)

| Item | Value |
|---|---|
| `main` | `e2271d0a` (docs) on top of `8d3e7dec` (last code merge) — verify `git log origin/main -3` |
| Production build | **`8d3e7dec`** — `/api/health` → `{"ok":true,"build":"8d3e7dec","region":"dub1","checks":{"auth":{"ok":true,"ms":314},"db":{"ok":true,"ms":577}}}` at 11:50 UTC |
| Migration count in repo | 261 (`SPRINT_BASELINE = 261`, market-map ratchet 261) — any new migration bumps both ratchets by design |
| Temp worktrees | none — `wt-red`, `wt-red-b`, `wt-red-c` removed after merge (each: 0 diff, 0 untracked, 0 unpushed). Stale `.claude/worktrees/agent-*` predate this work — leave them; **run vitest from `apps/web`** |
| Local processes / tabs | none |

## 2. RED batch 2026-09-03 A+B+C — APPLIED + MERGED + PROD VERIFIED

Owner approval sentence: **"Apply batch 2026-09-03 A+B+C"** (after the owner-requested final security review; fixes recorded in each PR body).

| Batch | Migration (repo name) | Prod ledger | PR → merge commit | Readback on production |
|---|---|---|---|---|
| A1 | `20260903100000_public_vacancy_supply_counts_v1` | `20260903105726` | #1448 → `6255e28e` | cron `public-vacancy-supply-counts-10min` (`*/10 * * * *`, active); row `46487/8817`; `count_public_vacancies_v1()` reads the row, `proconfig = search_path=public,work_mem=64MB`; table RLS on, 0 policies, anon SELECT = false; anon EXECUTE on refresh = false (ACL postgres + service_role only); anon EXECUTE on count = true (unchanged) |
| A2 | `20260903101000_agency_candidate_offer_decision_v1` | `20260903105753` | #1448 → `6255e28e` | status CHECK = `offered/withdrawn/accepted/declined`; columns `booking_id, decided_at, decided_by, decision_note`; `respond_agency_candidate_offer_v1` + `list_agency_offered_candidates_for_request_v2` ACL = authenticated only; `uq_offer_active` partial unique intact; 0 offers in prod (no data touched) |
| B | `20260903120000_education_programs_cohorts_v1` | `20260903105839` | #1454 → `1f6703fa` | `education_programs / education_cohorts / education_cohort_members` RLS on, one SELECT policy each, authenticated INSERT = false, anon SELECT = false; 3 definer commands ACL = authenticated; `count_public_vacancies_by_profession_v1(p_limit integer)` ACL = **authenticated only** (anon withdrawn), `work_mem=64MB`, covering index `public_vacancies_active_profession_cover_idx` present (7.2 s → 176 ms measured); top-3 `caregiver=4602, teacher=1782, cleaner=1234` |
| C | `20260903140000_institution_learner_outcomes_v1` | `20260903105902` | #1456 → `8d3e7dec` | `institution_learner_outcomes_v1(uuid)` ACL = authenticated; anon = false; suppression threshold **5** in body; aggregates only |

Cross-cutting: anon-executable SECURITY DEFINER set unchanged (8 functions:
`count_public_vacancies_v1`, `get_public_business_listings_v1`,
`get_public_business_profile_v1`, `get_public_business_services_v1`,
`get_public_vacancy_preview_v1`, `list_public_vacancy_sitemap_v1`,
`search_public_vacancy_previews_v1`, `submit_company_need_public_v1`).
Rollbacks: `supabase/rollbacks/20260903{100000,101000,120000,140000}_*.down.sql`
(A2 and B guarded — refuse while decided offers / programme rows exist).

Security-review fixes that shipped before apply (prod-verified in rolled-back probes):
1. `CREATE OR REPLACE FUNCTION` does **not** preserve `SET` config → `work_mem` re-stated in A1 body and rollback.
2. A1 fallback is `where not exists … having not exists …` (One-Time Filter, live aggregate never executed while the row exists; exactly one row either way).
3. B per-profession count: covering index + authenticated-only grant; anon-allowlist entry removed.
4. C suppression 3 → 5.

CI path lessons (already handled, do not repeat): RED migrations need `-- @human-gate-approved` for `migration-safety` to pass; `lib/guards/booking-engagement-end-v1.test.ts` pins the annotated-migration set (append new files); `lib/guards/no-user-facing-missing-backend-copy.test.ts` forbids "waiting on a DB update" copy in product namespaces — the programmes UI lost its `needs-migration` state (`9398e3f5`); sibling RED PRs conflict on the two ratchet files — merge sequentially and re-base.

## 3. Vercel Hobby deploy-quota incident (closed)

- 10:51–11:47 UTC every push returned Vercel status `failure — "Deployment rate limited — retry in 24 hours"`; production stayed on `342d225b` while `main` moved ahead (`4a7a86f7`, `ed672891`, `6255e28e`, `d358ffd4`, `1f6703fa`). CI, auto-merge and GitHub were unaffected; only the commit's `Vercel` status showed it.
- DB migrations were additive, so the older build ran correctly against the new schema — nothing broke.
- Resolved on its own: the rolling window freed a slot and `8d3e7dec` deployed at 11:47 UTC (`Vercel: success`). Owner row VERCEL-1 is closed, kept for the record.
- Rule from now on: after any merge to `main`, check `gh api repos/bandymuks1-stack/labourmarketai/commits/<sha>/status` (`Vercel` context) **and** `/api/health` `build` before claiming "deployed". Batch small commits (docs, ratchet bumps); every push is a deployment. `vercel` CLI is denied to the agent; Redeploy/Pro upgrade are owner-only.

## 4. Everything merged / applied today (SHAs)

| SHA | What |
|---|---|
| `b4f136b2` | #1453 live market demand card (agency + institution) |
| `1555cf45` | Lane A / Lane B pilot runbooks |
| `e7d47150` | #1455 internship + apprenticeship as canonical opportunity types (GREEN migration `20260903130000`, prod ledger `20260903094724`) |
| `342d225b` | pilot-execution checkpoint (last prod build before the quota window) |
| `4a7a86f7` | owner queue — final security review recorded |
| `ed672891` | register/queue/checkpoint — A+B+C applied |
| `6255e28e` | **#1448 RED batch A merged** |
| `1f6703fa` | **#1454 RED batch B merged** |
| `8d3e7dec` | **#1456 RED batch C merged — current production build** |
| `3597abb3`, `e2271d0a` | VERCEL-1 opened / closed |

Earlier today (already prod-verified, do not re-run): GREEN migrations `20260903070000`, `20260903090000`, `20260903110000` + manual `VACUUM (ANALYZE) public.public_vacancies` (P0-1 closed: health probe constant-cost, sitemap cold 200); P2-1 closed (`dynamicParams = false`); first-run router #1447; institution learners #1450; learning compass #1452; TTFV admin telemetry.

## 5. OWNER_ACTION_QUEUE after A+B+C (pending rows only)

| # | Owner action | State |
|---|---|---|
| 2 | Approve + apply batch 2026-09-02 (#1430, #1436, #1426, #1440) — reply "Apply batch 2026-09-02" | pending (RED, already reviewed) |
| 3 | **G-1** one real-inbox signup test (also the first real walk of the first-run router) — three screenshots | pending; prod autoconfirm OFF verified, Resend SMTP live, delivery to a real inbox still unproven |
| 4 | **LinkedIn app** (G-2a) — create app, OIDC product, Supabase provider on | pending; code path runtime-gated (#1381), zero prod use |
| 5 | **Meta / Facebook app** (G-2b) — same | pending; runtime-gated (#1381) |
| 6 | **VPS-1** Agentai scheduler state (`ssh agentai-vps` output or a read grant) | pending; ssh denied to the agent |
| 7 | **TG-1** Telegram channel `t.me/labourmarketai` + owner bot as admin | pending; sending authority stays the Agentai OS bridge, no second sender in LM |
| 8 | G-14 admin verify (`E2E Walker UAB`) | pending, 1 click |
| 9 | G-16 waiver line for #1433 (`/jobs` JSON-LD gate) | pending, 1 sentence |
| 10 | G-7 / G-8 Stripe (Set A, live keys, #1441) | before commercial launch only |
| 11 | L3 rollback drill (Vercel Promote) | before commercial launch only |

Rows 1 / 1b / 1c (batch A/B/C) and VERCEL-1 are closed.

## 6. Social login / G-1 / VPS-1 / TG-1 — current truth

- **Social login:** Google is the ONLY live provider (same-tab PKCE, returning-user proven on web and Android). LinkedIn / Facebook / Instagram: zero production use; buttons appear only when the Supabase provider is enabled (#1381). The Google consent screen still shows `supabase.co` — custom-domain-first fix is package 0011, owner-gated. Never automate the owner's personal social accounts; never substitute browser automation for OAuth.
- **G-1 e-mail delivery:** prod autoconfirm OFF (verified live); confirm link PKCE-only; API signup no longer autoconfirms; SMTP (Resend) configured; **delivery to a real inbox unproven** — only the owner's real-inbox test closes it. Do not generate `e2e-*` mail.
- **VPS-1:** Agentai scheduler profile/heartbeat unknown to the agent (ssh denied). Track E (radar/capability contract) proceeds on the contract file only.
- **TG-1:** no channel yet; distribution job + channel-discovery registry prepared; Telegram sending authority = Agentai OS bridge.

## 7. NEXT REAL PILOTS (the next window's primary work)

- **Lane A — real recruiter/agency:** `PILOT_RUNBOOK_LANE_A_RECRUITER.md`. Everything A1–A7 is LIVE in production now, including the explicit client **accept/decline** on a candidate offer (A5, batch A) and the agency-side decision chips. 0 real rows so far — the first real agency with one real client is the proof. Target TTFV < 1 day.
- **Lane B — real education institution + students:** `PILOT_RUNBOOK_LANE_B_INSTITUTION.md`. Invite → student context → Learners → live demand → **programmes / cohorts / members + demand per programme** (batch B) → **learner outcome aggregates, suppressed below 5** (batch C) are LIVE. Internship / apprenticeship are canonical opportunity types (#1455).
- Milestones to record from real events only: `REAL_RECRUITER_USED_PRODUCT`, `REAL_EDUCATION_INSTITUTION_USED_PRODUCT`. Measure from `pilot_events` (TTFV, drop-offs, `request_error`); the admin TTFV section is live. **Never fabricate a measurement.**
- Pilot feedback reprioritises tracks; it never fragments the canonical architecture.

## 8. Operating principles that stay binding

- **VALUE-NOW / USE-NOW:** every slice must let a real actor get real value today; no fake-success UX, no decorative dashboard depth, no placeholder data without a visible `preview`/`concept` label, no "demo" wording.
- **Do not declare success from CI or synthetic data alone.** PROD VERIFIED means read back from production.
- **Least privilege holds:** institutions never read learner records (aggregates only); agencies never bind workers; anon reaches only the allowlisted definer set; no security weakening to speed up pilots.
- **Architecture:** start at `docs/ARCHITECTURE.md` §7 — review question A (did we break something?) and B (did we make something previously possible impossible?). One canonical object per concept; no parallel student-job or second messaging system.
- **Goal is 100 % of the canonical product vision** (`docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md`, locks #900–#905, boundary/flywheel lock A-13) — the pilots are the next step on that road, not the destination. Last audit scores: CORE 78 / COMMERCIAL 35 / FULL_VISION 40 / PROD_VERIFIED 24 — move them by shipping real, verified capability, not by re-auditing.
- Merge envelope: GREEN = auto-merge once pushed; RED = draft + `needs-human-gate` + exact SQL in the PR; prod apply only via Supabase MCP `apply_migration` after the owner's sentence; every migration ships a rollback; migration-count ratchets are bumped with a declaration.
- Harness: run vitest from `apps/web`; heredoc regex/backslash traps — verify generated code bytes; only the exact permitted health-loop curl form works (otherwise use the in-app browser on `/api/health`); `ssh agentai-vps` and `vercel` CLI are denied.

## 9. First autonomous actions in the new window

1. `git pull --ff-only`, confirm `origin/main` ≥ `e2271d0a`; open `/api/health` and confirm `build` is `8d3e7dec` or newer with `ok:true`.
2. Read `OWNER_ACTION_QUEUE_2026-09-03.md` §5 rows; if the owner has replied to any (batch 2026-09-02, G-1 screenshots, "LinkedIn on", VPS output, channel link), act on that first — those are the only human gates.
3. Prepare Lane A and Lane B for the first real organisations: walk each runbook against production **as the pilot would** (one real login per lane supplied by the owner), fix any break found as a GREEN slice, record TTFV from `pilot_events`.
4. Keep the canonical-vision cadence: after each pilot finding, pick the next smallest additive slice that raises PROD_VERIFIED coverage (student cohort view, agency decision feedback loop, internship demand on the board/compass, Track E contract regeneration) — one PR per slice, auto-merge when GREEN.
5. Do not: re-audit, re-run proofs listed here, edit frozen landing files, generate `e2e-*` mail, touch billing (RED verbatim), or weaken any gate.
