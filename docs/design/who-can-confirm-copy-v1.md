# "Who can confirm this today" copy — clarity slice v1

**Date:** 2026-06-03
**Status:** Shipped (copy + guard only). **No DB / migration / RPC / RLS.**
**Builds on:** [`universal-confirmation-roles-v1.md`](./universal-confirmation-roles-v1.md)
(PR #239), §4: *"an honest per-entry 'who can confirm this today' line naming
only manager/owner."* This slice ships exactly that, with no new capability.

## Goal

A worker reading their Journal or Profile evidence should understand, in plain
language, **who can actually confirm an entry today** and that until then the
entry is **their own self-declared record**. No fake invite link, no
soon-to-exist confirmer role, no automatic/AI confirmation claim.

## What shipped

Two i18n strings (LT + EN), rendered on the two confirmation surfaces:

| Key | Surface | Component |
| --- | --- | --- |
| `workerEvidence.whoCanConfirm` | Profile → "My evidence" card | `components/app/worker-evidence-card.tsx` |
| `journal.whoCanConfirm` | Journal → entry list (above the status chips) | `app/[locale]/dashboard/journal/page.tsx` |

Both name **only** the confirmer roles the backend can store today —
`manager`, `owner`, `external_manager` (surfaced in lay terms as "your manager,
the business owner, or an external (client) manager") — and state that the entry
stays self-declared until one of them confirms it. "client" is the lay reading
of `external_manager` (the client-side manager in a staffing triangle), already
established and pinned in PR #239; this slice does not widen it further.

## What was intentionally NOT done

- **No DB change:** no new column, table, RPC, RLS policy, or migration.
- **No broad confirmer claim:** parent / guardian / teacher / mentor / buyer /
  customer / family are NOT presented as working confirmers (they cannot be
  stored — see PR #239 §1). The honesty guard blocks any such drift.
- **No fake invite/confirmation link:** the copy describes who *can* confirm,
  it does not render an action the backend cannot fulfil.
- **No fake AI / automatic / verification claim** (product-readiness guard).
- **No payments, marketplace, or new user roles.**

## Guard

`apps/web/lib/guards/confirmation-honesty.test.ts` was extended:
1. Both new keys are added to the scanned confirmation-copy set, so the existing
   broad-confirmer detector runs over them.
2. A new positive block asserts each whoCanConfirm line **names the manager and
   owner roles**, **marks the entry self-declared**, and **does not** name a
   broad confirmer. The guard fails if the copy is added without the supported
   roles, or if it ever over-claims.

## LT grammar & clarity audit

**Profile — `workerEvidence.whoCanConfirm`:**
> "Kas šiandien gali patvirtinti įrašą: jūsų vadovas, įmonės savininkas arba
> išorinis (kliento) vadovas — tie, kurie realiai prižiūri jūsų darbą. Kol kuris
> nors iš jų įrašo nepatvirtins, jis lieka jūsų paties nurodytas."

- *"Kas šiandien gali patvirtinti įrašą"* — correct interrogative-as-heading;
  `įrašą` accusative (object of `patvirtinti`). ✓
- *"jūsų vadovas, įmonės savininkas arba išorinis (kliento) vadovas"* —
  `kliento` genitive ("of the client") reads naturally as "client(') manager". ✓
- *"tie, kurie realiai prižiūri jūsų darbą"* — relative clause; `prižiūri`
  (3rd-person present) agrees with `kurie`. ✓
- *"Kol kuris nors iš jų įrašo nepatvirtins, jis lieka jūsų paties nurodytas"* —
  negated future `nepatvirtins` correctly governs the genitive `įrašo`; the
  "until …" idiom matches the existing `savedConfirmNote` style. `jis lieka …
  nurodytas` agrees in gender/number with `įrašas`. ✓

**Journal — `journal.whoCanConfirm`:**
> "Įrašą gali patvirtinti tik vadovas, savininkas arba išorinis (kliento)
> vadovas — tie, kurie prižiūri jūsų darbą. Iki tol tai jūsų paties nurodytas
> įrašas."

- *"Įrašą gali patvirtinti tik …"* — `tik` correctly scopes the closed list. ✓
- *"Iki tol tai jūsų paties nurodytas įrašas."* — concise closer; `paties`
  reflexive intensifier ("your own"). ✓

No LT word-boundary hazards (PR #61): no regex over `ą/ę/ė/į/š/ų/ū/ž` boundaries
in this slice. No `AI patvirtin` / `automati… patvirtin` substrings
(product-readiness guard).

## Validation

`pnpm -F web typecheck` · `lint` · `test` · `build` · `git diff --check` — all
expected green (copy + guard + docs only).
