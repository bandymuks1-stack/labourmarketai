# MAP — STRATEGIC PRODUCT MODEL

Supersedes the withdrawn "keep / shrink / remove" framing. **Removal is not an
option and is not proposed anywhere in this document.** The map is a strategic
labourmarket.ai capability; the question is what it must become.

Pinned at `origin/main` `779357aa`. Verdict:

> **`MAP_CURRENTLY_TOO_WEAK_REQUIRES_PRODUCTIZATION`**
> **`MAP_EXPANDABLE_WORKSPACE_REQUIRED`**
> **`MAP_CHAT_CALENDAR_INTEGRATION_REQUIRED`**
> **`MAP_OPERATIONAL_CAPABILITIES_REQUIRE_FUTURE_SLICES`**

The most important structural finding: **the product already contains two
different maps with two different data models, and the weaker one is the one
the user actually meets.**

---

## 1. What map functionality exists today

### 1a. The workspace map — inside the chat (`components/app/world-state/workspace-map.tsx`)

Rendered inside the 22 rem context panel at conversation depth 0.

| property | measured / read |
|---|---|
| size | **319 × 272 px** = 6.7 % of a 1440×900 viewport (`h-44` / `lg:h-52`) |
| engine | Leaflet via the one shared `mountLeafletMap` engine |
| data sources | exactly **two**: `loadWorkerOpportunityBoard("conversation")` and `listManagedProjects()` |
| anchor | `workers.current_location_country` — **country granularity only** |
| coordinates | `resolveLocation()` — a static 177-line table of country centroids + a city lookup. No geocoder |
| clustering | one counted marker per place; popup lists real rows |
| interaction | marker click → `open_object` on shared World State; the panel opens the entity and the chat is about it. Two-way with `activeEntity` |
| controls | zoom +/− only. `scrollWheelZoom: false`. **No filter, no radius, no layer toggle, no expand control** |
| honesty | unmapped rows counted out loud; country centroids labelled approximate |

**[measured]** For the **worker** fixture identity the map renders **nothing at
all** — `workers.current_location_country` is NULL and no opportunity resolves
to a coordinate, so `clusters.length === 0 && !home` and the component returns
`null`. For the **company** identity it shows two overlapping clusters over the
Benelux plus "dar 2 galimybės be nurodytos vietos".

So the identity whose central question is *"where is work?"* currently sees no
map, and the identity that does see one gets 6.7 % of the screen with no
decision-support controls.

### 1b. The market map — `/dashboard/market-map` (`MarketMapShell`, `lib/market-map/*`)

A far richer surface, on a route reachable only through the `full` shell's tab
row or quick-search. **[measured]** 2744 px / 3 folds at 1440, 12 cards, 10
`<h2>`: *your place on the market map · map layers · three things on the map ·
manage your locations · availability and mobility · skill signals · company
demand signals · market atlas · what you can do now · world map*.

Its read layer (`lib/market-map/capture.ts`, `spatial-read.ts`,
`demand-locations.ts`, `signals.ts`, `project-results.ts`) reads
`preferred_locations`, `company_demand_locations`, `consented_login_location_signals`
and project results — none of which the workspace map touches.

**Defect [measured]: the page renders two `<h1>`s** ("Žemėlapis" and "Mano rinkos
žemėlapis").

---

## 2. Current defects / limitations

| # | defect | severity |
|---|---|---|
| M-1 | two maps, two data models; the weak one is where the user is | architectural |
| M-2 | 319×272 px is too small to compare markers — the company's two clusters visually overlap | P1 |
| M-3 | invisible for the worker identity, i.e. exactly the "where is work?" user | P1 |
| M-4 | no expand / full-screen affordance from the panel at depth 0 | P1 |
| M-5 | no distance, no radius, no travel time, no "can I get there?" anywhere in the codebase (`grep` for haversine/distance/routing/isochrone over `lib` + `components`: **no hits**) | capability gap |
| M-6 | no geographic filter and no layer control on the workspace map | P2 |
| M-7 | the map never joins the calendar, even though the same rows carry `start_date` / `end_date` | capability gap |
| M-8 | `workers.current_location_country` is the only anchor and is country-granular; `preferred_locations` (city + granularity + intents) exists and is ignored by the workspace map | **DATA_EXISTS_UI_MISSING** |
| M-9 | `/dashboard/market-map` renders two `<h1>` | P2 |
| M-10 | from `/dashboard` there is **no link to any map** (the home has 0 `<a>`) | P0 — see `CHAT_FIRST_DASHBOARD_V1.md` |

---

## 3. Existing data sources (verified against the live local schema)

| table | geographic columns | time columns | privacy columns |
|---|---|---|---|
| `company_demand_locations` | `latitude`, `longitude`, `geo_precision`, `geocode_status`, `granularity`, `country_code`, `region`, `city`, `locality`, `address_text`, `location_label` | `start_date`, `end_date`, `urgency` | `visibility_level`, `active` |
| `company_locations` | `latitude`, `longitude`, `country`, `region`, `city`, `kind` | — | — |
| `preferred_locations` | `country_code`, `country_name`, `region`, `city`, `granularity` | — | `visibility_level`, `confirmed_by_user`, `active`, `intents`, `priority` |
| `projects` | `country`, `city`, `granularity`, `location_confirmed` | `start_date`, `end_date` | `visibility_level` |
| `booking_requests` | `location_country` | `start_date`, `expected_end_date`, `response_deadline_date` | — |
| `marketplace_listings` | `location_country`, `location_label` | — | — |
| `consented_login_location_signals` | `country_code`, `city`, `country_name` | — | consent-gated by construction |
| `workers` | `current_location_country` | — | — |
| `market_intelligence_observations` | `geo_city`, `geo_country` | — | — |

**Real longitude/latitude already exist on demand and company locations, real
dates already sit on the same rows, and a per-row `visibility_level` /
`granularity` / `confirmed_by_user` privacy model already exists.** The spatial
and temporal spine the owner is asking for is largely present in the schema and
absent from the workspace map's read.

---

## 4. Privacy / permission model

Already in the schema and to be honoured by every future slice:

- `visibility_level` per location row — the map must filter on it, never bypass it;
- `granularity` (`country` / `region` / `city` / `locality`) — render at the
  stored granularity, never sharper;
- `confirmed_by_user` on `preferred_locations` — an unconfirmed location is a
  guess and must not be pinned as fact;
- `consented_login_location_signals` is consent-gated by construction;
- `workers.current_location_country` is the worker's **own** row, read in their
  **own** view only. `loadWorkspaceMap` reads no third party's location today —
  keep that property.

Rules for anything new:

1. **Never** plot a worker's precise home. Worker supply is aggregate-only —
   counts per municipality/region, never individual pins, and never below a
   k-anonymity floor.
2. Employer-side operational pins (sites, projects, demand) are the
   organisation's **own** data and may be precise inside that organisation's
   workspace.
3. A worker's assignment location is operational data of the engagement, not a
   live position. **No live tracking, no movement history, no "where is my
   worker now".** The map shows *where work is*, never *where a person is*.
4. Precision minimisation: use the coarsest granularity that answers the
   question. Radius search needs a centre and a radius, not an address.

---

## 5–8. Use cases, with an honest maturity label

Labels: `SHIPPED_AND_WORKING` · `SHIPPED_BUT_WEAK` · `PARTIALLY_IMPLEMENTED` ·
`DATA_EXISTS_UI_MISSING` · `ARCHITECTURE_READY` · `FUTURE_CAPABILITY`.

### 5. Worker

| capability | status |
|---|---|
| see my visible opportunities on a map | `SHIPPED_BUT_WEAK` — renders only when a coordinate resolves; empty for the fixture worker |
| map anchored on my own market | `PARTIALLY_IMPLEMENTED` — anchor exists but is country-granular and NULL for every fixture identity |
| click a pin → the conversation is about that job | `SHIPPED_AND_WORKING` — two-way through World State |
| manage my preferred work locations | `SHIPPED_AND_WORKING` — but on `/dashboard/market-map`, not in the workspace map |
| jobs near me / radius search | `DATA_EXISTS_UI_MISSING` — `preferred_locations` + demand lat/lng exist; no distance code exists |
| distance from home | `FUTURE_CAPABILITY` — no haversine anywhere |
| travel time / commute / "can I realistically get there?" | `FUTURE_CAPABILITY` — needs an external routing source; none is wired, and adding one is an owner gate (new third-party dependency) |
| geographic demand density | `DATA_EXISTS_UI_MISSING` — signals layer exists on the market map only |

### 6. Employer

| capability | status |
|---|---|
| my projects on a map | `SHIPPED_BUT_WEAK` — via `listManagedProjects`, city/country granularity |
| my demand locations on a map | `DATA_EXISTS_UI_MISSING` in the workspace map; `PARTIALLY_IMPLEMENTED` on `/dashboard/market-map` |
| my company sites | `DATA_EXISTS_UI_MISSING` — `company_locations` has lat/lng, no map reads it |
| candidates by area | `FUTURE_CAPABILITY` — requires the aggregate-only rule in §4 |
| bookings on a map | `DATA_EXISTS_UI_MISSING` — `booking_requests.location_country` only |
| service-area / coverage | `FUTURE_CAPABILITY` |

### 7. Organization / manager

| capability | status |
|---|---|
| multi-site view | `ARCHITECTURE_READY` — `company_locations` + `organization_id` on projects/bookings; the workspace map is not organisation-scoped |
| staffing gaps by location | `FUTURE_CAPABILITY` |
| regional workforce coverage | `FUTURE_CAPABILITY`, aggregate-only |
| **employee surveillance** | **explicitly out of scope, permanently** — see §4 rule 3 |

### 8. Admin

| capability | status |
|---|---|
| market intelligence geography | `PARTIALLY_IMPLEMENTED` — `market_intelligence_observations.geo_*` feeds admin observation surfaces, not a map |
| operator map | **not proposed** — admin queues are lists; geography adds nothing to approve/reject decisions |

---

## 9. Chat ↔ Map

Already correct in principle and should not be rebuilt: both read one
`WorldStateProvider`; a marker click dispatches `open_object`; `AiWorkspaceBridge`
lets the assistant change World State and the map redraws. No navigation, no
second state.

What is missing is **intent-driven prominence**: a geographic question should
make the map big, and a non-geographic session should let it get out of the way.
Today the panel is a fixed 22 rem regardless of intent, `panelWide` widens for
`geography !== null` / `player-card` / `candidates` — the mechanism exists and
the map is not yet one of its triggers at depth 0.

## 10. Calendar ↔ Map

`FUTURE_CAPABILITY`, but closer than it looks: `company_demand_locations`,
`projects` and `booking_requests` all carry their dates on the same row as their
place. "Which opportunities fit my calendar **and** my location?" is a filter
over rows the product already reads — it needs no new table.
"Can I finish A and reach B?" additionally needs travel time (§5, owner-gated).

## 11. Booking ↔ Map

`booking_requests` carries `location_country` only — too coarse to place a
booking meaningfully. First slice would be to resolve a booking's place through
its project/demand rather than its own column.

## 12. Project / object ↔ Map

`SHIPPED_BUT_WEAK`. `projects` has city/country, `location_confirmed` and
`granularity`, and `ProjectMap` already exists on `/dashboard/projects`. A third
map component, again with its own model.

---

## 13. Desktop UX target

- panel default stays 22 rem, but the map inside it becomes a **preview with an
  explicit expand control**, and the preview is only shown when it has data;
- expanding uses the **existing `panelWide` mechanism** (`lg:w-[30rem]
  xl:w-[38rem]`) — same panel, more column, no second surface, no route change;
- a geographic intent detected in the conversation triggers the wide state
  automatically, exactly as `geography !== null` already does for the market
  result;
- filters (radius, granularity, layer) live in the expanded state only.

## 14. Mobile UX target

- the docked 55 px panel handle stays;
- opening the map opens it **full-screen**, not as a 176 px card in a sheet;
- full-screen map has: back to conversation, layer/filter control, and marker
  selection that returns to the conversation with the entity selected.

## 15. Expandable / full-map behaviour

Three states, one component: `preview` (in-panel, has data, expand affordance) →
`wide` (the existing wide panel, filters enabled) → `full` (mobile full-screen /
desktop `/dashboard/market-map` as the working surface). `onOpenFull` already
exists on `ContextPanel` and is used by results; the map does not use it yet.

## 16. Route / travel-time opportunity

`FUTURE_CAPABILITY` and an **owner gate**: it requires a third-party routing
provider (new external dependency, possibly paid). Do not build UI that implies
travel time until the source is approved. An honest intermediate step is
straight-line distance from a haversine over coordinates the product already
stores — clearly labelled as straight-line, never as travel time.

## 17. Geographic filtering

`DATA_EXISTS_UI_MISSING`. `granularity` + `country_code`/`region`/`city` support
filter-by-place today with no new schema. Radius filtering needs only haversine
over stored coordinates.

## 18. Future operational intelligence

Demand density, coverage gaps, supply/demand imbalance per region — all
aggregate-only, all subject to §4. Not before the base map is productised.

---

## 19. Implementation slices

| id | slice | scope | prerequisite | owner gate |
|---|---|---|---|---|
| **MAP-1** | make the map reachable — core nav on the chat home includes the map | `conversation-header.tsx` | — | no |
| **MAP-2** | unify the workspace map's read with the market map's read layer (`preferred_locations`, `company_demand_locations`, `company_locations`), respecting `visibility_level` + `granularity` | `lib/world-state/map-actions.ts` | — | no |
| **MAP-3** | preview → wide → full state machine; wire `onOpenFull`; hide the preview when it has no data instead of rendering a dead card | `context-panel.tsx`, `workspace-map.tsx` | MAP-2 | no |
| **MAP-4** | mobile full-screen map state | same | MAP-3 | no |
| **MAP-5** | geographic filter (place + granularity) in the wide/full states | map + read layer | MAP-2 | no |
| **MAP-6** | straight-line distance + radius from stored coordinates, labelled straight-line | new `lib/location/distance.ts` | MAP-2 | no |
| **MAP-7** | intent-driven prominence — a geographic turn widens the panel automatically | `conversation-chat.tsx` `panelWide` | MAP-3 | no |
| **MAP-8** | calendar ∩ geography filter ("fits my dates and my places") | read layer | MAP-5, MAP-6 | no |
| **MAP-9** | travel time / route | new provider | MAP-8 | **YES — third-party dependency** |
| **MAP-10** | aggregate workforce supply by region (k-anonymised) | new read | MAP-2 | **YES — privacy review** |
| **MAP-11** | retire `ProjectMap`'s separate model onto the unified read | `arena/project-map.tsx` | MAP-2 | no |
| **MAP-12** | fix the two `<h1>` on `/dashboard/market-map` | one file | — | no |

Sequence: **MAP-1 → MAP-2 → MAP-3 → MAP-4 → MAP-5 → MAP-6 → MAP-7 → MAP-8**,
then the gated ones. MAP-1 ships in this window; nothing else does.

## 20. Acceptance tests

1. A worker with a confirmed `preferred_locations` city sees a map anchored on
   that city; a worker with none sees no dead map card and no fake pin.
2. Every rendered pin traces to a real row whose `visibility_level` permits the
   viewer; a row with `granularity = 'country'` never renders at city precision.
3. No individual worker is ever plotted as a pin; supply views are counts only.
4. From `/dashboard` a map is reachable in one visible click (no quick-search).
5. Expanding the map does not navigate — the URL's `?result=` may change, the
   page does not.
6. Marker click still selects the entity in the shared World State and the
   conversation follows (regression on the one property that works today).
7. Mobile: the map opens full-screen with no horizontal overflow at 375.
8. Unmapped rows remain counted out loud at every state.
9. No UI states or implies travel time until MAP-9's provider is approved.
10. `/dashboard/market-map` has exactly one `<h1>`.
