# ARCHITECTURE CONSOLIDATION v1

**Programme:** Architecture Consolidation v1
**Baseline:** `main` @ `5eddebac` + PR #910 (`fix/cc/p0-stabilization-v1`)
**Branch:** `feat/cc/architecture-consolidation-v1`
**Date:** 2026-07-29
**References:** FULL PROJECT CANONICAL AUDIT v1 · `docs/audits/p0-stabilization-verification-v1.md`

**Baseline note:** PR #910 is OPEN and unmerged. This branch is stacked on it rather than merging it, so #910 stays the owner's decision.

**Rules applied:** verify before changing · behaviour identical · no UX redesign · no feature expansion · no schema change · no deploy · W4–W8 untouched.

---

## 0. HEADLINE

The honest result of this consolidation is **smaller than the audit implied, and that is the finding.**

Of the six duplications named in the canonical audit, PR #910 already proved four were false. This programme re-verified the rest and examined every remaining "dead" module. What survived scrutiny is **11 genuinely orphaned modules** — removed here — plus a clear statement of what must *not* be removed and why.

| | Count |
|---|---|
| Modules production-unreachable by import graph | 53 |
| — false positives (barrel/`index` resolution bug in the audit's own method) | 4 |
| — alive via config or repo-root consumers | 4 |
| — test fixtures / test infrastructure (test-only **by design**) | 4 |
| — **gated-off, not dead** (safety registries, provider contracts, gated features) | 30 |
| — **W4-owned IA surfaces** (deferred, not this programme's call) | 7 |
| — **genuinely orphaned → REMOVED** | **11** |

**The dominant category is "gated off, not dead".** In this repo a module with no callers is usually a feature waiting behind an owner gate, or a kill-switch registry pinned by a guard. Deleting those would remove safety controls, not debt.

---

## 1. GOAL 1 — CANONICAL ARCHITECTURE INVENTORY

Per subsystem, with the reason.

| Subsystem | Verdict | Why |
|---|---|---|
| Work Journal (`lib/journal/`, `lib/structuring/`) | **KEEP** | Out of scope by instruction; also the only chain proven end-to-end in production |
| Skill engine / recognition | **KEEP** | Out of scope by instruction |
| Matching (`lib/market/match-v1`, `match-team-v1`) | **KEEP** | Out of scope by instruction; one engine, 26 consumers, no duplicate found |
| Security / RLS / SECDEF allowlist | **KEEP** | Out of scope by instruction; verified correct against the live catalog in #910 |
| Auth + roles (`lib/auth/`) | **KEEP** | One resolver chain, no duplicate |
| Org / workspace context | **KEEP** | Single source — see GOAL 5 |
| Demand (`lib/demand`, `staffing`, `buyer`, `scouting`, `sales`) | **KEEP** | #910 proved these are five distinct actors/stages over one canonical table, not duplicates |
| Calendar (`lib/planning/`) | **KEEP** | #910 proved there is exactly one engine |
| Timelines (intelligence / buyer / activity-centre) | **KEEP** | #910 proved three unrelated domains |
| Booking version chain | **KEEP** | #910 proved a version-negotiation fallback, not three generations. Fallback arms are unreachable now that all versions are applied; they disappear when the owner gate retires, not before |
| Billing kill switches | **KEEP** | #910 proved layered scopes, not competing switches. Residual is naming similarity only |
| AI runtime (`lib/ai/runtime/`, `lib/ai/registry/`) | **KEEP** | The live stack. `run.ts` and `adapter-contract.ts` are unused *because AI is off*, not dead — see §2.1 |
| AI legacy island (`lib/config/ai.ts`, `lib/ai/provider.ts`, `noop-provider.ts`, `estimate-clarify-*`) | **MERGE — deferred, owner decision** | Confirmed duplication, but not separable in a behaviour-identical step — see §2.1 |
| LMC ledger + `lib/billing/lmc-flags.ts` | **ARCHIVE — deferred, owner decision** | Complete ledger, zero call sites, but `lmc-flags.ts` is a **kill-switch registry** pinned by a guard. Removing it deletes a safety control |
| Eurostat import | **ARCHIVE — deferred** | Double-gated by env flags; removal is a feature decision, not consolidation |
| Talent provenance / identity resolution | **ARCHIVE — deferred** | Zero consumers, but stranded on owner-gated migration `20260713210000`; decide with that migration |
| Orphaned UI components + `lib/config/intents` | **REMOVE** | §3 — zero import specifiers anywhere |
| IA surfaces (role catalogue, feature grid, dashboard-section, setup-role-choice, agency-workers-section, live-map, open-in-waze) | **DEFER TO W4** | W4 is *"IA konsolidacija … negyvų nuorodų valymas"* — these are exactly its material |

---

## 2. GOAL 2 — DUPLICATION ELIMINATED

### 2.1 What was verified and NOT eliminated (with reasons)

Honest accounting: the audit's duplication list did not survive verification, and the one confirmed duplication is not safely removable in a behaviour-identical change.

**AI stack (CONFIRMED duplication, deferred).** Two gates coexist: `lib/config/ai.ts` → `AI_ASSIST_ENABLED = false` (source literal, gating exactly one feature — estimate-clarify) and the env-driven `lib/ai/runtime/` used by five server actions. Merging is blocked because `lib/ai/types.ts` is shared by both (`lib/ai/runtime/task-routing.ts` imports `AI_MODEL_CANDIDATES` from it), so the island cannot be lifted out without touching the live routing layer. That is a refactor with behavioural risk, which this programme forbids. **Owner decision.**

**`lib/ai/runtime/run.ts` — NOT dead.** Its docblock names it *"the single function product code calls to run one agent completion"*. It is unreferenced because AI is off. Deleting it removes the intended entry point.

**`lib/ai/runtime/providers/adapter-contract.ts` — NOT dead.** It is the provider contract that `lib/guards/ai-task-routing.test.ts` and `labour-market-os-human-control.test.ts` verify adapters against.

**`lib/billing/lmc-flags.ts` — NOT dead.** Six `false as const` kill switches (`LMC_PURCHASES_ENABLED`, `LMC_SPENDING_ENABLED`, …) pinned by `lib/guards/lmc-ledger-foundation.test.ts` and mirrored in `public.lmc_settings`. Flipping any is an owner-only production gate. Removing the file would delete the TS half of a live safety control.

**`lib/security/canonical-authenticated-rpcs.ts`, `lib/security/secdef-revoke-scope.ts` — NOT dead.** Security registries under the DO-NOT-TOUCH security model.

**`lib/config/suggestion-statuses.ts` — NOT removed.** Guard-pinned by `lib/guards/product-readiness.test.ts` and referenced by four docs.

### 2.2 Four false positives in the audit's own reachability method

The canonical audit's import-graph script did not resolve a directory import to its `index` file, so four live modules were wrongly listed as unreachable. Corrected here:

| Module | Actually imported as | By |
|---|---|---|
| `lib/market/recognition/index.ts` | `@/lib/market/recognition` | `components/app/market/offer-demand-recognizer.tsx:7` |
| `lib/structuring/language-packs/index.ts` | `./language-packs` | `lib/structuring/skill-recognition.ts:18` |
| `lib/test/server-only-stub.ts` | vitest alias | `vitest.config.ts:23-24` |
| `lib/cv/normalize.ts` | — | *(still orphaned; the audit's evidence for it was noise from `lib/structuring/normalize.ts`, a different module. Left in place: `lib/cv/` is CV-import territory adjacent to the DO-NOT-TOUCH evidence chain)* |

---

## 3. GOAL 3 — DEAD CODE REMOVED (with evidence)

**Removal test applied to every candidate — all four conditions required:**
1. unreachable in the production import graph (graph built from non-test source only);
2. **zero import specifiers** anywhere in the repo — verified per module with an exact `from "@/<path>"` / `from "./<basename>"` grep, not a substring match;
3. no consumer in `scripts/`, `.github/`, `next.config.ts`, `vitest.config.ts`, `package.json`;
4. not named by W4–W8 planning (`docs/plans/labourmarketai-real-user-workflow-rebuild-plan-v1.md`, `docs/product/CONTEXT_PANEL_W3_V1.md`).

| Removed module | Prod refs | Guard refs | Root/config refs | Why it is orphaned |
|---|---|---|---|---|
| `components/visual/visual-os-shell.tsx` | 0 | 0 | 0 | Shell of `/dashboard/visual-os`, **deleted by W1 (PR #908)** |
| `components/visual/agency-cards.tsx` | 0 | 0 | 0 | Same — `/visual-os/agency`, deleted by W1 |
| `components/app/agency/can-offer-button.tsx` | 0 | 0 | 0 | Orphaned with the agency-pool route retired by W1 |
| `components/app/dashboard-first-use-panel.tsx` | 0 | 0 | 0 | Superseded first-use surface, never re-linked |
| `components/app/live-clock.tsx` | 0 | 0 | 0 | Never mounted |
| `components/marketing/billing-status-banner.tsx` | 0 | 0 | 0 | Never mounted; billing status renders elsewhere |
| `components/ui/Avatar.tsx` | 0 | 0 | 0 | Unused primitive |
| `components/ui/LiveDot.tsx` | 0 | 0 | 0 | Unused primitive |
| `components/ui/Sparkline.tsx` | 0 | 0* | 0 | Unused primitive. *`public-evidence-integrity.test.ts` asserts the marketing **page** does not contain the string "Sparkline" — it reads the page, not the component, and still passes |
| `components/ui/Stat.tsx` | 0 | 0 | 0 | Unused primitive |
| `lib/config/intents.ts` | 0 | 0 | 0 | Superseded by `lib/conversation/intent-router.ts` |

**Behaviour impact: none.** Nothing imported any of these, so no rendered surface, route, action or API changes.

**Not removed, deliberately:** everything in §2.1, all test fixtures (`lib/cv/__fixtures__/`, `lib/ai/evals/*.fixtures`, `lib/structuring/language-packs/fixtures/`), all test infrastructure, and the seven W4-owned IA surfaces.

---

## 4. GOAL 4 — CONVERSATION-FIRST DASHBOARD VERIFICATION

Verified, **not changed** — every dashboard change is either a UX redesign (forbidden here) or W4's declared scope (*"IA konsolidacija: nav simetrija … negyvų nuorodų valymas … vieno projekto kūrimo kelio konsolidacija"*).

| Surface cluster | Verdict | Note for W4 |
|---|---|---|
| `/dashboard` · `/dashboard/buyer` · `/dashboard/company` · `/dashboard/advanced` | **SHOULD MERGE** | Four role-landing surfaces. W4's nav-symmetry item covers this |
| `/dashboard/start` · `/start/buyer` · `/start/company` (+ `/start/agency` → 308) | **SHOULD MERGE** with `/onboarding` | Parallel entry paths; W4 owns the single project-creation path |
| `/dashboard/assist` · `/inbox/quick` · `/inbox/report` · `/instructions` | **SHOULD MERGE** | Four "help me act" surfaces |
| `/dashboard/planning` vs `/dashboard/company/planning` | **BOTH REMAIN** | Not duplicates — one calendar engine; the company page has zero calendar calls |
| `/dashboard/gallery`, `/dashboard/journal/voice`, `/dashboard/commercial` | **REMAIN** | W1 already corrected an earlier proposal to delete these; they are live, linked features |
| Feature surfaces with 0 production rows (bookings, listings, assets, absences, tasks, commercial CRM, defects) | **SHOULD HIDE, not disappear** | Complete and correct; hiding is a product decision, and hiding changes behaviour — owner call |

---

## 5. GOAL 5 — CONTEXT ARCHITECTURE: ONE SOURCE OF TRUTH

Verified. **No duplicate context resolver was found.**

| Context | Single source | Consumers | Verdict |
|---|---|---|---|
| Workspace / active organization | `lib/company/active-organization.ts`, built on `lib/company/organization-switch.ts` (`PERSONAL_WORKSPACE_ID`, `resolveActiveWorkspaceId`, `resolveActiveOrganizationId`) | `app/[locale]/dashboard/layout.tsx`, `.../journal/page.tsx`, `lib/conversation/dispatch.ts`, `lib/conversation/worklog-engagements.ts` | ✅ ONE |
| Client-side context propagation | `lib/auth/context.tsx` — the only client provider; delegates writes to `lib/company/organization-actions.ts` | header switcher, workspace chip, role switcher | ✅ ONE |
| Permissions / roles | `lib/auth/actions.ts` (`switchActiveRole`, `addRole`) + `lib/auth/require-role.ts` (`requireRoleOrRedirect`) + `lib/auth/superadmin.ts`; real enforcement is RLS + SECDEF | all guarded pages | ✅ ONE |
| Calendar context | `lib/planning/planning.ts` + `planning-model.ts` | `/dashboard/planning`, `lib/conversation/agenda-summary.ts`, `lib/ai-workspace/*` | ✅ ONE — the conversation delegates, it does not re-derive |
| Conversation context | `lib/conversation/dispatch.ts` → `dispatch-core.ts` (pure authz), `action-registry.ts`, `intent-router.ts` | chat surface | ✅ ONE |
| Entity / World State | `lib/world-state/` | — | **W3 territory, unmerged. Not audited here.** |

One honest caveat: the workspace pointer `profiles.active_organization_id` comes from owner-gated migration `20260714210000`. Until it is applied, `active-organization.ts` falls back to the first owned organization and reports `pointerAvailable: false`. That is documented honest degradation, not a second source of truth.

---

## 6. GOAL 6 — DOCUMENTATION

Checked `docs/ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md`, `docs/PLATFORM_DOCTRINE.md`, `docs/PRODUCT_CONSTITUTION.md` and `docs/ROADMAP.md` for architectural claims invalidated by W1's route retirement or by this removal: **none found**. No stale architecture description required deletion.

Historical audit documents that mention the removed components (`neutral-dashboard-feature-availability-audit-v1.md`, `role-catalogue-dashboard-surfaces-audit-v1.md`, `pr-a-contrast-evidence-v1.md`, `premium-design-map-v1.md`) are **left untouched by design** — they are dated records of a past state, and rewriting them would falsify the record.

This document is the canonical consolidation record.

---

## 7. FINAL REPORT

### 7.1 Removed duplications
- 11 orphaned modules (§3): 2 shells of the W1-deleted `/dashboard/visual-os`, 1 orphan of the retired agency-pool route, 4 unused `components/ui` primitives, 3 never-mounted components, and `lib/config/intents.ts` (superseded by `lib/conversation/intent-router.ts`).
- 4 false "dead module" findings in the canonical audit corrected (§2.2) — a directory-`index` resolution defect in the audit's own method.

### 7.2 Archived modules
None archived in code. Four archive candidates identified and **deferred with reasons**: the LMC ledger, Eurostat import, talent provenance, identity resolution (§1). Each is either a live safety registry or stranded on an owner-gated migration; archiving is an owner decision, not a consolidation step.

### 7.3 Remaining technical debt
1. **AI stack duplication** — confirmed, not separable behaviour-identically (§2.1). Owner decision.
2. **504 `supabase as any` casts across 176 files** — PR #910 restored the type mirror for 20 tables; the casts can now be unwound module by module. Mechanical, large, and behaviour-affecting if done carelessly.
3. **7 W4-owned IA surfaces** unreachable but deliberately untouched (§1).
4. **Booking version-negotiation fallback** — unreachable arms, harmless, retires with the owner gate.
5. **Payment kill-switch naming** — `PAYMENTS_ENABLED` / `LIVE_PAYMENTS_ENABLED` govern different things and read as if they govern the same thing.
6. **Test-suite shape** — 553 of 804 test files are static-source guards. Deleting 11 files required zero guard edits, which is the good case; renaming a route still costs ~28 guard rewrites (W1's actual experience).
7. Everything still open from `p0-stabilization-verification-v1.md` §4 — the AI daily-run budget guard being the one with real cost exposure.

### 7.4 Future consolidation opportunities
1. **After W4 lands**, re-run the reachability pass — W4's dead-link cleanup should free the 7 deferred IA surfaces for removal.
2. **Unwind `as any` per module**, starting with the 20 newly-typed tables (assets, contracts, proposals, defects, marketplace listings, project stages/budgets, absences).
3. **Decide the owner-gated migration backlog as one batch.** Eight gated migrations currently strand ~10 modules in "prepared, not activated". Applying or abandoning them as a set would resolve most remaining "dead code" questions at once.
4. **Collapse the AI stack** in a dedicated slice once `lib/ai/types.ts` ownership is settled.
5. **Rename the payment flags** to reflect their actual scopes.

---

## 8. VALIDATION

| Command | Result |
|---|---|
| `pnpm -F web typecheck` | ✅ clean |
| `pnpm exec vitest run lib/guards` | ✅ **551 files / 9,839 tests — all pass** |
| Full `pnpm -F web test` | ⚠️ locally timeout-flaky under machine contention — see below |

**On the local full-suite flakiness, stated plainly:** running the full suite locally produced 1 failure on this branch (`lib/cv/extract.test.ts` DOCX, a 5,000 ms timeout) and, in the same session under the same load, **33 failures across 14 files on the *unchanged* baseline branch**. The guard suite passes completely here and the CV test passes in isolation in 3.2 s. The failures are machine contention (three worktrees, parallel transform), not this change. **CI is the arbiter.**

Guard-test count moved 9,842 → 9,839. That is exactly the 3 dynamically-generated per-file cases for the removed files; no guard failed.

## 9. WHAT WAS NOT TOUCHED

Verified by diff: Work Journal, Skill Engine, matching algorithm, verified-evidence chain, W3/W4/W5+ material, the security model and RLS. No migration created, applied or altered. No schema change. No route, page, server action or API endpoint modified. No database access in this programme.
