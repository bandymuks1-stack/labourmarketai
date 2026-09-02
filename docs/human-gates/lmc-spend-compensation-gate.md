# HUMAN GATE — LMC spend compensation v1 (#1305)

> **Status:** APPROVED and APPLIED, 2026-08-28.
> **Migration:** `supabase/migrations/20260828090000_lmc_spend_compensation_v1.sql`
> **Rollback:** `supabase/rollbacks/20260828090000_lmc_spend_compensation_v1.down.sql`
> **Reviewed HEAD:** `3f0e2ce73b1c1efd409f10170ce1c01a335398e0`
> **Production project:** `gorgitwvdzxbnaxhrsrw`

---

## 1. THE OWNER DECISION, VERBATIM

An approval that is remembered loosely is an approval that grows. This is the
whole of it:

> APPROVE #1305 MIGRATION.
>
> This approval applies ONLY to the reviewed #1305 LMC spend-compensation
> migration in its CURRENT verified GREEN implementation.
>
> It does NOT approve:
> - live payments;
> - live-money activation;
> - new pricing;
> - new paid infrastructure;
> - unrelated financial migrations;
> - weakening LMC authorization;
> - any broader financial functionality.

The decision also carried a standing instruction that governs the verification
below: *"Do NOT create a real compensation merely for production proof if that
would mutate real user financial data unnecessarily."*

## 2. WHAT THE MARKER COVERS

`migration-safety` raises exactly two findings against this file, and the
`@human-gate-approved` marker covers exactly those two:

| finding | why it is present |
|---|---|
| `security-definer-function` | `lmc_compensate_spend_v1` must write the ledger, and no client role may. |
| `grant-or-revoke` | it revokes the function from `public, anon` and grants EXECUTE to `service_role` only. |

There is **no `data-dml` finding**: the only row inserted is the
`lmc_settings` kill-switch, default `false`.

## 3. PRE-APPLY VERIFICATION

Performed in order, against the production project named above, before any DDL.

| # | check | result |
|---|---|---|
| 1 | `origin/main` fetched | `48b12439` |
| 2 | PR head is the reviewed implementation | `3f0e2ce7`; branch rebased onto `48b12439`, migration sha256 **unchanged**: `d770c216277982cf8b2103fe6d33020c5aaebc2e7db9f5b7467325307665360a` |
| 3 | non-owner guards green | `quality` pass · CodeQL pass · Analyze pass |
| 4 | only remaining red | `migration-safety`, i.e. the RED **classification** itself |
| 5 | canonical approval mechanism | `@human-gate-approved` added **in the same commit as this record**, per the procedure the worker-display-name gate established |
| 6 | ledger + rollback state | `20260828090000` **absent** from the applied ledger; paired rollback present |

### Production pre-state (read-only)

```
lmc_compensate_spend_v1 exists ............ 0
lmc_settings row 'lmc_compensation_enabled' 0
lmc_transactions rows ..................... 0
lmc_accounts rows ......................... 0
lmc_lots rows ............................. 0
```

All four CHECK constraints (`lmc_transactions_kind_check`,
`lmc_tx_reversal_linkage`, `lmc_lots_source_kind_check`,
`lmc_lots_expiry_policy`) and `lmc_settings_key_check` read back at exactly the
pre-migration definitions this migration expects to replace.

**Zero ledger rows means no real user financial data was in scope** — which is
what made the owner's "do not mutate real financial data" instruction
satisfiable without weakening the proof.

## 4. WHAT WAS APPLIED

Through Supabase MCP `apply_migration`. **Never `db push`** — ledger versions
are assigned at apply time and do not match repository filenames, so a push
would re-run migrations that are already applied.

Applied ledger version: **`20260828155923`**, name
`lmc_spend_compensation_v1`.

> The first version of this record carried `20260828142124`, which was a
> PREDICTION written before the apply. Supabase assigns the ledger version at
> apply time, so it could not have been known in advance and should not have
> been written as though it were. Corrected from the ledger itself.

## 5. POST-APPLY VERIFICATION

Every item the owner required, in order. The behavioural checks ran inside a
transaction that was **rolled back**, so no row and no flag persisted.

Raw output of the behavioural block, which ended in a deliberate
`raise exception` so that everything it created was rolled back:

```
(a) flag-off gate ....... REFUSED: lmc_compensation_disabled
(b) foreign actor ....... REFUSED: lmc_actor_not_authorized: the initiating
                                   actor must own the affected account or be
                                   an admin
(c) non-spend ........... REFUSED: lmc_not_a_spend: promotional_activity
                                   cannot be compensated — only a spend can
(d) over-compensation ... REFUSED: lmc_over_compensation: 401 cents requested
                                   but only 400 remain of a 400 cent spend
(e) compensation ........ OK amount=400 expiry_mirrored=true
                            already_processed=false
(f) idempotency ......... same_tx=true already_processed=true
                            compensation_rows=1
(g) second full ......... REFUSED: lmc_already_compensated: spend … is fully
                                   compensated (400 of 400 cents)
(h) append-only ......... REFUSED: lmc_append_only: UPDATE on
                                   public.lmc_transactions is forbidden —
                                   the LMC ledger is immutable
(i) balance view ........ available=1000 promotional=1000
```

The balance line is the arithmetic proof: 1000 granted − 400 spent + 400
compensated = 1000, read back through `lmc_account_balances`.

**Post-rollback state re-read:** `lmc_accounts` 0, `lmc_transactions` 0,
`lmc_lots` 0, `lmc_lot_consumptions` 0, `audit_logs` compensation rows 0,
`lmc_compensation_enabled` `false` with `updated_by` NULL. Nothing persisted.

| # | required | result |
|---|---|---|
| 1 | production migration ledger | `20260828155923` present |
| 2 | feature flag DISABLED by default | `lmc_compensation_enabled = false`; policy class `admin` |
| 3 | anon cannot execute | `anon` holds **no** EXECUTE; `service_role` only |
| 4 | foreign actor cannot execute | `lmc_actor_not_authorized` (42501) |
| 5 | non-spend cannot compensate | `lmc_not_a_spend` on a `promotional_activity` |
| 6 | over-compensation refused | `lmc_over_compensation` at spend+1; `lmc_already_compensated` on a second full one |
| 7 | idempotency | same key returns the same transaction, `already_processed: true`, balance unmoved |
| 8 | append-only | `UPDATE` on `lmc_transactions` refused by `lmc_forbid_mutation` |
| 9 | balance/history surface still works | `lmc_account_balances` / `lmc_lot_balances` unchanged in shape and readable |
| 10 | no existing ledger semantics changed | all 10 pre-existing kinds still admitted; 7 core LMC RPCs present; 5 ledger triggers still attached; both balance views resolve; `authenticated` SELECT yes / INSERT no; `anon` SELECT no; `service_role` INSERT **no** (ledger writes stay RPC-only even for it) |
| 11 | flag gate is enforced, not merely defaulted | with the flag off the RPC refuses `lmc_compensation_disabled` — check (a) above |

## 6. WHAT REMAINS BLOCKED

The capability is **live but switched off**. Turning it on is a separate
decision: `lmc_compensation_enabled` is class `admin` and defaults `false`.
Nothing in this approval touches `stripe_lmc_topups_enabled` or
`live_payments_enabled`, which stay `owner_only` — the shared setter refuses
every caller for those, service_role included, by design.

There is also **no product surface calling this RPC yet**. This migration ships
the ledger capability; reaching it from the LMC surface (#1323) is future work
and is not covered by this approval.
