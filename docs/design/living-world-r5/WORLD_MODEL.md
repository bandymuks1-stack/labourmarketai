# R5 — World data model (country-agnostic)

The world engine must not be a Sweden feature or a `worker → vacancy` map.
This file maps R5's seven world groups onto **entities that already exist in
production**, so the camera is reading the system rather than illustrating it.

Rule applied throughout: *use only semantics that genuinely exist*. Where the
system has nothing, this file says so instead of inventing a field.

| World group | R5 concept | Real production entity | State today |
|---|---|---|---|
| GEOGRAPHY | country | `public_vacancies.country`, `countries` | REAL — `SE` only (1 country, 21 regions, 290 cities) |
| | region | `public_vacancies.region` | REAL — Swedish `län` strings |
| | city | `public_vacancies.city` | REAL — 290 distinct names |
| | coordinates | `public_vacancies.lat/lng` | **ABSENT — 0 of 41,461 rows geocoded.** The camera places a *city* from its public coordinate; it never places a workplace. |
| ECONOMIC CONTEXT | sector | — | **No sector column.** Sector families in the prototypes are a presentation grouping over real `profession_slug` values and are labelled as such. |
| | profession | `professions`, `public_vacancies.profession_slug` | REAL — 49 catalogue rows; 39 distinct slugs present in inventory; only `transform_version = v2` used (pre-v2 slugs are polluted) |
| | company / organization | `organizations`, `companies`, `public_vacancies.employer_name` | REAL but tiny on the platform side (13 orgs); 7,785 supplier employer strings, **counted, never named** |
| | project / workplace | `engagement_contexts` | REAL (53 rows) — not used in R5 prototypes |
| PEOPLE / CAPABILITY | worker | `workers`, `profiles` | REAL (36) |
| | skills | `skills` (153), `profession_skills` (232), `worker_skills` (48) | REAL — canonical ids are `skills.slug` |
| | evidence | `lib/evidence/evidence-tier.ts` | REAL ladder: `manager_confirmed` › `work_journal` › `self_declared` |
| | availability / mobility | `workers` fields | REAL — not exercised in R5 |
| ACTIVITY | journal entry | `journal_entries` (36), `journal_entry_skills` (46), `journal_entry_photos` (8) | REAL, small |
| OUTPUT | result / evidence | `journal_entry_photos`, `journal_entry_confirmations` | REAL, small |
| | product / capacity | `marketplace_listings`, `service_offerings` | REAL tables; **work-bounded categories only** |
| DEMAND | job vacancy | `public_vacancies` | REAL — 41,432 active |
| | worker / customer / service inquiry | `customer_requests` (17) | REAL, small |
| | product demand | — | **ABSENT — no produce/goods demand channel exists.** The cucumber journey shows this gap honestly rather than filling it. |
| OPPORTUNITY | match | `lib/market/match-v1.ts`, `lib/market/fit.ts` | REAL — deterministic, basis-carrying |
| | realization channel | `lib/value-channels/channel-registry.ts` + `eligibility.ts` | REAL — 4 channels, closed verdict set |

## Country-agnostic by construction

Nothing in the world engine is Swedish. The camera consumes:

```
country { iso2, activeCount, regions, cities }
  → region { name, activeCount, cities }
    → city { name, coordinate, activeCount, employers, professions[] }
      → chain[] { professionSlug, activeCount, employers }
        → workplace (a scale, not a record)
          → person → activity → result
            → journal entry → skills[] with evidence tier
              → fit { needSlugs[], matchedSlugs[], missingSlugs[] }
                → opportunities { professionSlug, city, activeCount }
```

Swap the country plate, the city coordinate and the supplier attribution and
the same ladder runs for NL, DE, LT, DK. The only Sweden-specific facts are
the *values*, which live in `data/world-snapshot.json` — not in the markup.

## What the world may say about a person

Permitted, because the system computes it and can show its basis:
- which canonical skills a need requires, and which of them are covered;
- which evidence tier each covered skill sits at;
- which opportunities exist, where, and how many.

Forbidden, and absent from every prototype:
- a person value score, profile strength, XP, level, or "N% VALUE";
- a fit percentage without its basis (`fit.ts`: *a % without its basis does
  not exist*);
- any employer name, salary band, or opportunity count that is not a live
  count from the snapshot.

## Reaction, not wallpaper

The world reacts because the *data* changes, and each reaction is a real
computation:

| Trigger | Reaction | Backed by |
|---|---|---|
| a profession is chosen | camera turns to that ecosystem; counts change | `cityProfessions` |
| a city is chosen | the world travels there; region/city counts change | `topCities` |
| a journal entry lands | two skills move to `work_journal` tier | `evidence-tier.ts` |
| evidence changes | coverage recomputes, basis redrawn | `fit.ts` |
| coverage crosses into a second profession | a genuinely different opportunity opens, with honest partial coverage | `profession_skills` overlap |
| a product is stated | channels are assessed, and the gap is named | `eligibility.ts` |
