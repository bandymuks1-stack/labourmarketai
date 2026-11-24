# Autonomous train — 2026-08-07

Base at start `b9cfdb0a` → final main `2b8b20b5`. Ten PRs merged, zero left open.

## What landed

| PR | W | What |
|---|---|---|
| #1057 | W7 | Non-worker identity made explicit on the person profile |
| #1058 | W7 | `has_transport` = mobility vs `own_vehicle` = ownership (copy-only) |
| #1059 | W19 | Vitest project split: guards 30s, unit stays 5s |
| #1060 | W7 | `marketplaceHub` misnomer retired |
| #1061 | W7 | 44px hit areas across the profile + 7 input names |
| #1062 | W7 | Safe-work closure docs |
| #1063 | W8 | Org demand rollup v1 (employer analytics) |
| #1064 | W10 | Match symmetry guard (slice 7) |
| #1065 | — | **Regression fix: `network.organizations.title`, deleted by #1060** |
| #1066 | W9 | Active organization has ONE source |

## Three findings worth more than the slices that produced them

**1. An audited premise was false, and only the database could say so.**
The W7 closure audit recorded that a company/agency identity "silently loses
12 of 21 profile sections". Migration `0009`'s
`on_profile_created_ensure_worker` trigger gives EVERY profile a `workers`
row, so `workerId` is never null for a normally-created account and those
gates never fire. **Identity truth is `profile_roles`, not the presence of an
entity row.** The real defect was the reverse shape — an account holding no
person role reading a worker-framed page — and it is what #1057 fixed. Any
audit finding derived from a `workerId` gate needs re-checking against that
trigger.

**2. A "cosmetic" naming cleanup was hiding a wrong answer.**
W9's remaining `getOwnCompany()` sites read like tidy-up. They were not: for
someone managing an organization they do not own, the owned-only reader does
not fail empty — `resolveActiveOrganizationId` cannot see membership rows, so
a valid pointer looks stale and falls through to "exactly one owned org →
use it". The chip said one organization, the role switcher said another.
Reproduced on the local stack before fixing (#1066).

**3. I shipped a regression, and the browser caught what the test suite could not.**
#1060 replaced an i18n namespace instead of extending it, deleting
`network.organizations.title`; `/dashboard/network` rendered the raw key
`NETWORK.ORGANIZATIONS.TITLE` on main in all five active locales. Parity
guards compare locales to *each other* and all five lost it symmetrically;
the debt check counts `[EN]` shells and a missing key is not a shell;
typecheck cannot follow a string key across the `next-intl` boundary. Nobody
would have noticed until a user did. Found by reading a screenshot taken for
an unrelated slice, fixed in #1065 with a guard that resolves every `t("…")`
call site a page makes against every active catalog — negative-tested.

**The lesson worth keeping: a screenshot is not decoration on a PR.** Two of
these three were found by looking at the running product, not by reading
code or watching tests go green.

## Owner decisions, in priority order

1. **P1-3 conversation memory** — MIGRATION_GATE. Apply Draft PR #883
   (stacked on #879); proposal SHA-256 re-verified intact from canonical git
   blobs this session (working-tree hashes differ on Windows because of CRLF
   — that is not tampering).
2. **P2-1 open-ended booking** — PRODUCT_DECISION. Pick a model from
   `docs/program/W7_P2_1_OPEN_ENDED_BOOKING_DECISION_PACKAGE.md`.
   Recommendation: **Model A (review-date)** — the only model where W12's
   double-booking protection actually covers ongoing work without unbounded
   calendar bands.
3. **W10 P0-1 remainder** (surfaced by #1064) — the worker board can report
   `strong` for a demand whose own payload blocks it in scouting, because the
   role-text need never evaluates `engagement_form`. Either route the board
   through `needFromDemandRow` everywhere, or say the reduction in the UI.
4. **Should every signup get a `workers` row?** (surfaced by #1057) — as
   shipped the profile tells the truth either way, so nothing blocks on it.

## Next safe work, no owner needed

- **W11 F7** — operations centre real entry point (routing/UI, no migration).
- **W8 §9.5** — re-home / rename `/dashboard/candidates` (naming only; it
  currently means private drafts of unregistered people, not employer
  candidates).
- **W13** — write the baseline FROM the existing notification spine code
  (scope definition only; the W13 scope has never been defined).
- **W2** — card-count ratchet down (interleave opportunistically).
