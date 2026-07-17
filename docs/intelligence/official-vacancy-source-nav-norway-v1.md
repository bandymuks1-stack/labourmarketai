# Official Vacancy Source — NAV Norway v1 (source-governance record)

Status: **SHIPPED OFF** — code registry `nav_arbeidsplassen` = `legalStatus:
"unconfirmed"`, `activation: "off"`, `proposedOnly: true`, `importPolicy:
null` (fail-closed). Nothing is fetched, nothing is rendered, the
`external_vacancies` migration is a DRAFT and is NOT applied.

Retrieval date for every fact below: **2026-07-17** (official sources only).

## 1. Official source URLs

| What | URL |
|---|---|
| Feed docs | https://navikt.github.io/pam-stilling-feed/ |
| OpenAPI (Swagger) | https://pam-stilling-feed.ekstern.dev.nav.no/swagger (+ `/redoc`) |
| Dataset registration (data.norge.no) | https://data.norge.no/en/datasets/62409bc8-680d-3f70-98bf-d2f2beebaa50/api-navs-stillingsdatabase |
| API terms (vilkår) | https://arbeidsplassen.nav.no/vilkar-api |
| Production feed | https://pam-stilling-feed.nav.no/api/v1/feed |
| Public experiment token | https://pam-stilling-feed.nav.no/api/publicToken |

## 2. Licence / terms summary — the 8 confirmations

Verified 2026-07-17 against the official terms (vilkår-api) and feed docs:

1. **Third-party use: YES.** The feed exists for external consumers; the
   terms address consumers ("konsument") republishing NAV job ads.
2. **Republication/display: YES.** Consumers receive the right to
   republish and display received job ads ("rett til å republisere og
   vise").
3. **Free of charge: YES — but production requires registration.** The
   service is free; PRODUCTION access requires a PRIVATE token issued after
   consumer registration with WRITTEN confirmation of terms acceptance
   (email gate, §4). The public rotating token is for experiments only.
4. **Immediate removal obligation.** Ads that become inactive/deleted at
   NAV MUST be removed from the consumer's surfaces IMMEDIATELY ("straks").
   → Implemented: `status='inactive'` rows are invisible to every client
   (RLS selects ACTIVE only); the import emits deactivation records that the
   operator applies in the same session as inserts.
5. **Immediate sync obligation.** Updates MUST be synchronized immediately.
   → Implemented: content-hash change detection; the runbook requires
   deactivations+updates in the same operator session.
6. **Deep-link application obligation.** The application function MUST
   deep-link to the original system's application function. → Implemented:
   the ONLY CTA links `application_url ?? canonical_source_url`
   (`target="_blank" rel="noopener noreferrer"`); no in-platform applying;
   the UI states LabourMarket.ai is not the employer.
7. **Personal-data obligations.** Consumers are SEPARATE data controllers
   under Norwegian personal-data law: limit storage, delete when
   unnecessary. Actively-stopped ads get fields masked (title / employer /
   contact) — consumers must honour that. → Implemented: `contactList` is
   NEVER persisted (privacy minimization); masked entries parse (nullable
   fields) and deactivate the stored row; bounded retention (§6).
8. **Auth / rate limits / registration knowns.** Bearer token required on
   every request; ETag/Last-Modified + If-None-Match/If-Modified-Since
   supported; pagination via `next_url`/`next_id` (null = end). Rate limits
   are NOT published — we self-impose polite bounds (≤10 pages, ≤200
   entries/session, ≥1 s spacing, 15 s timeout, 2 MB cap, host-pinned,
   GET-only). NAV may cut access on misuse.

Feed shape (verified against the official OpenAPI 2026-07-17): feed page
`{ version, title, home_page_url, feed_url, description, id, next_url|null,
next_id|null, items[] }`; item `{ id, url, title, content_text,
date_modified|null, _feed_entry { uuid, status ACTIVE|INACTIVE, title,
businessName, municipal, sistEndret } }`; entry detail `{ uuid, sistEndret,
status, ad_content|null }` with `ad_content` = `{ uuid, title, jobtitle,
link, sourceurl, sector, published, expires, updated, employer { name,
orgnr, description, homepage }, workLocations [{ country, address, city,
postalCode, county, municipal }], contactList [{ name, email, phone, role,
title }], occupationCategories, categoryList, description, applicationUrl,
applicationDue, engagementtype, extent, starttime, positioncount }`.
Fixtures (`apps/web/lib/vacancy-sources/nav-fixtures.ts`) are pinned to this
shape, including an INACTIVE ad and a masked stopped ad.

## 3. Architecture (what this PR ships, all dark)

- **Pure layer** `apps/web/lib/vacancy-sources/` (no fetch/HTTP — the
  eurostat pattern; deliberately OUTSIDE `lib/intelligence` because
  `market_intelligence_observations` is aggregates-only): versioned zod
  contract (`nav-feed-contract.ts`, `NAV_TRANSFORM_VERSION`), normalizer
  (`normalize.ts` → `ExternalVacancyV1`, sha256 `content_hash`, sanitized
  bounded plain-text description, NO contact fields, NO raw payload),
  idempotent upsert planner, paging governor.
- **DRAFT migration** `supabase/migrations/20260717170000_external_vacancies_v1.sql`
  (+ paired rollback): per-ad table, unique `(source_key,
  source_vacancy_id)` + `(source_key, content_hash)`, RLS = authenticated
  SELECT of ACTIVE rows only, writes service-role only. NOT applied.
- **Operator scripts** `apps/web/scripts/nav-vacancy-dry-run.ts` (fixtures
  or live-with-token; persists nothing) and `nav-vacancy-import.ts`
  (fail-closed triple gate: `NAV_SOURCE_ENABLED=on` + `NAV_FEED_TOKEN` +
  registry confirmed/on via `validateExternalImport`; EMITS validated JSON,
  never writes the DB — operator persists via Supabase MCP service-role
  with `on conflict (source_key, content_hash) do nothing`). No cron, no
  scheduler.
- **Display (ships dark)** `components/app/external-vacancies-section.tsx`
  + `lib/vacancy-sources/read.ts` on the worker opportunities page: a
  SEPARATE source-badged block ("Iš oficialaus šaltinio: arbeidsplassen.no
  (NAV)"), published/expiry facts, deep-link CTA. Renders NOTHING until the
  owner applies the migration AND activates the source (42P01 probe +
  registry gate). Never blended with internal demand.
- **Matching: NOT wired.** External vacancies are NOT fed into match-v1,
  recommendations, or the spine in this PR. Next wave (owner-gated): expose
  them through the existing deterministic matching contracts as clearly
  external, source-badged candidates — a separate slice with its own
  review.
- **SEO/noindex policy:** the only surface is the auth-gated dashboard —
  nothing indexable ships here. IF a public vacancy page is ever proposed,
  it must ship `noindex` until the owner explicitly reviews source terms on
  search-engine exposure and canonicalization (original ad = canonical).

## 4. REQUIRES_OWNER_ACTION — production token registration

No import may run without this. Email (from the operator entity's address):

> **To:** nav.team.arbeidsplassen@nav.no
> **Subject:** Consumer registration — production access to pam-stilling-feed (LabourMarket.ai)
>
> Hei,
>
> we would like to register as a consumer of the public job vacancy feed
> (pam-stilling-feed.nav.no) and request PRODUCTION API access (private
> token).
>
> - Company / identifier: [LabourMarket.ai operator entity — the UAB
>   operator/controller from the verified legal-entity structure; owner
>   inserts the exact registered legal name + org code before sending]
> - Contact person: [owner name]
> - E-mail: [owner e-mail]
> - Phone: [owner phone]
> - Purpose: displaying active Norwegian job vacancies to job seekers on
>   labourmarket.ai, with immediate synchronization and immediate removal
>   of inactive ads, and with the application function deep-linking to the
>   original ad's application page.
>
> We hereby CONFIRM IN WRITING that we have read and accept the API terms
> of use (https://arbeidsplassen.nav.no/vilkar-api), including the
> immediate-removal and immediate-update obligations, the deep-link
> application obligation, and our responsibilities as a separate data
> controller under Norwegian personal-data law. Please confirm our
> registration and the republication right for our production use.
>
> Med vennlig hilsen,
> [owner name], LabourMarket.ai

## 5. Activation runbook (owner steps, in order)

1. **Obtain token:** send the §4 email; receive the private token +
   NAV's registration/republication confirmation. Store the confirmation.
2. **Set env (server/operator only, never committed):**
   `NAV_FEED_TOKEN=<private token>`, `NAV_SOURCE_ENABLED=on`
   (`NAV_KILL_SWITCH=on` is the instant stop at any time).
3. **Apply migration** `20260717170000_external_vacancies_v1.sql` via
   Supabase MCP `apply_migration` (RED-class, human-gated) + add the
   APPLIED_LEDGER row. Rollback: paired `.down.sql`.
4. **Flip activation in code:** `lib/intelligence/source-governance.ts`
   `nav_arbeidsplassen` → `legalStatus: "confirmed"`, `activation: "on"`,
   `proposedOnly: false` + update the pinned guard tests in the same PR
   (they intentionally fail on a silent flip).
5. **Run the bounded first import:**
   `pnpm tsx scripts/nav-vacancy-dry-run.ts --live` (evidence file), then
   `pnpm tsx scripts/nav-vacancy-import.ts --emit nav-first-import.json
   --max-entries 200`; persist `acceptedRows` via MCP service-role with
   `on conflict (source_key, content_hash) do nothing` and apply
   `deactivationRecords` in the SAME session.
6. **Verify:** authenticated user sees the source-badged section on
   /dashboard/opportunities with working deep-links; inactive test row is
   invisible; re-running the import inserts 0 duplicates.
7. **Recurring duty (manual until a scheduler slice is approved):** re-run
   import + deactivations frequently enough to honour the immediate-sync
   obligation, and delete inactive rows older than 30 days.

## 6. Retention

Inactive rows: kept at most **30 days** after deactivation (audit window),
then deleted by the operator (service-role) —
`delete from external_vacancies where status='inactive' and deactivated_at
< now() - interval '30 days'`. Contact data: never stored. Raw payloads:
never stored (bounded sanitized fields only).

## 7. Deferred source register (research only — NO code, NO fetching)

| Source | Status | Blocker |
|---|---|---|
| France Travail (francetravail.io "Offres d'emploi" API) | deferred | Requires account/credentials (OAuth) + terms review; owner decision pending |
| EURES | deferred | Third-party access/republication rights UNCONFIRMED; portal aggregates member-state data with mixed ownership |
| Lithuanian UŽT (uzt.lt) | deferred | Official feed/permission required; scraping forbidden (repo hard rule); no confirmed public vacancy API terms |
| Sweden Arbetsförmedlingen (jobtechdev.se) etc. | deferred | Research only — promising open APIs, but terms + attribution model not yet owner-reviewed |

Each deferred source follows the SAME gate as NAV before any code ships:
official terms retrieved and recorded → registry entry (off/unconfirmed) →
owner registration/confirmation → activation PR.
