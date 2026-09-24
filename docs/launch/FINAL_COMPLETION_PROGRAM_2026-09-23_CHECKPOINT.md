# FINAL COMPLETION PROGRAM — CONTINUATION CHECKPOINT (2026-09-23)

> Canonical continuation state for the owner's FINAL PRODUCT COMPLETION program
> (2026-09-23). Read FIRST after any session renewal, then verify repo / PRs /
> production / DB against it and continue from §J. Executable truth = repo, PRs,
> worktrees, production, DB. This file is the index to that truth.
> PUBLIC REPO: ids and roles only — no personal names, e-mails or contact data.
> Updated: 2026-09-24 ~06:40Z (checkpoint #9 — cloud session after the owner-PC session hit its weekly limit; N-P2 #1864 merged + deployed; batch-5 HIST PR-4 / PR-5 / M-residue NOT RECOVERABLE from the cloud — see §C).
> Updated: 2026-09-24 ~08:00Z (checkpoint #10 — second cloud session: state re-verified, nothing new on any ref or on production; ŠIANDIEN P2 mechanism located and left as is; #1430 found STALE and refreshed as K2-1 v2; manager-RLS and company-description defects measured — see §K).
>
> Checkpoint #9 was written from a CLOUD session (no access to the owner PC, its worktrees or
> `labourmarket.ai` — the environment's network policy answers 403). Until #9 the file lived only on
> the unmerged branch `docs/cc/final-completion-checkpoint`; #9 lands it on `main`.

## A. BASELINE
- Repo `bandymuks1-stack/labourmarketai`; canonical root `C:\Users\Mano\Documents\labourmarketai`.
- Program baseline 06d5bb199 (#1844). main now b237ff4f0 (#1849, #1856, #1857, #1855, #1858, #1859, #1862, #1860, #1861, #1863 merged after the pause). PRODUCTION = b237ff4f per /api/health at 02:14Z (health now reports deployEnv and vacancyFreshness: current, 5 h old). Vercel skipped 7e398a6b9 once (Hobby quota) and deployed the next merge; check /api/health `build` before claiming a deploy. Anonymous landing probe on b237ff4f: 375px bodyScrollW 375, CTAs y=289/345, jobs band with 4 DISTINCT cards, example chips wrap and read fully, LM mark renders with its fill.
- Vercel deploys `main` only. Docker Desktop OFF by owner directive; local Supabase = LOCAL_TEST_DEPENDENCY only.
- #9: main now 1b44319e (#1864 → 1082325c, #1827 → 1b44319e). Vercel commit status for 1082325c = `success`, Production deployment created 06:03:15Z (GitHub deployments API). `/api/health` NOT read (cloud network policy 403) — DEPLOYED, not browser-proven.

## B. AUTHORITATIVE OWNER DECISIONS (2026-09-23)
1. Full product completion against the canonical contract; launch gate per program §38.
2. Production never depends on the owner PC (PROVEN). Docker only for LOCAL INTEGRATION.
3. Landing directives authorize the landing-freeze baseline regeneration (done in #1851 and #1861, recorded in lib/guards/landing-freeze.ts).
4. Design: #1826 hardening is live; ratified remainder integrated in #1851 (green confirmation, CTA, 12px switcher).
5. NONSTOP: one canonical org 20b2c802 UAB „Nonstop Group“ (302676973 / LT100010790613); profile 01353767 owner/Director; profile dc3284ea manager (Recruiter); employer + workforce_provider; duplicates/test shells archived; nothing deleted.
6. HISTORICAL IMPORT = TIMESHEETS ONLY; ordered work ≠ order document (unknown details stay UNKNOWN; additional ordered work = separate later step); VERIFIED HISTORICAL WORK basis 'organization timesheet'; no finance; one pipeline; synthetic fixture first. Design: docs/design/historical-timesheet-import-v3.md (#1853).
7. Continuity rule (92%).

## C. ACTIVE WORK (batch 5, workflow launched 2026-09-24 ~02:30Z)
| Lane | Purpose | PR | State | Next |
|---|---|---|---|---|
| HIST PR-4 | RED packet: M2 project_ordered_work (table + RLS + grants) and M3 source preservation (org_import_source type, document_files MIME CHECK, bucket UPDATE, register_document_file_v1 body with only the MIME list widened — diffed against production); rolled-back M2/M3 dry-run block | — | implementing | draft + needs-human-gate → owner approval → lead dry run → apply → readback |
| HIST PR-5 | customer key + resolution; historical project / customer-row / parties writer through the one create core; live-planning isolation; address pass-through; week/month parsing; grouped review kinds; decided events; PR-2 review P2s folded in | — | implementing (M1 applied, may merge) | review → merge |
| M-residue | workflow_* and document_* emitters read ungranted tables via the admin client (same class as #1858) → facts from the write path | — | implementing | review → merge |
| N-P2 | pin 'an agency is a company type' admission; manager-scope notice honours the platform-admin dual signal; projects page resolves the worker branch first | #1864 | MERGED 1082325c, DEPLOYED (Vercel success) | owner walk (manager notice, agency owner, worker /projects) |

**#9 — batch-5 recovery result.** Searched every remote branch tip (604 heads) and every PR ref for
the lanes' files (`ordered-work`, `customer-key`, `historical-project-isolation`, `org_import_source`,
an M2/M3 migration): **nothing**. HIST PR-4, HIST PR-5 and M-residue were never pushed; whatever they
produced lives only in the owner-PC worktrees under `C:\Users\Mano\Documents\labourmarketai`.
ENVIRONMENT LIMITATION: a cloud session cannot reach them, and the PC session is rate-limited until
2026-09-27 05:00 Vilnius. Owner rule (2026-09-24): do NOT recreate them until that work is recovered
or proven lost. Next PC session: `git -C <worktree> status` in each batch-5 worktree, commit + push
what exists, open the PRs, then continue from the table above.

## D. MERGED IN THIS PROGRAM
#1845 local-stack diagnostics · #1846 auth-boundary guards · #1847 Nonstop consolidation code (migration applied) · #1848 honest chat + rename by sentence + setup ?org= · #1850 paperclip attach + journal validation parity · #1852 provenance without false precision · #1851 landing value + real current jobs + green confirmation (PROVEN on production desktop + 375px, anonymous gating intact) · #1853 timesheet import design v3 · #1854 profile summary-first + full screen expands · #1849 one active context (switch without reload, one pointer rule, identity follows the workspace) — production proof of the multi-org switch is the director's and the recruiter's own walk · #1856 LM mark instead of a letter + calm home (no map at depth 0, covered brief rungs omitted, empty states hidden; review P2s: phone-sheet yield order-dependent, 4 dead today.* keys, returning-user ŠIANDIEN latent) · #1857 HIST PR-2 seams + idempotent resumable staging + synthetic fixture (review P2s carried into PR-5) · #1855 'visible to employers' reachable via chat intent (write-class), hub + board readiness item (unknown ≠ off), one-time ask after first work-card save (device-local dismissal), account-menu entry, failed-read state · #1859 managers open the workspace they belong to (one authority projection; membership arm decided from the ONE workspace read; members + invitations in company Settings; pending-membership spine signal; honest 'invitation created — no e-mail goes out' copy in 11 catalogs; review P2s → lane N-P2) · #1858 booking/engagement/task/absence/demand-interest events carry facts from the write path (service_role holds no SELECT on those tables — proven read-only on prod); absence review reads facts BEFORE the RPC; source guard incl. admin-as-parameter; production proof = first live row after a real booking/absence (owner walk) · #1862 HIST PR-3 M1 (APPLIED, see §E) · #1860 J2: db:push refusal, DEPLOYMENT.md rewrite, e2e-seed-claims deleted, LOCAL_DB_URL, outbound host policy (VERCEL_ENV composed with the production host; ::ffff loopback), /api/health deployEnv + vacancyFreshness, Eurostat as-of · #1861 landing 375px: chips wrap and read fully (PROVEN on production screenshot), switcher no longer overlaps, sample fingerprint over RENDERED card facts (distinct cards PROVEN), CodeQL clean · #1863 agency→client invitation delivered through the #1752 primitive (copy/share link; honest not-sent state), pending/accepted/created/sent/delivery_failed row states, allowed_agency_connection messaging, locale clamp (toActiveLocale), no-company landing notice, bridge spine counts.

#9: #1864 N-P2 (agency owner = company-space member by contract, pinned with negative controls; manager notice yields to the platform-admin dual signal and no longer promises "never an empty list" — 11 catalogs; /dashboard/projects decides the worker branch from the ONE workspace read before any employer read) · #1827 ledger row for countries_all_iso_v1 (facts re-read on production: 249 countries, the same 10 target markets, 0 dangling FKs).

**#9 production DB evidence (read-only SELECTs, aggregate / id-prefix only):**
- Demand interest → owner notified (#1761/#1858 class): 2 `demand_interest_expressed` rows at 05:50Z / 05:51Z, written 245–330 ms after their `demand_interest_signals` rows → the LIVE emitter (not backfill). DB leg PROVEN; the owner's visible notification not observed.
- Invitation → sign-up → accept: a Nonstop-sourced `join_platform` invitation (consent `worker-broader-search-v1` recorded) created 05:25Z, opened 05:25Z, a new profile created 05:26Z (worker role + workers row), accepted 05:29Z. DB leg PROVEN for the invitation acceptance path (this is not the #1863 agency→client path — no such row yet).
- #1850 paperclip / journal: 0 `conversation_message_attachments`, 0 `journal_entries` since its deploy → NOT PRODUCTION-PROVEN (no real use yet).
- #1858 booking / engagement / task / absence events: 0 rows since deploy (only `weekly_digest` + the two interest rows) → NOT PROVEN (no real booking/absence yet).
- Historical import: 158 records unchanged, 0 historical projects (writer PR-5 not on main).

## E. DATABASE STATE
- TWO production writes — APPLIED: (1) nonstop_org_consolidation_v1 → ledger 20260923142823 (dry run first, readback done; rollback supabase/rollbacks/20260923114500_nonstop_org_consolidation_v1.down.sql). (2) historical_timesheet_m1 → ledger 20260924021637 (rolled-back dry run ok / 0 failed, actor A = the canonical org with a manager seeded only inside the rolled-back transaction; apply of the byte-identical body; readback 13 restrictive policies, all columns/constraints/indexes, 158 records + 158 events intact; rollback supabase/rollbacks/20260924100000_historical_timesheet_m1.down.sql). Everything else READ ONLY.

## F. NONSTOP
- Consolidation applied and read back (PR #1847). Lane N (#1859) live on b237ff4f: the manager-role member opens the canonical workspace; members + invitations in Settings. Remaining: the director's and the recruiter's own switcher/workspace walk; RED manager RLS (projects_* / company_workers_select → manages_organization) so the recruiter's project writes stop answering 42501.

## G. HISTORICAL TIMESHEET IMPORT
- Design v3 merged (#1853). PR-2 (#1857) and PR-3 (#1862) merged; M1 APPLIED (ledger 20260924021637). Batch 5: PR-4 M2+M3 RED packet (draft + needs-human-gate; owner approves; lead dry-runs then applies) and PR-5 writer (GREEN). Then PR-6 ordered-work detection + preservation + verified derivation (after M2/M3) → PR-7 views → real import in an authorised Nonstop session when the owner supplies timesheets.

## H. REMAINING LANES (queued after batch 5)
Production proofs by the owner's own sessions (multi-org switch, manager workspace, visibility consent from chat, agency invitation link, first live booking/absence notification row) · worktree hygiene (89 worktrees remain, most from earlier programs — remove merged ones after the 4 checks, never --force; stray vitest workers can hold a worktree, see memory) · final human acceptance walk + final receipt (program §41).

## I. OWNER DECISIONS STILL OPEN
1. RED #1430 → superseded by K2-1 v2 (P0 privacy; see §K — details in the owner channel, not in this public repo).
2. RED R-B #1813 filtered /jobs cold timeout (needed before profession chips can link).
3. Demand visibility: unverified companies' needs hidden from workers — badge vs verification queue.
4. RED manager RLS (projects_* / company_workers_select → manages_organization) — affects the Nonstop recruiter; membership_accept_v1 role grant vs the workspace-derived gate (#1859).
5. RED drafts #1815, R-P2, R-6/EVID-2, #1577, #883; INVITE_EMAIL_* env (invitation e-mail is inert — links are copy/share); prod-qa identity marker/allowlist.
6. Provenance data: keep/retract the 2026-09-17 period interpretations (44940e33, 1e628d75).
7. Personal workspace: worker composition even for holders of company/admin roles (lane A behaviour) — confirm.
8. Historical import: threshold calibration on a preview-only run of the first real file; leave Nonstop's draft projects untouched; approve PR-4 (M2 + M3) when it is posted.

## J. NEXT ACTION QUEUE
0. (#10b, 2026-09-24 ~08:45Z) K2-1 v2 APPLIED per the owner's approved order: #1868 MERGED `04f7b741` → Vercel Production deployment success → rolled-back prod dry run → APPLIED (ledger `20260924083740`) → read-back (docs/APPLIED_LEDGER.md). Status: DB-level PRODUCTION-PROVEN; app path VERIFICATION PENDING — OPEN until a signed-in company-page walk as owner AND as manager, each seeing their own company's details rendered (a bare reader 200 is not proof: an unauthorized caller also gets 200 with zero rows); cloud network 403 blocks the walk from here. #1430 must never be applied. Owner also APPROVED preparing two separate RED drafts (NOT to be applied until their concrete drafts are reviewed): company description save = definer `set_company_description_v1` (option b); manager RLS = projects SELECT/INSERT/UPDATE + company_workers SELECT via the existing `manages_organization`, no DELETE. Historical stays BLOCKED on the owner-PC batch-5 worktrees; returning-user ŠIANDIEN: no change.
0. (#10) EXACT NEXT ACTION — PC session (rate-limited until 2026-09-27 05:00 Vilnius): in each batch-5 worktree `git status`, `git log origin/main..HEAD`, list untracked/ignored unique files → commit + push → open HIST PR-4 (draft + needs-human-gate), HIST PR-5, M-residue → continue §C. Cloud sessions meanwhile: owner decisions on the §K RED packets (K2-1 v2 PR, manager RLS, description save); after an approval, the lead runs the rolled-back production dry run, applies, reads back.
0. (#9) PC session: recover batch-5 worktrees (HIST PR-4, HIST PR-5, M-residue) → push → PRs. N-P2 is done (#1864).
   (#9b, cloud) CLOSED in the follow-up PR from `claude/jolly-babbage-tajf4d`: the #1849 residue
   (every server action that writes into the active organization refuses a stale screen — 30 actions,
   21 screens, the dispatcher's own `isStaleWorkspaceContext`); #1856 P2 "4 dead `today.*` keys" and
   "phone-sheet yield order-dependent"; #1835's product half (a saved draft keeps its country — its
   walk/spec half stays on #1835). `main` CI red since 1082325c (intent suites timing out on V8 regex
   warm-up) fixed in #1865. STILL OPEN: #1856 P2 "returning-user ŠIANDIEN latent" — the review text
   is not in any ref; the next session that has it fixes it (a restored transcript ends the opening
   state, so whether ŠIANDIEN should reappear for a returning user is the question to settle).
1. Batch 5 results (HIST PR-4 draft, HIST PR-5, M-residue) → reviews → merge GREEN one at a time → verify /api/health build.
2. Owner: approve PR-4 (M2 + M3) → lead dry-runs and applies → PR-6, PR-7.
3. Owner walks (their own sessions) listed in §H; final human acceptance walk; final receipt (program §41).
4. Worktree hygiene as time allows.

## K. CHECKPOINT #10 (2026-09-24 ~08:00Z, cloud session; network policy still answers 403 for `labourmarket.ai`)

**Verified, not assumed.**
- `main` = `5497708a` (#1866). CI on it: Quality Gates, E2E Smoke, CodeQL, Mobile = success. Production = `5497708a` per the owner's handoff ("deployment completed"); `/api/health` not readable from the cloud (403) → #1866 is DEPLOYED / NOT PRODUCTION-PROVEN.
- Ledger tail unchanged: `20260924021637 historical_timesheet_m1`. No migration applied this session.
- No PR after #1866. 605 remote heads, none new except this session's branch; no file of HIST PR-4 / PR-5 / M-residue (`ordered-work`, `customer-key`, `historical-project-isolation`, `org_import_source`, `source-subtotals`, `historical-graph`, M2/M3) in any fetched ref → batch 5 still lives only in the owner-PC worktrees; per the owner rule it is NOT recreated. Historical PR-6 / PR-7 depend on PR-5 and on PR-4 applied (design v3 §15), so the whole historical chain waits on that recovery.
- Dirty worktrees / local-only commits: none in this cloud container except the K2-1 v2 commit, pushed as its own draft PR right after this checkpoint merges (branch `claude/sweet-mccarthy-3joyg4`).

**Production DB since #9 (read-only aggregates, 07:31Z):** 0 message attachments and 0 journal entries since #1850; 0 booking / absence / task rows since #1858; notification events today = 2 `demand_interest_expressed` + 2 `weekly_digest` (last 05:51Z); invitations today = 1 `join_platform` accepted (the #9 one); 0 new profiles; 158 evidence records; 0 historical projects. Nothing new is PRODUCTION-PROVEN; the #9 DB-level proofs (interest → owner notified; invitation → sign-up → accepted) stand.

**#1856 "returning-user ŠIANDIEN latent" — mechanism located, behaviour kept.** The review text is still in no ref (the only GitHub review on #1856 is a Codex P2, below). In code: `conversation-chat.tsx` sets `todayOnScreen = Boolean(openingContext)` and the brief omits `TODAY_COVERED_BRIEF_RUNGS` on that, but ŠIANDIEN renders only while the thread is in its opening state (`ConversationThread` `isOpening && intro`). A restored transcript (`HistoryBlock`) ends the opening state, so a returning user would see neither ŠIANDIEN nor the omitted rungs. LATENT: transcript restore needs RED #883 (unapplied) — unreachable on production today. Per the owner rule nothing was changed; it is settled together with #883.

**#1856 Codex P2 (unresolved thread, `lib/today/today-route.ts:92`) — recorded, not changed.** `profile-gap` is omitted under ŠIANDIEN, but the brief's gap comes from the profile readiness summary (skills, supported evidence, work-card confirmation …) while ŠIANDIEN's next action comes from the work-card engine (work, availability, location, pay, journal count): a worker with a journal entry and no supported evidence no longer hears the evidence gap in the brief. The readiness item stays reachable on the hub/board (#1855). Owner call: keep the omission, or omit `profile-gap` only when both engines name the same step.

**RED packets (one decision each; nothing applied).**
1. **K2-1 v2 — company data minimization (replaces #1430).** Still needed; #1430 as drafted no longer fits `main` after #1859 (it would break the company doors for managers and members). v2 = narrowed column grant + ONE definer reader for the people who already open the company, the four app reads routed through it with a fallback, paired rollback; contract proven on a local PostgreSQL 16 (before/after/rollback). Order: deploy the app half first, then apply. Draft PR `needs-human-gate` from `claude/sweet-mccarthy-3joyg4`. Security analysis and evidence: owner channel only (AGENTS.md — this repo is public).
2. **Manager RLS (no draft yet).** Still needed: a manager member cannot write projects or read the workforce list (the app says so honestly). Proposal: extend the `projects` and `company_workers` policies with the existing `manages_organization(...)` helper for select/insert/update; delete unchanged unless the owner says otherwise. Detail in the owner channel.
3. **Company description save does not persist (new defect, needs RED).** The public business page's description save (`lib/company/description-actions.ts`) writes through a path production does not grant, so it always ends in the generic error; no company carries a description. No existing write path covers it. Options: (a) a column grant, (b) a definer write gated like `owns_company` (matches the `manage-company-profile` capability). Recommended: (b).
4. Still open from §I: #1813 R-B, demand visibility, #1815 / R-P2 / R-6 / EVID-2 / #1577 / #883 (#883 also settles the ŠIANDIEN item above), provenance data, historical PR-4 when it is recovered.
