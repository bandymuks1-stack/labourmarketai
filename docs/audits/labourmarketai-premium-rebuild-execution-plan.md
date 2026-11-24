# LABOURMARKET.AI — PREMIUM REBUILD EXECUTION PLAN

> Dependency-ordered backlog. One plan, not a second competing master plan.
> Live progress lives in `labourmarketai-premium-rebuild-live-state.md`.

## Governing constraints

- Chat is the primary control surface. No second dashboard. One active context.
- Real data only. Errors never render as empty results.
- Repair before replacing; reuse before adding; no dependency without justification.
- No billing, no destructive production operations, no unauthorized migrations.
- TailAdmin = visual maturity signal only. Ponytail Improved = `ADAPT_RULES_ONLY`, not installed.

## Wave status

| Wave | Scope | State | Gate |
|---|---|---|---|
| **W1** | Full product + UI audit; landing repair | **DONE (local)** | `premium-rebuild-w1/README.md` |
| **Goal 3** | Market → projects → project evaluation | **DONE (local)** | `goal3-project-evaluation/README.md` |
| **INT** | Push, PR #925, CI, merge, deploy, production proof | **IN PROGRESS** | production SHA + smoke |
| **W3** | Remove the second dashboard without losing capability | **NEXT** | capability migration matrix → deletion proof |
| W2 | Design tokens + shell | pending | tokens exist as CSS; needs consolidation audit first |
| W4 | Premium Player Card | partial (#923/#924 landed; owner rejected #922 round) | §5 field list |
| W5 | Real charts + analytics | partial (3 charts mounted, real rows) | §6 state completeness |
| W6 | Work journal → skill evidence | strong domain, UI fragmented | §7 provenance separation |
| W7 | Job + candidate search paths | partial | §9 A/B E2E |
| W8 | Calendar + conflicts | unproven | §9 E E2E |
| W9 | Login / onboarding | login OK (Google + email/password, no dead providers); onboarding unaudited | §10 |
| W10 | Mobile, a11y, performance | unaudited beyond the Goal 3 panel | axe + Lighthouse budgets |
| W11 | Production E2E + visual QA | not started | launch gates |

## Launch gates (dated, non-negotiable)

| Gate | Date | State |
|---|---|---|
| `EMPLOYEE_BETA_PRODUCTION_GATE` | promotion starts 2026-08-01 | **NOT ASSESSED** — requires production proof of login → onboarding → profile/Player Card → chat action → job discovery → journal |
| `COMPANY_BETA_PRODUCTION_GATE` | following week | **NOT ASSESSED** |
| `PUBLIC_RELEASE_PRODUCTION_GATE` | — | blocked by W3 (second dashboard) at minimum |

Promotion readiness of a public worker route is a **narrower** question than
full completion, and is the immediate priority after integration.

---

## W3 — REMOVE THE SECOND DASHBOARD (next wave, detailed)

`/dashboard/advanced/page.tsx` is 916 lines and mounts `PremiumHubScreen`,
`PremiumHubCompanyCard`, `PremiumHubProjectCard`, `PremiumHubMarketMap`.
Inbound references found: the account menu (`account-menu.tsx:81`), a work-log
flow CTA (`worker-worklog-flow.tsx:235`), the surface registry, and the
route-truth map.

### Method (deletion is the LAST step, never the first)

1. **Capability inventory.** Every feature of `/dashboard/advanced`, classified:
   `ALREADY_IN_RESULT_SURFACE` / `ABSORB_INTO_RESULT_SURFACE` /
   `INVOKE_VIA_CHAT` / `OBSOLETE_DUPLICATE` / `LEGITIMATE_DETAIL_ROUTE`.
2. **Migration matrix**, one row per capability, with the target result kind.
3. **Implement** the missing result states — real data, real permissions, and
   the full idle/loading/empty/partial/error/retry set.
4. **Re-point** every inbound link and chat action.
5. **Prove no capability was lost** — per-capability browser assertion, not a
   claim.
6. **Delete** the route only after route/reference/browser proof.
7. **Reduce three navigation systems** toward one canonical navigation.
8. Desktop + mobile visual proof, then merge, deploy, production-prove.

`audience-value-sections.tsx` is dead but is **not** to be deleted on that basis
alone — it has no successor, so removal destroys content. Decide by preservation
or an evidence-backed product decision.

---

## Standing engineering discipline (Ponytail, adopted not installed)

Before each stage, answer in the PR:

1. Does it already exist here? 2. Can the existing place be repaired?
3. Is a dependency needed? 4. Can the platform do it? 5. Will a user feel it?
6. Does it reduce or increase complexity? 7. What is removed in exchange?

Every PR carries the simplicity table (components, duplicates, dependencies,
dead CTAs, parallel nav paths, mock data sites, code changed, dead code removed).

## Evidence discipline

Every claim states its level: `local` / `preview` / `production`, `automated` /
`manual`, and the SHA it was produced at. Evidence from an older SHA cannot
close a current gate unless the code path and deployment are proven unchanged.
