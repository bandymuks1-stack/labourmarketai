# FINAL COMPLETION PROGRAM — CONTINUATION CHECKPOINT (2026-09-23)

> Canonical continuation state for the owner's FINAL PRODUCT COMPLETION program
> (2026-09-23). Read FIRST after any session renewal, then verify repo / PRs /
> production / DB against it and continue from §J. Executable truth = repo, PRs,
> worktrees, production, DB. This file is the index to that truth.
> PUBLIC REPO: ids and roles only — no personal names, e-mails or contact data.
> Updated: 2026-09-24 ~00:55Z (checkpoint #7 — batch 4c reviewed; #1859 merged; batch 4d fixes running).

## A. BASELINE
- Repo `bandymuks1-stack/labourmarketai`; canonical root `C:\Users\Mano\Documents\labourmarketai`.
- Program baseline 06d5bb199 (#1844). main now aabc7a4a3 (#1849, #1856, #1857, #1855, #1858, #1859 merged after the pause). PRODUCTION = cdbd342b per /api/health at 00:23Z (aabc7a4a3 deploy being watched) (Vercel skipped 7e398a6b9 — Hobby quota — and deployed the next merge). Anonymous landing probe re-run on cdbd342b: 375px bodyScrollW 375, CTAs y=289/345, jobs band with 4 cards, LM mark renders with its fill — unchanged from the #1851 proof.
- Vercel deploys `main` only. Docker Desktop OFF by owner directive; local Supabase = LOCAL_TEST_DEPENDENCY only.

## B. AUTHORITATIVE OWNER DECISIONS (2026-09-23)
1. Full product completion against the canonical contract; launch gate per program §38.
2. Production never depends on the owner PC (PROVEN). Docker only for LOCAL INTEGRATION.
3. Landing directives authorize the landing-freeze baseline regeneration (done in #1851, recorded in lib/guards/landing-freeze.ts).
4. Design: #1826 hardening is live; ratified remainder integrated in #1851 (green confirmation, CTA, 12px switcher).
5. NONSTOP: one canonical org 20b2c802 UAB „Nonstop Group“ (302676973 / LT100010790613); profile 01353767 owner/Director; profile dc3284ea manager (Recruiter); employer + workforce_provider; duplicates/test shells archived; nothing deleted.
6. HISTORICAL IMPORT = TIMESHEETS ONLY; ordered work ≠ order document (unknown details stay UNKNOWN; additional ordered work = separate later step); VERIFIED HISTORICAL WORK basis 'organization timesheet'; no finance; one pipeline; synthetic fixture first. Design: docs/design/historical-timesheet-import-v3.md (#1853).
7. Continuity rule (92%).

## C. ACTIVE WORK
| Lane | Purpose | PR | State | Next |
|---|---|---|---|---|
| N | manager read/edit authority split; members + invitations in Settings; pending-membership spine signal | #1859 | implemented (21e184c40); review never ran (session limit); CI quality FAILED 4 guards (second workspace-context read; getOwnedCompany pin; 'Invitation sent' false-sent copy en/lt) → batch 4c lane N-ci-fix-review | fix → review → merge |
| L | agency→client invitation delivered through the #1752 primitive; bridge spine counts; allowed_agency_connection messaging | #1863 | review APPROVE (P2s); CI: messaging-abuse-caps guard (8th direct-subject writer) + 2 flakes → batch 4d fix lane (guard honesty, locale clamp, accepted-invitation state, no-company landing) | CI green → merge |
| J2 | db:push refusal, DEPLOYMENT.md rewrite, e2e-seed-claims deleted/guarded, LOCAL_DB_URL, outbound host policy in production, /api/health vacancy freshness, Eurostat as-of | #1860 | review APPROVE (P2s); CI: 2 timeout flakes (rerun) → batch 4d fix lane (fail-open on VERCEL_ENV composed with production host; ::ffff loopback; import order) | CI green → merge |
| HIST PR-3 | M1 migration 20260924100000_historical_timesheet_m1.sql + rollback + docs/design/historical-timesheet-m1-dryrun.sql | #1862 | review APPROVE (P2s); CI green; lead DB proof posted (checks 1–3 = 0/0/0 on prod; 0 cross-org sessions) → batch 4d fix lane (supplied_by copied from the session's own column + pin; CHECK created_session_id ⇒ organization_id; dry-run step-0 legacy-owner assertion) | merge → lead runs the rolled-back DO block on prod → apply_migration → readback → PR-4 RED packet |
| LANDING-P2 | readable example chips, no switcher overlap, distinct sample jobs at 375px | #1861 | review APPROVE (P2); CodeQL HIGH js/incomplete-sanitization in the new guard test → batch 4d fix lane (+ fingerprint over RENDERED card facts) | CodeQL green → merge → anonymous 375px probe on production |

## D. MERGED IN THIS PROGRAM
#1845 local-stack diagnostics · #1846 auth-boundary guards · #1847 Nonstop consolidation code (migration applied) · #1848 honest chat + rename by sentence + setup ?org= · #1850 paperclip attach + journal validation parity · #1852 provenance without false precision · #1851 landing value + real current jobs + green confirmation (PROVEN on production desktop + 375px, anonymous gating intact) · #1853 timesheet import design v3 · #1854 profile summary-first + full screen expands · #1849 one active context (switch without reload, one pointer rule, identity follows the workspace) — production proof of the multi-org switch is the director's and the recruiter's own walk · #1856 LM mark instead of a letter + calm home (no map at depth 0, covered brief rungs omitted, empty states hidden; review P2s: phone-sheet yield order-dependent, 4 dead today.* keys, returning-user ŠIANDIEN latent) · #1857 HIST PR-2 seams + idempotent resumable staging + synthetic fixture (review P2s for PR-5/6: lifecycleSweep 200-event cap after rollback, per-row commit round trips, partialCover duplicates resolve-entities prefix rule) · #1855 'visible to employers' reachable via chat intent (write-class), hub + board readiness item (unknown ≠ off), one-time ask after first work-card save (device-local dismissal), account-menu entry, failed-read state · #1859 managers open the workspace they belong to (one authority projection; membership arm decided from the ONE workspace read; members + invitations in company Settings; pending-membership spine signal; honest 'invitation created — no e-mail goes out' copy in 11 catalogs; review P2s: manager-scope notice ignores the platform-admin dual signal; agency-only owners now admitted to /dashboard/company/* (an agency is a company type — pin it); projects page resolves employer context before the worker branch) · #1858 booking/engagement/task/absence/demand-interest events carry facts from the write path (service_role holds no SELECT on those tables — proven read-only on prod); absence review reads facts BEFORE the RPC; source guard incl. admin-as-parameter; production proof = first live row after a real booking/absence (owner walk); residue: workflow_* and document_* emitters same class.

## E. DATABASE STATE
- ONE production write — APPLIED: nonstop_org_consolidation_v1 → ledger 20260923142823 (dry run first, readback done). Rollback: supabase/rollbacks/20260923114500_nonstop_org_consolidation_v1.down.sql. Everything else READ ONLY.

## F. NONSTOP
- Applied and read back (see memory note / PR #1847 comment). Code live since 0c7bda20. Remaining: the director's and the recruiter's own switcher walk; manager-role read/edit split (lane N) so the recruiter can act.

## G. HISTORICAL TIMESHEET IMPORT
- Design v3 merged (#1853). PR plan: PR-2 seams (running) → PR-3 M1 GREEN migration → PR-4 M2+M3 RED (ordered-work table, source preservation incl. register_document_file_v1 MIME) → PR-5 resolution writer → PR-6 ordered-work detection + preservation + verified derivation → PR-7 views → real import in an authorised Nonstop session.

## H. REMAINING LANES (queued)
Batch 4c = scratchpad batch4c-script.js (lanes N-ci-fix-review, L, J2 resume-in-place, LANDING-P2, HIST-PR3-M1; agents commit WIP locally at milestones, push only when complete) · same-class notification residue from #1858 (workflow_* and document_* emitters read ungranted tables via the admin client) · then production proofs for chat/attach/workspace (prod-qa worker; owner sessions for multi-org) · worktree cleanup (92 worktrees; 4 checks each, never --force).

## I. OWNER DECISIONS STILL OPEN
1. RED #1430 companies contact/VAT/admin-note visible to every signed-in account (P0 security).
2. RED R-B #1813 filtered /jobs cold timeout (needed before profession chips can link).
3. Demand visibility: unverified companies' needs hidden from workers — badge vs verification queue.
4. RED manager RLS (projects_* → manages_organization) — affects the Nonstop recruiter.
5. RED drafts #1815, R-P2, R-6/EVID-2, #1577, #883; INVITE_EMAIL_* env; prod-qa identity marker/allowlist.
6. Provenance data: keep/retract the 2026-09-17 period interpretations (44940e33, 1e628d75).
7. Personal workspace: worker composition even for holders of company/admin roles (lane A behaviour) — confirm.
8. Historical import: threshold calibration on a preview-only run of the first real file; leave Nonstop's draft projects untouched.

## J. NEXT ACTION QUEUE
1. Batch 4d (wf_1247cfbe-4f4) fixes on #1863, #1861, #1862, #1860 → CI green → merge one at a time (each merge = one Vercel slot) → verify /api/health build → anonymous landing probe after #1861.
1b. RED items for the owner from lane N: projects_* / company_workers_select → manages_organization; membership_accept_v1 role grant (or keep the workspace-derived gate).
2b. Then the workflow/document emitter residue lane; remove merged worktrees (4 checks; wf_0b83e05c-4f7-{1,2,4} after #1858/#1859 merge; 93 worktrees now).
3. HIST PR-3: lead runs the rolled-back M1 dry run on production after PR-2 deploys → apply via MCP → readback → PR-4 RED packet for the owner (M2 project_ordered_work + M3 register_document_file_v1 MIME).
4. Production proofs; worktree cleanup; final human acceptance walk; final receipt.
