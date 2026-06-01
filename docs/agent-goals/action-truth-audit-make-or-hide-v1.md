# Labourmarket.ai — Action truth audit + make-or-hide v1

## /goal

```text
/goal Read and execute docs/agent-goals/action-truth-audit-make-or-hide-v1.md.

Repo: bandymuks1-stack/labourmarketai.
Start from fresh origin/main after PR #207. Verify main includes 3a0074b or later.

Branch:
feat/cc/action-truth-audit-make-or-hide-v1

Open PR only. Do not merge. Do not deploy.

Goal:
Audit all visible buttons/cards/chips/steppers in the existing rooms. Anything that looks clickable must either work, be clearly disabled/future, become info-only, or be hidden until ready.

Rules:
- no DB changes
- no migrations
- no auth/env/billing/payment/outbound changes
- no AI/matching
- no fake/demo data
- no broad redesign
- keep current room IA and boundaries

Final report:
PR URL, branch, head SHA, files changed, routes affected, action inventory counts, validation, safety proof.
```

---

# Action truth audit + make-or-hide v1

## Context

Ramūnas found the main blocker: some elements still look clickable or action-like, but users do not clearly know what can be pressed or what will happen.

## Rule

Every visible action-like element must be one of:

1. Real working route/action
2. Clearly disabled/future
3. Info-only and visually not clickable
4. Hidden until it works

No fake CTA. No dead button. No card that looks clickable but does nothing.

## Routes to inspect

- `/[locale]/dashboard`
- `/[locale]/dashboard/account`
- `/[locale]/dashboard/profile`
- `/[locale]/dashboard/buyer`
- `/[locale]/dashboard/company`
- `/[locale]/dashboard/agency`
- `/[locale]/dashboard/journal`

## Step 1 — action inventory

Create:

```text
docs/owner-reviews/action-truth-audit-make-or-hide-v1.md
```

Include a table:

- Route
- Element text
- Type: button/link/card/chip/stepper/future/info
- Current href/action
- Status: active_real_route / active_real_action / disabled_future / info_only / misleading_should_fix
- Decision: keep_active / make_disabled / make_info_only / hide_until_ready / wire_existing_route
- Notes

## Step 2 — fix misleading controls

For every `misleading_should_fix` item:

- if real route/action exists, wire it;
- if not ready, make disabled/future;
- if informational, remove clickable styling;
- if not useful now, hide it from active room.

## Step 3 — active controls

Every real clickable item must have:

- real href/action;
- visible label;
- hover/focus state;
- keyboard focus if link/button;
- no `href="#"`;
- no empty `onClick`;
- mobile tap target where practical.

## Step 4 — disabled/future/info

Disabled/future items:

- no pointer cursor;
- no active hover/chevron/CTA style;
- secondary visual weight;
- clear `Ruošiama / Coming later` only where needed.

Info-only cards:

- no hover-button styling;
- no pointer cursor;
- no fake focus state.

## Step 5 — steppers

If a stepper is not navigation:

- no button/link semantics;
- no clickable styling;
- show as progress/status only.

## Keep room rules

- `/dashboard` remains focused.
- `/dashboard/account` remains the only cross-space catalogue/switcher.
- Buyer does not present workers as purchasable.
- Company hiring remains separate from buyer.
- Profile does not show buyer/company/agency blocks except compact switch.
- Journal does not show buyer/agency/company-as-buyer clutter.

## Guards/tests

Add/update guards:

- no `href="#"` in reviewed action elements;
- no action-looking element without route/action/disabled/info state;
- future modules do not use active clickable styling;
- info-only cards do not use pointer/hover-button styling;
- clickable chips/cards/buttons have real href/action;
- `/dashboard` has no all-role catalogue or future-module grid;
- `/dashboard/account` is the only cross-space catalogue surface;
- buyer has no worker-purchase wording;
- no DB/RPC/schema text in user-facing UI.

## Validation

Run:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- relevant tests/guards
- migration-safety
- `git diff --check`

## Final report

```text
Final Report — Action truth audit + make-or-hide v1

Identifiers
- PR:
- Branch:
- Head SHA:
- Base main SHA:
- Merge status: OPEN, not merged
- Deploy status: NOT deployed

Inventory
- Total action-like elements:
- Active real routes/actions:
- Disabled/future:
- Info-only:
- Fixed misleading elements:

Routes changed
- ...

Validation
- typecheck:
- lint:
- build:
- tests/guards:
- migration-safety:
- git diff --check:

Safety proof
- No DB changes:
- No migrations:
- No auth/env/billing/payment/outbound:
- No fake/demo data:
- No broad redesign:
- Room boundaries preserved:

Owner review artifact
- Path:

Recommendation
- READY_FOR_OWNER_REVIEW
  OR
- BLOCKED with reason
```
