# labourmarketai — Constitution Audit + Premium Visual Lock v1

Audit of the locked constitution against the codebase. This stage is an audit
plus a minimal lock — not new features. Branch:
`feat/labourmarketai-foundation-v1`.

## Scope inventoried

`docs/product/labourmarketai-product-constitution.md`,
`docs/product/labourmarketai-route-map.md`,
`docs/product/labourmarketai-component-map.md`, `src/app/globals.css`,
`scripts/check.ts`, `src/lib/layout-blocks.ts`,
`src/components/ui/LayoutBlock.tsx`, `src/components/ui/StatusChip.tsx`, plus
the full route tree and component tree.

## Routes — compliant

Exactly the 13 allowed routes exist, no more: `/`, `/login`, `/register`,
`/role`, `/app`, `/app/profile`, `/app/discover`, `/app/matches`,
`/app/company`, `/app/hiring-needs`, `/app/communication`, `/app/settings`,
`/admin` (plus the root and `/app` layouts). **No** separate avatar route,
**no** duplicate profile/communication route, **no** review route — in code or
docs.

## Terms / functions — no duplication found

| Concern | One meaning · one place | Second version? |
| --- | --- | --- |
| profile | `Profile` (`src/lib/types.ts`) + `/app/profile` | none |
| player card | `PlayerSurface` via `ProfilePlayerCard` | none |
| avatar | visual projection inside the player card only | none (no component/route) |
| candidate card | `DiscoverCard` composes `ProfilePlayerCard` | none |
| company card | `CompanyPlayerCard` | none |
| hiring need | `HiringNeed` + `HiringNeedCard` + `/app/hiring-needs` | none |
| matching | `src/lib/matching.ts` + `MatchResult` + `/app/matches` | none |
| discover | `DiscoverCard` + `/app/discover` (reuses profile data) | none |
| communication | `CommunicationStart` + `/app/communication` | none |
| admin | `AdminShell` + `/admin` (management shell only) | none |

`DiscoverCard`, `MatchResult`, `HiringNeedCard` and `CommunicationStart` all
compose the canonical components — none defines a second product model.

## Premium visual direction — already existed (not duplicated)

The premium sports / draft / scouting direction is already locked in the
constitution §2 and the named token vocabulary in §7.1 (added in the prior
visual addendum). It already covers every required point: top-tier sports
aesthetic, draft & scouting logic, premium-arena feel, dark navy/graphite/
black base, strong contrast, restrained electric/neon accents, gold/silver/
blue/green fit & status signals, high-value player/candidate-card feel, and
the information hierarchy (what it is → why it matters → does it fit → what to
do next). **Not duplicated, not rewritten.**

## Design tokens — already present (not duplicated)

All required token names already exist in `src/app/globals.css` `@theme`:
`--color-arena`, `--color-surface-premium`, `--color-surface-card`,
`--color-border-premium`, `--color-accent-draft`, `--color-accent-match`,
`--color-fit-success`, `--color-fit-warning`, `--color-fit-neutral`,
`--shadow-glow` (glow), `--shadow-depth` (depth shadow), plus the
`--color-signal-*` family. No duplicate tokens introduced.

## Guards — one gap found and closed

All required guards already existed (single profile route, no separate avatar
route, single communication route, approval/screening/owner-acceptance
phrasing, fabricated-intelligence claims, technical terms in public UI copy,
duplicate player-card components, duplicate profile source file, duplicate
communication area). **One gap:** no guard for terms contradicting the §2
premium visual direction. Added `checkPremiumVisualTerms()` in
`scripts/check.ts`, scoped to the public surface only (landing route + landing
components, like the lexicon guard so docs may legitimately say "not a SaaS
template"). Constitution §11 updated to record it.

## Minor observation (left unchanged by design)

`LandingHero.tsx` and `Wordmark.tsx` each carry one `rgba()` glow value inside
a Tailwind arbitrary `shadow-[…]` utility. These are glow-only (not raw
palette) and value-equivalent to the glow language. Per the audit's
"inventory first, change only if truly needed, do not redesign landing"
constraint they are **not modified now**; recorded here as optional future
token-purity cleanup.

## Result

Structure is compliant with the constitution. The only changes this stage:
the one missing guard (`checkPremiumVisualTerms`), the §11 enforcement line,
and this audit record. No new features, routes, flows, components, or landing
redesign; auth, admin and app functionality untouched.
