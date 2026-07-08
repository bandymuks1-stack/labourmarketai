# EmployerPreview cleanup v1 — delete the dead mirror

Follow-up to PR #691. `EmployerPreview` ("Kaip mane matytų darbdavys" / "how an
employer sees you") was a read-only mirror that only ever mounted inside
`WorkCard`. PR #691 removed WorkCard (folded into the hub Asmens kortelė), which
left `EmployerPreview` **unmounted dead code** — a technical artifact, not a
product requirement.

## Decision

Workers do **not** need a "how an employer sees you" mirror on the dashboard, and
it is **not** re-homed to `/dashboard/profile`. It is deleted outright.

## Confirmed dead before deleting

- No `<EmployerPreview>` mount anywhere in `app/` or `components/` (grep: zero).
- The only references to the component were inside its own file.
- The only guard/test referencing it was `employer-preview-honesty.test.ts`,
  which solely tested this component + its copy.
- The `auth.dashboard.workCard.employerPreview` i18n keys had no remaining
  consumer (WorkCard, their only builder, is gone).

## Removed

- `components/app/employer-preview.tsx` — the component (`EmployerPreview`,
  `EmployerPreviewRow`, `EmployerPreviewLabels`).
- `lib/guards/employer-preview-honesty.test.ts` — solely tested the component +
  its copy.
- `auth.dashboard.workCard.employerPreview` (toggle / title / intro / notSet /
  unverifiedNote) from `messages/lt.json`, `en.json`, `ru.json` (the only base
  files that carried it; LT/EN/RU workCard key sets stay in parity).

## Not touched

No new dashboard/profile card, no WorkCard reintroduced, no second worker
identity block. `/dashboard` stays the single action hub; `/dashboard/hub` stays
404. No auth / RLS / migration / billing / matching / conversation / map-provider
changes. The pure `work-card-state` engine, `WorkCardEditor` (folded into the hub
person block), `getWorkerCard`, and the rest of the `workCard` i18n namespace are
untouched — the worker's next action + inline editor keep working.

## Validation

typecheck ✓ · lint ✓ · build ✓ · full vitest ✓ · `check:primary-route-smoke` ✓ ·
`check:i18n-debt` ✓ · `/dashboard/hub` → 404.
