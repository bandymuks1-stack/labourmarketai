# Open Markets Update v1 — GE / BE / FR / ES / AT / CH (2026-07-17)

Honest surface update: the owner announced six newly opened markets —
Georgia (GE), Belgium (BE), France (FR), Spain (ES), Austria (AT),
Switzerland (CH). This slice makes them visible and selectable ONLY where
that is truthful today. No fake listings, no fake counts, no claim that any
feature is live in those countries.

## What changed (data-only, no new registry)

The audit confirmed there is NO single country registry — 8 parallel country
lists exist. This slice deliberately does NOT create a 9th; it extends the
two config lists whose consumers already degrade honestly:

1. `apps/web/lib/labour-market/country-evidence.ts` — `PRIORITY_MARKETS`
   (canonical marketing list). The `/labour-market` index maps this list;
   the six new codes are NOT in `SUPPORTED_COUNTRIES`, so they render as
   honest "coming soon" (`countryComingSoon`) cards with no evidence page
   and no data claims. `/labour-market/<code>` for the new codes stays 404
   (`isSupportedCountry` gate).
2. `apps/web/lib/taxonomy/work-categories.ts` — `MARKET_COUNTRIES`
   (dashboard demand-intake selects, market-map locator/capture, company
   page). Verified safe: the backing column `customer_requests.country`
   is free text (`0028_customer_requests.sql`, no CHECK constraint), and
   the location tables validate only `^[A-Z]{2}$`, so no migration is
   needed for authenticated demand creation in the new markets.
3. `apps/web/lib/structuring/structure-need.ts` — `COUNTRY_RULES` needles
   so free-text need structuring can detect the six markets (filtered
   through `MARKET_COUNTRIES` as before).
4. `messages/<locale>/labour-market.json` (12 locales) —
   `countryNames.{GE,BE,FR,ES,AT,CH}` plus ONE new intro sentence on the
   `/labour-market` index ("Atidarytos rinkos papildytos Gruzija, Belgija,
   Prancūzija, Ispanija, Austrija ir Šveicarija." — translated for active
   locales). No numeric "N countries" claim anywhere (public-market-entry
   guard). Inactive locales mirror their existing plain-English convention;
   for NL/DE the single `countryIndexSubcopy` string was fully translated
   so the paragraph is not mixed-language.

## Deliberately NOT touched

- Landing `LiveMap` (`content/placeholders.ts` `MAP_TARGETS`,
  `components/app/europe-geo.ts`) — placeholder counts + a BEL
  Belarus/Belgium code collision; out of scope for this PR.
- `READINESS_COUNTRIES` — requires a sourced legal readiness matrix per
  country; the guard fails without it.
- `COMPANY_COUNTRY_CODES` — company-setup FK needs the DB `countries`
  rows first (owner decision below).
- `company_need_public_intake` RPC country allowlist and the three
  CHECK-constraint allowlists (see below).
- ADR 0010 (nine priority launch markets) — register unchanged; this doc
  records the surface update, the ADR list is an owner-level decision.

## REQUIRES_OWNER_DECISION

1. **DB `countries` rows for GE/BE/FR/ES/AT/CH** — needed before company
   setup (`organizations.country` FK) can store the new markets. A ready
   DRAFT migration exists at
   `supabase/migrations/20260717130000_open_markets_countries_draft_v1.sql`
   (header: `DRAFT — needs-human-gate — DO NOT APPLY`; paired rollback in
   `supabase/rollbacks/`). It follows the FI precedent
   (`20260613100200`). NOT applied.
2. **Widening `company_need_public_intake`** (`20260707120000`) — the RPC
   hard-rejects countries outside its 10-market `IN` list, so the PUBLIC
   company-need form cannot accept the new markets until the owner
   approves a widening migration (described, not drafted).
3. **Widening the three CHECK-constraint allowlists** (described, not
   drafted): `country_document_requirements` (`20260610170000`, last
   widened by `20260613100200`), `market_rate_averages`
   (`20260610214000`). Widening is the drop+re-add CHECK GREEN idiom, but
   each list implies curated per-country content, so it stays owner-gated.
