# FINAL COMPLETION PROGRAM — CONTINUATION CHECKPOINT (2026-09-23)

> Canonical continuation state for the owner's FINAL PRODUCT COMPLETION program
> (2026-09-23). Read FIRST after any session renewal, then verify repo / PRs /
> production / DB against it and continue from §J. Executable truth = repo, PRs,
> worktrees, production, DB. This file is the index to that truth.
> PUBLIC REPO: ids and roles only — no personal names, e-mails or contact data.
> Updated: 2026-09-24 ~02:30Z (checkpoint #8 — batch 4 fully merged and live; M1 APPLIED; batch 5 launched).

## A. BASELINE
- Repo `bandymuks1-stack/labourmarketai`; canonical root `C:\Users\Mano\Documents\labourmarketai`.
- Program baseline 06d5bb199 (#1844). main now b237ff4f0 (#1849, #1856, #1857, #1855, #1858, #1859, #1862, #1860, #1861, #1863 merged after the pause). PRODUCTION = b237ff4f per /api/health at 02:14Z (health now reports deployEnv and vacancyFreshness: current, 5 h old). Vercel skipped 7e398a6b9 once (Hobby quota) and deployed the next merge; check /api/health `build` before claiming a deploy. Anonymous landing probe on b237ff4f: 375px bodyScrollW 375, CTAs y=289/345, jobs band with 4 DISTINCT cards, example chips wrap and read fully, LM mark renders with its fill.
- Vercel deploys `main` only. Docker Desktop OFF by owner directive; local Supabase = LOCAL_TEST_DEPENDENCY only.

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
| N-P2 | pin 'an agency is a company type' admission; manager-scope notice honours the platform-admin dual signal; projects page resolves the worker branch first | — | implementing | review → merge |

## D. MERGED IN THIS PROGRAM
#1845 local-stack diagnostics · #1846 auth-boundary guards · #1847 Nonstop consolidation code (migration applied) · #1848 honest chat + rename by sentence + setup ?org= · #1850 paperclip attach + journal validation parity · #1852 provenance without false precision · #1851 landing value + real current jobs + green confirmation (PROVEN on production desktop + 375px, anonymous gating intact) · #1853 timesheet import design v3 · #1854 profile summary-first + full screen expands · #1849 one active context (switch without reload, one pointer rule, identity follows the workspace) — production proof of the multi-org switch is the director's and the recruiter's own walk · #1856 LM mark instead of a letter + calm home (no map at depth 0, covered brief rungs omitted, empty states hidden; review P2s: phone-sheet yield order-dependent, 4 dead today.* keys, returning-user ŠIANDIEN latent) · #1857 HIST PR-2 seams + idempotent resumable staging + synthetic fixture (review P2s carried into PR-5) · #1855 'visible to employers' reachable via chat intent (write-class), hub + board readiness item (unknown ≠ off), one-time ask after first work-card save (device-local dismissal), account-menu entry, failed-read state · #1859 managers open the workspace they belong to (one authority projection; membership arm decided from the ONE workspace read; members + invitations in company Settings; pending-membership spine signal; honest 'invitation created — no e-mail goes out' copy in 11 catalogs; review P2s → lane N-P2) · #1858 booking/engagement/task/absence/demand-interest events carry facts from the write path (service_role holds no SELECT on those tables — proven read-only on prod); absence review reads facts BEFORE the RPC; source guard incl. admin-as-parameter; production proof = first live row after a real booking/absence (owner walk) · #1862 HIST PR-3 M1 (APPLIED, see §E) · #1860 J2: db:push refusal, DEPLOYMENT.md rewrite, e2e-seed-claims deleted, LOCAL_DB_URL, outbound host policy (VERCEL_ENV composed with the production host; ::ffff loopback), /api/health deployEnv + vacancyFreshness, Eurostat as-of · #1861 landing 375px: chips wrap and read fully (PROVEN on production screenshot), switcher no longer overlaps, sample fingerprint over RENDERED card facts (distinct cards PROVEN), CodeQL clean · #1863 agency→client invitation delivered through the #1752 primitive (copy/share link; honest not-sent state), pending/accepted/created/sent/delivery_failed row states, allowed_agency_connection messaging, locale clamp (toActiveLocale), no-company landing notice, bridge spine counts.

## E. DATABASE STATE
- TWO production writes — APPLIED: (1) nonstop_org_consolidation_v1 → ledger 20260923142823 (dry run first, readback done; rollback supabase/rollbacks/20260923114500_nonstop_org_consolidation_v1.down.sql). (2) historical_timesheet_m1 → ledger 20260924021637 (rolled-back dry run ok / 0 failed, actor A = the canonical org with a manager seeded only inside the rolled-back transaction; apply of the byte-identical body; readback 13 restrictive policies, all columns/constraints/indexes, 158 records + 158 events intact; rollback supabase/rollbacks/20260924100000_historical_timesheet_m1.down.sql). Everything else READ ONLY.

## F. NONSTOP
- Consolidation applied and read back (PR #1847). Lane N (#1859) live on b237ff4f: the manager-role member opens the canonical workspace; members + invitations in Settings. Remaining: the director's and the recruiter's own switcher/workspace walk; RED manager RLS (projects_* / company_workers_select → manages_organization) so the recruiter's project writes stop answering 42501.

## G. HISTORICAL TIMESHEET IMPORT
- Design v3 merged (#1853). PR-2 (#1857) and PR-3 (#1862) merged; M1 APPLIED (ledger 20260924021637). Batch 5: PR-4 M2+M3 RED packet (draft + needs-human-gate; owner approves; lead dry-runs then applies) and PR-5 writer (GREEN). Then PR-6 ordered-work detection + preservation + verified derivation (after M2/M3) → PR-7 views → real import in an authorised Nonstop session when the owner supplies timesheets.

## H. REMAINING LANES (queued after batch 5)
Production proofs by the owner's own sessions (multi-org switch, manager workspace, visibility consent from chat, agency invitation link, first live booking/absence notification row) · worktree hygiene (89 worktrees remain, most from earlier programs — remove merged ones after the 4 checks, never --force; stray vitest workers can hold a worktree, see memory) · final human acceptance walk + final receipt (program §41).

## I. OWNER DECISIONS STILL OPEN
1. RED #1430 companies contact/VAT/admin-note visible to every signed-in account (P0 security).
2. RED R-B #1813 filtered /jobs cold timeout (needed before profession chips can link).
3. Demand visibility: unverified companies' needs hidden from workers — badge vs verification queue.
4. RED manager RLS (projects_* / company_workers_select → manages_organization) — affects the Nonstop recruiter; membership_accept_v1 role grant vs the workspace-derived gate (#1859).
5. RED drafts #1815, R-P2, R-6/EVID-2, #1577, #883; INVITE_EMAIL_* env (invitation e-mail is inert — links are copy/share); prod-qa identity marker/allowlist.
6. Provenance data: keep/retract the 2026-09-17 period interpretations (44940e33, 1e628d75).
7. Personal workspace: worker composition even for holders of company/admin roles (lane A behaviour) — confirm.
8. Historical import: threshold calibration on a preview-only run of the first real file; leave Nonstop's draft projects untouched; approve PR-4 (M2 + M3) when it is posted.

## J. NEXT ACTION QUEUE
1. Batch 5 results (HIST PR-4 draft, HIST PR-5, M-residue, N-P2) → reviews → merge GREEN one at a time → verify /api/health build.
2. Owner: approve PR-4 (M2 + M3) → lead dry-runs and applies → PR-6, PR-7.
3. Owner walks (their own sessions) listed in §H; final human acceptance walk; final receipt (program §41).
4. Worktree hygiene as time allows.
