# AUTONOMOUS EXECUTION TRACKER

One row per slice executed under the owner-away autonomous train. Each entry
records what was actually done and proven — not what was planned. A slice that
was blocked says so, with the blocker class.

Canonical scope and W numbering stay owned by
`docs/program/W1_W22_CURRENT_STATE_MATRIX.md`; this file never redefines them.

---

## W7-S4 — profile information architecture

| field | value |
|---|---|
| start SHA | `7e13886f826b77e71b96764014f8feb9a5c362f7` (verified via `git fetch origin`) |
| branch | `feat/cc/w7-s4-profile-ia-cleanup` |
| worktree | `C:/Users/Mano/Documents/claud darbai/labourmarketai-wt/w7-s4` (new, own `node_modules`, own dev server `:3470`, own local-stack `.env.local`) |
| objective | remove domain-misplaced content from `/dashboard/profile` without losing capability and without creating a route; fold in W7-S2 debt A-1 |
| before state | W7 ≈76%; profile 2 unlabelled perceivable inputs, 35–36 sub-44px targets, 16–17 cards, 14 `<section>`, 12 `<h2>` |

### Changes

- `#managed-companies` → `/dashboard/network` (`network-organizations`), with
  the add-company action, the zero-company state and the individual-activity
  note ported — all three were absent at the destination.
- `MessageButton` (worker → employer) → `/dashboard/network`
  (`network-relationships`).
- Two unnamed perceivable inputs named via `aria-labelledby` → the visible
  label (external-profile URL; image-OCR seam file input).
- Profile header action row raised to `min-h-11`; one handoff link added
  (`profile-network-link`). Dead `#managed-companies` quick-nav chip removed.
- Two readers left the profile render path (`getOwnedOrganizations`,
  `getEmployerOwnerProfileId`), guard-pinned at zero calls.

### Canonical corrections made on evidence

Both destinations named by `W7_S1_PROFILE_HUB_OVERVIEW.md` §11 were rejected:

- `/dashboard/company` — role-gated (`requireRoleOrRedirect(…, "company")`)
  and renders a single active-workspace company. It redirects away the
  zero-company reader the add-company action exists for.
- `/dashboard/communication` — `message-counterpart-restricted.test.ts` (a P0
  owner production correction) forbids any contact button on both thread
  surfaces. **The guard was kept; the destination changed.**

### Verification

| check | result |
|---|---|
| typecheck | clean |
| tests | 859 files / 13974 pass (`--testTimeout=30000`; default 5s run flakes on tree-scanning guards — recorded, not hidden) |
| lint | clean |
| repo gates | `check:constitution`, `check:i18n-debt` (baseline unchanged), `check:worker-plain-language`, `check:pilot-honesty-copy`, `check:fit-signal-copy` all pass |
| browser proof | 1440 + 375 × 2 identity scenarios × 2 routes; 16 screenshots + 4 JSONs; 0 console errors, 0 hydration warnings, 0 overflow, 0 dead anchors |
| new guard | `w7-s4-profile-information-architecture.test.ts` (30 assertions) |
| migration | none |

### Result

| metric (profile) | before | after |
|---|---|---|
| height @1440 | 5406 / 5542 | 5160 / 5345 |
| height @375 | 7679 / 7815 | 7423 / 7628 |
| cards | 16 / 17 | 15 / 16 |
| `<section>` | 14 | 13 |
| `<h2>` | 12 | 11 |
| unlabelled perceivable inputs | 2 | **0** |
| sub-44px targets | 36 / 35 | **29 / 28** |

`/dashboard/network` grew +85…+224 px — that growth is the ported capability,
and one metric regressed there (sub-44 19 → 20 in the worker scenario, the
shared `MessageButton`'s own ~26 px styling). Both are reported in
`W7_S4_PROFILE_INFORMATION_ARCHITECTURE.md` §7 rather than omitted.

| field | value |
|---|---|
| PR | #1054 — MERGED |
| merge SHA | `d5f3f9a539992d05b450e1af28dde7a8f52bf703` (PR #1054, squash-merged) |
| deployment | n/a (no migration; ships with the next main deploy) |
| owner gates hit | none |
| resulting W7 | ~82% |
| next action | W7-S5 — worker-profile copy consistency |

---

## W7-S5 — worker profile copy consistency

| field | value |
|---|---|
| start SHA | `d5f3f9a539992d05b450e1af28dde7a8f52bf703` (W7-S4 merged) |
| branch | `feat/cc/w7-s5-worker-copy-consistency` |
| worktree | `C:/Users/Mano/Documents/claud darbai/labourmarketai-wt/w7-s5` (new, own `node_modules`, own dev server `:3471`) |
| objective | the worker's own profile speaks with one voice — the worker's |
| before state | three voices mixed across `workerPrefs` v1/v2 and `cvImport.availabilityKeys`, in all 5 locales |

### Changes

**63 strings, 5 locales, 2 namespaces. No key added, renamed or removed; diff
is exactly 63 insertions / 63 deletions.**

The matrix recorded this as a Lithuanian v1-vs-v2 mismatch. It was one symptom
of a three-surface, five-locale problem: a person filling in their own profile
was reading a dossier written about them (`Has own transport`, `Gali dirbti…`,
`Может работать…`). Two gender defects were found in the same pass and fixed —
Lithuanian `Galiu dirbti vienas` (masculine-only) and Russian `Готов` where v2
two fields below already used the inclusive `Готов(а)`.

Scope boundary is deliberate and pinned in BOTH directions: instructions and
chat questions stay second person, because that is correct for them.

### Verification

| check | result |
|---|---|
| typecheck | clean |
| tests | 860 files / 13993 pass |
| i18n-debt | baseline unchanged (no key added or removed) |
| constitution / plain-language / pilot-honesty | pass |
| browser proof | rendered form read in lt/en/ru at 1440 + 375; 12 screenshots + 2 JSONs; **zero overflow, zero console errors, zero hydration warnings** |
| new guard | `w7-s5-worker-self-declaration-voice.test.ts`, 19 assertions |
| migration | none |

Cost: **+16 px (en) / +32 px (ru) on mobile only** from longer labels wrapping;
desktop unchanged. Reported rather than omitted.

| field | value |
|---|---|
| PR | pending |
| owner gates hit | none |
| resulting W7 | ~88% |
| next action | W7 P1-3 — conversation-memory reality audit |

---

## W7 closure audit — P1-3 + P2-1

| field | value |
|---|---|
| start SHA | `7632f428e109f3710c6a61c2459c16c93f7a024a` (W7-S5 merged) |
| branch | `feat/cc/w7-closure-audit` |
| objective | reality-audit the two W7 items that were never slices; ship whatever needs no schema change |

### Findings

**P1-3 conversation memory — BLOCKED / MIGRATION_GATE.** Stronger than the
matrix recorded: the AI-control thread has NO persistence layer at all (plain
`useState`, re-seeded each mount; the one `sessionStorage` use is a read-once
voice hand-off). No `assistant_*` table exists. The design package is complete
and its SHA-256 pins re-verified INTACT — with an operational note that on
Windows the working-tree hashes differ because of CRLF checkout, which would
otherwise look like a failed integrity check on an owner-gated migration.
Package already exists as Draft PR #883; no duplicate work done.

**P2-1 open-ended booking — PARTIAL.** Mechanism located exactly:
`daterange(start_date, coalesce(expected_end_date, start_date), '[]')` collapses
an end-less booking to its START DAY, in both the EXCLUDE constraint and
`respond_booking_request_v3`. Worker double-booking protection is therefore
absent from day two onward. Three parts of the system read the same NULL three
different ways (one day / ongoing / not stated). The honesty half SHIPPED with
no schema change; the capability half needs five product definitions before a
migration can even be written.

### Verification

| check | result |
|---|---|
| typecheck / lint | clean |
| tests | 861 files / 14003 pass |
| i18n-debt | within baseline |
| new guard | `w7-p2-1-open-ended-booking-honesty.test.ts`, 10 assertions |
| migration | none |

| field | value |
|---|---|
| PR | pending |
| owner gates hit | **2** — #883 conversation-memory migration; open-ended booking conflict model |
| resulting W7 | **PARTIAL — `W7_REMAINING_GAPS_EXPLICIT`**, not DONE |
| next action | W7-S5b (safe, unblocked), then W8 |

---
