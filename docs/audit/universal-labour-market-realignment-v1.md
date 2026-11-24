# Universal Labour-Market Realignment — Audit & Change Record v1

**Date:** 2026-07-17 · **Owner directive:** Universal Labour Market Realignment
**Base:** `main` @ `9e8abee1` · **Status:** Draft PRs open (owner-gated merge)

Purpose: make LabourMarket.ai's product identity, architecture, search, matching,
copy and metadata universal — for **all professions, education levels, experience
and life stages, across Europe** — and add regression guards so single-sector
narrowing cannot return. This document is the Wave 0 reality audit plus the record
of what each wave changed.

---

## 1. Headline reality (Wave 0 audit)

The platform was **already ~90% universal by decision** and defended by ~15
existing guards. It was NOT structurally construction-only:

- **Product Constitution §7** and **ADR 0008** already declare a universal
  labour-market OS; construction is seed/first-templates, never a boundary.
- **Core schema is sector-neutral** — `profiles` / `workers` / `professions`
  carry no mandatory construction/trades columns; `profession` is a free
  registry slug; `DEFAULT_SECTOR = "other"` (not construction).
- **Search / worker-discovery / matching are already sector-agnostic** — the
  real matching engine (`lib/market/match-v1.ts`) weights only evidence strength,
  skills, transferable-skills, location, languages, etc. No default sector
  filter, no profession whitelist, no sector/industry boost, no source-adapter
  single-sector filter (Eurostat pins the whole business-economy aggregate
  `nace_r2 = B-S`, not construction "F").
- **Existing universality guards:** `universal-profession-families`,
  `sector-neutral-recognition`, `skill-design-not-construction`,
  `whole-labour-market-copy`, `public-trust-positioning`, `matching-ui-neutralized`,
  `universal-search-reports`, `public-seo-indexing` (bans construction-first
  brand), and more.

The residual **active** narrowing was small and concentrated in public copy.

## 2. Narrowings found (classified)

| # | Location | Class | Disposition |
|---|---|---|---|
| 1 | `messages/{en,lt,ru,nl,de}.json` `workAbroad.subcopy` — platform defined as "a digital international labour-force agency" | ACTIVE_PUBLIC (strongest) | **Fixed — Wave 3** |
| 2 | `workAbroad` "trade / amatas / vak / Gewerk" onboarding vocabulary | ACTIVE_PUBLIC | **Fixed — Wave 3** |
| 3 | `messages/en.json:7774` companyNeed — "For construction needs — a partner-company route" (UAB Nonstop Group) | ACTIVE_PUBLIC, business/partner text | **Owner-gated — NOT touched** (see §5) |
| 4 | `lib/staffing/worker-intake.ts` `PROFESSION_DIRECTIONS` — construction-first ordering bloc | SEED/ORDER bias | **Fixed — Wave 4** |
| 5 | `teamBrigades` "brigade / Facade brigade A" copy | ACTIVE_PUBLIC (low) | Left — "brigade" is a doctrine §5.5 generic team term (optional); not sector-locking |
| 6 | `supabase/dev-fixtures.sql`, `lib/ai/evals/fixtures.ts` — construction-only demo/eval data | SEED_IMBALANCE (local/test only, not user-visible) | **Recommendation only — NOT changed** (see §6) |
| 7 | Diverse-catalogue migration `20260704120000_universal_profession_skill_catalogue.sql` unapplied → live DB seed still construction-only | SEED/pending | **Owner/ops-gated — NOT applied** (see §5) |
| 8 | LinkedIn marketing drafts leading with "Construction first. Not construction only." | HISTORICAL_DOC, publish-risk | Flagged — do not publish as-is (§6) |

Everything else (SEO metadata source-of-truth, root landing, professions page,
work-opportunities, labour-market copy) was already universal and was kept as-is.

## 3. Waves & PRs

- **Wave 1 — canonical definition + guard** (`feat/cc/universal-labour-market-realignment-v1`, PR #799):
  - `docs/PRODUCT_CONSTITUTION.md §7.1` enshrines the owner's canonical universal
    definition (verbatim LT + EN) as a binding product-architecture rule with
    public-identity constraints (positive/universal, never single-sector even by
    negation, no sector-priority construct).
  - `lib/guards/universal-canonical-definition.test.ts` — fails on any
    priority-narrowing phrase or single-sector self-label in the canonical
    definition or the public `BRAND_SEO` strings; requires a cross-sector marker
    per active locale.
- **Wave 3 — public copy de-narrowing** (`feat/cc/universal-realignment-copy-v1`, PR #800):
  - Work-abroad identity reframed to ONE path (not the platform's definition);
    trade→profession vocabulary; honesty phrasing preserved.
  - `lib/guards/universal-work-abroad-not-agency.test.ts`.
- **Wave 4 — neutral ordering + this audit** (`feat/cc/universal-realignment-fixtures-docs-v1`):
  - `PROFESSION_DIRECTIONS` reordered to sector-neutral (alphabetical) — no
    construction-first bloc.
  - `lib/guards/universal-profession-directions-neutral.test.ts`.
  - This document.

(Wave 2 "search / profiles / matching generalization" produced no code change —
those layers were already sector-agnostic, per §1.)

## 4. New regression guards (summary)

1. `universal-canonical-definition` — canonical definition + public metadata stay universal (G.7, G.10).
2. `universal-work-abroad-not-agency` — no agency/job-board self-definition; onboarding asks for a profession.
3. `universal-profession-directions-neutral` — starter list is sector-neutral, construction a minority, not leading.

These run automatically in CI via `pnpm -F web test` (vitest `test.include`).

## 5. Owner-gated — intentionally NOT done

- **#3 Construction / Nonstop-Group partner routing copy** (`companyNeed`): this
  is a business/partner arrangement, not accidental drift. Removing or reframing
  it is a **business-wording decision for the owner** (CLAUDE.md §4 owner-gate:
  "Legal or business text that requires owner wording"). Left untouched; flagged
  for an owner decision on whether the construction-specific partner route should
  remain on the public company-need surface.
- **#7 Diverse-catalogue migration `20260704120000`**: unapplied (blocked on the
  Supabase connector). The message-JSON registry is diverse, but the **live DB
  seed rows remain construction-only** until this migration is applied. Applying
  migrations is **out of scope / owner-gated** — NOT applied here.
- **#798 (NAV Norway)** and NAV activation: untouched, not merged, no token used.

## 6. Remaining real limitations & recommendations (honest)

1. **Live DB seed is construction-only** until migration `20260704120000` is
   applied (owner/ops). Registry vs DB rows are out of sync.
2. **Representative test data** (`dev-fixtures.sql`, `lib/ai/evals/fixtures.ts`)
   is construction-flavoured. Recommend diversifying (software developer, nurse,
   teacher, analyst, designer, …) — deferred to avoid destabilising e2e/eval
   expectations; a follow-up should add cases additively.
2b. **Professions registry breadth**: strong (~49 professions, 12-locale parity)
   but thin on university-credentialed knowledge roles (nurse/healthcare,
   accountant, non-site engineer, designer, analyst, scientist, lawyer). Add via
   the same one-row slug→JSON registry pattern (all 12 taxonomy locales).
3. **Marketing drafts** (`docs/marketing/linkedin-*`) lead with "Construction
   first" / "Not construction only" — must be rewritten to positive universal
   framing before any publication.
4. **`teamBrigades` / `work-categories.ts`** carry construction-leaning
   vocabulary/ordering; structurally universal and guard-tested, a data-breadth
   balance item, not a code narrowing.

## 7. Guarantees

- **#798 unchanged and unmerged.** No migrations applied. No NAV token used.
- No schema, RLS, auth, or destructive change in any wave.
- All changes are copy/doc/const-reorder + additive guards, each validated green
  (typecheck, full vitest suite, production build, i18n-debt, route-smoke, SEO,
  placeholders, honesty guards) before commit.
