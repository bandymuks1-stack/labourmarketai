# Mano darbo kortelė — State-Aware Continuity (v1)

**Slice:** `work-card-state-aware-v1`
**Branch:** `feat/cc/work-card-state-aware-v1`
**Scope:** the authenticated **worker** entry (`/dashboard`, worker role).
**Builds on:** `my-space-human-entry-v1` (PR #256).

> Goal: every login feels like *"the system remembers me, understands my
> situation, and offers one clear useful step"* — not *"the system tells me to
> fill everything in again."*

---

## 1. The problem this fixes

The v1 "Mano erdvė" entry was calm, but it was **stateless**: it showed the same
snapshot regardless of whether the person was brand new or a returning user who
had already told us everything. The product principle is the opposite:

> **Ask only what the system does not know. Never re-ask what is already saved.**
> On every login, show the current **Mano darbo kortelė** and **one** best next
> action.

The human path has five dimensions:

| Dimension | Question | Stored as (real `public.workers` columns) |
|-----------|----------|--------------------------------------------|
| work | ką galiu dirbti | primary profession + ≥1 skill |
| availability | kada galiu pradėti | `availability_status`, `available_from` |
| location | kur galiu dirbti | `current_location_country`, `preferred_countries` |
| pay | kiek tikiuosi | `salary_min_eur`, `salary_max_eur` |
| evidence | kuo galiu įrodyti | work-journal entries |

The fields **already existed** on `workers` — they were simply never editable by
the user. So this slice wires them up and makes the entry **state-aware**.

---

## 2. The three states

A pure engine (`lib/worker/work-card-state.ts`, fully unit-tested) maps the
worker's REAL saved signals → one of three states:

### a) `new` (nothing saved yet)
A short **guided path**: the five dimensions shown as "Ko dar trūksta", with one
primary CTA ("Nurodyti, ką dirbu") and the benefit sentence. Shown **once** —
after any saved dimension the worker is in continuity, never the full
questionnaire again.

### b) `returning` (something saved)
The saved card summary, split into **"Kas jau aišku"** (saved dimensions, with
their real values) and **"Ko dar trūksta"**. Plus **one** best next action (the
first unmet dimension in human-path order) and **one sentence on why it helps**.
A saved dimension is **never** the next action and is **never re-asked**.

### c) `stale` (time-sensitive data confirmed long ago)
Availability / location / pay are preferences that age. After
**`STALE_AFTER_DAYS = 90`**, the card shows a small confirmation —
**"Ar tai vis dar galioja?"** with **"Taip, galioja"** / **"Pakeisti"** — and
nothing else changes. It **does not restart onboarding**. "Taip" stamps a fresh
confirmation time; "Pakeisti" opens the editor. New cards and cards with no
time-sensitive data never go stale.

---

## 3. "Why it helps" copy (mandated benefit lines)

Every suggested action explains why it helps (exact lines from the brief):

- work → *"Tai padeda suprasti, kokiam darbui jus galima siūlyti."*
- availability / location → *"Tai padeda nerodyti jums netinkamų pasiūlymų."*
- pay → *"Tai padeda pagrįsti jūsų pageidaujamą tarifą."*
- evidence → *"Įrodymai didina pasitikėjimą, bet galite juos pridėti vėliau."*

These describe the **benefit of providing data** — never a promise that matching
or opportunities exist today (no fake matching, no fake score; guard-pinned).

---

## 4. Persistence (why a migration was required, and how it is safe)

The card fields exist on `public.workers`, but `authenticated` only has
`GRANT SELECT` — and `workers` also holds **system fields** (`trust_score`,
`profile_completeness`) the user must never set. A blanket `UPDATE` grant would
let a user write their own trust score. So writes go through two **SECURITY
DEFINER** RPCs (migration `20260608120000_worker_work_card.sql`):

- `save_worker_card(...)` — owner-scoped (`WHERE profile_id = auth.uid()`),
  writes **only whitelisted card fields**, validates availability against the
  existing CHECK, stamps `work_card_confirmed_at`.
- `confirm_worker_card()` — stamps `work_card_confirmed_at` only ("Taip, galioja").

The migration is **additive + reversible**: one `IF NOT EXISTS` column +
two functions + two `grant execute`. No drops, no RLS-loosening, no `anon`/`public`
grant, no auth-core change → it passes the static `migration-safety` gate
(**GREEN class**). Rollback is documented in the file header.

**Graceful degradation:** the read path retries without `work_card_confirmed_at`
and the save/confirm actions return `needs_migration` if the RPCs aren't applied
yet — so the dashboard works on prod **before** the migration is applied; the
stale prompt and persistence simply light up once it lands.

> ⚠️ **Prod apply is NOT automatic.** Per the operating contract, the agent never
> applies migrations to production. DI applies `20260608120000_worker_work_card.sql`
> via Supabase MCP `apply_migration` (or SQL editor) after review, then runs
> `pnpm db:types` to refresh the generated types.

---

## 5. What was built

| File | Purpose |
|------|---------|
| `supabase/migrations/20260608120000_worker_work_card.sql` | additive column + owner-scoped save/confirm RPCs |
| `lib/worker/work-card-state.ts` | **pure** state engine (new/returning/stale, one next action, why, staleness) |
| `lib/worker/work-card.ts` | read service → engine signals (graceful degradation) |
| `lib/worker/work-card-actions.ts` | `saveWorkerCardAction` / `confirmWorkerCardAction` (tagged returns) |
| `components/app/work-card.tsx` | server: the state-aware card (greeting, clear/missing, next + why, stale) |
| `components/app/work-card-editor.tsx` | client: one primary CTA, "Taip/Pakeisti" confirm, secondary/collapsed editor |
| `app/[locale]/dashboard/page.tsx` | worker branch now mounts `<WorkCard>` (replaces `MySpaceNow` + worker `DashboardNextAction`) |
| `messages/{lt,en}.json` | `auth.dashboard.workCard` copy (calm, human, both locales) |

The `MySpaceNow` component (v1) was superseded by `WorkCard` and removed. The
company/agency/customer branch is **untouched** (it keeps its own
`DashboardNextAction` + cockpit).

---

## 6. Rules honoured

- ✅ Never re-asks a saved dimension (unless the user edits, or it goes stale).
- ✅ Never more than one primary next action (single gradient CTA; engine guarantees one).
- ✅ Edit stays **secondary/collapsed** (a toggled editor, never the primary surface).
- ✅ No fake matching / opportunities / score / rating / AI claims.
- ✅ No demo/sample data — empty dimensions say "dar nenurodyta" plainly.
- ✅ No billing/payment/checkout changes.
- ✅ No company/agency/admin redesign.

---

## 7. Guards / tests

- **New** `lib/guards/work-card-state.test.ts` — 18 unit tests pinning the engine:
  state classification, "ask only what is unknown", exactly one next action in
  human-path order, and staleness as a small confirmation (never a restart).
- **New** `lib/guards/worker-work-card-migration.test.ts` — additive + reversible
  + owner-scoped + SECURITY DEFINER + never writes system fields + no blanket
  workers UPDATE grant.
- **Updated** `lib/guards/my-space-human-entry.test.ts` — worker entry mounts
  `<WorkCard>`; work-card copy complete in LT+EN; the four benefit lines present;
  no fake score / matching wording.
- **Updated** `dashboard-chain-reachability`, `product-readiness` (migration
  baseline 46 → 47), `ops-bridge-migration` (baseline assertion) — to reflect the
  worker → WorkCard architecture and the new (additive, queued) migration.

---

## 8. Validation

| Check | Result |
|-------|--------|
| `pnpm -F web typecheck` | ✅ pass |
| `pnpm -F web lint` | ✅ pass (1 pre-existing unrelated warning) |
| `pnpm -F web test` | ✅ 148 files / 2262 tests pass |
| `pnpm -F web build` | ✅ pass |
| `migration-safety` (static gate) | ✅ GREEN (additive, reversible, owner-scoped) |

**No** billing/payment/checkout · **no** env/secret · **no** company/admin
redesign · **no** fake/demo data · **not merged, not deployed.**

---

## 9. Visual review

Rendered from the real `<WorkCard>` with static props via a temporary dev-only
preview route (removed before commit — the live dashboard needs a Supabase
session this environment lacks; prod must not be touched):

- Desktop LT: `docs/audits/screenshots/work-card-desktop-lt.png`
- Desktop EN: `docs/audits/screenshots/work-card-desktop-en.png`
- Mobile LT: `docs/audits/screenshots/work-card-mobile-lt.png`

Each shows the three states side by side: **new** (guided path), **returning**
(remembers saved data, asks only for the one missing dimension + why), **stale**
("Ar tai vis dar galioja?" → Taip / Pakeisti).

---

## 10. Next recommended slice (`work-card-state-aware-v2`)

1. **Per-dimension staleness** (availability vs location vs pay independently),
   if owner wants finer prompts than the single card-level confirm.
2. **Richer location/pay inputs** (country picker, currency) instead of the
   compact code/number fields.
3. Reflect the saved card on **`/dashboard/profile`** so the two surfaces share
   one editor.
4. Apply the same state-aware continuity to the **company/agency** entry.
