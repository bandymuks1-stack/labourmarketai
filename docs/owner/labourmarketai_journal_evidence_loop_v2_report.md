# Journal Evidence-Loop v2 — Report

Branch: `fix/journal-evidence-loop-v2-fk-and-lt-numbers`
Base: `origin/main` @ `ce42909` (PR #61 merged)
Date: 2026-05-25

## What v1 (PR #61) exposed in production

After PR #61 the save action returned precise error codes instead of the
generic `"Nepavyko išsaugoti"`. The first thing the owner saw on prod was a
`unit_slug` FK rejection — a long-latent bug that was always there but had
been masked by the old "swallow everything" catch.

Two follow-ups also landed in this sprint:
- Parser couldn't handle LT *number-word* forms (`keturias valandas`,
  `dvi valandas`, `penkiolika minučių`) — only digit forms.
- Dictionary missed three common day-work directions (door/window install,
  roof framing, project preparation).
- And the save was only atomic in the happy case — if the metrics step
  failed, the entry row could leak.

This PR closes all four.

## Root causes

### unit_slug FK rejection

`supabase/migrations/0013_work_journal_m1.sql` defines
`journal_entry_metrics.unit_slug` as `text references public.productivity_units(slug)`.
The seed at the bottom of 0013 only inserted three slugs:

```
square_meters, square_meters_per_day, box_per_day
```

But the journal composer (`apps/web/components/app/journal-entry-composer.tsx`)
has always offered:

```
hours, minutes, days, square_meters, meters, pieces, kilograms, packages
```

…and `messages/{locale}/productivity-units.json` carries localized labels
for every one of them. Any worker who confirmed a non-area unit (or the
time-as-fallback path) hit an FK rejection. Before PR #61 the message was
swallowed; after PR #61 the worker finally saw the real error.

### Partial save

`createJournalEntry` did two `insert` round-trips (`journal_entries` then
`journal_entry_metrics`). If the second failed, the first stayed — and
journal_entries has no DELETE policy (append-only doctrine §3), so even a
compensating delete couldn't always clean up.

### LT number-word numerics

`detectWordHours` only recognized `vieną valandą`, bare `valandą`, and the
`pusvalandį` / `pusę valandos` forms. The owner's new test sentences use
the cardinal-numeral forms `keturias` (4), `dvi` (2), `penkiolika` (15)
— none of those existed in the lexicon.

### Missing activity hints

`ACTIVITY_HINTS_LT` had construction trades + driver/cashier from v1, but
no entries for door+window installation, roof framing, or project
preparation — three of the most common LT day-work directions adjacent to
the construction set.

## Changes

| Path | Change |
|------|--------|
| `supabase/migrations/0017_seed_platform_productivity_units.sql` | **NEW.** Seeds the 7 missing platform productivity_units (`hours`, `minutes`, `days`, `meters`, `pieces`, `kilograms`, `packages`) with `on conflict do nothing` (idempotent). Defines `create_journal_entry_full(...)` RPC which inserts the entry + every metric row inside one transaction. RPC is `security invoker`, so RLS still applies. `grant execute … to authenticated`, revoked from `public`. |
| `apps/web/lib/journal/actions.ts` | Calls `create_journal_entry_full` RPC as primary save path. Pre-validates every `unit_slug` against `productivity_units` BEFORE any insert (new `unit_slug_unknown` error code). Falls back to the legacy two-step insert only when the RPC isn't applied yet on the target DB (detected via `PGRST202` / missing-function error). Legacy fallback issues a compensating `delete` on metrics failure and returns a precise error. |
| `apps/web/lib/structuring/extract-journal-suggestions.ts` | New `detectNumberWordTime()` recognizing LT number-words 1–20 paired with `valand*` / `minu[čt]*` / `dien*`. Unicode-aware regex (`\p{L}` with `u` flag) so LT suffix declensions (`valandų`, `minučių`, `minutėms`, `dienomis`) all match. `splitFragments` now also splits on plain commas (downstream filter drops fragments that have no time / no activity, so this can't add noise). |
| `apps/web/lib/structuring/keywords.ts` | Three new `ACTIVITY_HINTS_LT` rows, placed BEFORE the generic `stog…` row so they win: **Stogo karkaso darbai** (`carpenter`), **Durų ir langų montavimas** (`carpenter`, explicit LT case forms only — `dur`/`lang` would false-match), **Projekto rengimas** (slug=null, label-only — no fake taxonomy entry). |
| `apps/web/lib/structuring/extract-journal-suggestions.test.ts` | 11 new tests covering the v2 number-words, the three new activity directions, the digit-vs-word precedence, and a mixed 3-fragment sentence. |
| `apps/web/lib/guards/journal-evidence-loop.test.ts` | New assertions: pre-validation against `productivity_units` exists; RPC is the primary save path; legacy fallback issues a compensating delete. |
| `apps/web/lib/guards/journal-v2-migration-0017.test.ts` | **NEW.** Pins the 0017 migration: every expected unit slug appears; uses `on conflict (slug) do nothing`; no DROP/ALTER/DELETE; RPC is `security invoker`, granted to `authenticated`, revoked from `public`. |
| `apps/web/lib/guards/product-readiness.test.ts` | `SPRINT_BASELINE` bumped 15 → 16 with the rationale captured in a comment. |

## Owner's new LT phrases — before vs after

| Phrase | Before | After |
|--------|--------|-------|
| `Keturias valandas dirbau objektuose.` | time: null (no digit) | fragment[0].time = `{4, hours}` |
| `Dvi valandas dirbau pavežėju.` | time: null | fragment[0].time = `{2, hours}` |
| `Penkiolika minučių valiau įrankius.` | time: null | fragment[0].time = `{15, minutes}` |
| `Dvi valandas ir penkiolika minučių rengiau projektą.` | 0 fragments | 2 fragments (2h + 15min, project preparation label) |
| `Dvi valandas montavau duris.` | activitySlug: null, label: null | slug: `carpenter`, label: `Durų ir langų montavimas` |
| `Keturias valandas dariau stogo karkasą.` | dropped to generic roofing (slug: `roofer`) | slug: `carpenter`, label: `Stogo karkaso darbai` |
| `Vieną valandą rengiau projektą.` | activitySlug/label: null | slug: null, label: `Projekto rengimas` (label-only, no fake skill) |

All asserted in the new test cases.

## Atomicity proof

Primary path: `supabase.rpc('create_journal_entry_full', …)`. The RPC body
is one PL/pgSQL function that runs in a single implicit transaction —
either every row commits or none does. A missing FK (e.g. an unseeded
`unit_slug`) raises inside the loop, the function aborts, and no row
lands in `journal_entries`. The save is structurally all-or-nothing.

Fallback path (legacy DBs without 0017 applied): two inserts. If metrics
fail, the action attempts a compensating `delete` on the orphan entry
and returns `metrics_insert_failed` with a clear LT message ("Įrašas
nebuvo išsaugotas pilnai: … Įrašas atmestas — bandykite dar kartą.").
The DELETE may still be blocked by RLS (append-only), but the worker is
no longer told the save succeeded.

## Required checks

| Gate | Result |
|------|--------|
| `pnpm -F web lint` | green |
| `pnpm -F web typecheck` | green |
| `pnpm -F web test` (vitest) | **360 / 360** passed (20 files) |
| `pnpm -F web build` | green |

## Safety proof

- [x] No billing / payments / Stripe / Montonio / pricing edits.
- [x] No env / secrets / Vercel changes.
- [x] **Migration 0017 is shipped but NOT auto-applied to production** — per
      the project's "running migrations on production is NEVER automatic"
      policy in CLAUDE.md. Owner runs it manually via Supabase SQL editor or
      CLI. The app degrades gracefully on un-migrated DBs via the legacy
      fallback path + the `unit_slug_unknown` precheck.
- [x] No `service_role` runtime client. RPC is `security invoker`, so RLS
      still applies to the caller's session.
- [x] No fake AI / matching / verification claims. `Projekto rengimas` is
      intentionally label-only (`slug: null`), preserving the v1 doctrine
      that the construction taxonomy is not extended unless a real trade
      slug exists.
- [x] PR #54 remains unmerged.
- [x] PR #18 remains untouched.
- [x] Branch is fresh off `origin/main` at `ce42909`.

## Owner manual smoke checklist

1. **Apply migration 0017 on production** (Supabase SQL editor, paste the
   contents of `supabase/migrations/0017_seed_platform_productivity_units.sql`).
2. Open `/lt/dashboard/journal` as the worker.
3. Try each of:
   - `Valandą dirbau pavežėju. 3 valandas parduotuvėje kasininku, ir 5 valandas padėjau dengti stogą.` (v1 sentence)
   - `Dvi valandas montavau duris. Keturias valandas dariau stogo karkasą. Vieną valandą rengiau projektą.` (v2 sentence — mix of new activities)
   - `Dvi valandas ir penkiolika minučių valiau įrankius.` (v2 number-word minutes)
4. Press **Patvirtinti visus pasiūlymus** → **Patvirtinti įrašą**.
5. Expected: each save returns the green "✓ Įrašas išsaugotas" card. Entry
   appears in **Įrašai**. Survives hard reload.
6. If 0017 was not yet applied: red banner reads "Vieneto registre kol kas
   nėra: hours, … Paprašykite administratoriaus pritaikyti migraciją 0017."
   No entry leaks.

## Out of scope (intentionally)

- Vercel Preview Google OAuth still doesn't complete — preview redirect
  allowlist issue, not journal. Documented in PR #61.
- Manager / client confirmation backbone (PR #18) remains draft.
- Pilot draft flows (PR #54) still wait on owner role smoke.
