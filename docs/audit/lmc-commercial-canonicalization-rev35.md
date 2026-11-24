# LMC Commercial Canonicalization — rev35 audit

Binding companion to `docs/product/lmc-commercial-system-train-v1.md`.
PR #843 (`feat/lmc-commercial-foundation-v1`), Draft, base `main`.

## 1. Starting head

- Expected and verified: `27bc57c06a2f92a307df565880f70ad88427b794` (rev34).
- Worktree clean, branch in sync with `origin/feat/lmc-commercial-foundation-v1`,
  CI green (`quality`, `migration-safety`) at that head.

## 2. Codex findings addressed

- **P1 — “Restrict live-payment activation to the owner”**: the shared
  `lmc_set_flag_v1` accepted any caller-supplied profile UUID with either
  admin signal for ALL six flags, so a service-role caller could enable
  `live_payments_enabled` while attributing the flip to any administrator —
  without proving an owner decision.
- **P2 — “Return the documented conflict for foreign admin-grant keys”**:
  when a different administrator reused an existing global admin-grant key
  for a different recipient, the branch fell through and the insert failed
  with the raw `lmc_admin_grant_key_global` unique-constraint error instead
  of the documented `lmc_idempotency_conflict` — the error contract depended
  on whether the reused key targeted the same account.

## 3. Owner decision (binding for this PR)

`live_payments_enabled` and `stripe_lmc_topups_enabled` are **owner-only
commercial activation flags**. The shared setter must always refuse them with
the canonical `lmc_owner_only_flag` error — for admin, superadmin,
`service_role` and any caller-supplied profile UUID; a supplied owner UUID
grants nothing. No hardcoded owner UUID/email, no caller-supplied owner
profile, no untrusted JWT field, no temporary bypass. Both flags stay
`false`; all TS kill-switches stay `false as const`; no live-payments/Stripe
activation and no temporary owner-activation RPC ship in this PR.

## 4. Flag authorization matrix (implemented + proven)

One canonical policy source: `public.lmc_flag_policy_v1` (SQL) mirrored by
`LMC_FLAG_POLICY` (`apps/web/lib/billing/lmc-flags.ts`), guard-pinned to stay
identical (`lmc-ledger-foundation.test.ts`).

| Key | Class |
|---|---|
| `lmc_purchases_enabled` | `admin` |
| `lmc_promotional_grants_enabled` | `admin` |
| `lmc_referrals_enabled` | `admin` |
| `lmc_spending_enabled` | `admin` |
| `stripe_lmc_topups_enabled` | **`owner_only`** |
| `live_payments_enabled` | **`owner_only`** |
| *(anything else)* | **`system_locked`** (fail-closed default — never `admin`) |

Enforcement points:

1. `lmc_set_flag_v1` checks the class **before** any identity check:
   `owner_only` → `lmc_owner_only_flag` (42501) for every caller, both
   directions; `system_locked` → `lmc_system_locked_flag` (42501); unknown
   key → `lmc_unknown_flag` (22023). Only `admin`-class keys reach the
   dual-signal admin authority gate.
2. `lmc_settings_update_guard` trigger belt: even a table-owner UPDATE
   cannot enable an `owner_only` flag or change a `system_locked` flag.
3. Every refused attempt raises before any write — no partial DB change,
   no provenance overwrite, no audit row (proven).

Proof: db-proof **P37** (admin flips admin-class; owner_only refused for
admin + dual-signal superadmin + service_role + plain caller-supplied UUID,
enable and disable; owner-path UPDATE refused; unknown and system_locked
fail closed; both owner flags remain `false` with zero audit rows).

Future owner mechanism boundary is documented in train doc **§14a**
(server-side owner registry + `auth.uid()`, no hardcoded identity,
strengthened confirmation, expected-current-value guard, immutable audit).
It is deliberately NOT implemented in this PR.

## 5. Admin-grant global idempotency matrix (implemented + proven)

One canonical interpreter: `public.lmc_admin_grant_existing_v1`, called at
every resolution point of `lmc_admin_grant_v1` (pre-gate leak-safe,
kill-switch race window, post-lock pre-insert, unique_violation backstop).

| Case | Outcome |
|---|---|
| Same actor + same key + same payload | canonical replay, no second grant, no balance change |
| Same actor + same key + different recipient/amount/campaign/reason/expiry | `lmc_idempotency_conflict`, SQLSTATE 23505 |
| Foreign admin + same key (any payload) | `lmc_idempotency_conflict`, 23505, immediately after the live admin gate — **no fall-through** |
| Non-admin + same key | `Admin only` (key existence never leaked) |
| Concurrent cross-account reuse | insert `unique_violation` handler rewrites `lmc_admin_grant_key_global` into the **same** canonical conflict |

The global key is checked before the insert; the raw unique index remains
only as a concurrency backstop whose error is rewritten to the identical
canonical shape. Conflict messages expose no other actor/recipient identity.
Proof: db-proof **P38** (full matrix incl. audit/balance stability) and
**P38b** (deterministic cross-account concurrency through the backstop);
P21/P27/P34/P35 unchanged and green.

## 6. Old-implementation registry (full audit)

Searched: git history, all open/draft/closed PRs, all remote branches, all
migrations (repo + production ledger via Supabase MCP `list_migrations`),
SQL functions, TS code, tests, docs, env/config — terms: LMC, ledger,
balance, credits, referral, bonus, admin grant, idempotency, Stripe, top-up,
live payments, commercial activation, feature flags, owner-only/owner gate,
kill-switch.

| Object | Where | Merged? | In prod? | Verdict |
|---|---|---|---|---|
| PR #754 `feat(billing): pricing & payments architecture v2` (branch `feat/cc/owner-sprint-v2-pricing-rebased`, head `dc051b45`) — `credit_ledger`/`credit_balances`/`credit_types`, `usage_events` + cost engine, offer windows, `PLAN_CATALOGUE_V2`, ad-product registry; migrations `20260714190000/191000/200000` | open Draft | no | **no** (verified absent from prod migration ledger) | **REMOVED** (closed as `SUPERSEDED_BY_843`; branch deleted). Reusable elements were already consciously migrated by the Wagon-0 audit (train doc §3.1): patterns #1–#6/#15/#16 adopted or already on `main`; #10 price table preserved as the §6 decision-matrix input; #7/#8/#9/#11/#12/#14 rejected by doctrine. No unique un-migrated change remains. |
| PR #753 (branch `feat/cc/owner-sprint-v2-pricing`) — identical content, pre-rebase | closed (replaced by #754) | no | no | **REMOVED** (obsolete branch deleted; PR history preserved) |
| PR #171 `Slice 7 — payments/subscriptions (plan only)` (branch `feat/cc/slice-7-payments-red-draft`, docs-only plan) | closed, unmerged | no | no | **REMOVED** (branch deleted); plan long superseded by the merged Stripe TEST scaffold (#367–#375) and this train |
| Stripe TEST scaffold on `main` (`lib/billing/*`: config-core live-key hard block, provider adapter, checkout/webhook, subscription-store, `PAYMENTS_ENABLED=false as const`, entitlements; migration `20260613200000_billing_test_mode_records`) | merged, prod-applied migration | yes | yes | **STILL_REQUIRED** — the canonical non-LMC billing foundation; Wagon 4 builds on it. Not a competing ledger (no credits, no balances). Untouched. |
| Merged billing/pricing history (#80, #148, #234, #361, #367–#375, #428, #432, #436, #438, #542, #617, #622, #695) | merged | yes | n/a | **PRESERVED_HISTORY** — audit trail; no dead competing code found on `main` from these |
| `20260702130000_admin_grant_guard` (block self-promotion to admin role) | merged | yes | yes | **STILL_REQUIRED** — different domain (role self-promotion guard, not LMC grants). Untouched. |
| PR #754 pricing table (9.99/24.99/99/99.99/249.99/499.99 €) | — | — | — | **MIGRATED_TO_CANONICAL** — preserved as the base column of the train doc §6 owner pricing decision matrix |
| LMC Wagon 1 (this PR): `lmc_*` tables/RPCs/flags, `lmc-flags.ts`, guard test, db-proof | PR #843 | no (Draft) | **no** | **CANONICAL** |

No second LMC ledger, flag setter, owner-authorization source, admin-grant
RPC, idempotency-key interpretation or commercial activation path exists
anywhere else in the tree (search proof §10).

## 7. Closed PRs

- **#754** — closed with `SUPERSEDED_BY_843` comment naming the canonical
  replacement.

## 8. Deleted remote branches

- `feat/cc/owner-sprint-v2-pricing-rebased` (PR #754, after closure)
- `feat/cc/owner-sprint-v2-pricing` (PR #753, closed earlier as replaced)
- `feat/cc/slice-7-payments-red-draft` (PR #171, closed 2026-05, plan-only)

Each deleted individually by exact name after verifying no open PR or other
active work uses it. No mass/wildcard deletion was used. Merged-PR branches
and unrelated branches untouched.

## 9. Removed files and symbols

Nothing on `main` or the PR branch duplicated the LMC architecture, so no
tracked file needed deletion; the removals in §6 are the unmerged #754/#753
branch content (never on `main`, never applied to production) and dangling
branches. Within the PR branch, rev35 removed the last scattered
authorization logic by centralizing it:

- inline admin-grant global replay block → `lmc_admin_grant_existing_v1`
  (single interpreter; the “different actor: fall through” branch is gone);
- per-function flag special-cases → `lmc_flag_policy_v1` (single policy).

## 10. Search proof (post-change)

`grep -rli <term>` over `apps/ scripts/ supabase/ services/`
(`*.ts,*.tsx,*.sql,*.mts`):

| Term | Remaining hits | Why legitimate |
|---|---|---|
| `credit_ledger`, `credit_balances`, `credit_types`, `usage_events`, `billing_offer`, `PLAN_CATALOGUE_V2`, `launch_offer_99` | **none** | superseded #754 schema absent from the tree |
| `ad_products` | guard test only | the cleanup-regression assertion that pins its absence |
| `lmc_set_flag`, `lmc_admin_grant`, `owner_only`, `lmc_owner_only_flag`, `system_locked`, `topup`, `live_payment` | migration, rollback, `lmc-flags.ts`, guard test, db-proof | the canonical Wagon-1 implementation itself |

Guard-level regression (`lmc-ledger-foundation.test.ts`): no
`billing_plans_offers|ad_products_registry|usage_cost_tracking|credit_*`
migration/rollback filenames; no `offer*/usage*/cost-engine*/ad-products/
plans-v2` modules in `lib/billing`; exactly one `lmc_set_flag_v*` and one
`lmc_admin_grant_v*` in the migration; no hardcoded UUID/email in shipped
surfaces; no `lmc_owner_set_flag`/`owner_activation` RPC.

## 11. Production migrations untouched (proof)

Supabase MCP `list_migrations` (project `gorgitwvdzxbnaxhrsrw`, 2026-07-21):
ledger ends at `20260721041309 learning_stale_lifecycle_v1`. It contains
**neither** `20260720190000_lmc_ledger_foundation_v1` **nor** any #754
migration (`20260714190000/191000/200000`) — so editing the PR-branch
migration in place is safe, and no production migration was deleted,
renamed, rewritten or checksum-changed. Applied migrations
(`billing_test_mode_records`, `admin_grant_guard`, …) untouched.

## 12. Canonical component map after rev35

1. **Ledger**: `lmc_transactions` + `lmc_lots` + `lmc_lot_consumptions`,
   append-only; balances derived (`lmc_account_balances` view). One path.
2. **Admin grants**: `lmc_admin_grant_v1` + internal
   `lmc_admin_grant_existing_v1` (single global-key interpretation).
3. **Idempotency**: `unique (account_id, idempotency_key)` +
   `lmc_admin_grant_key_global` + `lmc_existing_by_idempotency_v1`
   fingerprints; one semantics, one error shape (`lmc_idempotency_conflict`,
   23505).
4. **Flag policy**: `lmc_flag_policy_v1` (SQL) ⇔ `LMC_FLAG_POLICY` (TS),
   one shared setter `lmc_set_flag_v1` that cannot touch `owner_only` /
   `system_locked` keys, plus the trigger belt.
5. **No** active live-payments or Stripe top-up path; **no** temporary owner
   bypass; **one** binding document (train doc) matching SQL + TS behaviour.

## 13. Tests and CI

- db-proof harness: **67/67** proofs green locally (scratch DB), including
  new P37, P38, P38b; all negative controls green.
- Guard suite `lmc-ledger-foundation.test.ts`: 27/27 (policy mirror, setter
  ordering, trigger belt, no hardcoded identity, single-interpreter,
  canonical-conflict, cleanup regression). A CRLF-normalization fix makes
  `sqlBody` behave identically on Windows checkouts.
- Full `pnpm -F web` test suite, typecheck, lint, production build and
  GitHub CI (`quality`, `migration-safety`): results recorded in the PR
  conversation for the rev35 head.

## 14. Remaining risks

- The owner activation RPC (train doc §14a) intentionally does not exist
  yet; until that wagon, owner_only flags can only be changed by a reviewed
  migration — accepted by design.
- `lmc_settings_update_guard` permits a hypothetical true→false emergency
  disable of an owner_only flag at the table-owner layer (the setter still
  refuses); irrelevant while both flags are structurally `false`, and the
  future owner wagon must define the sanctioned disable path.
- The migration remains DRAFT / `needs-human-gate`; nothing here changes the
  production apply decision.
