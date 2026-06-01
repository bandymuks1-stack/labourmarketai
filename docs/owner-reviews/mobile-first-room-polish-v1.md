# Owner review — Mobile-first room polish v1

**Provisional owner review before deploy. Final verdict after deploy.**

The missing spec file was restored at
`docs/agent-goals/mobile-first-room-polish-v1.md`. This slice broadens the
polish across the five room routes and pins room separation with guards.
CSS/layout + copy + guards only — no DB, no logic, no redesign.

## Route-by-route mobile notes

### `/dashboard` (active space)
- Journey rail: per-step labels **hidden on mobile**; circles + one clear
  **current-step line** (`journey-current-step`). Desktop unchanged.
- Primary action (pilot CTA): **full-width on phones**, compact at sm+.
- Stays focused — **no all-roles catalogue, no future-module grid** (guard-enforced).
- Current-space header kept.

### `/dashboard/account` — "Mano erdvės / My spaces"
- The single cross-space switcher/catalogue surface. The `my-spaces` section now
  shows **current space** (`my-spaces-current` → active role's space name) →
  **available / add space** (role catalogue) → **modules coming later**
  (`FeatureAvailabilityGrid comingLater`, secondary + inactive-looking).
- This is the only place the all-roles catalogue + future-module grid render
  (guard-enforced).

### `/dashboard/buyer` — buyer / requests only
- Renders **no** profile-CV / company / agency / catalogue blocks
  (guard-enforced; the page imports none of those components).
- Buyer copy uses **specialist / supplier / team** — **no "darbuotojo" / worker
  purchase** wording (guard-enforced).
- Header gains a **compact "Mano erdvės / My spaces" switch link** (`room-my-spaces-link`).

### `/dashboard/company` — company work management
- Renders **no** buyer-request blocks (no `BuyerRequestsSection` / customer-request
  reads — guard-enforced). Keeps projects / teams / hiring / project-context.
- Header gains the compact **My spaces** switch link.

### `/dashboard/profile` — personal profile
- Renders avatar / CV / skills / status surfaces only; **no** buyer / company /
  agency / catalogue blocks (guard-enforced). The only cross-space element is the
  **compact My-spaces switch link** in the header.

## What was simplified
- Mobile journey rail decluttered (labels → single current step).
- Primary action made a clear full-width mobile tap target.
- Every room now self-names + offers a single compact path to switch spaces,
  with all cross-space content consolidated in `/dashboard/account`.

## What remains future work
- Deeper per-space mobile treatments (sticky primary action, per-room spacing
  tokens), and a real per-space route/persistence model + company-as-buyer mode.
  Flagged, not faked.

## Guards (added/updated)
- `room-separation.test.ts` (new): `/dashboard` has no catalogue/future-grid;
  `/dashboard/account` is the only cross-space surface; buyer/company/profile
  render none of the other spaces' blocks; each room has the compact switch link;
  no worker-purchase / DB-RPC-schema text in buyer copy.
- `mobile-first-room-polish.test.ts`: mobile journey labels hidden + current-step
  line; primary CTA full-width on mobile.

## Routes affected
`/[locale]/dashboard`, `/dashboard/account`, `/dashboard/buyer`,
`/dashboard/company`, `/dashboard/profile`.

## Validation
typecheck ✓ · lint ✓ (pre-existing warning only) · build ✓ · full vitest
**1389 passed / 101 files** ✓ · migration-safety **GREEN** · `git diff --check` clean.

## Identifiers
- Branch: `feat/cc/mobile-first-room-polish-v1`
- Base main SHA: `30ff0a5`
- Head SHA: see the PR (open, **not merged**, **not deployed**)
