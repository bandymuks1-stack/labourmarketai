# FINAL COMPLETION PROGRAM — CONTINUATION CHECKPOINT (2026-09-23)

> Canonical continuation state for the owner's FINAL PRODUCT COMPLETION program
> (2026-09-23). Read FIRST after any session renewal, then verify repo / PRs /
> production / DB against it and continue from §J. Executable truth = repo, PRs,
> worktrees, production, DB. This file is the index to that truth.
> PUBLIC REPO: this file carries ids and roles only — no personal names, e-mails
> or contact data (those live only in private operator memory).
> Updated: 2026-09-23 ~15:50Z (checkpoint #3).

## A. BASELINE
- Repo `bandymuks1-stack/labourmarketai`; canonical root `C:\Users\Mano\Documents\labourmarketai`.
- Program baseline 06d5bb199 (#1844). main now includes #1845, #1846, #1847 (0c7bda200, prod build 0c7bda20), #1848 (6e0117d53).
- Vercel deploys `main` only. Docker Desktop is OFF by owner directive; local Supabase = LOCAL_TEST_DEPENDENCY only.

## B. AUTHORITATIVE OWNER DECISIONS (2026-09-23)
1. Full product completion against the canonical contract (not a bug list). Launch gate per program §38.
2. Production must never depend on the owner PC — PROVEN independent. Docker only for LOCAL INTEGRATION; never start it as if required.
3. PUBLIC_LANDING_REAL_JOB_DISCOVERY + landing value story (§22) — AUTHORIZE the owner-gated landing-freeze baseline regeneration (record verbatim in `lib/guards/landing-freeze.ts`).
4. Yesterday's design = #1826 hardening + Design System artifact (TARGET stays TARGET). Integrate the ratified remainder: employer-confirmed = trust-accent GREEN, work-card-editor CTA, 12px switcher floor.
5. NONSTOP: ONE canonical org `20b2c802` UAB „Nonstop Group“, code 302676973, VAT LT100010790613; profile 01353767 = owner/Director; profile dc3284ea = manager (functional role Recruiter), not owner, personal worker data stays personal; employer + workforce_provider on the same org; company_type unchanged; archive reversibly f2315826, 2e3a4744, af6cc3d6, a3d59458; delete nothing; never touch the 158 evidence records in 19f47e78.
6. HISTORICAL IMPORT = TIMESHEETS ONLY (owner correction): timesheet → worker → Nonstop → customer → ordered work/project → object → address → work → hours → VERIFIED HISTORICAL WORK (basis: organization timesheet). No invoices/payments/payroll. Ordered work exists without an order document; unknown order details stay UNKNOWN; later work on the same customer object = additional ordered work (separate step). Reuse existing structures; synthetic fixture first.
7. Continuity rule (92%): checkpoint safely, continue automatically after renewal.

## C. ACTIVE WORK
| Lane | Purpose | Branch / worktree | PR | State | Next |
|---|---|---|---|---|---|
| A | one active context | fix/cc/active-context-integrity | #1849 | APPROVED; rebasing onto main + P2 fixes (wf_9f7d62bd-2f4) | post-rebase review → merge |
| B | honest chat + rename + setup ?org= | — | #1848 MERGED 6e0117d53 | done | prod proof (prod-qa worker) |
| C | paperclip attach + journal validation | fix/cc/universal-attachment-journal | #1850 | APPROVED; rebasing (conflict with #1848) → auto-merge (wf_9f7d62bd-2f4) | prod proof |
| NONSTOP | consolidation | — | #1847 MERGED 0c7bda200 (migration applied 20260923142823) | code live | owner-side switcher walk |
| HIST | historical TIMESHEET import (owner correction: timesheets only; ordered work ≠ order document) | design v3 (wf_331fc132-a37) | — | designing | PR-1 fixture → PR-2 pipeline |
| BATCH2 | E provenance, D profile/full screen, H landing+jobs+green confirmation | worktrees | — | implementing (wf_06639332-229) | review → merge |

## D. COMPLETED
- #1845 MERGED (cb92a6f1a) and deployed — LOCAL_INTEGRATION_TEST_REQUIRES_DOCKER, prod-qa mint path guard, test classes in docs/TESTING.md.
- #1846 MERGED (863a0174a) — guard: verified getter above every Suspense boundary; getSession ban; forged-session spec (local).
- Audits (session scratchpad): architecture map `map/lane-{A..I}.md`, Docker audit `docker-critic.txt`, capability matrix `matrix-synthesis.md`, landing job-discovery trace, yesterday-design trace, Nonstop FK sweep, registry `REGISTRY.md`.
- Vitest with Docker OFF: 24,641/24,643 (2 = known Windows CRLF).

## E. DATABASE STATE
- ONE production write in this program — APPLIED: `nonstop_org_consolidation_v1` → ledger **20260923142823** (14:28Z via MCP apply_migration, from commit d71f3b3e1). A rolled-back production dry run (14:24Z) passed every assertion first; production was verified unchanged after it. Everything else READ ONLY.
- Rollback: `supabase/rollbacks/20260923114500_nonstop_org_consolidation_v1.down.sql` (restores from audit_logs action `org_consolidation_v1`).

## F. NONSTOP
- Readback: company 048aa7e1 = UAB „Nonstop Group“ / 302676973 / LT100010790613 / verified / construction; org 20b2c802 mirrored; capabilities employer + workforce_provider; memberships owner 01353767 + manager dc3284ea; pointer 01353767 → 20b2c802; archived f2315826, 2e3a4744, af6cc3d6, a3d59458; test need 7454f365 closed; test engagement 2698c6e3 ended; 22 personal journal entries + 158 LM evidence records intact; 11 audited changes.
- Remaining: merge #1847 code (archived orgs leave every workspace read) → deploy → verify; director's own walk; recruiter walk; manager-role read/edit split (lane N) so the recruiter can act.

## G. HISTORICAL EVIDENCE GRAPH
- Design v1 (8 agents) mapped reuse: organization_people roster, projects + work_objects (RPC already accepts address/project), agency_clients generalised as the org client register, insert-only organization_evidence_records, org_documents/document_files, historical visual grammar. New only: commercial records (orders, change orders, invoices/payments, payroll) + one evidence-link relation + precision/verification encoding. Both reviews NEEDS_CHANGES (append-only vs FK actions, batch rollback, client identity merging, attestation allow-list, payroll amount visibility, SEP-3, fixture assertions). Next: re-run the revision, then PR-1 (design record + synthetic fixture) and PR-2 (pipeline integrity, GREEN).

## H. LANE STATUS
workspace/context = A · chat/action = B · attachments + journal = C · organization lifecycle = NONSTOP + N (queued) · legacy surfaces + provenance = D+E (queued) · landing/jobs = H (queued) · brand/design = G (queued) · security = #1846 merged; RED #1430 owner · mobile = verified per lane at 375px · Docker/tooling = #1845 merged; J2 queued · capability matrix DONE → K/L/M/N queued.

## I. OWNER DECISIONS STILL OPEN
1. RED #1430: companies contact/VAT/admin-note visible to every signed-in account (P0 security).
2. RED R-B #1813: filtered /jobs cold timeout.
3. Demand visibility: unverified companies' needs hidden from workers — badge vs verification queue.
4. RED manager RLS (projects_* → manages_organization) — affects the Nonstop recruiter.
5. RED drafts #1815, R-P2, R-6/EVID-2, #1577, #883; INVITE_EMAIL_* env; prod-qa identity marker/allowlist.
6. Provenance data: keep/retract the 2026-09-17 period interpretations (records 44940e33, 1e628d75).

## J. NEXT ACTION QUEUE
1. #1847 CI green → merge → health build → verify archived shells gone from the workspace readers.
2. wf_e077c75b-e7f results → apply fixes → merge B (#1848) → C → A (#1849, rebased onto #1847).
3. Re-run the historical design revision → PR-1 → PR-2.
4. Batch 2: D+E, G, H, J2, K, L, M, N.
5. Production proof after each merge; final acceptance walk; final receipt.
