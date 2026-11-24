# European Work & Project Calculator v1

Status: Draft PR (Wave 4). Public route shipped; engine reused; no DB change.

## 1. Audit summary — what already existed (and was therefore NOT built)

The spec's original `lib/calculators/` plan was **cancelled before any code**:
the repo already contains a deterministic, transparent cost engine and the
audit confirmed it end-to-end:

| Existing asset | Location |
|---|---|
| Cost engine (9 sector templates, unit types, labour → direct → overhead → margin → contingency → total + low/base/high range, validation, assumption + missing-info keys) | `apps/web/lib/estimate/estimate.ts` (`ESTIMATE_VERSION = 1`) |
| Payload bridge (server-recomputed estimate persisted into `customer_requests.payload.estimate`, tolerant read) | `apps/web/lib/estimate/estimate-payload.ts` |
| Builder + summary UI (Intl.NumberFormat money, binding-quote disclaimer) | `apps/web/components/app/estimate-builder.tsx`, `estimate-summary.tsx` |
| Demand-wizard mount | `apps/web/components/app/demand-request-button.tsx` (dashboard `#demand-intake` section) |
| Tests | `lib/estimate/estimate.test.ts`, `estimate-payload.test.ts`, `lib/guards/estimate-builder.test.ts` |

**No second engine was written.** The public calculator imports
`computeEstimate` etc. from `lib/estimate/estimate` directly; a guard
(`lib/guards/project-cost-calculator.test.ts`) fails the build if a
`lib/calculators/` directory ever appears or the page forks the math.

## 2. What is new in this wave

1. **Public route** `/{locale}/calculators/project-cost` (marketing group):
   account-free, fully client-side, stateless. Wizard-like progressive
   disclosure: context → scope/hours → prices/rates → result.
2. **VAT display layer** `lib/estimate/vat-display-v1.ts` (v1).
3. **Area quantity pack** `lib/estimate/packs/area-quantity-v1.ts` (v1).
4. **CSV export** `lib/estimate/calculator-csv-v1.ts` (v1) + print stylesheet
   (`print.css`, scoped to the result region → browser print-to-PDF).
5. **Real bridges** into the product (see §7).
6. **Company-need prefill adapter** `lib/staffing/company-need-prefill.ts`.

## 3. Engine-extension decision (documented choice)

The spec allowed either extending the engine (with a version bump) or a
public-page-only display layer. **Chosen: display layer; engine untouched.**

Reasons (smallest safe diff):

- `estimate.ts` is shared by the authenticated demand wizard, the server
  recompute path and every stored `customer_requests.payload.estimate` row.
  Any change there risks the production demand flow for a v1 whose VAT is
  purely presentational.
- The client-messages / guard architecture already made the public page a
  separate composition, so layering VAT over `EstimateResult` is natural.
- Consequence: `ESTIMATE_VERSION` stays **1**, `parseStoredEstimate` is
  unchanged, stored payloads keep parsing byte-identically. A guard asserts
  the engine contains no VAT concept.

Accommodation/transport: the engine already has a lump-sum
`transportAccommodation` field. Instead of new engine fields, the public page
adds an **accommodation helper** (workers × days × price-per-worker-day, all
user-entered) whose product the user explicitly writes into that existing
field. Per-km transport was **omitted**: there is no honest default rate, and
a lump sum covers v1. Both decisions keep stored payload shape untouched.

## 4. Formula table

Engine (unchanged, `lib/estimate/estimate.ts`):

| Line | Formula |
|---|---|
| labourHours | totalHours > 0 ? totalHours : workerCount × hoursPerWorker |
| labourSubtotal | labourHours × rate |
| directCosts | labourSubtotal + materials + equipment + transportAccommodation |
| overhead | directCosts × overhead% |
| margin | (directCosts + overhead) × margin% |
| contingency | (directCosts + overhead + margin) × contingency% |
| estimatedTotal | directCosts + overhead + margin + contingency |
| low / high | without reserve / with doubled reserve (only when contingency% > 0) |

VAT display (v1, only when the user entered a rate; 0 % entered is shown):

| Line | Formula |
|---|---|
| netTotal | engine estimatedTotal (sub-total excl. VAT) |
| vatAmount | netTotal × vat% |
| grossTotal | netTotal + vatAmount |

Area quantity pack (v1):

| Output | Formula |
|---|---|
| netAreaM2 | direct net area, or length × height − openings (floored at 0) |
| coverageAreaM2 | netAreaM2 × layers |
| coverageWithWasteM2 | coverageAreaM2 × (1 + waste%) |
| packageCount | ceil(coverageWithWasteM2 / coveragePerPackageM2) — **always up** |
| materialCost | packageCount × pricePerPackage |
| labourHours | coverageAreaM2 × labourHoursPerM2 (waste adds material, not labour) |
| crewDurationHours | labourHours / crewSize |
| insulationVolumeM3 | netAreaM2 × layers × thickness(mm)/1000 |

Acceptance fixtures (unit-tested): 100 m² net, 3 × 50 mm layers, 5 % waste,
6 m²/package → 300 m² coverage, 315 m² with waste, **53 packages** (52.5 up),
15 m³ volume. Exact divisions never float-drift upward (6-decimal trim before
ceil); rounding down is guard-banned.

"Apply" feeds `unitType=square_meters`, `quantity=netAreaM2`,
`totalHours=labourHours`, `materials=materialCost` into the engine inputs —
the user can still edit every field afterwards.

## 5. Rounding / money policy

The shared engine rounds money to 2 decimals with `round2` floats — this wave
does **not** rewrite that math (mandate). The VAT and pack modules use the
same `round2` formula locally (documented divergence: small helper duplicated
rather than exporting a private engine function and touching the engine
file). Display uses `Intl.NumberFormat(locale, {2,2})` everywhere, identical
to the existing summary. CSV emits locale-independent dot-decimal `toFixed(2)`
for money and raw numbers otherwise — the file is the machine view, the page
is the localized view.

## 6. Country / currency model

- Country select: the existing `MARKET_COUNTRIES` (LT LV EE PL DE NL DK NO SE
  FI) from `lib/taxonomy/work-categories.ts`, display names from the existing
  `labourMarket.countryNames` catalogue. Country is optional display context —
  it never changes any number.
- Currency: free ISO-style text input, default `EUR` — exactly the engine's
  existing model. **No country→currency registry, no FX, no live rates.**

## 7. Data hierarchy & honesty boundaries (v1)

- **User-entered values only.** No market averages, no wage/tax data, no AI
  numbers, no external APIs. VAT only when entered.
- Incomplete ≠ zero: quantities without hours/rate show an explicit
  "estimate incomplete — labour cost missing" state plus the engine's
  missing-info list; an empty calculator shows an empty state, never a fake 0.
- The existing preliminary-estimate disclaimer is reused verbatim
  (`estimate.disclaimer`, all 5 active locales) and rides the CSV too.
- The pack is labelled a quantity estimate, not structural design; the guard
  bans structural-advice concepts from the calculator surface.

## 8. Bridges (implemented, honest behaviour)

- **Authenticated**: CTA → `/{locale}/dashboard#demand-intake` via
  `AuthCtaLink` (crosses to the app host when on the marketing apex). This is
  the EXISTING anchored demand-intake section whose wizard contains the same
  estimate builder. The wizard supports no estimate-prefill parameter today,
  so the copy says explicitly the calculator does **not** transfer numbers —
  no fake prefill claim. (Prefill handoff = future wave.)
- **Anonymous**: CTA → `/{locale}/company-need?number_of_workers=N&country=CC`.
  The company-need form now applies bounded, validated query-param defaults
  (adapter `lib/staffing/company-need-prefill.ts`) for the five fields its
  server action already accepted; the calculator sends only worker count +
  country — **no prices, no free text, no PII in URLs** (guard-asserted).
  Defaults are applied after hydration so the static page stays static; the
  user reviews everything before submitting.

## 9. Component reuse map

| Reused as-is | `computeEstimate`, `validateEstimateInputs`, `hasMeaningfulEstimate`, `estimateAssumptionKeys`, `estimateMissingInfoKeys`, `EMPTY_ESTIMATE_INPUTS`, templates/units lists; `csvCell`; `AuthCtaLink`; `MARKET_COUNTRIES`; `labourMarket.countryNames`; the whole `estimate` i18n namespace (field/result/error/assumption labels + disclaimer) |
|---|---|
| **Refactored for reuse** | `estimate-summary.tsx` split into `EstimateSummaryView` (pure, labels-as-props — `estimate-summary-view.tsx`) + the existing `EstimateSummary` i18n wrapper. Rendered output and all call-sites unchanged; `lib/guards/estimate-builder.test.ts` reads the pair as one surface. |
| Why not mount `EstimateBuilder` directly | It reads `useTranslations("auth.dashboard.wow.demand.estimate")`; the marketing route group ships a minimal message pick and `lib/guards/client-messages-allowlist.test.ts` (rule 9) bans non-literal namespaces there. Mounting it would force the whole `auth` tree (~28 KB) onto every marketing page. The public wizard therefore receives ALL labels as server-resolved props (CompanyNeedForm precedent) — zero client i18n payload growth. |

## 10. SEO / i18n

- Metadata via `buildPageMetadataFor("projectCostCalculator", …)` — new
  `PAGE_SEO` entry, cross-sector titles (construction listed as one sector
  among many, per the SEO guard's positioning rule); sitemap entry added.
- New `calculators.projectCost` namespace in the 5 ACTIVE locales
  (lt/en/ru/nl/de) — the same locale scope as the existing `estimate`
  namespace (non-active catalogs do not carry it either); structure parity +
  no `[EN]`/empty values are guard-tested.

## 11. Validation (commands + results — see PR body for the run log)

`pnpm typecheck` · `pnpm lint` · `pnpm check:i18n-debt` ·
`pnpm check:primary-route-smoke` · `pnpm -C apps/web check:public-seo-indexing`
· targeted vitest (estimate suites, new module tests, new guard,
estimate-builder guard, public-seo guard, client-messages allowlist, i18n
parity) · `pnpm build` (proves the route builds).

## 12. Limitations

- Stateless: nothing is saved; reload clears the estimate (CSV/print are the
  take-away).
- No estimate-prefill into the demand wizard (honestly disclosed in the UI).
- VAT is display-only; a persisted-VAT engine version is a future decision.
- One quantity pack (area/insulation); no per-km transport.
- Money math inherits the engine's `round2` float policy (unchanged by
  mandate).

## 13. Future waves

- More quantity packs (volume/concrete, linear/skirting, tile).
- **Saved estimates** (persistence for anonymous users) —
  `REQUIRES_OWNER_DECISION`: needs a table/migration and retention policy.
- ECB reference-rate adapter for currency display (owner-gated external
  source).
- Org rate books (company-specific default rates) — dashboard feature.
- Demand-wizard estimate-prefill handoff parameter.
