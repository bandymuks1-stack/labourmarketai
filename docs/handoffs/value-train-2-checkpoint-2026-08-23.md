# Value Train 2 — resumable checkpoint (2026-08-23)

**Base at train start:** merged main `0caf0895` (Train 1, PR #1236).
**Branch (fixed for this train):** `claude/labourmarket-audit-consolidate-dbqwzt`
(restarted from fresh `origin/main` after every merged wagon).
**Production target (verified):** Supabase `gorgitwvdzxbnaxhrsrw` (labourmarket.ai, eu-west-1).

## Completed / merged

| Wagon | PR | Merge SHA | What changed |
|---|---|---|---|
| A — AI activation readiness | #1237 | `e7b098d4` | Model-aware thinking (haiku alias no longer 400s), canonical `claude-haiku-4-5` id, structured-output schema propagated to all adapters, `truncated` request-attributed (chain stops — no paid re-disclosure), chain fallback never ships a foreign vendor's model id, per-client throttles on all three public marketing AI actions + guard. NO provider activated. |
| B1 — weekly intelligence read model | #1238 | `86c2cfdc` | Pure codes-only weekly view model on canonical reads (`journalReportWindow`, `getWorkerJobRecommendations`, §19 basis carried whole). Honesty rules tested: unavailable ≠ zero, unknowable omitted, factual inactivity coding. |
| B2 — weekly digest carrier | #1239 | `bf383492` | `weekly_digest` event/entity type (v6 widening, canonical GREEN idiom), read-time materializer in `event-emitters.ts` (no new service-role caller), pointer-only row (§19(d)), copy in 11 locales (real translations), 3 baselines 235→236. |
| C1 — document→journal draft seam | #1241 | `99fed66c` | The import chain's missing middle: RLS-scoped `document_files` bytes read + deterministic offline extraction (works with AI DORMANT) + provenance metric vocabulary. Honest refusals: classified / images (no OCR exists). |
| C-r3 — journal-backed matches signal | #1251 | `15bfeb40` | WAGON=C-r3 · STATUS=MERGED · USER_VALUE=weekly section shows which matched skills real recorded work already supports (the mechanism working — the counterpart of missing_evidence) · REUSED=getWorkerSkillRows + readWorkerEntrySkillLinks (durable journal_entry_skills links are the truth, per P1 review fix; failed link read → omitted, never guessed) · NEW_PRIMITIVES=none · TESTS=16,509+ green. |
| C-r2 — appeared-this-week market fact | #1250 | `8fa8ee99` | WAGON=C-r2 · STATUS=MERGED · USER_VALUE=weekly section now answers "what changed this week" with the store-independent half: inquiries created in the last 7 days, counts rendered as "N+" when the 100-row board page is full (no silent caps) · REUSED=recentlyCreated already derived for isNew; canonical board read · NEW_PRIMITIVES=none · TESTS=16,507 green · Review findings (created_at semantics, RPC cap) verified and fixed in-PR; submitted_at column + uncapped count RPC recorded as owner-gated follow-ups. |
| E-w1 — no raw i18n key reaches a user | #1248 | `c1e03320` | WAGON=E-w1 · STATUS=MERGED · USER_VALUE=six raw-key-path defects killed: documents checklist could demand a document the UI made unaddable (posting_notification dead-end), profile skill chips, weekly journal-unavailable line, agreements attach form, AI chat tail; verified label now names its origin · REUSED=merged-catalog resolution exactly as lib/i18n/request.ts ships it · NEW_PRIMITIVES=guard i18n-key-resolution.test.ts (seed ⊆ labels; repaired keys resolve; weekly.* literals × 11) · TESTS=16,503 green · SECURITY=copy only. |
| E-w2 — truth-drift copy repairs | #1249 | `be003540` | WAGON=E-w2 · STATUS=MERGED · USER_VALUE=helpInfoNote no longer hides the shipped help-request path; "pre-alpha" gone from 8 locales; /cv one-sided salary keeps its direction (From/Up to); TEST MODE badges localized lt/ru · REUSED=existing row/render patterns · NEW_PRIMITIVES=none · TESTS=16,503 green. |
| C-r1 — weekly intelligence rendered | #1247 | `a155e188` | WAGON=C-r1 · STATUS=MERGED · USER_VALUE=the weekly digest bell finally points at a real summary: journal facts, matching count with whole §19 basis, context-bound skill gaps, honest unavailable states, on /dashboard/opportunities · REUSED=getWeeklyPersonalIntelligence, B1 signals, buildWorkTypeLabelMap, skillNames, createUtcFormatter · NEW_PRIMITIVES=none (render-only section + render guard) · SECURITY=no schema, own-session reads only · TESTS=16,492 green + weekly-intelligence-render guard · PRODUCTION_PROOF=deploys with main (render-only; §5 browser debt recorded below) · Also ships the makePdf page-edge fixture fix (pdf.js truncation at ~50 chars). |
| C2a — provenance on entry save | #1242 | `da29a89c` | `createJournalEntry` accepts a caller-RLS-verified `source_document_file_id`, refuses unverifiable claims (`source_document_invalid`, 11 locales), appends provenance rows atomically; extractor version server-stamped. |
| B3 — notification_preferences (D7) | #1243 | `cf7d641f` | Owner APPROVED D7 2026-08-23 → migration annotated `-- @human-gate-approved`, merged through the RED route, **APPLIED TO PROD via MCP** and read-verified (table exists, RLS enabled, 4 own-row policies, 0 rows). Semantic categories at the slug layer; no global agree-all; marketing never silently opt-in. |

**APPLIED TO PROD: notification_events_v6_weekly_digest** (rollback:
`supabase/rollbacks/20260823150500_notification_events_v6_weekly_digest.down.sql`)
— post-apply MCP read verified both CHECK constraints include `weekly_digest`.

**APPLIED TO PROD: notification_preferences_v1** (rollback:
`supabase/rollbacks/20260823160000_notification_preferences_v1.down.sql`)
— post-apply MCP read verified: table_exists=true, rls_enabled=true,
policy_count=4 (all `auth.uid()` own-row), row_count=0.

## Production evidence gathered (read-only, 2026-08-23)

`ai_runs` 0 · `usage_cost_events` 0 (AI DORMANT confirmed) ·
`notification_events` 2 rows pre-train · profiles 36 · journal_entries 36 ·
active `public_vacancies` 43,817 · `document_files` 0 · `customer_requests` 17.

## Owner continuation (2026-08-23 ~20:00 UTC) — train resumed

The owner directed: do NOT wait for Telegram, do NOT idle on #1244, continue
GREEN wagons autonomously (directions A–L), PARK RED/owner gates, no
questions until train end. Consequences executed:
- **#1244 temporarily CLOSED** to free the single train branch (same
  sanctioned re-sequencing as #1240→#1243); content preserved on local
  branch `c2b-backup` (`bdeb592`); an identical draft PR re-opens at the
  train tail. Its state is unchanged: CI green, IMPLEMENTED_NOT_PROVEN in
  browser, blocker = browser-capable environment.
- Continuation audits (read-only, evidence in session log): email delivery
  (A), weekly opportunity intelligence (C), landing market intelligence (H).
  Findings: email loop unclosable now (no `INVITE_EMAIL_*` credentials =
  owner gate; no preferences UI = §5 browser gate; D7 §3 dispatch design
  open) — PARKED. Trends/EUR/employer-identity — PARKED (D2, no FX code, no
  history data). Weekly intelligence rendered = wagon C-r1 (merged, above).

**Wagon C2b — IMPLEMENTED, re-opened as a fresh draft PR at the train tail**
(the closed #1244's content cherry-picked onto latest main; the weekly
section and E-wagon fixes it now sits on are all merged). Blueprint fully
executed:
documents page gains a per-file "draft journal entry" link (extractable
mimes only — images honestly get none), inline `?draftFrom=` review section
(no new route/modal — product gate 0 surfaces), worker edits + explicitly
confirms → canonical journal entry with C2a provenance. 18 copy keys ×
11 locales. Evidence: typecheck 0 / lint 0 / full suite 16,489+ green /
all five honesty scripts clean. Offline capability proof (safe fixture):
PDF + DOCX → full-text extraction → time 6 h, quantity 20 m², skill
`roofing`, site "Vilniuje" — **CAPABILITY_PROVEN**;
REAL_OWNER_DOCUMENT_E2E = NOT_YET_PROVEN.

**Why #1244 stays draft (doctrine §5):** the browser pass is
environmentally impossible in the 2026-08-23 managed session — (a) no
Docker daemon → no local Supabase stack, AND (b) org egress policy answers
**403 to CONNECT `*.supabase.co`** for every tool (agentproxy status is the
primary source), so even a locally served production build cannot log in.
Needs either a Docker-capable session (docs/TESTING.md stack +
`tests/e2e/document-journal-draft.spec.ts`) or supabase.co egress; the
committed `apps/web/scripts/c2b-browser-acceptance.ts` driver is
proxy-ready. En route, a real fixture bug was fixed (`a187f16`): `makePdf`
drew one long 24pt line off the page edge and pdf.js truncated extraction
at ~50 chars.

**Cleanup done:** the marked synthetic prod test account
(`train2.c2b.e2e.worker@example.com`, never logged in) was deleted and
verified gone (0 rows everywhere). Both stale PR check-in triggers
(#1240, #1243) deleted; the session watches #1244 only.

## Open owner gates

Train 1: D1 (CI ledger grant) · D2 (employer-count registry identity, RED
SQL drafted in the package) · D3 (search index option A/B) · D4 (draft-queue
per-file verdicts) · D5 (/jobs throttle waiver) · D6 (AI activation route).
Train 2: **D7 CLOSED** (approved 2026-08-23 → merged `cf7d641f` → applied to
prod → verified) · D8 (gemini costClass) · D9 (Telegram env secrets).
TELEGRAM_STATUS = UNAVAILABLE this environment.
NEW environmental gate: browser acceptance for the C2b draft PR (Docker OR
supabase.co egress — see "In flight").
**H (public landing top-15 professions) PARKED — owner gate:** the landing
is frozen by owner directive (`lib/guards/landing-freeze.test.ts`:
"Do NOT regenerate the baseline unless the change is part of the explicit,
owner-approved landing plan"). The 10→15 slug extension is prepared
(welder, plumber, painter, teacher, sales_assistant — all with 11-locale
catalog coverage) and waits for that plan; it was deliberately NOT forced
past the freeze. Also parked: submitted_at timestamp for demands +
uncapped board count RPC (both RED-route schema/RPC changes, from #1250
review), pilot-framing copy replacement on /pricing (owner wording),
LT-only legal guidance bodies (owner/legal).

## Next highest-value seams (in priority order, per the train's bias)

1. **After D6:** one harmless E2E AI proof (one `ai_runs` row,
   `schema_validation='passed'` + paired cost event) → AI_RUNTIME =
   CAPABILITY_PROVEN/VERIFIED_PRODUCTION.
2. **D7 is closed →** email dispatch wagon is now unblocked (reuse
   `lib/email/transactional.ts`, invitation delivery-ledger pattern,
   GH-Actions kill-switched cron; per-type consent rows live in
   `notification_preferences`) — closes the loop for absent workers.
3. **Wagon C2b:** run the browser pass for draft #1244 in a
   browser-capable environment (everything else is done and green) — the
   first real `document_files` rows and the full §27 proof land there.
4. **D2 → Market Pulse (Wagon E):** canonical employer count unblocks the
   public aggregate surface.
5. `worker_opportunity_seen` apply (D4 "APPLY" recommendation) unlocks the
   honest "new since last week" digest signal (currently omitted by design).

## Status labels (hard completion rules)

AI_RUNTIME = IMPLEMENTED_NOT_PROVEN (activation-ready; owner-gated).
WEEKLY_DIGEST_IN_APP = SHIPPED (merged + deployed + prod constraint
verified; first real rows require real worker visits — REAL_USER_DATA not
yet claimed). NOTIFICATION_PREFERENCES_SCHEMA = VERIFIED_PRODUCTION (D7).
NOTIFICATION_EMAIL = IMPLEMENTED-BLOCKED-ON-NOTHING code-wise but not
built yet (next train candidate; D7 consent layer ready).
DOCUMENT_IMPORT_CHAIN = CAPABILITY_PROVEN offline (pdf+docx, safe
fixture); UI in draft #1244; REAL_OWNER_DOCUMENT_E2E = NOT_YET_PROVEN;
images/OCR = NOT_SUPPORTED (honestly refused, no dead links).
