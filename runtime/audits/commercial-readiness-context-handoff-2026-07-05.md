# CR TRAIN — CONTEXT HANDOFF / CHECKPOINT (2026-07-05)

> ## ADDENDUM — WAGON 8 EXECUTED (2026-07-05, later session)
>
> The "EXACT NEXT ACTION" below was carried out to spec by the successor
> session. WAGON 8 = PR #627 `feat/cc/journal-modes-gallery` (commits
> 5508c13 + c2387db, both by this session in an isolated worktree — branch
> ownership lock honoured, no carried commits):
> - mode presets quick/structured/photo over the ONE composer (same save
>   spine, picker hidden in edit mode);
> - project work gallery on the manager-only stadium page reading EXISTING
>   journal_entry_photos via private-bucket signed URLs, honest
>   empty/preview-unavailable states, no public gallery;
> - migration 20260705250000 (renumbered from 20260705240000 by PR #628,
>   merge SHA 0f6e8b4 — the old prefix collided with the prod ledger name
>   20260705240000_agency_legacy_retype, applied via MCP as ledger version
>   20260705111011; the gallery file itself was never applied anywhere, so
>   the rename was pure) — ADDITIVE, CREATE-POLICY-ONLY (two SELECT
>   policies mirroring the 0013 journal_entries manager boundary) + paired
>   rollback file; migration-safety gate GREEN; **apply stays OWNER-GATED**
>   (map gate item 5) — NOT applied; managers see an honest empty gallery
>   until applied; ratchet 109→110 bumped in the three baseline guards;
> - guard journal-modes-gallery.test.ts (16 tests); suite 7728/7728; build/
>   lint/constitution/pilot-honesty/i18n-debt/route-smoke all green;
> - labma-security-reviewer: APPROVE WITH NOTES — follow-ups for owner:
>   (1) consider gallery signed-URL TTL 3600s → 5–15 min; (2) pre-existing:
>   storage INSERT policy validates only path segment [1], segment [2] is
>   uploader-asserted for direct uploads — cheap hardening slice;
>   (3) soft-delete filtering is app-side only (parity with entry boundary).
> - Area moves when merged: 14 Y→G, 15 R→G(scoped), 16 Y→G(scoped) —
>   "scoped" = manager visibility activates on owner apply of 20260705250000.
> - Merge state: MERGED — squash SHA c2a9ac0 on main (CI fully green:
>   quality, migration-safety, Vercel; Supabase Preview skipped as usual).
>   Local worktree ..\labourmarketai-w8 and local branch
>   feat/cc/journal-modes-gallery still exist (cleanup was declined this
>   session — safe to remove any time; remote branch deleted).
>
> ## ADDENDUM 2 — WAGON 9 EXECUTED (2026-07-05, same later session)
>
> Owner LT-FIRST correction honoured: all legal/document guidance exists in
> LITHUANIAN ONLY; EN/RU show only "prepared from the Lithuanian master".
> WAGON 9 = PR #629, merge SHA e4da336 (1 commit 86d4af3, isolated worktree
> labourmarketai-w9 from main @ 0f6e8b4 — ownership lock honoured):
> - lib/documents/lt-master-guidance.ts — SINGLE content source: 17
>   conservative LT draft items (6 general + LT/LV/EE/NL/DE/DK/NO/SE/PL),
>   dimensions (worker/company/work country × role × context), "kas
>   dažniausiai pasirūpina", 5-state pipeline (LT_DRAFT_READY →
>   OWNER_EDITING → OWNER_APPROVED_LT → TRANSLATION_READY → TRANSLATED),
>   EVERY row needsLegalReview: true (0 approved, 0 translated);
> - locale-split surface on /dashboard/documents#guidance (both readiness
>   branches); guard lt-master-document-guidance.test.ts (30 tests) pins
>   LT-only bodies, EN/RU leak probes, conservative wording, no CTA/form
>   (WAGON 10 scope), country_document_requirements untouched (no migration);
> - owner review index: runtime/audits/lt-master-documents-owner-review-2026-07-05.md
>   (local-only) — where to read (/lt/dashboard/documents#guidance), how to
>   approve (flip status + needsLegalReview in the data module);
> - command finder untouched (lock #1 holds until WAGON 10);
> - suite 7758/7758 (495 files); all repo checks green; CI green.
> - Area 17 → GREEN-scoped (content approval = owner/lawyer gate).
>
> TALLY after W9 (recount from the W7 tally + W8/W9 moves):
> **14 GREEN (1,4,5,6,7,8,9,10,11,12,14 + scoped 15,16,17) · 4 YELLOW
> (2,3 legal wording · 13 recognition-limits copy · 19 awaits W10 type) ·
> 1 RED (18 help-demand CTAs = WAGON 10) · area 20 RED-by-design ·
> payments BLOCKED.** Progression: … → W7 10/7/2 → W8 13/5/1 → W9 14/4/1.
>
> PENDING PRODUCTION APPLY (owner gate, unchanged): 20260705250000
> journal_photos_project_gallery (renumbered by #628; rollback file paired).
> Also pre-existing: 20260610190000 original_language draft.
>
> ## ADDENDUM 3 — WAGON 10 EXECUTED + BOTH APPLIES DONE (2026-07-05)
>
> APPLY VERIFICATION (this session, Supabase MCP only, no db push):
> - 20260610190000 original_language — ALREADY APPLIED (2026-06-11 per
>   ledger; verified live: conversation_messages.original_language exists).
>   No action taken.
> - 20260705250000 journal_photos_project_gallery — APPLIED + VERIFIED
>   (both SELECT policies exist, ledger version 20260705160046). WAGON 8
>   gallery now live for org managers. APPLIED_LEDGER.md row committed in
>   PR #630.
> - 20260705260000 help_request_intake — APPLIED post-merge + VERIFIED
>   (submit_help_request_v1 SECURITY DEFINER, grants postgres+authenticated
>   only, ledger name recorded, 0 pre-existing help rows). Ledger doc row
>   rides the WAGON 11 closure PR.
>
> WAGON 10 = PR #630, merge SHA c189a68 (1 commit, isolated worktree
> labourmarketai-w10 from main @ e4da336 — ownership lock honoured):
> - five typed INTERNAL help CTAs (recruiter/accounting/legal/documents/
>   demand_filling) on /dashboard/company#help → submit_help_request_v1 →
>   customer_requests row at status 'in_review' (operator-visible; NEVER on
>   the submitted-only agency/worker demand projections); honest success
>   copy (human review, no auto-assigned specialist), no external sending,
>   no payments — guard help-request-cta.test.ts (17 tests);
> - admin queue: helpRequests SECTION on the existing sales-intake panel
>   (reused follow-up action; demand queue now excludes help rows);
> - command finder: owner lock #1 FLIPPED with its guard — recruiter_help/
>   accounting_help/legal_help now route to /dashboard/company, audience
>   company, truthful 'Prašyti…/Request…/Запросить…' action labels;
> - LT-first: help explanations in lib/help/help-explanations-lt.ts (LT
>   master, all LT_DRAFT_READY awaiting owner review); EN/RU show the
>   pending notice; leak probes guard-pinned;
> - ratchet 110→111; suite 7776/7776 (496 files); all checks + CI green.
>
> TALLY after W10: **16 GREEN (1,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19) ·
> 3 YELLOW (2,3 legal wording — owner/lawyer gate · 13 recognition-limits
> copy) · 0 RED · area 20 RED-by-design (W11 deliverable) · payments
> BLOCKED.** Progression: W7 10/7/2 → W8 13/5/1 → W9 14/4/1 → W10 16/3/0.
>
> NEXT SESSION → WAGON 11 FINAL CLOSURE: create
> runtime/audits/commercial-readiness-human-usability-final-closure doc
> answering the owner's 14 questions ONLY with true statements; corrected
> tally + progression + carried-commit history (90a964e via #622) per the
> locks; commit ALL local-only audit files (this handoff, branch-ownership
> lock, LT master review index, closure) via a docs PR (git add -f — the
> runtime/ tree is gitignored); add the 20260705260000 APPLIED_LEDGER row;
> name every remaining YELLOW and the standing owner gates (legal wording,
> pricing flip, payment provider, LT-master approvals: 17 guidance items +
> 5 help explanations all needsLegalReview).

Owner CONTEXT HANDOFF LOCK executed. State verified from git/GitHub, not memory.
NEXT SESSION: read this file + the train doc
`C:\Users\Mano\Downloads\LABOURMARKETAI_COMMERCIAL_READINESS_HUMAN_USABILITY_TRAIN.md`
before doing anything.

## Train identity
- Train: Commercial Readiness & Human Usability Train (11 wagons)
- Repo: C:\Users\Mano\Documents\labourmarketai · GitHub bandymuks1-stack/labourmarketai
- Latest merged main SHA: **f6c2be5** (local main == origin/main, tree CLEAN,
  `git diff --stat` empty, no uncommitted files, no open CR-train branch)

## Completed wagons (all squash-merged green, six-point gated)
| Wagon | PR(s) | Merge SHA | Area moves |
|---|---|---|---|
| 1 audit/map | #619 | 8a40990 | baseline mapped (later reconciled) |
| 2 compliance/GDPR/project explanation | #620 | f78787b | 1 Y→G, 4 R→G |
| 3 command finder | #621 (+ carried lock fix 90a964e via #622) | 5bb901e | 6 R→G |
| 4 free vs paid clarity | #622 (carries 90a964e, disclosed) | 3040556 | 7 stayed G (clarity layer) |
| 5 language communication clarity | #623 | 2c6d836 | 9 Y→G (8 stayed G) |
| 6 sports operating model | #624 | 9b201ee | 10 Y→G |
| 7 permission matrix | #625 + owner-lock addendum #626 | 4c25baa + f6c2be5 | 12 R→G |

NOTE vs owner's stale snapshot: WAGON 7 IS ALREADY MERGED (#625/#626) — not
"next/current". No wagon is currently active; Wagon 8 was NOT started (held by
this handoff lock).

## Exact corrected tally (area-by-area recount; drift in wagon 4-6 report
## arithmetic was owner-caught and corrected — per-area bodies were always right)
After Wagon 7: **10 GREEN / 7 YELLOW / 2 RED (+ area 20 RED-by-design) / payments BLOCKED**
- GREEN: 1, 4, 5, 6, 7, 8, 9, 10, 11, 12
- YELLOW: 2, 3 (legal wording — owner/lawyer gate), 13, 14, 16, 17, 19
- RED: 15 work gallery (Wagon 8), 18 help-demand CTAs (Wagon 10)
- Area 20 = RED by design (Wagon 11's own acceptance checklist deliverable)
- Progression table: W1 4/10/5 → W2 6/9/4 → W3 7/9/3 → W4 7/9/3 → W5 8/8/3 →
  W6 9/7/3 → W7 10/7/2.

## Tests / build at checkpoint
Suite 7710/7710 (last full run on #626 pre-merge) · build PASS · all honesty/
constitution/i18n/route-smoke gates PASS · CI green on every merge.

## Pending DB items
- NO pending applies from the CR train (it has produced zero migrations).
- Pre-existing owner-gated draft: 20260610190000 original_language (applying it
  lights up Wagon 5's message-language chips).
- Ratchets = repo migrations = 109 unchanged.

## Payment provider
BLOCKED / OWNER PAYMENT GATE. Untouched all train. Capture-impossible
guard-proven (billing-readiness.test.ts). Must not be touched.

## Owner locks currently ACTIVE (all binding on the next session)
1. NO-FAKE-FINDER-RESULTS (guard-enforced in command-finder.test.ts):
   recruiter/accounting/legal help finder terms stay information-only until
   Wagon 10 lands the real internal request flow — Wagon 10 must update routes
   AND that guard together.
2. BRANCH OWNERSHIP LOCK (cr-train-branch-ownership-lock-2026-07-05.md): one
   writer per tree; pre-PR commit listing; carried commits declared; history of
   the one collision (90a964e via #622) must appear in final closure.
3. COUNT RECONCILIATION: closure uses the corrected tally + progression table
   above; no RED hidden under YELLOW/payments.
4. WAGON 6 PART B: sports model = no fake rankings/scores/game layer (guarded).
5. FINAL CLAIM LOCK (from the previous train, still standing for its closure
   docs) + train doc §4 non-negotiables.
6. Legal final wording = owner/lawyer gate; pending-wording markers stay honest.

## Local-only files awaiting commit (per branch-ownership lock, ride the NEXT
## audit-committing PR or Wagon 11 closure — do NOT commit from a hot tree)
- runtime/audits/cr-train-branch-ownership-lock-2026-07-05.md
- runtime/audits/commercial-readiness-context-handoff-2026-07-05.md (this file)

## Unrelated standing state (do not touch)
- 6 old docs/audit draft PRs open (#516/511/510/507/486/379) — predate both
  trains; not CR work; leave for owner review.
- Old local branches from prior sprints exist; do not delete without owner ask.

## EXACT NEXT ACTION (next session, after re-verifying repo per train doc §3)
Launch WAGON 8 — journal modes, work gallery, photo reports (areas 14, 15, 16;
15 is RED): branch `feat/cc/journal-modes-gallery` from fresh main; spec = train
doc §WAGON 8 + audit map areas 14/15/16 (reuse: existing composer,
journal_entry_photos pipeline from 20260612091000 applied, project handover
surfaces, private storage patterns; modes = quick entry / structured report /
photo report / project gallery; NO public gallery by default; any
storage/migration need = additive, RLS-scoped, owner-gated apply, rollback-safe
per the established draft pattern; ratchet 109→110 if a migration is genuinely
needed). Then Wagon 9 (jurisdiction guidance registry — /dashboard/documents
engine exists, requirements registry ships empty needs_legal_source), Wagon 10
(help-demand CTAs + finder flip under lock #1 + admin queue view via
follow_up_tasks/#614 + sales intake/#615), Wagon 11 (final acceptance closure:
answer all 14 owner questions; commit ALL local-only audit files; closure
wording only if true; restate carried-commit history and corrected tally).
