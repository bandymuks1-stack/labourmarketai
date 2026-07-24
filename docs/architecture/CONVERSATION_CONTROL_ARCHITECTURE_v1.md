# Conversation Control Architecture v1 — Owner Review

**Status:** `CONVERSATION_CONTROL_ARCHITECTURE_READY_FOR_OWNER_REVIEW`
**Baseline main:** `a0fbba9c` · **Branch:** `feat/cc/conversation-control-foundation-v1` · **Date:** 2026-07-24
**Product gate:** worker ads stay OFF until a verified conversation-first control layer exists.

> One-line thesis: the conversation-first layer is a **thin, deterministic orchestration + presentation surface over the platform's existing server actions, RPCs, RLS, next-action engine, command registry and audit stores.** It introduces **no new domain logic, no parallel data system, and (for the foundation) no database migration.** The LLM is an optional, feature-flagged suggestion layer that can never execute or claim success.

---

## 1. Existing actions inventory (summary)

Full per-action inventory (11 fields each: entrypoint, RPC/table, roles, input, confirmation, reversibility, real result, human error, canonical fn, deep link) is in the audit appendix (this PR's description). Headline:

**Worker (15 action groups + 7 CV-import confirms), all canonical, all reused:**
`complete-onboarding`, `upload-cv` (`/api/cv/extract`, no write), `save-profile-text`, `save/delete-skill-claims`, `set-primary-profession`/`add`/`remove-direction`, `save-skills` (`POST /api/workers/:id/skills` — REST), `save/confirm-work-card`, `save-availability-prefs` (v1+v2), `save/remove-language`, `save/remove-education`, `save/remove-achievement`, 7× `confirm-cv-*` (work-history/education/language/certificate/achievement/salary/availability), `respond-booking` (accept/decline), `express/withdraw-interest`, `readiness-status` (pure read).

**Company:** `create-demand` (canonical §17 intake), `save/delete-demand-draft`, `add-demand-location`, `confirm-recognized-need` (§19), `close/reopen-demand`, `shortlist-candidate`, `contact-worker`, booking proposer set (`propose/withdraw/reschedule/set-deadline`), `create-project`, `assign-worker`/`end-assignment` (PR #857), candidate-draft CRM, worker management (`invite`/`assign-role`/`provision-engagement`/`set-journal-review`), `create-or-update` company, `switch-active-organization`.

**Agency:** bridge (PR #860) `invite/accept/decline/revoke-connection`, `share/unshare-request`, `propose/withdraw-offer`; clients CRM (`save/remove-client`, `link-demand`); `mark-can-offer`; worker management (mirror of company).

**Cross-cutting reuse (do NOT rebuild):**
- `lib/dashboard/next-action.ts` — **the** canonical "what next" resolver (`workerNextAction`, `managerNextAction`, `customerNextAction`); doctrine: extend, never compete.
- `lib/navigation/command-registry.ts` — `matchCommands()` deterministic intent matcher (~50 intents, lt/en/ru/nl/de synonyms, diacritics-insensitive, cap 5).
- `lib/assist/assist.ts` `getAssistView(role)` — composed "state of the world" reader.
- `lib/notifications/spine.ts` `getSpineCounts()` — "who is waiting for my action" counts (in-app only).
- `lib/ai/runtime/config-core.ts` `resolveAiRuntimeConfig()` + `runAiAgent` + `ai_runs` audit — the AI boundary (disabled in prod).
- `audit_logs` (append-only, RPC-written) + `journal_entries` (+satellites) — the real activity stores.
- `{ok:true}|{ok:false,code}` server-action union (`lib/instructions/actions.ts` canonical) + `getSessionProfile`/`requireRoleOrRedirect`.

---

## 2. Proposed component architecture

```
                 ┌───────────────────────────────────────────────────────────┐
   USER (mobile-first)                    Conversation Shell (default mode)    │
                 │  ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐  │
                 │  │ Current goal  │  │ Suggested    │  │ Command input    │  │
                 │  │ + Continue    │  │ actions      │  │ (free text)      │  │
                 │  └──────┬────────┘  └──────┬───────┘  └────────┬─────────┘  │
                 │         │  derived from    │ next-action/spine  │           │
                 │         ▼                   ▼                    ▼           │
                 │   ┌───────────────── Intent resolution ──────────────────┐  │
                 │   │ 1. matchCommands() [deterministic, always on]        │  │
                 │   │ 2. (optional) LLM proposal — ONLY if AI state=live   │  │
                 │   │    → returns {actionId, partialInput} PROPOSAL       │  │
                 │   └───────────────────────┬──────────────────────────────┘  │
                 │                           ▼                                  │
                 │   ┌──────────── Action Registry (declarative) ───────────┐  │
                 │   │ id · allowedRoles · zod inputSchema · confirmation    │  │
                 │   │ tier · telemetry event · advanced deep link · labels  │  │
                 │   └───────────────────────┬──────────────────────────────┘  │
                 │        read → run    write → Confirmation card → confirm     │
                 │                           ▼                                  │
   ═════════════ SERVER boundary (all authz + validation re-done here) ═══════ │
                 │   dispatchConversationAction(actionId, input, token)         │
                 │     · getSessionProfile() + allowedRoles ∩ held roles        │
                 │     · zod validate  · confirmation-token freshness/idempotency│
                 │     · calls the EXISTING server action / RPC  (no new logic)  │
                 │     · normalizes to {ok,code}  · emits pilot_events           │
                 │           │                         │                        │
                 │           ▼                         ▼                        │
                 │   Existing server action ──► RPC (RLS + SECURITY DEFINER)     │
                 │                              └► writes audit_logs (its own)   │
                 └───────────────────────────────────────────────────────────┘
   Result/Error/Confirmation cards ◄── real server result only (never fabricated)
   Journal / Continuity  ◄── READ audit_logs + journal_entries + spine + next-action
   Advanced mode  ──────────► existing /dashboard/* screens (unchanged, always available)
```

**Placement:** the shell mounts as the **default dashboard landing** (conversation-first). Every existing screen remains reachable and unchanged as **Advanced mode** via a persistent toggle + per-card deep links. Admin/expert users can never lose Advanced mode.

---

## 3. Action Registry schema

A **fixed, code-path set** (doctrine §10 boundary note: like the RBAC `Role` union — labels still resolve via i18n slugs). Declarative metadata only; **no domain logic** lives here.

```ts
type ConfirmationTier =
  | "read"               // no write — run immediately
  | "reversible_write"   // show result, allow edit/undo
  | "important_write"    // explicit confirmation card required
  | "strong_irreversible"; // strong confirmation (engagement/assignment/revoke/journal-grant)

interface ConversationActionDescriptor<I = unknown, R = unknown> {
  id: string;                         // stable kebab, e.g. "worker.respond-booking"
  subject: Role;                      // "worker" | "company" | "agency" | "customer"
  allowedRoles: Role[];               // checked server-side vs HELD roles (profile_roles)
  labelKey: string;                   // i18n key in `conversation` namespace (never inline copy)
  descriptionKey: string;
  confirmation: ConfirmationTier;
  inputSchema: ZodType<I>;            // server-validated; LLM output must pass this
  precondition?: ActionPrecondition;  // e.g. "has_worker_row", "has_company", "has_open_booking"
  migrationSensitive: boolean;        // true → may return needs_migration, degrade honestly
  telemetryEvent: FunnelEventName;    // pilot_events usage trail
  advancedDeepLink: (locale, ctx) => string; // existing screen that does this today
  // Execution is a REFERENCE to an existing entrypoint, never inline logic:
  execute: (input: I, ctx: DispatchCtx) => Promise<ActionResult<R>>;
}

type ActionResult<R> =
  | { ok: true; data: R }
  | { ok: false; code: "auth"|"not_authorized"|"invalid"|"needs_migration"
        |"conflict"|"precondition"|"rate_limited"|"stale_confirmation"|"error";
      message?: string; existing?: string };
```

- `execute` is a **thin adapter** that calls the existing server action / RPC / REST route (e.g. `respondBookingAction`, `saveWorkerCardAction`, `POST /api/workers/:id/skills`) and **normalizes** its return (including wrapping the four throwing actions — `completeOnboarding`, `saveWorkerProfileText`, `saveProfileSkillClaims*`, profession/direction — in try/catch → `{ok:false,code}`).
- `allowedRoles`, `inputSchema`, and `precondition` are re-enforced **server-side** in `dispatchConversationAction`; the client-side registry copy is UX only. RLS + the underlying RPC remain the true trust boundary.
- The registry is data; a guard test asserts every entry has all fields, labels in all 5 active locales, a `telemetryEvent`, and an `execute` that references an allow-listed existing entrypoint (no `.from(...).insert/update/delete` and no `.rpc(` inside the registry module itself).

---

## 4. Confirmation model

Maps 1:1 to the audited reversibility of each action:

| Tier | Behaviour | Actions (examples) |
|---|---|---|
| `read` | run immediately, show result card | `readiness-status`, `upload-cv` (extract), all list/read helpers |
| `reversible_write` | run, show result, offer inline edit/undo (re-save/remove) | `save-work-card`, `save-availability-prefs`, `save/remove-language/education/achievement`, `save-profile-text`, skill claims, `shortlist-candidate`, drafts |
| `important_write` | explicit "Patvirtinti?" card BEFORE dispatch | `create-demand`, `assign-worker`, `contact-worker`, `propose-booking`, `express-interest`, `invite-worker`, `propose-candidate`, `close/reopen-demand` |
| `strong_irreversible` | strong card ("Šis veiksmas … Ar tikrai?") + typed/second-tap confirm | `respond-booking` **accept** (creates engagement/assignment, blocks double-booking), `set-journal-review` **enable** (grants journal read), agency `revoke/decline-connection`, `end-assignment` |
| conflict overlay | when a single-value fact already differs, show BOTH values + require explicit "replace" (`allowReplace:true`) | all `confirm-cv-*` single-value (language level, salary, availability) — doctrine §7.1 |

**Confirmation integrity (replay/idempotency):** an `important_write`/`strong_irreversible` card carries a server-issued `confirmationToken` = `hash(actionId + normalizedInput + issuedAt + sessionId)` with a short TTL. `dispatchConversationAction` re-derives and rejects stale/mismatched tokens → `code:"stale_confirmation"`. This closes replay, double-submit, and "executing a stale confirmation card" (§11).

---

## 5. Journal / activity model (READ-ONLY, no new table)

The human-readable work journal / activity log **reads existing canonical stores** — it never writes a parallel activity table (which would trigger §3.3 hash-chain + §4 + §2.3 = migration).

Sources joined for the timeline view:
- `audit_logs` (`actor_id`, `action`, `entity`, `entity_id`, `occurred_at`, `payload`) — the system event trail (written by existing SECURITY DEFINER RPCs).
- `journal_entries` (+ `journal_entry_confirmations`, `journal_entry_skills`, `journal_entry_photos`) — the worker-authored narrative.
- `getSpineCounts()` + `next-action` — "what's pending / recommended next".
- `pilot_events` (admin-only) — usage trail, NOT shown to end users.

Presentation rule (§5 of brief): render **human language** — "CV įkeltas · 3 įgūdžiai patvirtinti · laukia darbdavio atsakymo" — **never** raw table/RPC names to ordinary users. Each row maps `action`/`entity` slugs → i18n labels in the `conversation` namespace.

**If future persisted chat history is wanted** (transcripts), that is a **new user-content table** → owner-gated migration carrying §3.1 append-only + §3.3 hash chain + §4 default-closed + §2.3 translation columns. The foundation deliberately does **not** need it.

---

## 6. Server continuity model ("Continue where I left off")

The server is the canonical state source; **no reliance on localStorage** for important processes. Continuity is **derived**, not stored in a new table:

- **Current goal / progress** = `workerNextAction()` / `managerNextAction()` output + `computeWorkerCountryReadiness()` (both pure/derived from real rows).
- **Unfinished drafts** = existing canonical draft rows: `customer_requests` draft (demand), `candidate_drafts`, `agency` CRM rows — read via their existing readers (`getOwnLastDemandPrefill`, etc.).
- **Last real server result** = last relevant `audit_logs` row for the actor.
- **"Continue" button** = deep-links to the next incomplete step's action (deterministic from next-action).

Because every piece is derived from RLS-scoped canonical rows, continuity survives logout/login and device change **for free**, with no new persistence.

---

## 7. LLM vs deterministic boundary

| Capability | Deterministic (always on) | LLM (feature-flagged, `disabled` in prod today) |
|---|---|---|
| Suggested actions | `next-action` + `spine` + `assist` | — |
| Free-text → intent | `matchCommands()` | may propose `{actionId, partialInput}` **only** |
| Collect missing fields | typed form per `inputSchema` | may pre-fill fields (must pass `inputSchema` server-side) |
| Explain a result | i18n templates per result code | may phrase an explanation of the **real** returned result |
| **Execute an action** | `dispatchConversationAction` (server) | **NEVER** — LLM output is a proposal, not an execution |
| Write DB / claim success | only via existing RPC after real result | **NEVER** |

- Gate: `getAiRuntimeConfig().state`. `disabled` (prod) → shell runs fully on `matchCommands` + quick actions + wizard (§8 fallback). `live` → LLM proposals routed through `runAiAgent` (auto-writes `ai_runs` audit; guards ban direct SDK calls).
- **No critical function depends on the LLM** (§8): every MVP action is reachable via deterministic quick-action / command / wizard with the LLM off.
- LLM never sees more than the current user's own RLS-scoped context; CV/free text is treated as **untrusted content, never instructions** (§11 — prompt-injection defense baked into the agent prompt registry + the fact that the LLM cannot execute).

---

## 8. Migrations — NONE required for the foundation (proof)

Verified live in production (`gorgitwvdzxbnaxhrsrw`, 2026-07-24):

| Object | Status |
|---|---|
| `save_self_declared_work_history_v1`, `save_worker_language_v1`, `save_worker_availability_prefs` (+`_v2`) | **applied** |
| `worker_education`, `worker_achievements` tables | **applied** |
| `respond_booking_request_v3`, `assign_worker_to_project` (PR #857) | **applied** |
| `submit_agency_candidate_offer_v1` (PR #860) | **applied** |
| `audit_logs` | **applied** |
| `save_agency_client_v1` (agency private CRM) | **NOT applied** → registry degrades to `needs_migration` honestly |
| `ai_runs` (AI audit) | **NOT applied** → only needed when AI flips to `live`; not on the foundation path |

**Conclusion:** the conversation foundation (registry + shell + deterministic fallback + read-only journal/continuity) requires **no DB migration**. The two unapplied objects are non-blocking (agency-CRM and AI-audit), reached only by later journey PRs and handled by the uniform `needs_migration` degradation. **No owner gate needed for the foundation PR.**

Future owner-gated migrations (NOT in scope now): persisted chat transcripts (§3.3 hash chain), `ai_runs` (only if AI generation is turned on), `save_agency_client_v1` (agency CRM completeness).

---

## 9. Security & privacy threat model

| Threat | Mitigation (existing + added) |
|---|---|
| Prompt injection via CV / free text | LLM cannot execute (only proposes); proposals must pass server-side `inputSchema` + `allowedRoles` + RLS; CV text never treated as instructions; agent prompt registry is the only path (direct-SDK guard). |
| Cross-tenant data leak | Every action goes through the existing RLS-scoped server action / RPC; `dispatchConversationAction` never accepts a caller-supplied `profile_id`/`company_id` — subject is derived from `getSessionProfile()`. |
| Role escalation | `allowedRoles ∩ heldRoles(profile_roles)` re-checked server-side; RLS backstop; admin actions still behind `superadmin`. |
| Using someone else's ID | IDs in input are validated + authorization is re-done inside the canonical RPC (owner-scope); registry cannot bypass. |
| Replay / double-submit / stale confirmation | `confirmationToken` freshness + idempotency (§4); underlying RPCs already idempotent/conflict-guarded (booking `conflict`, upserts). |
| PII into LLM / telemetry | telemetry metadata allow-listed + capped, no free-text; LLM sees only own-scope; utterance text never written to `pilot_events`. |
| Conversation retention | foundation stores **no** conversation transcript → nothing to retain/erase; journal reads existing stores whose retention/erasure already governed. |
| User-deletion impact | continuity/journal are derived/append-only reads; note the known `pilot_events` NO-ACTION FK that blocks profile deletion (separate GDPR-erasure item, unchanged here). |
| Audit-log access | `audit_logs` remains admin-read RLS; the user-facing journal shows only the actor's own derived rows, label-translated. |
| "AI claimed it did X" | impossible: success cards render only the **real** `{ok,code}` from the server; LLM text is visually marked as suggestion/explanation, never as an executed result. |

Tests pin each of these (see §12 of brief).

---

## 10. PR split plan

| PR | Scope | Migration | Gate |
|---|---|---|---|
| **A — Foundation (this branch)** | action registry + dispatcher + deterministic conversation shell (role-aware suggested actions, command input via `matchCommands`, result/confirmation/error/continue cards, advanced-mode toggle) + read-only journal/continuity + `conversation` i18n + full guard suite. LLM off. | **none** | GREEN (auto-merge) |
| **B — Worker journey** | wire all worker executors end-to-end (registration continuation → CV → profile → work history → languages/skills → preferences → booking review/accept-decline → "what next"), worker journal view, continuity, production E2E. | none (backing live) | GREEN |
| **C — Company journey** | company executors (create-demand → review candidates → booking statuses → accepted worker → project assignment via #857), "who's waiting", production E2E. #857 read-only downstream. | none | GREEN |
| **D — Agency journey** | agency executors (clients → shared needs → propose candidate → status → contractual relationships via #860), production E2E. `save_agency_client_v1` may need owner-gated apply for CRM completeness → STOP + owner gate if so. | possibly 1 (agency CRM) → owner gate | RED if migration |

Each PR is independently green, additive, and behind the `conversation` feature exposure so the default can flip only when a journey is verified.

---

## 11. Scope & risks

- **Blast radius:** the shell becomes the default dashboard landing — mitigated by (a) keeping every existing screen live as Advanced mode, (b) a feature-exposure flag so the flip is controlled, (c) the shell being a thin reader/dispatcher (no domain logic).
- **Throwing actions** (4) need try/catch wrappers — handled in the dispatcher adapter.
- **REST-route action** (`save-skills`) needs an HTTP adapter in the dispatcher.
- **`next-action` monopoly:** we extend it, never add a competing resolver (doctrine).
- **AI stays off** — zero dependency; when enabled later, `runAiAgent` + `ai_runs` audit already exist.
- **i18n cost:** `conversation` namespace lands in all 11 files each PR (lt/en/ru real, others `[EN]` until translated) — parity guard enforced.
- **Risk if rushed:** wiring executors sloppily could bypass a confirmation tier — mitigated by the `server-result-required` + `confirmation-required` + `no-direct-db-write` guards that fail CI.

---

## 12. What each subject gets, per phase

- **Worker (Phase B):** a single conversational home that says, in plain language, "Įkelk CV" → "Užbaik profilį" → "Nurodyk šalis" → "Peržiūrėk pasiūlymą" → "Tęsk, kur sustojai", each executing the real, already-verified server action with an honest result/confirmation card, and a Continue that survives logout. Advanced = today's profile/bookings screens.
- **Company (Phase C):** "Sukurk poreikį" → "Peržiūrėk kandidatus" → "Atsakyk agentūrai" → "Priskirk darbuotoją projektui" → "Kas laukia mano veiksmo?", all over existing demand-intake / scouting / #857 assignment.
- **Agency (Phase D):** "Klientai" → "Bendri poreikiai" → "Pasiūlyk kandidatą" → "Pasiūlymo būsena" → "Kas laukia mano veiksmo?", over the #860 bridge; agency-CRM completeness may need an owner-gated migration (STOP-before-apply).
- **Admin/expert:** everything above **plus** undiminished Advanced mode; conversation layer never hides a control they rely on.

---

### Owner decision requested
1. Approve this architecture and the A→B→C→D PR split.
2. Confirm the foundation (PR A) may auto-merge (GREEN, migration-free) once its tests are green.
3. Note the two deferred owner-gated migrations (agency CRM `save_agency_client_v1`; `ai_runs` if/when AI is enabled) — neither blocks the foundation.
