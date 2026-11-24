# W7 — safe-work closure (autonomous train, 2026-08-07)

> Final state: **W7_SAFE_TECHNICAL_WORK_COMPLETE_OWNER_GATES_REMAIN**
> Base at start: `b9cfdb0a`. Safe-work PRs: #1057, #1058, #1059, #1060, #1061.

## 1. The four safe items from `W7_CLOSURE_AUDIT.md` §3 — all closed

| item | PR | outcome |
|---|---|---|
| W7-S5b non-worker identity | #1057 **MERGED** | **Premise corrected**: the audited "12 of 21 sections silently lost" state is unreachable for normally-created accounts (migration 0009's `ensure_worker` trigger gives every profile a `workers` row). The real defect — no-person-ROLE accounts reading a worker-framed page of empty sections — fixed with THE one identity notice (reason + presentation machine-readable), FeatureNote copy keyed on identity, both presentations browser-proven at 1440+375. `docs/audits/W7_S5B_NON_WORKER_IDENTITY.md` |
| A-2 touch targets + labels | #1061 **MERGED** | ~29 sub-44px targets → 44px at call sites; Playwright sweep with forms OPEN over the four worker sections: **0 enabled controls under 43.5px**. 7 new unnamed/placeholder-only open-form inputs named via `Label id` + `aria-labelledby`. **Corrections**: the audited "two remaining A-1 label issues" were already closed; the licence chips named as remaining debt were already `min-h-11 min-w-11` and guard-pinned. `docs/audits/evidence/w7-a2/` |
| `hasTransport` vs `v2.ownVehicle` | #1058 **MERGED** | **Classification A — legitimately distinct** (the v2 migration's own doctrine: mobility vs ownership), collapsed by defective copy (de had literally identical labels). Copy-only fix on all three surfaces, guard pins both directions per active locale, no migration. `docs/audits/W7_TRANSPORT_SEMANTICS.md` |
| `marketplaceHub` misnomer | #1060 **MERGED** | Only 3 keys were live (all on `/dashboard/network`); values moved verbatim to `network.organizations.*`, 14 dead keys deleted from the five active catalogs, W7-S4 guard re-pinned to the honest home, runtime smoke clean. No human-facing string was ever misleading — the misnomer was internal. |

Also closed en route (W19 platform debt, #1059 **MERGED**): the tree-scan
guard flake — vitest project split gives `lib/guards/**` a 30s timeout while
every other unit test keeps failing fast at 5s; 5 full-suite runs, stable.

## 2. Journey re-check

The A-2 evidence run IS a worker journey pass on the current build: login →
`/dashboard/profile` → open education/achievements forms → open capabilities
→ measured sweep → 1440+375 captures. The S5b run adds the two non-worker
identity scenarios. Zero P0 found; no console errors; no layout breakage at
375 (screenshots in `docs/audits/evidence/w7-a2/` and `…/w7-s5b/`).

Simplicity movement this train: the profile now tells every identity the
truth about itself (S5b), every control is reachable by touch (A-2), and the
two remaining copy-level confusions (transport, marketplaceHub) are gone.
The W7-S2 scorecard's NEEDS_POLISH items were touch targets and copy — both
now closed; first-time clarity for non-worker identities moved from
"looks broken" to "explained in one block".

## 3. Remaining W7 gaps — classification (every one)

| gap | class | package |
|---|---|---|
| P1-3 conversation memory | **MIGRATION_GATE** | Draft PR #883 (+#879), proposal SHA-256 re-verified intact this session from canonical git blobs. Retention, isolation, erasure, rollback all specified. Owner steps listed in `W7_CLOSURE_AUDIT.md` §1. |
| P2-1 open-ended booking capability | **PRODUCT_DECISION** | `docs/program/W7_P2_1_OPEN_ENDED_BOOKING_DECISION_PACKAGE.md` — three coherent models (review-date / true-indefinite / status-flag) answering all ten brief questions, recommendation: **Model A (review-date)**. Honesty half already shipped (#1056). |
| whether every signup should get a `workers` row (0009 trigger) | **PRODUCT_DECISION** (new, surfaced by S5b) | recorded in `W7_S5B_NON_WORKER_IDENTITY.md` §5 — as shipped, the page tells the truth in both worlds, so nothing blocks on it. |

**No SAFE_WORK remains in W7.** The two blocking gaps are owner-decision
gaps, not repo-side work. Per the owner-away rule the train proceeds to W8.
