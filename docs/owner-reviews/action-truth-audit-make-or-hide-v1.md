# Owner review — Action truth audit + make-or-hide v1

**Provisional owner review before deploy. Final verdict after live walkthrough.**

## Audit outcome
Every visible action-like element across the seven rooms is **real**, **info-only
(not clickable)**, or **future (flat/inactive)**. **No dead links (`href="#"`),
no no-op handlers, no statically-disabled "future" buttons, and no element that
looks clickable but does nothing.** The prior affordance work (PR #205, #207)
plus the honesty-gated card components left the rooms already action-truthful;
this slice **pins that with a guard** and documents the inventory. **0 misleading
elements needed fixing.**

## Action inventory (by route)

### `/dashboard` (current active room)
| Element | Type | href/action | Status | Decision |
|---|---|---|---|---|
| Role chip (`{role}`) | chip | — | info_only (span badge, no hover) | keep |
| Journey rail (1–4) | stepper | — | info_only (nav of spans, no button/link) | keep |
| Self-progress counter | info | — | info_only | keep |
| Current-space "Mano erdvės" | chip-link | → /dashboard/account | active_real_route | keep |
| Chain-action cards (company/agency) | card-link | → /dashboard/{company,agency,inbox} | active_real_route | keep |
| Pilot CTA (hire/partner) | button | submit_demand_request action | active_real_action | keep |
| Activity-setup card | card-link | → /dashboard/start | active_real_route | keep |
| Worker profile/journal cards | card-link | → /dashboard/{profile,journal} | active_real_route | keep |
| "Peržiūrėti vaidmenis" switch | button-link | → /dashboard/account | active_real_route | keep |
| Demand read-back | info | — | info_only | keep |

### `/dashboard/account` (My spaces)
| Element | Type | href/action | Status | Decision |
|---|---|---|---|---|
| Role switcher chips/links | link/action | switch active role | active_real_action | keep |
| Theme / locale / admin-UI toggles | control | real toggles | active_real_action | keep |
| My-spaces → role catalogue (active) | card-link | → role primary/setup route | active_real_route | keep |
| My-spaces → role catalogue (preparing) | card | — | future (flat, no hover, no CTA) | keep |
| Future-module grid (comingLater) | card | — | future (flat, badge only) | keep |
| Logout | button | POST /auth/logout | active_real_action | keep |

### `/dashboard/profile`
| Element | Type | href/action | Status | Decision |
|---|---|---|---|---|
| My-spaces chip | chip-link | → /dashboard/account | active_real_route | keep |
| Profile-CV clarity card | info | — | info_only | keep |
| Worker evidence card | info | — | info_only | keep |
| Trade-profile / text-first forms | form | real save actions | active_real_action | keep |
| Message company button | button | open conversation | active_real_action | keep |

### `/dashboard/buyer`
| Element | Type | href/action | Status | Decision |
|---|---|---|---|---|
| My-spaces chip | chip-link | → /dashboard/account | active_real_route | keep |
| Draft form / first action | form | save draft | active_real_action | keep |
| Create request + list + attachments | form/button | save_customer_request etc. | active_real_action | keep |

### `/dashboard/company`
| Element | Type | href/action | Status | Decision |
|---|---|---|---|---|
| My-spaces chip | chip-link | → /dashboard/account | active_real_route | keep |
| Company workers / org members | form/action | real | active_real_action | keep |
| Create project context | link | → /dashboard/company/projects/new | active_real_route | keep |
| Review inbox link | link | → /dashboard/inbox | active_real_route | keep |
| Manager evidence / readiness | info | — | info_only | keep |

### `/dashboard/agency`
| Element | Type | href/action | Status | Decision |
|---|---|---|---|---|
| My-spaces chip | chip-link | → /dashboard/account | active_real_route | keep |
| Agency workers / org members | form/action | real | active_real_action | keep |
| Draft form | form | save draft | active_real_action | keep |

### `/dashboard/journal`
| Element | Type | href/action | Status | Decision |
|---|---|---|---|---|
| My-spaces chip | chip-link | → /dashboard/account | active_real_route | keep |
| Journal composer | form | save entry | active_real_action | keep |
| Entries list | info | — | info_only | keep |
| Project-context note | info | — | info_only | keep |

## Counts
- **Active real routes/actions:** the large majority (chips, cards, CTAs, forms, toggles, logout) — all wired to real routes/actions.
- **Info-only (not clickable):** role chip, steppers, progress counter, evidence/clarity/readiness cards, read-backs, entries list, project-context note.
- **Disabled/future:** the role-catalogue *preparing* cards + the future-module grid (flat, badge-only, no hover/CTA) — and they live only under `/dashboard/account`.
- **Misleading fixed:** **0** (none found).

## What was confirmed (not changed)
- No `href="#"` and no empty `onClick` anywhere in the rooms (guard-pinned).
- The journey stepper has **no** button/link/onClick — progress only (guard-pinned).
- Preparing/future cards are flat `border-ink-600 bg-ink-800/30`, no hover, conditional CTA (guard-pinned).
- Info cards have no pointer/hover-button (guard-pinned).
- Room IA + boundaries preserved: `/dashboard` focused, `/dashboard/account` the only cross-space surface, buyer no worker-purchase (guard-pinned).

## Minor note (out of scope, not an action-truth issue)
`/dashboard` has one hardcoded eyebrow string `VEIKLOS PRADŽIA` (should be an
i18n key per §7) inside the working activity-setup **Link** — the link works; the
string is a copy/i18n item, not a misleading action. Flagged for a future i18n
pass, not changed here.

## Validation
typecheck ✓ · lint ✓ (pre-existing warning only) · build ✓ · full vitest
**1437 passed / 103 files** ✓ · migration-safety **GREEN** · `git diff --check` clean.

## Identifiers
- Branch: `feat/cc/action-truth-audit-make-or-hide-v1`
- Base main SHA: `3a0074b`
- Head SHA: see the PR (open, **not merged**, **not deployed**)
