# Commercial Readiness & Human Usability Train — FINAL ACCEPTANCE CLOSURE (2026-07-05)

**Train:** Commercial Readiness & Human Usability Train, 11 wagons
(spec: `LABOURMARKETAI_COMMERCIAL_READINESS_HUMAN_USABILITY_TRAIN.md`, owner
copy in Downloads; binding wagon plan:
`runtime/audits/commercial-readiness-human-usability-map-2026-07-05.md`).
**Baseline:** `main` @ `f466bb3` (post full-product-tree train, #618).
**Closure baseline:** `main` @ `c189a68` (#630 merged; wagons 1–10 done).
**Method:** every claim below is source-proven (file, guard, CI run, or a
verified production-ledger read). Only-if-true wording; every YELLOW named.

## Wagon ledger (all squash-merged green)

| Wagon | PR(s) | Merge SHA |
|---|---|---|
| 1 audit map | #619 | 8a40990 |
| 2 compliance/GDPR/explanation pack | #620 | f78787b |
| 3 command finder | #621 (+ carried lock fix 90a964e via #622 — the train's ONE branch-ownership collision, disclosed in #622 and here per the lock) | 5bb901e |
| 4 free vs paid clarity | #622 | 3040556 |
| 5 language communication clarity | #623 | 2c6d836 |
| 6 sports operating model | #624 | 9b201ee |
| 7 permission matrix | #625 + #626 | 4c25baa + f6c2be5 |
| 8 journal modes / work gallery / photo reports | #627 (+ renumber fix #628) | c2a9ac0 + 0f6e8b4 |
| 9 LT-master jurisdiction/document guidance | #629 | e4da336 |
| 10 typed internal help requests + finder flip | #630 | c189a68 |
| 11 this closure | docs-only PR | (see PR) |

## Production applies — NOTHING PENDING (verified live 2026-07-05)

| Migration | State |
|---|---|
| `20260705250000_journal_photos_project_gallery` | APPLIED + verified (ledger version 20260705160046; both SELECT policies present). WAGON 8 gallery live for org managers. |
| `20260610190000` original_language | APPLIED 2026-06-11 (pre-existing; verified live: `conversation_messages.original_language` exists). |
| `20260705260000_help_request_intake` | APPLIED + verified (RPC `submit_help_request_v1` SECURITY DEFINER, EXECUTE grants postgres+authenticated only, ledger name recorded, 0 pre-existing help rows). |

No pending non-payment applies remain. The ONLY standing external gate is
the payment provider connection.

## The 22 acceptance answers

1. **Project / legal / GDPR / data-protection docs present?** YES as honest
   drafts and real explanations: `/legal/privacy`, `/legal/terms`,
   `/legal/cookies` (honest "being prepared" state where final wording is
   pending), `/legal/marketplace-rules` (substantive),
   `/legal/data-access` (real explanation + permission matrix, #620/#625).
   Guards: legal-pages-public-clean, no-legal-guarantee-copy, privacy-base.
2. **Owner/lawyer wording gate remaining?** Final wording of privacy /
   terms / cookies (areas 2–3) — plus the LT-master approvals: 17 WAGON 9
   guidance items and 5 WAGON 10 help explanations, all `LT_DRAFT_READY`
   with `needsLegalReview: true` (nothing claims approval — guard-pinned).
3. **Navigation easy and searchable by normal terms?** YES —
   `lib/config/navigation.ts` single source, honest tab set, route truth
   map CI-enforced (area 5 GREEN since WAGON 1).
4. **Command finder live?** YES — #621, curated term → real-route registry
   over feature-availability + route truth map; every result resolves
   (command-finder.test.ts); help terms are now REAL actions (see 18).
5. **Free vs paid boundaries clear?** YES — PRE_PAYMENT_PLANS + honest
   not-purchasable paid tiers + plan-clarity copy (#622); prices stay
   "draft_pricing" until the owner flips (never enables payments).
6. **Payment still blocked?** YES — `PAYMENTS_ENABLED = false`,
   `PRICING_READINESS_STATE = "draft_pricing"`, capture-impossible
   guard-proven (billing-readiness.test.ts 24 assertions,
   no-live-payments.test.ts). Verified from source at closure time.
7. **Multilingual communication honest?** YES — original text always
   preserved, original-language chips live (20260610190000 applied), no
   fake translation anywhere, honest no-translation state (#623).
8. **Everyone sees their selected UI language where supported?** YES —
   active locales lt/en/ru with full parity guard; locale switcher +
   account language section; dormant locales honestly inactive.
9. **Sports/team/object/player-card model usable?** YES — one player-card
   system (guard-pinned), team-brigades on the org spine (#612 applied),
   project stadium/operations surfaces, model explained user-facing (#624);
   no rankings/scores/game layer (fit-not-rating + W6 guards).
10. **Owners/operators can see and assign workers to projects/objects
    where real?** YES — project_worker_assignments spine + operations
    board + roster views; assignments are real rows, honest empty states.
11. **Permission matrix visible and source-backed?** YES —
    `/legal/data-access#matrix`: 11 surfaces × 4 roles + messaging rules,
    every claim pinned to the enforcing policy/RPC/guard
    (permission-matrix.test.ts, 99 assertions after #626).
12. **Skill-recognition limits honest?** STRUCTURALLY YES — three honest
    evidence tiers, candidate gating, no auto-verification, guard-pinned
    phrases. REMAINING YELLOW (area 13): the plain-language "how
    recognition works and its limits" explainer copy on the journal/profile
    surfaces has not shipped.
13. **Journal modes available?** YES — quick / structured / photo-first
    presets over the ONE composer, same save spine (#627,
    journal-modes-gallery.test.ts).
14. **Gallery/photo reports available, private/safe?** YES — project work
    gallery on the manager-only stadium page reading existing
    journal_entry_photos; PRIVATE bucket, short-lived signed URLs, RLS
    mirrors the journal_entries manager boundary (applied + verified);
    no public gallery; no fake verification from photos. Security-review
    follow-ups (non-blocking) are logged in the context handoff.
15. **Jurisdiction/document guidance available?** YES —
    `/dashboard/documents#guidance`: 17 conservative LT draft items across
    9 launch markets with dimensions (worker/company/work country × role ×
    context) and "kas dažniausiai pasirūpina"; the live readiness engine
    (`Mano dokumentai`) unchanged; the DB requirements registry stays
    honestly empty pending legal source.
16. **Lithuanian master text the source of truth?** YES —
    `lib/documents/lt-master-guidance.ts` + `lib/help/help-explanations-lt.ts`
    are the ONLY content sources; 5-state review pipeline
    (LT_DRAFT_READY → … → TRANSLATED); owner review index:
    `runtime/audits/lt-master-documents-owner-review-2026-07-05.md`.
17. **EN/RU legal/document translations blocked until LT approval?** YES —
    guard-enforced: zero approved/translated items may exist today, LT-body
    leak probes fail the build if guidance text appears in en/ru catalogs;
    EN/RU render only the "prepared from the Lithuanian master" notice.
18. **Companies can request recruiter/accounting/legal/document help?**
    YES, LIVE — `/dashboard/company#help`: five typed CTAs (recruiter,
    accounting, legal, document check, demand filling) → gated
    `submit_help_request_v1` (applied + verified) → REAL customer_requests
    row at `in_review`. Honest copy: human review, no auto-assigned
    specialist, nothing sent externally (guard help-request-cta.test.ts).
    Command finder terms flipped to truthful request actions together with
    the guard (owner lock #1 satisfied).
19. **Where do admin/operators see these requests?** The existing admin
    control room → sales-intake panel → "Pagalbos užklausos" section
    (type, note, id-only subject pointer, reused follow-up action);
    requireSuperadmin-gated, admin RLS.
20. **What remains YELLOW? (exactly 3)**
    1. Area 2 — GDPR/privacy FINAL WORDING (owner/lawyer gate; honest
       pending markers shipped).
    2. Area 3 — terms/cookies FINAL WORDING (owner/lawyer gate; honest
       pending markers shipped).
    3. Area 13 — plain-language skill-recognition LIMITS copy (small copy
       slice; recognition itself is honest and guard-pinned).
    Additionally OWNER-GATED (not YELLOW-by-absence): LT-master approvals
    (17 + 5 draft items), pricing flip draft_pricing → owner_confirmed,
    dormant-locale promotion.
21. **What remains BLOCKED?** The payment provider connection — the ONE
    standing external gate. Untouched by this train, capture structurally
    impossible until the owner connects a provider and flips the gates.
22. **What should the owner manually browser-smoke next?** (lt locale,
    ~10 min)
    1. `/lt/dashboard/company` → #help → submit an "accounting" help
       request with a note → expect the honest success state;
    2. `/lt/dashboard/admin` → sales intake → "Pagalbos užklausos" —
       the request appears with type + note; record a follow-up;
    3. `/lt/dashboard/journal` → switch the three entry modes; save a
       photo-first entry with a photo;
    4. as a company manager: `/lt/dashboard/projects/<id>` → "Darbų
       galerija" shows the photo (post-apply manager visibility);
    5. `/lt/dashboard/documents#guidance` → read 2–3 LT guidance drafts,
       check the review-status badges;
    6. command finder → type "buhalterija" → the result is the REAL
       "Prašyti buhalterijos pagalbos" action;
    7. switch locale to EN → documents guidance and help explanations show
       only the "prepared from the Lithuanian master" notices;
    8. `/lt/pricing` → paid tiers still honestly not purchasable.

## Final tally (corrected-tally lock honoured)

**16 GREEN (areas 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19)
· 3 YELLOW (2, 3, 13 — named above) · 0 RED · area 20 = this closure
(delivered by this document) · payments BLOCKED.**

Progression: W1 4/10/5 → W2 6/9/4 → W3 7/9/3 → W4 7/9/3 → W5 8/8/3 →
W6 9/7/3 → W7 10/7/2 → W8 13/5/1 → W9 14/4/1 → W10 16/3/0 → W11 closure.

## Final wording (true as of 2026-07-05)

**Commercial readiness and human usability layer is source-proven. Payment
provider connection remains the major external gate.**

The three named YELLOW items are wording/copy gates (two owner/lawyer, one
small copy slice) — none blocks usage of the shipped product surface.

## Committed with this closure (branch-ownership lock item)

- this closure document;
- `commercial-readiness-context-handoff-2026-07-05.md` (full train context
  incl. WAGON 8–10 addenda, security-review follow-ups, apply verifications);
- `cr-train-branch-ownership-lock-2026-07-05.md`;
- `lt-master-documents-owner-review-2026-07-05.md`;
- `docs/APPLIED_LEDGER.md` row for the verified 20260705260000 apply.
