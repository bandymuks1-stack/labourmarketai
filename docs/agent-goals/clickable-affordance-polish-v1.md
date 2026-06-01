# Labourmarket.ai — Clickable affordance polish v1

## /goal

```text
/goal Read and execute docs/agent-goals/clickable-affordance-polish-v1.md.

Repo: bandymuks1-stack/labourmarketai.
Start from fresh origin/main after PR #206. Verify main includes merge SHA 23aba6a or later.

Branch:
feat/cc/clickable-affordance-polish-v1

Open PR only. Do not merge. Do not deploy.

Goal:
After Ramūnas review, improve the UI so users immediately understand what can be clicked/tapped and what is only information. Keep the approved room-based IA and visual direction. Reduce text where possible.

Hard boundaries:
No DB changes. No migrations. No auth/env/billing/payment/outbound changes. No AI/matching. No new business logic. No fake/demo data. No broad redesign.
```

---

# Clickable affordance polish v1

## Context

Ramūnas review summary:

- clear where you are;
- no unnecessary elements noticed;
- background is pleasant and not tiring;
- texts are understandable;
- would use it;
- main issue: not always clear what can be tapped/clicked.

## Goal

Make actions visually obvious and make non-actions clearly inactive/informational.

Do not change the IA again.

Do not add more explanatory text.

Use visual cues, not paragraphs.

## Routes to inspect

```text
/[locale]/dashboard
/[locale]/dashboard/account
/[locale]/dashboard/profile
/[locale]/dashboard/buyer
/[locale]/dashboard/company
/[locale]/dashboard/agency
/[locale]/dashboard/journal
```

## Required changes

### 1. Active actions must look tappable

Use consistent cues:

- primary button style;
- chevron/arrow on navigational cards;
- clear hover/focus/active state;
- mobile tap targets about 44px where practical;
- action label visible.

### 2. Info-only cards must not look tappable

If a card is not clickable:

- no pointer cursor;
- no hover lift;
- no button-like style;
- no misleading focus state.

### 3. Each room should have one obvious main action

Only use real existing actions.

Examples:

- Buyer: `Sukurti užklausą`
- Company: `Sukurti darbo pasiūlymą` or `Sukurti projekto kontekstą`
- Profile: CV / skills / avatar action if already real
- Journal: work journal action if already real
- Account: switch/add space action

Do not invent fake actions.

### 4. “Mano erdvės / My spaces” must look clickable

Keep it compact, but unmistakably tappable.

### 5. Future modules must look inactive

They must not compete with real actions.

They must not feel like broken buttons.

### 6. Reduce text

Where a visual cue solves the problem, remove or shorten helper text.

No new long paragraphs.

## Keep unchanged

- approved background direction;
- room-based IA;
- `/dashboard` focused room;
- `/dashboard/account` as the only cross-space surface;
- buyer/company/profile/agency/journal boundaries.

## Guards/tests

Add or update guards:

- clickable navigation cards have visible cue/chevron/action label;
- inactive/future cards do not use active button affordance;
- info-only cards do not use pointer/hover-button styling;
- current-space “My spaces” switch remains visible and tappable;
- real primary action exists where already supported;
- `/dashboard` remains focused;
- cross-space content remains only under `/dashboard/account`;
- buyer does not present workers as purchasable;
- no DB/RPC/schema text in user-facing UI.

## Validation

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Also run:

- relevant tests/guards;
- migration-safety;
- `git diff --check`.

## Owner review artifact

Create:

```text
docs/owner-reviews/clickable-affordance-polish-v1.md
```

Include briefly:

- Ramūnas feedback;
- routes inspected;
- what now looks clickable;
- what was made inactive/info-only;
- what text was shortened;
- what stayed unchanged;
- validation results;
- label: `Provisional owner review before deploy. Final verdict after live walkthrough.`

## Final report

```text
Final Report — Clickable affordance polish v1

Identifiers
- PR:
- Branch:
- Head SHA:
- Base main SHA:
- Merge status: OPEN, not merged
- Deploy status: NOT deployed

What changed
- ...

Routes affected
- ...

Clickable affordance
- Active actions:
- Info-only cards:
- Future modules:
- My spaces switch:

Text reduction
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
- /dashboard remains focused:
- /dashboard/account remains the only cross-space surface:

Owner review artifact
- Path:

Recommendation
- READY_FOR_OWNER_REVIEW
  OR
- BLOCKED with reason
```

## Definition of done

Done when:

- PR is open;
- PR is not merged;
- users can visually distinguish clickable vs non-clickable elements;
- room IA is preserved;
- text is not increased;
- validation is green or blockers are reported honestly.
