/**
 * Market Map — THREE spatial entities, typed and never mixed (Sprint v2 §6).
 *
 * The map supports exactly three spatial entity kinds:
 *   1. person_presence   — people, ONLY as coarse aggregated presence,
 *   2. company_territory — where a company operates (areas/territories),
 *   3. project_location  — where a real project happens (typed point rows).
 *
 * Each kind has its OWN visibility rule and its OWN rendering contract; the
 * read layer returns typed collections (SpatialEntityCollections), never a
 * mixed bag of look-alike pins. A person can therefore never be confused with
 * a company territory or a project pin — structurally, not just visually.
 *
 * §20 privacy base (doctrine, owner text 2026-06-11):
 *   - Private person data is NEVER visible to companies in any form. The
 *     PersonPresenceEntity type carries NO latitude/longitude fields at all —
 *     an exact person point cannot be represented, let alone rendered.
 *   - Aggregation combines BOTH repo thresholds: buckets below
 *     DEFAULT_MIN_BUCKET (3) are dropped entirely (individual protection),
 *     buckets below PERSON_PRESENCE_MIN_N (5) surface only as a "<5"
 *     small-sample band (the §20 "n<5 šablonas"), and only buckets with
 *     n >= 5 show an exact count.
 *   - Only shareable signals feed the person layer (visibility levels
 *     aggregated / region_visible / city_visible; login only when the user
 *     consented) — default-closed (§4): private/self_only never leave the
 *     owner's own view.
 *
 * Individual person pins: NO existing consent covers being individually
 * plotted on the map. `profile_discoverability` (2026-07-11.v2) covers
 * search discoverability with an APPROXIMATE preferred region only. Per the
 * "never invent a consent silently" rule this module ships aggregate-only;
 * see INDIVIDUAL_PERSON_PIN_CONSENT_EXISTS below (owner decision).
 *
 * Communication rule (Sprint v2 §6): users remain discoverable, but contact
 * happens ONLY through the LabourMarket.ai workflow. Every entity kind pins
 * contactPolicy = "platform_workflow_only" — no entity carries or renders a
 * phone number, email or any direct-contact bypass.
 *
 * Pure and inert: no DB, no network, no server-only. The owner-scoped
 * composer (./spatial-read.ts) feeds it real RLS-scoped rows; a future
 * owner-gated cross-user source can feed the same functions unchanged.
 */

import {
  aggregateSignals,
  DEFAULT_MIN_BUCKET,
  type Granularity,
  type NormalizedSignal,
  type SignalType,
} from "./signal-model";
import {
  isMappableDemandLocation,
  type DemandLocation,
} from "./demand-locations";

// ── Entity kind registry ────────────────────────────────────────────────────

export const SPATIAL_ENTITY_KINDS = [
  "person_presence",
  "company_territory",
  "project_location",
] as const;

export type SpatialEntityKind = (typeof SPATIAL_ENTITY_KINDS)[number];

/** How a kind may be drawn. The three kinds NEVER share a rendering contract. */
export type SpatialRenderContract =
  | "area_bucket" // coarse aggregated area chip — persons only
  | "territory_shape" // outlined area/territory — companies only, never a pin
  | "point_pin"; // typed point marker — projects only

export interface SpatialEntityContract {
  readonly kind: SpatialEntityKind;
  /** Human-readable visibility rule, pinned by the guard test. */
  readonly visibilityRule: string;
  readonly render: SpatialRenderContract;
  /** The ONLY communication route — the platform workflow (no direct contact). */
  readonly contactPolicy: "platform_workflow_only";
  /** i18n subtree under marketMap.entities.* */
  readonly i18nKey: "person" | "company" | "project";
}

export const SPATIAL_ENTITY_REGISTRY: Readonly<
  Record<SpatialEntityKind, SpatialEntityContract>
> = {
  person_presence: {
    kind: "person_presence",
    visibilityRule:
      "aggregate-only; default-closed; shareable visibility levels only; " +
      "n<3 dropped, n<5 banded, no exact coordinates representable (§20)",
    render: "area_bucket",
    contactPolicy: "platform_workflow_only",
    i18nKey: "person",
  },
  company_territory: {
    kind: "company_territory",
    visibilityRule:
      "company-entered operating geography (company_locations) + " +
      "coordinate-verified demand anchors; company data only — this layer " +
      "never stores or renders private worker locations",
    render: "territory_shape",
    contactPolicy: "platform_workflow_only",
    i18nKey: "company",
  },
  project_location: {
    kind: "project_location",
    visibilityRule:
      "real project rows with a location, per-row visibility_level; a city " +
      "point only when the project location was explicitly confirmed",
    render: "point_pin",
    contactPolicy: "platform_workflow_only",
    i18nKey: "project",
  },
};

/**
 * OWNER DECISION (not invented silently): there is NO existing consent
 * purpose that authorizes plotting an individual person on the map. Until the
 * owner approves such a consent version (lib/privacy/consent-definitions.ts),
 * the person layer is aggregate-only and this stays `false`.
 */
export const INDIVIDUAL_PERSON_PIN_CONSENT_EXISTS = false as const;

// ── 1. Person presence (aggregate-only, §20-safe) ───────────────────────────

/** §20 small-sample threshold ("n<5 šablonas") — mirrors SMALL_SAMPLE_N = 5
 * in lib/admin/market-analysis.ts and lib/market/thermometer-data.ts. */
export const PERSON_PRESENCE_MIN_N = 5;

export type PersonPresenceBand =
  /** n >= PERSON_PRESENCE_MIN_N — the exact bucket size may be shown. */
  | { readonly kind: "exact"; readonly count: number }
  /** DEFAULT_MIN_BUCKET <= n < PERSON_PRESENCE_MIN_N — shown only as "<5",
   *  the exact small count is deliberately NOT carried in the type. */
  | { readonly kind: "small_sample" };

/**
 * Coarse person presence in one area. Structurally coordinate-free: the type
 * has no latitude/longitude (and the guard test asserts no such key can ever
 * appear in builder output), so an exact person point cannot exist here.
 */
export interface PersonPresenceEntity {
  readonly entity: "person_presence";
  /** Stable bucket key: country|region|city (empty segments allowed). */
  readonly areaKey: string;
  readonly country: string;
  readonly region: string | null;
  readonly city: string | null;
  readonly granularity: Granularity;
  readonly band: PersonPresenceBand;
}

/** Signal types that describe a PERSON's presence (never company/project). */
const PERSON_SIGNAL_TYPES: ReadonlySet<SignalType> = new Set<SignalType>([
  "profile_location",
  "preferred_location",
  "login_location",
]);

/**
 * Build the aggregate-only person layer from normalized signals.
 *
 * Reuses the read layer's aggregation engine (aggregateSignals), which already
 * enforces: shareable visibility levels only, login-consent gating, and the
 * DEFAULT_MIN_BUCKET floor. On top of that, buckets below `minN` collapse to
 * the "<5" small-sample band. Output carries no owner ids, no coordinates.
 */
export function buildPersonPresenceLayer(
  signals: readonly NormalizedSignal[],
  minN: number = PERSON_PRESENCE_MIN_N,
): PersonPresenceEntity[] {
  const personSignals = signals.filter((s) =>
    PERSON_SIGNAL_TYPES.has(s.signalType),
  );
  const buckets = aggregateSignals(personSignals, DEFAULT_MIN_BUCKET);
  const out: PersonPresenceEntity[] = [];
  for (const b of buckets) {
    if (!b.country) continue;
    const count = b.aggregatedCount ?? b.count;
    out.push({
      entity: "person_presence",
      areaKey: [b.country, b.region ?? "", b.city ?? ""].join("|"),
      country: b.country,
      region: b.region,
      city: b.city,
      granularity: b.granularity,
      band:
        count >= minN ? { kind: "exact", count } : { kind: "small_sample" },
    });
  }
  return out;
}

// ── 2. Company operating territory ──────────────────────────────────────────

export type CompanyTerritoryKind =
  | "headquarters"
  | "operating"
  | "desired_market"
  /** Derived from a coordinate-verified company demand location. */
  | "demand_anchor";

/** Input shape mirroring lib/company/company-locations.ts CompanyLocation. */
export interface CompanyTerritorySourceRow {
  id: string;
  kind: "headquarters" | "operating" | "desired_market";
  country: string;
  region: string | null;
  city: string | null;
  label: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * A company's operating territory element. Rendered ONLY as a territory
 * shape (outlined area / approximate circle) — never as a point-pin that
 * could be confused with a person or a project. `center` is optional
 * COMPANY-ENTERED approximate geography (company data, never worker data).
 */
export interface CompanyTerritoryEntity {
  readonly entity: "company_territory";
  readonly id: string;
  readonly territoryKind: CompanyTerritoryKind;
  readonly country: string;
  readonly region: string | null;
  readonly city: string | null;
  readonly label: string | null;
  readonly center: { latitude: number; longitude: number } | null;
}

const COMPANY_LOCATION_KINDS: ReadonlySet<string> = new Set([
  "headquarters",
  "operating",
  "desired_market",
]);

/**
 * Derive the company territory layer from existing data: company_locations
 * rows (HQ / operating / desired markets) plus coordinate-verified demand
 * locations as operating anchors. Nothing is invented: rows without a country
 * are skipped; demand rows without verified/manual coordinates are excluded
 * (they stay in the signal-only demand board, never faked into a territory).
 */
export function buildCompanyTerritoryLayer(
  companyLocations: readonly CompanyTerritorySourceRow[],
  demandLocations: readonly DemandLocation[] = [],
): CompanyTerritoryEntity[] {
  const out: CompanyTerritoryEntity[] = [];
  for (const row of companyLocations) {
    if (!COMPANY_LOCATION_KINDS.has(row.kind)) continue;
    if (!/^[A-Z]{2}$/.test(row.country)) continue;
    const hasPair = row.latitude !== null && row.longitude !== null;
    out.push({
      entity: "company_territory",
      id: `company-location:${row.id}`,
      territoryKind: row.kind,
      country: row.country,
      region: row.region,
      city: row.city,
      label: row.label,
      center: hasPair
        ? { latitude: row.latitude as number, longitude: row.longitude as number }
        : null,
    });
  }
  for (const row of demandLocations) {
    if (!isMappableDemandLocation(row)) continue;
    out.push({
      entity: "company_territory",
      id: `demand-anchor:${row.id}`,
      territoryKind: "demand_anchor",
      country: row.countryCode,
      region: row.region,
      city: row.city,
      label: row.locationLabel,
      center: { latitude: row.latitude as number, longitude: row.longitude as number },
    });
  }
  return out;
}

// ── 3. Project location ─────────────────────────────────────────────────────

/** Input shape mirroring the projects read in lib/market-map/signals.ts. */
export interface ProjectLocationSourceRow {
  id: string;
  country: string | null;
  city: string | null;
  granularity: Granularity;
  locationConfirmed: boolean;
  status: string;
}

/**
 * A real project's location — the third, distinct layer. A project may render
 * as a typed point-pin ONLY when its location was explicitly confirmed at
 * city level; otherwise it is an area-level entry (honest, no invented point).
 */
export interface ProjectLocationEntity {
  readonly entity: "project_location";
  readonly id: string;
  readonly country: string;
  readonly city: string | null;
  readonly granularity: Granularity;
  readonly confirmed: boolean;
  readonly status: string;
}

export function buildProjectLocationLayer(
  rows: readonly ProjectLocationSourceRow[],
): ProjectLocationEntity[] {
  const out: ProjectLocationEntity[] = [];
  for (const row of rows) {
    if (!row.country) continue;
    out.push({
      entity: "project_location",
      id: `project:${row.id}`,
      country: row.country,
      city: row.city,
      granularity: row.granularity,
      confirmed: row.locationConfirmed === true,
      status: row.status,
    });
  }
  return out;
}

// ── Typed collections (never a mixed bag) ───────────────────────────────────

/**
 * The ONLY shape the map read layer returns: one typed array per entity kind.
 * There is deliberately NO combined all-entities array — mixing the three
 * kinds into one pin list is structurally impossible for consumers.
 */
export interface SpatialEntityCollections {
  readonly personPresence: PersonPresenceEntity[];
  readonly companyTerritories: CompanyTerritoryEntity[];
  readonly projectLocations: ProjectLocationEntity[];
}

export function emptySpatialCollections(): SpatialEntityCollections {
  return { personPresence: [], companyTerritories: [], projectLocations: [] };
}

export function buildSpatialCollections(input: {
  signals: readonly NormalizedSignal[];
  companyLocations?: readonly CompanyTerritorySourceRow[];
  demandLocations?: readonly DemandLocation[];
  projects?: readonly ProjectLocationSourceRow[];
}): SpatialEntityCollections {
  return {
    personPresence: buildPersonPresenceLayer(input.signals),
    companyTerritories: buildCompanyTerritoryLayer(
      input.companyLocations ?? [],
      input.demandLocations ?? [],
    ),
    projectLocations: buildProjectLocationLayer(input.projects ?? []),
  };
}

// ── Structural separation checks (used by unit + guard tests) ───────────────

const COORDINATE_KEY_RE = /^(lat|lng|lon|latitude|longitude|coords?|point|x|y)$/i;

/** Deep-scan an object tree for any coordinate-shaped key. */
export function containsCoordinateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCoordinateKey);
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (COORDINATE_KEY_RE.test(k)) return true;
      if (containsCoordinateKey(v)) return true;
    }
  }
  return false;
}

/**
 * True only when the collections honour the separation contract:
 * each array holds ONLY its own kind, and — unless the (non-existent) explicit
 * individual-pin consent path exists — no person entity carries any
 * coordinate-shaped data anywhere in its tree.
 */
export function collectionsAreStrictlyTyped(
  c: SpatialEntityCollections,
): boolean {
  if (!c.personPresence.every((e) => e.entity === "person_presence")) {
    return false;
  }
  if (!c.companyTerritories.every((e) => e.entity === "company_territory")) {
    return false;
  }
  if (!c.projectLocations.every((e) => e.entity === "project_location")) {
    return false;
  }
  if (!INDIVIDUAL_PERSON_PIN_CONSENT_EXISTS) {
    if (c.personPresence.some((e) => containsCoordinateKey(e))) return false;
  }
  return true;
}
