# Market Map — Three Spatial Entities v1 (Sprint v2 §6)

Status: implemented 2026-07-14 (Market Map Completion slice, P1).
Guard: `apps/web/lib/guards/market-map-three-entities-v1.test.ts`.
Model: `apps/web/lib/market-map/spatial-entities.ts` (pure) +
`apps/web/lib/market-map/spatial-read.ts` (owner-scoped composer) +
`apps/web/components/app/market-map-entity-layers.tsx` (props-only UI).

## Owner requirement

The map supports THREE different spatial entities — never mixed:

1. **Person** (`person_presence`)
2. **Company operating territory** (`company_territory`)
3. **Project location** (`project_location`)

Users remain discoverable, but communication happens only through the
LabourMarket.ai workflow (no direct-contact bypass). Every entity kind pins
`contactPolicy: "platform_workflow_only"`; no entity carries or renders a
phone number, email address or any other direct channel.

## The typed model

`SpatialEntityCollections` is the ONLY shape the read layer returns — one
typed array per kind (`personPresence`, `companyTerritories`,
`projectLocations`). There is deliberately no combined array, so a consumer
cannot draw the three kinds as one look-alike pin list. Each kind owns a
distinct rendering contract, enforced in the registry and unit tests:

| Entity | Render contract | Visual language |
|---|---|---|
| `person_presence` | `area_bucket` | filled rounded square area chip (blue) |
| `company_territory` | `territory_shape` | dashed outline ring/area (cyan) — never a point |
| `project_location` | `point_pin` | diamond marker (amber) |

## Visibility rules per entity

### 1. Person presence — §20-safe, aggregate-only

- **Default-closed (§4):** only signals with shareable visibility levels
  (`aggregated` / `region_visible` / `city_visible`) feed the layer;
  `private` / `self_only` never leave the owner's own view. Login-location
  signals count only with `consent_status = 'consented'`.
- **Aggregation thresholds (§20, both repo conventions combined):**
  - buckets with n < `DEFAULT_MIN_BUCKET` (3) are dropped entirely
    (individual protection — a single person can never be singled out);
  - buckets with 3 ≤ n < `PERSON_PRESENCE_MIN_N` (5) surface only as the
    **"<5" small-sample band** (the §20 "n<5 šablonas"); the exact small
    count is not representable in the entity type;
  - only buckets with n ≥ 5 show an exact count.
- **No exact person point, structurally:** `PersonPresenceEntity` has no
  latitude/longitude fields at all. The unit + guard tests assert no
  coordinate-shaped key can appear anywhere in builder output, and
  `collectionsAreStrictlyTyped()` rejects a smuggled coordinate at runtime.
- **No names, no owner ids, no contact data** on any aggregate.

### 2. Company operating territory

- Derived from EXISTING data only: `company_locations` rows (headquarters /
  operating / desired_market; owner-gated draft migration
  `20260713120000_company_locations_v1`, honest `needs-migration` state until
  the owner applies it) plus coordinate-verified company demand locations as
  `demand_anchor` territory elements.
- Company-entered approximate coordinates are COMPANY geography — this layer
  never stores or renders private worker locations (symmetry note: worker
  private data never flows to companies; company territory is business data
  the company chose to publish to its own workspace surface).
- Rendered ONLY as outlined territory shapes — never a point-pin that could
  be confused with a person or a project.

### 3. Project location

- Real `projects` rows with a location (country/city + per-row
  `visibility_level`), read through the existing owner-scoped fetcher.
- `confirmed` is true only when the project location was explicitly
  confirmed (`location_confirmed`); otherwise the entry stays honest
  "area level" — no invented point.

## §20 compliance statement

Private person data is NEVER visible to companies in any form through this
layer: person output is aggregate-only, coordinate-free by type, floored at
n ≥ 3, banded below n < 5, name-free and contact-free. The symmetry holds
both ways (person entities carry no company-targeting data either). Research
or cross-user feeds are NOT part of this slice — the composer
(`spatial-read.ts`) reads only the caller's own RLS-scoped rows; a cross-user
person-presence source remains a separate owner-gated decision with the same
pure engine.

## Owner decisions (open)

1. **Individual person pins:** NO existing consent purpose authorizes
   plotting an individual person on the map. `profile_discoverability`
   (2026-07-11.v2) covers search discoverability with an APPROXIMATE
   preferred region only. Per the "never invent a consent silently" rule the
   model pins `INDIVIDUAL_PERSON_PIN_CONSENT_EXISTS = false`; adding such a
   consent version (lib/privacy/consent-definitions.ts + DB pin) is an owner
   decision.
2. **Cross-user person-presence feed:** the aggregation engine is live and
   fully tested, but it is fed owner-scoped signals only (RLS). Turning on a
   cross-user aggregate source is owner-gated (same boundary as the market
   read layer v1 audit).
3. **company_locations activation:** the company-territory store shows an
   honest inactive state until the owner applies the draft migration.

## Migrations

None. The slice derives everything from existing tables
(`preferred_locations`, `profiles`, `consented_login_location_signals`,
`company_locations` [draft], `company_demand_locations`, `projects`). The
migration baseline guard stays at 137; the guard test additionally asserts no
`2026071422xxxx` migration file was added.
