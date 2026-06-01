# Owner / Ramūnas review — All spaces review-ready polish v1

**Provisional owner review before deploy. Final verdict after deploy and live walkthrough.**

A review-readiness pass: every existing room is role-specific, mobile-readable,
and free of cross-space clutter. No new features, logic, or DB.

## Routes reviewed
| Route | Exists | Space |
|---|---|---|
| `/[locale]/dashboard` | ✅ | current active room |
| `/[locale]/dashboard/account` | ✅ | My spaces / switcher |
| `/[locale]/dashboard/profile` | ✅ | personal profile |
| `/[locale]/dashboard/buyer` | ✅ | buyer / requests |
| `/[locale]/dashboard/company` | ✅ | company workspace |
| `/[locale]/dashboard/agency` | ✅ | agency / candidate supply |
| `/[locale]/dashboard/journal` | ✅ | work journal / evidence |
| team / projects / notifications / messages(`messages`) | ❌ | not present (see future work; `communication` is the messaging surface) |

## Per-space — purpose · what changed · intentionally elsewhere

### Personal profile (`/dashboard/profile`)
- **Is:** avatar, CV, skills, work status, profile completeness.
- **Changed:** already focused (PR #205); compact **My spaces** link in header.
- **Elsewhere:** buyer/company/agency content (only the compact switch link is cross-space).

### Dashboard / current room (`/dashboard`)
- **Is:** the current active space only — current-space header + room actions/status + compact switch.
- **Changed:** (PR #204/#205) no all-roles catalogue, no future-module grid; mobile journey rail + full-width primary CTA.
- **Elsewhere:** all-roles catalogue + future modules → `/dashboard/account`.

### My spaces (`/dashboard/account`)
- **Is:** the only cross-space switcher/catalogue surface.
- **Changed:** the `my-spaces` room now reads **Current space → Available spaces → Modules coming later** (added the **"Galimos erdvės / Available spaces"** label; current-space + comingLater already present, secondary).
- **Elsewhere:** nothing — this is where other spaces live.

### Buyer (`/dashboard/buyer`)
- **Is:** create request, my requests, request status; buyer looks for product/service/specialist/master/contractor/supplier/team.
- **Changed:** compact My spaces link (PR #205); guard pins no worker-purchase wording.
- **Elsewhere:** CV/profile, employer hiring, company workspace, agency supply.

### Company workspace (`/dashboard/company`)
- **Is:** projects, teams, hiring, job requests, project context.
- **Changed:** compact My spaces link (PR #205).
- **Elsewhere:** buyer request UI.

### Agency (`/dashboard/agency`)
- **Is:** candidate/team supply, offer candidate/team, assignments.
- **Changed:** compact **My spaces** link added; guard pins no buyer/private-person blocks.
- **Elsewhere:** buyer/private-person content.

### Journal / work (`/dashboard/journal`)
- **Is:** work journal entries, evidence, read-only project-context note, review status.
- **Changed:** compact **My spaces** link added; guard pins no buyer/agency/company-as-buyer blocks.
- **Elsewhere:** buyer/agency/company-as-buyer clutter.

## What remains future work (documented, not faked)
- **Company-as-buyer** has no dedicated route/role yet.
- No `team` / `projects` / `notifications` standalone routes (project context is read-only inside company; messaging is `communication`).
- Deeper per-space mobile treatments (sticky primary action, per-room spacing tokens) and a per-space route/persistence model.

## Mobile review checklist (each room)
- [ ] First screen names the room.
- [ ] Primary action is obvious.
- [ ] Cards stack cleanly; no cramped button row.
- [ ] No tiny <10px labels / overflow / table-on-narrow.
- [ ] No unrelated role cards.
- [ ] Future/inactive items are secondary.
- [ ] Compact "Mano erdvės / My spaces" switch present.

## Suggested walkthrough order (Ramūnas)
1. Personal profile → 2. Dashboard / current room → 3. My spaces (`/dashboard/account`) → 4. Buyer → 5. Company → 6. Journal / work → 7. Agency.

## Validation
typecheck ✓ · lint ✓ (pre-existing warning only) · build ✓ · full vitest
**1394 passed / 101 files** ✓ · migration-safety **GREEN** · `git diff --check` clean.

## Identifiers
- Branch: `feat/cc/all-spaces-review-ready-polish-v1`
- Base main SHA: `d7b68f8`
- Head SHA: see the PR (open, **not merged**, **not deployed**)
