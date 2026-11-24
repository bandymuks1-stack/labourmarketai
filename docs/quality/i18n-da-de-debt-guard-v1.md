# DA/DE i18n Debt Inventory + Ratchet Guard v1

> Companion to the primary-route smoke guard (PR #136) and Quality Gates CI
> (PR #138). Spec: `docs/quality/safe-merge-and-continue-quality-v2.md`.

> ⚠️ **Historical snapshot — numbers below are the guard-creation baseline,
> not the current state.** Measured 2026-08-30: `de.json` carries **0** `[EN]`
> markers (DE was fully translated and ACTIVATED 2026-07-11; its ratchet
> baseline is 0) and `da.json` carries **1,301** (live ratchet ceiling
> `da: 1314`). The current baselines live in `apps/web/lib/guards/i18n-debt.ts`
> and the canonical language-coverage numbers live in
> [`docs/LANGUAGE_MATRIX.md`](../LANGUAGE_MATRIX.md) §2.1 — defer there when
> this file disagrees. The mechanism this doc describes (measure + ratchet,
> never machine-translate) is still in force unchanged.

## Problem

Quality Audit v2 flagged that the non-primary locale catalogs ship many strings
still marked `[EN]` — English text shown to the user. EN and LT are fully
translated (0 markers); **DA and DE each carry 633 untranslated keys** (the same
debt magnitude also exists in et/lv/nl/no/pl/sv).

Machine-translating these as "native-perfect" is **forbidden** (platform
doctrine §7 — no fake content). So the first safe step is **measure + ratchet**,
not translate.

## What this adds

- `apps/web/lib/guards/i18n-debt.ts` — pure scanner: counts `[EN]` leaf values in
  `messages/da.json` / `messages/de.json`, grouped by namespace; recorded
  baseline (`da: 633`, `de: 633`).
- `apps/web/lib/guards/i18n-debt.test.ts` — vitest ratchet: fails only if DA/DE
  rise above baseline, or if `en`/`lt` regress to show any `[EN]`.
- `apps/web/scripts/check-i18n-debt.ts` + `pnpm check:i18n-debt` — owner report
  (`runtime/project-quality/i18n-da-de-inventory.{md,html,json}`) + CI gate.

## Guard behaviour (ratchet)

| Action | Result |
|--------|--------|
| Ship a new untranslated `[EN]` string in DA/DE (count rises) | ❌ fails |
| `[EN]` appears in `en` or `lt` | ❌ fails (primary regression) |
| Human-translate strings (count drops) | ✅ passes — then lower the baseline |
| No change | ✅ passes (existing debt allowed) |

## Explicitly NOT done

- No translation (human or machine) is performed.
- No copy is edited. No product behaviour changes. No env/DB/billing/auth.

## Translate-first order (from the inventory)

Largest DA/DE namespace is `auth` (184 each), then `agencies` / `companies` /
`workers` (46 each), then `pricing` (45). A human translation pass should start
with `auth`, then lower the baseline to lock the gain in.
