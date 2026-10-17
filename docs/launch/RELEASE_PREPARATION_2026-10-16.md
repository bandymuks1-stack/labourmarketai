# Controlled release preparation — 2026-10-16 (evening, post-audit)

| Field | Value |
|---|---|
| Scope | Owner policy direction 2026-10-16: Stripe suspension prepared (not executed); #2439 technical preparation; #2442 kept as owner-gated draft; N-12 register correction; #2426 kept blocked; GREEN PR recheck, merge order, integrated regression, smoke checklist |
| Rule | Nothing was merged, deployed, applied, charged, rotated or changed in production. Every production read was read-only SQL through Supabase MCP (counts, catalog, ledger). The hosting agent's work (Vercel blocked → Hostinger/Cloudflare restore, PRs #2443 and #2445) was not touched or duplicated |
| Base | `main` at `100fef1` |
| Companion files | `PRODUCTION_SMOKE_20MIN_2026-10-16.md` · `../billing/STRIPE_LIVE_SUSPENSION_RUNBOOK_2026-10-16.md` · `release-prep-2026-10-16/patches/` |

## A. Ready-to-merge PRs and merge order

Integrated regression (§D.1) was run on exactly this order, merged one by one
onto `main` `100fef1`: **no conflict at any step.** Merge one at a time,
`quality` + `migration-safety` green, `/api/health` build check after each
(smoke block 0), full smoke after the last.

| Step | PR | Class | State 2026-10-16 20:30 UTC | Condition |
|---|---|---|---|---|
| 1 | #2437 company — unknown is not zero | GREEN | CI green on `98d4fbaa`; Codex P1 (stadium guard) already answered by the pushed guard update; P2 (DST offset at local midnight, `lib/time/local-day.ts`) open, non-blocking | none |
| 2 | #2436 privacy notice + DSR due date | GREEN | CI green on `a8516857`; Codex P1 **calendar-month deadline** unaddressed on the branch → patch prepared (`patches/2436-dsr-calendar-month.patch`, 21/21 tests); P1 "five inactive catalogs" is pre-existing debt (lv/et/da/no/sv each lack ~8,900 keys on `main`), not introduced here; P1 "browser-storage disclosure incomplete" (voice transcript / chat sentence in sessionStorage) is a copy addition the owner should accept or reject | merge as is, or apply the patch first (owner call D-2) |
| 3 | #2435 international entry | GREEN | CI green on `96a82469`; Codex P2 `q=0` → patch prepared (`patches/2435-entry-locale-q0.patch`, 7/7) | optional patch |
| 4 | #2434 marketplace goods honesty | GREEN | CI green on `35638a5d`; two Codex P2 (seek-side goods unreachable; automatic-currency tracking) are follow-ups, not regressions | none |
| 5 | #2432 journal is a fact | GREEN | CI green on `72c868f8`; P1 supersede path fixed in that push; P2 (clock metrics dropped on edit; `personCalendarDay()` during render) open, non-blocking | none |
| 6 | #2433 AI refusals never count | GREEN | CI green on `18920e83`; P1 chain-path matcher fixed in that push (thread outdated) | none |
| 7 | #2444 confirmation tokens need `CONVERSATION_TOKEN_SECRET` | GREEN, **env-gated** | CI: `quality` was still running at 20:30 UTC (all others green); Codex P2 local harness → patch prepared (`patches/2444-local-harness-secret.patch`, 3/3) | **N-13: the variable must exist in the production environment before this merges** (§D.3) |
| 8 | #2438 master audit docs | GREEN (docs) | CI green on `70bd76af`; Codex P1 **"security audit in a public repository"** (AGENTS.md § Capability pre-flight) is an owner decision D-1; P1 "future-date guard pending" → patch prepared (`patches/2438-future-date-guard-pending.patch`); P2 research URLs → author follow-up | merge last, after D-1 |

Dropped from the order: **#2419** (AI monitor) — its own CI is red (`quality`,
`e2e-smoke`, CodeQL on `3d872605`), and the first integration run reproduced
the cause (`lib/ops/ai-run-outcome.ts` uses a regex flag the TS target rejects).
It is not in the owner's GREEN set and must be fixed on its branch first.

Not assessed here (another session owns them): #2443 (stale e2e expectations)
and #2445 (mobile tap floor) — the hosting agent's session was committing to
#2443 at 20:22 UTC.

RED set — **not merged, not applied, no auto-merge**: #2439, #2440, #2441,
#2442, and #2426 (stays blocked; superseded in approach by #2442).

Rollback for every GREEN PR: plain `git revert` of the squash commit; no data,
schema or env effect. #2444's revert restores the service-role fallback.

## B. Remaining owner decisions

| Id | Decision | Why it is the owner's |
|---|---|---|
| N-1 | Stripe: containment option A (merge RED #2441, flag-gated) and/or B (env disarm), then the webhook proof before any re-arm — runbook `../billing/STRIPE_LIVE_SUSPENSION_RUNBOOK_2026-10-16.md` | production payment setting; Stripe dashboard facts only the owner can read |
| N-9 | Approve and apply #2439 (journal evidence integrity) via Supabase MCP `apply_migration`; §C.2 lists what was prepared | RED migration |
| N-4 | #2442 legal list L-1…L-15; name the executor and the Art. 12 reply author for the request received **2026-10-14 08:53 UTC** (`account_deletion`, `in_review`); #2442 depends on #2439's bypass GUC being applied first | legal + RED migration |
| N-10 | Approve #2440 (null-safe owner check) | RED migration |
| N-11 | Lift the merge hold for §A, or merge yourself in that order | the owner's hold on merges to `main` |
| N-12 | Approve the register correction in this PR (journey register: two steps LIVE with ledger proof; EVID-2 closed; ARCH-5 closed; ORCHESTRATION_ASSESSMENT corrected; history kept verbatim) | register truth is owner-owned |
| N-13 | Set `CONVERSATION_TOKEN_SECRET` (≥16 chars, e.g. `openssl rand -hex 32`) in the production environment **before** step 7 | production env; value never handled by an agent |
| D-1 *(new)* | #2438 publishes a consolidated audit (production/payment state, security findings) in a **public** repository, which AGENTS.md says must live in the private Internal Brain. Sanitise to an outcome-level summary, or accept the exposure knowingly | policy conflict |
| D-2 *(new)* | Accept the calendar-month DSR deadline (patch for #2436) — it moves the shown due date of the open request from 2026-11-13 to **2026-11-16** (14 Nov is a Saturday) | legal reading |
| D-3 *(new)* | #2419: fix on its branch before any merge, or drop it from this release | red CI |
| GOV-1 | Read-only `SUPABASE_DB_URL` Actions secret (arms the two live security gates in `quality.yml`) | secret |
| ARCH-3 | Is zero usage a broken journey? Now decides whether the three remaining BROKEN links and the two newly LIVE-with-empty-evidence steps are a backlog | architecture standard |

## C. Production blockers

1. **Hosting.** Vercel account blocked (HTTP 402) since 2026-10-15; restoration is the hosting agent's work. Nothing in §A can be verified on a deployed build until `/api/health` answers with a current `build`.
2. **`CONVERSATION_TOKEN_SECRET` unverifiable from here** (§D.3). Merging #2444 before N-13 would make every chat and capability confirmation refuse on the restored host. The standalone packaging (`scripts/package-standalone.mjs`, #2431) deliberately strips `.env*` from the artefact, so the host's own environment must carry it.
3. **Live Stripe armed with zero webhook evidence** (§B N-1). Until option A or B is in place, a completed checkout can convert to a real charge with no entitlement on our side.
4. **No human walk of the authenticated product on the deployed build since #2421.** CI has no database; the integrated proof in §D is unit-level only.
5. **#2439 prepared but unapplied** — the journal's tamper-evidence claim stays unsupported until N-9 (§C.2).
6. **GOV-1** — two live security gates inactive in CI.
7. **#2419 red** — AI-provider failures remain unmonitored until fixed.

### C.2 #2439 technical preparation (journal evidence integrity) — done, nothing applied

- **Legacy-record compatibility, checked against the live catalog (read-only):** production `journal_entries` has exactly the 16 columns the migration hashes/immutabilises (no extra column that a legacy write path could touch); 155 rows, 17 workers, 0 null `hash_self`, 19 null `hash_prev` (chain heads), 8 soft-deleted, 14 superseded — all stay `hash_version = 1` and verify as `legacy`. Live triggers today: `journal_entries_attribution_guard_v1`, `set_updated_at` (the latter changes only `updated_at`, which the guard allows). Every live function that writes the table was read from `pg_proc`: `create_journal_entry_full` (insert — its client hashes become ignored), `journal_entry_supersede` / `_v2` (insert + `superseded_by`, `updated_at`), `journal_entry_soft_delete` / `_restore` (`deleted_at`, `updated_at`) — **none sets an immutable column**, so no RPC breaks after apply. Neither `journal_entries_chain_v1`, `verify_journal_chain_v1` nor the guard exist in production yet (confirmed), and no `20261016*` version is in the ledger.
- **Rollback strategy:** `supabase/rollbacks/20261016190000_journal_evidence_integrity_v1.down.sql` — drops the triggers, verifier, audit guard and `hash_version`, restores the pre-migration photo-delete policy verbatim, and *warns* (does not refuse) when version-2 rows exist: their hashes stay valid sha256 strings, only the version marker is lost. Rollback + re-apply proven idempotent in the proof.
- **Adversarial verification, re-run independently in this session:** `apps/web/scripts/db-proof/journal-evidence-integrity-local.mjs` on a fresh throwaway PostgreSQL 16.15 cluster (initdb as a non-root user, migration applied verbatim) — **15/15 PASS, exit 0**: forged client hashes overwritten; content UPDATE / DELETE / TRUNCATE → 42501 for owner and authenticated; lifecycle columns writable; service_role bypass only with the transaction-local GUC; monotonic server-set `created_at`; concurrent inserts serialised; legacy rows → `legacy`; verifier SECURITY INVOKER; orphan-only photo delete; rollback + re-apply.
- Apply order if approved: 20261016190000 (#2439) → 20261016190100 (#2440) → 20261016150000 (#2442), each via MCP `apply_migration` with its post-apply checklist; never `supabase db push`.

### C.3 #2442 (GDPR erasure v3) — kept as owner-gated draft

Proof re-run independently: `privacy-erasure-v3-local.mjs` on the same kind of
throwaway cluster — **71/71 ALL PASS, exit 0** (sever-not-delete, token
single-use/expiry/binding, undecided FK refused by name, receipts without
identifiers, rollback refuses while receipts exist). No erasure executed; the
legal list L-1…L-15 is untouched; #2426 remains draft + `needs-human-gate`.

## D. Evidence for release readiness

### D.1 Integrated regression (local, this session)

| Tree | Steps | Result |
|---|---|---|
| `main 100fef1` + #2437 → #2436 → #2435 → #2434 → #2432 → #2433 → #2444 → #2438 (merge commits `68c1943` … `b5764d5`, `ce02670`) | `pnpm -F web typecheck` | **PASS** |
| same | `pnpm -F web test` (vitest) | **PASS — 1,886 files, 29,916 tests, 3 skipped, 34 todo** |
| same | `pnpm -F web lint` | **PASS** |
| same + #2419 (first run) | typecheck | FAIL in `lib/ops/ai-run-outcome.ts` (#2419 only) → #2419 dropped |
| same + #2419 | vitest 1,887 files / 29,920 tests · placeholders · product-truth `--check` · migration-safety | PASS · PASS · PASS · PASS |
| same | `product-gate.mjs` | not runnable outside a PR context (owner waivers are PR-bound, so a combined local run reports `pr-not-covered`); each PR's own `quality` run, which includes the gate, is green |

### D.2 Per-PR CI (GitHub check runs, head SHAs as listed in §A)

`quality`, `migration-safety`, `e2e-smoke`, `mobile`, CodeQL: green on #2432,
#2433, #2434, #2435, #2436, #2437, #2438; #2444 had `quality` in progress at
20:30 UTC with the rest green. #2419: red.

### D.3 `CONVERSATION_TOKEN_SECRET` — contract verified, deployment NOT verifiable from this session

- Code contract (read): `lib/env.ts` declares it `z.string().min(16).optional()` on `main`; #2444 removes the `|| SUPABASE_SERVICE_ROLE_KEY` fallback in `lib/conversation/dispatch.ts` and `lib/capabilities/confirmable.ts`, adds it to `.env.example` and `docs/DEPLOYMENT.md` as **mandatory**, and pins all three in a guard test. Rotation invalidates pending confirmations only.
- This session has no Vercel or host credentials and does not want the value. Presence can be checked without exposing it:
  - Vercel: `vercel env ls production` lists names only — `CONVERSATION_TOKEN_SECRET` must appear for Production.
  - Restored host (standalone `node server.js`): in the service's environment run `node -e 'const v=process.env.CONVERSATION_TOKEN_SECRET; console.log(v ? "present, " + v.length + " chars" : "MISSING")'` — expect `present, ≥16 chars`.
  - Runtime proof after deploy: smoke row 7 (one confirmation succeeds, replay refused). A named refusal means the variable is missing.
- Optional follow-up (not done, GREEN): report `confirmationSecret: "configured" | "missing"` from `/api/health` so a monitor sees it; the route already reports env booleans.

### D.4 Production state read today (read-only; the basis for §B and the runbook)

Ledger: `20261003150100`, `20261003150500`, `20261007150000`, `20261012110000`,
`20261012180000`, `20261006100300`, `20260915180000` are applied under
apply-time versions (`20261007131443`, `20261007131826`, `20261008050149`,
`20261012084624`, `20261012193513`, `20261007160023`, `20260915185038`) — the
objects were confirmed in the catalog, not only in the ledger. No `20261016*`
version exists. Billing: 3 customers, 3 live checkout operations (2 open), 0
subscriptions, 0 webhook events, `live_payments_enabled = false`.

## E. Next safe executable action

1. **Owner, now (no code):** N-13 — set `CONVERSATION_TOKEN_SECRET` in the production environment the hosting agent is restoring; confirm with the names-only check in §D.3.
2. **Owner, now (10 minutes, read-only):** Stripe dashboard Step 0 of the runbook; then choose containment A and/or B.
3. **When hosting answers `/api/health` with a current build:** merge §A steps 1–6 one at a time with smoke block 0 after each (steps 1–6 need no env or decision); apply the prepared patches to #2436/#2435 beforehand if D-2 is accepted; step 7 only after N-13; step 8 only after D-1.
4. **Then:** full 20-minute smoke; record the outcome line; only then consider N-9 (apply #2439) and the rest of the RED queue, in the apply order of §C.2.

Nothing in 3–4 may be started by an agent while the owner's merge hold stands.
