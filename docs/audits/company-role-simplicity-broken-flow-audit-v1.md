# Company role simplicity + broken-flow audit v1 (owner smoke, 2026-06-12)

Slice: `feat/cc/company-role-simplicity-v1`. Scope = owner smoke findings +
authenticated-flow audit. No billing, no external AI tools, no fake
verification, no manual-approval additions.

## Owner smoke findings — root causes + fixes

| # | Finding | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Company create threw a technical error about the organization country key | `companies.country` was FREE TEXT in the form/RPC, but the 0013 mirror trigger copies it into `organizations.country`, which has a FOREIGN KEY to `countries(code)` → typing e.g. "Lietuva" crashed with the raw `organizations_country_fkey` violation, and the form banner printed the raw DB message | Country is now a SELECT over the 9 seeded countries (default Lietuva). New `save_company_setup_v2` (20260612090000) validates the code against `public.countries` before writing. The service maps any country/FK failure to a calm LT message and NEVER passes raw DB text to the banner |
| 2 | Worker-instruction form: worker looked selected but submit showed the browser's "Please select an item in the list" | The select was UNCONTROLLED + native `required`; React 19 resets uncontrolled fields after every form action, so the value could be empty while the user believed a worker was chosen | Controlled select (value survives renders), single managed worker is preselected, native `required` removed, validation shows LT inline message ("Pirmiausia pasirinkite darbuotoją iš sąrašo.") |
| 3 | Right-side panel stayed open after navigating | Header popovers (notifications, role switcher) had no route-change/outside-click close and no ✕ on desktop | Shared `usePopoverDismiss` hook: closes on pathname change, outside click, Escape; explicit ✕ buttons added to both. Mobile sheet already had ✕ |
| 4 | Changing company↔agency left the user in the old mode | Agency was a separate ROOT role with its own entity/pages | Agency is now a `company_type` (`staffing_agency`) inside the ONE canonical company profile. Type change re-labels the dashboard (chip + mode note) after save/refresh via `revalidatePath(layout)` |
| 5 | No photo field in work reports | Journal had no attachment schema/storage at all | Real minimal upload shipped (20260612091000): private `journal-entry-photos` bucket + metadata table + register RPC that ENFORCES the free 1-photo-per-entry cap server-side. Composer shows the field + the honest note: "Nemokamai galite pridėti 1 nuotrauką prie įrašo. Daugiau nuotraukų ir išplėstiniai įrodymai bus VIP funkcija." If storage is not provisioned, the user sees an honest "not ready yet" note — never a silently missing feature |

## Role model after this slice

- Start choices (onboarding + setup role choice): **worker** and **company** only.
- `company_type` ladder: statybos įmonė / personalo agentūra / subrangovas /
  gamyba / paslaugos / klientas-užsakovas / kita.
- Agency root role: HIDDEN from all add/start surfaces (`lib/config/roles.ts`).
  Existing agency holders keep their workspace (`/dashboard/agency`, pool,
  invitations) — legacy continuity, no data loss.
- Customer root role: still exists for held users + buyer flows; new users are
  guided to the company profile with type "klientas / užsakovas". (Removing the
  customer role entirely would break live demand-intake flows — out of scope
  for v1, flagged below.)

## Authenticated-flow audit (kas veikia / kas ne)

### Veikia (works)
- Role selection (onboarding 2 cards; setup role choice 2 options)
- Company create/edit (`/dashboard/start/company`) — with type + country selects
- Company type change company↔agency↔client — same profile, recalculated labels
- Worker profile (`/dashboard/profile`), work card, journal save/submit
- Company dashboard (next actions, team roster, invitations, ops board)
- Worker instruction send (team-level + project-scoped, relationship-gated)
- Drawer/popover close on route change (notifications + role switcher)
- Journal photo: 1 free photo end-to-end once migrations are applied
- Dashboard navigation, account spaces, role switcher for HELD roles

### Ribota tyčia (intentionally limited, honest)
- Verification ladder: `verified` is admin-only; users get automatic-first
  `active_unverified` / `needs_checks` — by doctrine §7 (no fake verification)
- Candidate/provider drafts: never become accounts; not assignable until linked
- Journal review: enabling requires a real engagement context (server-gated)

### Ribota dėl VIP/Pro (paid-tier limited, honest copy)
- Work-report photos: 1 photo per entry free (server-enforced);
  more photos + extended evidence labelled as a future VIP feature.
  No billing exists yet — nothing is sold, the limit is just real.

### Neveikia / paslėpta (broken or hidden)
- Agency START path: intentionally hidden (agency = company type now).
  `/dashboard/start/agency` still exists for legacy holders but is no longer
  linked from any start surface.
- Project journal linking: still disabled (pre-existing; comment-documented).
- Project creation for company (`/dashboard/company/projects/new`): works, but
  journal linking remains off (pre-existing limitation).

### Stale copy found (follow-up, not fixed here)
- `/dashboard/start` buyer lane still claims "customers table does not exist
  (M3)" — migration 0026 shipped it long ago. The lane works via pilot drafts,
  but the blocker copy is outdated. Follow-up slice recommended.

## Migrations in this slice (both additive, GREEN)
- `20260612090000_company_type_and_country_safety.sql` — `companies.company_type`
  + CHECK; `save_company_setup_v2` (validated country, allowlisted type; same
  automatic-first honest status ladder; never sets `verified`). v1 RPC kept;
  app falls back to it when v2 is absent.
- `20260612091000_journal_entry_photos.sql` — metadata table + RLS (insert via
  RPC only), `register_journal_entry_photo` (ownership, MIME, 5 MB, 1-photo
  free cap), private storage bucket + owner-scoped storage policies.

## Guards added/updated
- NEW `lib/guards/company-role-simplicity.test.ts` — pins all six owner
  validation contracts (agency-as-type, human country errors, controlled
  instruction select, popover dismiss, free-photo honesty, type-driven UI).
- UPDATED `remove-wrong-agency-gate.test.ts` (2 simple start options),
  `header-role-switcher-parity.test.ts` (agency hidden),
  `product-readiness.test.ts` + `ops-bridge-migration.test.ts` (baseline 69).
