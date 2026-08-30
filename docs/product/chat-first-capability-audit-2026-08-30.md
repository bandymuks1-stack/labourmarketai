# Chat-First Product Control — Capability / UX / Domain Completion Audit

**Date:** 2026-08-30 · **Baseline:** main `f7f44611` (audit ran against this
tree; docs commit `523922b5` on top) · **Method:** three parallel source-level
sweeps (web chat pipeline, MCP/capability layer, per-user-goal domain map) +
production Supabase log verification. Statuses are evidence-based; nothing
below is claimed from documentation alone.

> Authority: subordinate to [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md),
> [`PLATFORM_DOCTRINE.md`](../PLATFORM_DOCTRINE.md), the product vision lock.
> This document is the chat-first LENS over
> [`docs/CAPABILITY_INVENTORY.md`](../CAPABILITY_INVENTORY.md), not a second
> inventory — where they overlap, the inventory's per-capability proof levels
> stand.

---

## 0. Real-client proof state (server-log verified)

| Fact | State | Evidence |
|---|---|---|
| REAL_CHATGPT_OAUTH_CONNECTION | **PROVEN** | DCR 201 → consent 200 → token 200 (`resource=https://labourmarket.ai`), prod Supabase auth logs 2026-08-30 |
| MCP_IDENTITY_PROVEN | **YES** | every bearer verification 200 under the caller's own JWT subject |
| MCP_READ_PROVEN | **YES** | unique `profile.get` fingerprint (`profiles?select=…onboarded,active_role`) executed 11:44:16.546 UTC, status 200, subject = caller — caller-scoped RLS, no service role |
| MCP_WRITE_PROVEN | **YES** (2026-08-30 13:16 UTC) | full natural-language draft→choice-by-name→preview→confirm E2E through the real ChatGPT client: exactly-once canonical write (`journal_entries` 18→19, entry `5e7557f9-…`), caller's own JWT subject, chosen context attributed, chain intact, draft wrote nothing, real-client replay rejected `stale_state`, entry visible in the web journal. Evidence: `CHATGPT_MCP_CLIENT_V1.md` §7 |
| Connector attach UX | ChatGPT platform behavior | developer-mode connector tools are **per-conversation**; until attached to the composer the model has no tools and declines in prose. Not a server defect. Mitigation shipped: honest MCP `annotations` + richer presentation (see §5) |

## 1. Architecture verdicts (the §27 headline flags)

| Dimension | Verdict | The one-sentence truth |
|---|---|---|
| CHAT_FIRST_ARCHITECTURE | **PARTIAL — real, deterministic, guarded, but not registry-driven** | The web chat routes 32 intents with an honest no-LLM keyword router and never claims false success; but the intent→handler map lives inlined in a 2,453-line client component (`conversation-chat.tsx`), not in an enumerable registry, so nothing can audit/guard/i18n-check what chat can do. |
| ACTIVE_CONTEXT_MODEL | **ONE model, server-authoritative — but chat can't touch it** | `getWorkspaceContext()` + `lm_active_workspace` cookie is the single truth (W9-guarded). **No chat intent can switch context** — the single most fundamental piece of product state is unreachable by sentence. Also: `dispatch.ts` derives the executing workspace from the action-id namespace (`company.*`), not the caller's active workspace. |
| INTENT_ROUTING | **Deterministic scored needle-matcher, 32 intents, no semantic layer** | lt/en/ru have full pattern coverage; nl/de cover ~12/32 despite routing as full locales; the router sits OUTSIDE the concept-resolution seam built precisely to end per-language needle lists. |
| PRESENTATION_LAYER | **Exists but is three mechanisms, not one contract** | Server "summary" modules + `WorkflowResult` (mandatory `explanation.why`, 8/32 intents) + structured cards/panels. No raw JSON is ever shown in web chat. MCP had NO presentation until this audit's slice (§5). |
| STRUCTURED_UI_SYNC | **SOUND — one canonical domain state** | Chat writes go through `dispatch.ts` → the same server actions the UI uses; `no-direct-write.test.ts` guards it. Watch items: transcript appends are fire-and-forget; two selection stores (`?result=` URL vs World State) for the same "open X" request. |
| FILE_INGESTION | **FRAGMENTED ×3, no shared architecture** | CV extract (proven, worker-only) · admin CSV sandbox (dry-run only, writes nothing) · vacancy/Eurostat corpus importers. **No XLSX anywhere in the repo. No employer bulk import. No shared import-session primitive** (`import_session_id` is a vacancy-corpus column only). |
| MOBILE_REUSE | **Correct-by-design, currently a stale gate** | `packages/client-core` shares transport shape (bearer + Accept-Language) and deliberately zero domain logic. But `DOMAIN_TRANSPORT_STATUS.open=false` cites the pre-#1331 world — the seam it waits on has shipped; the refusal flag is stale. Mobile reaches no product data today. |
| MULTILINGUAL_REUSE | **Honest but shallow** | 5 routed locales of 26 required; intent patterns are hand-written per language per rule; `LANGUAGE_MATRIX.md` stays the one number source; the concept-resolution seam exists but chat routing doesn't use it. |

## 2. Domain scorecard (§21)

Columns: DOMAIN_READY (canonical layer) / UI_READY / CHAT_READ / CHAT_WRITE /
MOBILE / CHATGPT / SAFE (confirmation + RLS) / HUMAN_FRIENDLY / E2E_PROVEN.
✅ real · ◐ partial · ✗ missing · n/a not applicable.

| Domain | DOMAIN | UI | CHAT_R | CHAT_W | MOBILE | CHATGPT | SAFE | HUMAN | E2E |
|---|---|---|---|---|---|---|---|---|---|
| PROFILE | ✅ | ✅ | ✅ card | ◐ (work-card/prefs via forms; no role/locale switch) | ✗ (gate stale) | ◐ read-only | ✅ | ✅ | ✅ web |
| LIVING_CV | ✅ (incl. EU format) | ✅ | ◐ (skills via profile card) | ✅ (CV import + per-item confirm) | ✗ | ◐ skills read only | ✅ | ✅ | ✅ import chain |
| WORK_JOURNAL | ✅ (hash chain, pipeline) | ✅ (projection; create is chat-only BY DESIGN) | ◐ (recent summary; no inline list renderer) | ✅ draft→preview→confirm | ✗ | ✅ draft+confirm (write E2E pending) | ✅ | ✅ | ✅ web/chat |
| COMPANY | ✅ | ✅ | ◐ overview link | ◐ (memberships/setup not in chat) | ✗ | ✗ | ✅ | ✅ | ◐ |
| PROJECT | ✅ | ✅ | ◐ open-project | ◐ (assign only; no create/status via chat) | ✗ | ✗ | ✅ | ◐ (`project` result has no inline renderer) | ✗ (inventory: UNPROVEN) |
| TEAM | ✅ (approvals, timesheets, review) | ◐ (no /people index, no /timesheets index) | ◐ (engagements, who-waits deep-link) | ✗ | ✗ | ✗ | ✅ | ◐ | ✗ |
| EMPLOYER_NEED | ✅ (NL intake proven LT/EN/RU/NL) | ✅ | ✅ | ✅ create/confirm/close/reopen | ✗ | ✗ | ✅ | ✅ | ✅ |
| MATCHING | ✅ (deterministic, evidence-tiered) | ✅ | ✅ 3-best | ✅ express-interest | ✗ | ✗ | ✅ | ✅ | ✅ |
| OPPORTUNITIES | ✅ | ✅ | ✅ | ✅ | ✗ | ✗ | ✅ | ✅ | ✅ |
| MARKET | ✅ | ✅ (no /market index page) | ◐ (map only as result surface, no sentence route) | n/a | ✗ | ✗ | ✅ | ✅ | ◐ |
| REPORTING | ◐ (5 CSV/JSON routes; window-report engine) | ◐ | ◐ figures summary | ✗ (no export via chat) | ✗ | ✗ | ✅ | ◐ | ◐ |
| FILE_INGESTION | ◐ (3 unconnected paths) | ◐ | ✅ CV only | ✅ CV only | ✗ | ✗ | ✅ | ✅ | ✅ CV |
| CONTEXT_SWITCHING | ✅ (one model) | ✅ header dropdown | ✗ **no intent** | ✗ | ✗ | ✗ | ✅ | n/a | ✅ UI |
| MOBILE | n/a | scaffold ✅ | n/a | n/a | — | n/a | ✅ honest refusal | ✅ | build-level only |
| CHATGPT | 4 capabilities | n/a | ✅ read | ◐ (write unproven E2E) | n/a | — | ✅ | ✅ (this slice) | read ✅ / write ✗ |
| AI_ACTORS | recorded (ARCH §5.1), deferred | n/a | n/a | n/a | n/a | transport seam = MCP | ✅ | n/a | n/a |
| MULTILINGUAL | ◐ 5/26 routed | ✅ parity-guarded | ◐ lt/en/ru full; nl/de ~12/32 | same | ✗ | ◐ Accept-Language honored | ✅ | ✅ | ◐ |

## 3. Gap matrix — what's missing, why, and the canonical fix (§20)

Priorities: P0 blocks basic product operation · P1 breaks the chat-first loop ·
P2 major workflow incomplete · P3 polish/advanced.

| # | Gap | Domain | What exists | What's missing / why | Canonical fix | Prio |
|---|---|---|---|---|---|---|
| G1 | **Context switch unreachable by chat** | context | `switchActiveOrganization`/`switchWorkspace` (UI-only) | no intent, no chip; chat can't change the state everything else resolves against | one `switch-context` intent + `ws:<id>` chip calling the existing `auth.switchWorkspace` — no new domain code | **P0** |
| G2 | ~~Intent→handler map not a registry~~ | chat core | `lib/conversation/intent-registry.ts` | **CLOSED 2026-08-30**: declarative `IntentDescriptor` table (domain, read/write class, handler id, typing behavior) + `dispatchIntent`; component supplies handlers, exhaustive both ways at compile time; source-slicing guards re-anchored to registry/handlers. Per-locale coverage field deferred to G3 (needles become data there — declaring locales the router cannot prove would be a lie) | — | done |
| G3 | **nl/de routed but ~12/32 intents understood** | i18n | full lt/en/ru needles | German/Dutch users get fluent UI + generic chat fallback; violates LANGUAGE_MATRIX honesty | complete needle sets for nl/de as data; then migrate router behind the concept-resolution seam | **P1** |
| G4 | **MCP surface = 4 capabilities vs 19 schema'd chat actions** | external clients | `worker-schemas.ts` has 9 worker + `company-schemas.ts` 10 company actions, all zod'd + confirmation-tiered | executors are cookie-coupled (259/893 lib modules self-resolve cookie client) | per-action `createJournalEntryCore`-style extraction, then a CONVERSATION_ACTIONS→CapabilityDescriptor bridge; NO new domain logic | **P1** (foundation) |
| G5 | ~~No MCP annotations / no presentation~~ | external clients | — | **CLOSED by this audit's slice** (§5) | — | done |
| G6 | **journal.list / living_cv.get missing from MCP** | journal/CV | `buildVerifiedCv()` exists (cookie-coupled); journal list is inline page SQL — no service function at all | ChatGPT can write a journal entry but cannot read the journal | extract `listJournalEntries(caller)` service fn; thread `buildVerifiedCv` on the caller client | **P1** |
| G7 | **Mobile domain gate stale** | mobile | `resolveApiIdentity` shipped; `/api/mcp` live over the same bearer boundary | `DOMAIN_TRANSPORT_STATUS.open=false` cites pre-#1331 state; mobile reaches nothing | flip the gate against the SAME capability registry (mobile = another MCP-shaped client), align refusal vocabularies (`rate-limited` missing on mobile) | **P1** |
| G8 | **`candidates`/`projects` chip-only** | employer/projects | `startEmployerCandidates`, `startProjects` handlers exist | typed sentences land on `find-workers` (different engine) — same request, two paths | add sentence needles routing to the same handlers | **P1** |
| G9 | **Whole domains sentence-unreachable** | market, documents, tasks, finance, timesheets, assets, listings, learning | most reachable via command-finder (search box) | search box ≠ chat; the coverage guard counts either as "reachable" | after G2, add intents per domain from the registry | P2 |
| G10 | **No file ingestion architecture** | ingestion | CV extract (proven); admin CSV dry-run sandbox; corpus importers | no XLSX dep at all, no employer bulk import, no persisting CSV path, no shared import-session/provenance primitive | design ONE ingestion architecture (parse→classify→resolve→preview→confirm→write+provenance) generalizing the proven CV chain; map first, build after owner scoping | P2 |
| G11 | **No per-project hours rollup** | project | hours aggregate by worker/day; journal carries `project_id` | "kiek žmonių šiandien dirbo projekte X?" unanswerable | aggregate `journal_entry_metrics` by project in the window-report engine | P2 |
| G12 | **Reporting: CSV only, no chat/export capability, no XLSX, no per-worker export** | reporting | 5 export routes + `getJournalWindowReport` | chat can't produce/export a report; "same Excel format back" impossible | expose window-report as capability; XLSX writer decision is part of G10 | P2 |
| G13 | **3 results `unverified`** (journal, evidence, invoice) — no inline renderer | presentation | result-registry honesty gate works | the journal — the core worker artefact — can be written but not SHOWN in the panel | build the journal inline renderer first | P2 |
| G14 | **Missing index pages**: `/dashboard/people`, `/dashboard/market`, `/dashboard/planning/timesheets`, dead `/dashboard/company/projects` | UI | children exist | dead/absent hubs referenced by actions | small index pages or honest redirects | P2 |
| G15 | **Fallback copy understates the product** | chat UX | `conversation.chat.fallback` names 3 capabilities of ~30 | the "not understood" answer actively shrinks perceived product | rewrite fallback per role from the (future) intent registry | P2→after G2 |
| G16 | **Transcript append fire-and-forget** | chat state | hash-chained `assistant_messages` | dropped append silently desyncs durable transcript from rendered thread | surface append failure to the thread (marker), or await with timeout | P2 |
| G17 | **Two selection stores** (`?result=` URL vs World State) | chat state | both work | same user goal takes two state paths by entry point | converge on one selection door (decision record first) | P3 |
| G18 | **`write-employer` deflects** (neither acts nor refuses) | communication | messaging exists via `messages-view` | the one intent violating the honesty model's spirit | route to messaging flow or honest not-built refusal | P3 |
| G19 | **Workspace derivation from action-id namespace** (`dispatch.ts`) | safety model | server re-resolves per action class | caller's ACTIVE workspace ignored for `company.*` actions — likely intentional, undocumented | decision record; if intentional, guard it | P2 |
| G20 | **No EU CV machine-readable file export** | CV | print-to-PDF via browser | no PDF/XML/JSON endpoint | server-side render decision owner-gated (cost) | P3 |

## 4. Read/write safety classification (§8) — verified sound

- READ: frictionless everywhere (13 read-tier actions + all MCP reads).
- REVERSIBLE/IMPORTANT writes: two-phase HMAC confirmation (`prepare → token →
  dispatch`), token bound to actionId+inputHash+userId+stateFingerprint, 5-min
  TTL. Journal confirm's fingerprint = chain head → genuinely one-time.
- STRONG_IRREVERSIBLE tier exists (3 actions) and is confirmation-gated.
- Noted: only booking/interest/engagement-end have per-action state
  fingerprints; other tokens are fresh-but-not-single-use (recorded, not
  urgent — every one still requires explicit user confirm).
- No confirmation spam found on reads. Honesty model (`reminderBlocked`,
  `translateBlocked`, unavailable≠empty distinctions) is real and guarded.

## 5. Shipped in this audit train (2026-08-30)

1. **Docs reconciliation** (main `523922b5`): real-ChatGPT read proof recorded
   with server-log evidence; server-lifecycle policy committed.
2. **MCP honest annotations** (`CapabilityAnnotations`, REQUIRED per
   capability): reads/draft `readOnlyHint:true`; confirm
   `readOnlyHint:false destructiveHint:false idempotentHint:true`; all
   `openWorldHint:false`. Emitted verbatim in `tools/list`.
3. **Capability presentation adapter** (`lib/capabilities/presentation.ts`):
   successful tool calls lead with a localized human summary (`capabilities`
   i18n namespace, 5 active locales, parity-guarded), full structured payload
   preserved in text AND `structuredContent`. Additive; failure of the
   summarizer can never break the call.
4. **Chat context-switch intent** — see the PR for scope actually landed.

## 6. Reuse-first list (top existing assets for the next slices)

`createJournalEntryCore` (the adapter pattern itself) · `findWorkForChat` ·
`loadWorkerOpportunityMatches` · `expressInterestAction` ·
`submitDemandRequest` · `startDemandFromNeedText` · `buildVerifiedCv` +
`buildEuFormatCv` (pure) · `confirmCv*Action` family ·
`reviewJournalEntry`/`batchQuickConfirm` · `listManagedProjects` ·
`getApprovalsOverview` · `getJournalWindowReport` ·
`switchActiveOrganization`/`switchActiveRole` · the 19 zod'd conversation
action schemas · the concept-resolution seam.

## 7. Continuation queue (prioritized, honest)

1. (P0) G1 context-switch intent — in this train.
2. ~~(P0-found.) G2 intent registry extraction~~ — SHIPPED 2026-08-30 (`intent-registry.ts`).
3. (P1) G4 executor extraction train — **REPRESENTATIVE BRIDGE SHIPPED
   2026-08-30** (PRs A/B/C): `lib/domain/caller.ts` shared execution
   contract + envelope reconciliation; one core per table for
   profiles/workers/worker_skills/journal-list; workspace-switch core +
   `context.switch` capability; `journal.list` capability. REMAINING G4
   tail: per-action `*Core` for the 19 schema'd conversation actions
   (start: express-interest, create-demand, save-work-card) + the
   CONVERSATION_ACTIONS→CapabilityDescriptor bridge.
4. (P1) G6 — `journal.list` SHIPPED 2026-08-30 (canonical list core, page delegates). `living_cv.get` (full CV via `buildVerifiedCv` caller-threading) still open.
5. (P1) G3 nl/de intent coverage; then router behind concept-resolution.
6. (P1) G7 mobile gate flip onto the capability registry.
7. (P1) MCP write E2E through the real ChatGPT client (owner-in-the-loop).
8. (P2) G10 ingestion architecture doc → owner scoping → first slice.
9. (P2) G11–G16.

## 8. Completion state (§28 vocabulary)

- **AUDIT_COMPLETE: YES** (this document, evidence-based)
- **FOUNDATION_COMPLETE: PARTIAL** (G2 registry + G4 representative bridge shipped 2026-08-30; G4 per-action extraction of the 19 schema'd conversation actions pending)
- **P0_COMPLETE: YES** (G1 shipped this train; G2 shipped 2026-08-30)
- **P1_COMPLETE: NO**
- **FULL_PRODUCT_COMPLETE: NO**

Anti-regression declarations for this train:
DID_WE_CREATE_DUPLICATE_DOMAIN_LOGIC: **NO** ·
DID_WE_WEAKEN_RLS: **NO** ·
DID_WE_USE_SERVICE_ROLE_FOR_CALLER_AUTH: **NO** ·
DID_WE_REMOVE_EXISTING_CAPABILITY: **NO** ·
DID_WE_ARCHITECTURALLY_CAP_FUTURE_EXPANSION: **NO**.
