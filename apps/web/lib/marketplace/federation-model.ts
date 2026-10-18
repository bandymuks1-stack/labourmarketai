/**
 * Universal Marketplace — FEDERATION ADAPTERS, the pure half.
 *
 * ONE discovery over the canonical domain sources, WITHOUT copying data into
 * `marketplace_listings`. `market_index_v1` (SQL, security_invoker) federates
 * the two tables that are readable under their own RLS. The domains below are
 * NOT readable that way — each is served by its own gated, already-authorized
 * reader — so they are federated here, in the app layer, by COMPOSING those
 * readers (the precedent is `lib/demand/canonical-demand.ts`: "composing the
 * paths that are ALREADY authorized adds no privilege and needs no migration").
 *
 *   domain        direction  origin (canonical source)                 reader (its own gate)
 *   ------------  ---------  --------------------------------------  -----------------------------------------
 *   job           need       public_vacancies (external vacancies)    search_public_vacancy_previews_v1
 *                                                                      (anon-boundary projection, unchanged)
 *   workforce     offer      customer_requests kind=agency_offer      list_open_supply_for_employers
 *                                                                      (caller must manage an organization)
 *   project_work  need       customer_requests demand kinds           list_open_demand_for_workers + own rows
 *                                                                      (worker gate / RLS, verified company only)
 *
 * Every adapter row carries PROVENANCE (origin table + id, provenance class),
 * VISIBILITY (who the source lets read it), DIRECTION and DOMAIN. Nothing is
 * invented: an absent fact stays `null`, a row without a usable id is dropped,
 * and no adapter widens what its reader returned (a vacancy has no employer
 * name here because the anon-boundary projection has none).
 *
 * No individual worker is listed. A person's discoverability is a per-need,
 * consent-gated, anonymized read (scouting / `can_view_worker`); a generic
 * people list would be a NEW disclosure and is deliberately not built here.
 *
 * Pure: no server-only, no Supabase client — every rule is unit-testable.
 */

import { AGENCY_CAPABILITY_ROLES } from "@/lib/company/agency-capability";
import type {
  ActorBasis,
  ActorKind,
  MarketplaceDiscoveryRow,
  MarketProvenance,
  MarketVisibility,
} from "@/lib/marketplace/listings-model";

/** Domains that exist ONLY through an adapter (no marketplace_listings row). */
export const FEDERATED_ONLY_DOMAINS = ["job", "workforce"] as const;
export type FederatedOnlyDomain = (typeof FEDERATED_ONLY_DOMAINS)[number];

/** Domain of adapter-served project / contract demand (reuses the registry domain). */
export const PROJECT_DEMAND_DOMAIN = "project_work";

export function isFederatedOnlyDomain(d: unknown): d is FederatedOnlyDomain {
  return typeof d === "string" && (FEDERATED_ONLY_DOMAINS as readonly string[]).includes(d);
}

/** Which adapters a domain filter needs. `null` filter = all of them. */
export function adaptersForDomain(domain: string | null | undefined): {
  vacancies: boolean;
  workforce: boolean;
  demand: boolean;
} {
  if (!domain || domain === "all") return { vacancies: true, workforce: true, demand: true };
  return {
    vacancies: domain === "job",
    workforce: domain === "workforce",
    demand: domain === PROJECT_DEMAND_DOMAIN,
  };
}

/** Direction a federated domain can have — never both, never guessed. */
export const FEDERATED_DIRECTION = {
  job: "need",
  workforce: "offer",
  project_work: "need",
} as const;

/** Per-adapter caps. Vacancies are by far the largest source, so the mixed
 *  view takes a bounded slice and points at the full board for the rest. */
export const VACANCY_SLICE_MIXED = 20;
export const VACANCY_SLICE_JOB_TAB = 50;
export const FEDERATION_ROW_CAP = 200;

// ── ACTOR dimension ────────────────────────────────────────────────────────

/**
 * The four universal domain groups the model must never be narrowed below
 * (work, service, goods, project/contract), mapped to the registry / adapter
 * domains that realise them. Extensible: add a group, never remove one.
 */
export const UNIVERSAL_DOMAIN_GROUPS = {
  work: ["work_resource", "job", "workforce", "personal"],
  service: ["service", "service_need"],
  goods: ["goods"],
  project: ["project_work"],
} as const;

/**
 * Organisation CAPABILITY -> actor kind. Source: `organization_roles.role_slug`
 * (vocabulary `organization_role_types`), NEVER the legacy single-valued
 * company / organization type (ORG-2: an agency is a capability, not an
 * account type).
 */
const INSTITUTION_ROLES = ["training_provider"] as const;
const SUPPLIER_ROLES = [
  "supplier",
  "logistics_provider",
  "payroll_provider",
  "verification_provider",
] as const;
const COMPANY_ROLES = [
  "employer",
  "client",
  "contractor",
  "subcontractor",
  "project_operator",
] as const;

/**
 * Actor kind of an ORGANISATION from the capabilities the caller can read.
 * Deterministic and domain/direction aware: the same organisation is an
 * `agency` when it offers workforce, a `supplier` when it offers goods, and a
 * `company` when it posts a need. No readable capability -> `other` (honest).
 */
export function actorKindForOrganisation(
  capabilities: readonly string[],
  ctx: { domain: string; direction: "offer" | "need" | "other" },
): ActorKind {
  const has = (roles: readonly string[]) => roles.some((r) => capabilities.includes(r));
  const candidates = {
    institution: has(INSTITUTION_ROLES),
    agency: has(AGENCY_CAPABILITY_ROLES),
    supplier: has(SUPPLIER_ROLES),
    company: has(COMPANY_ROLES),
  };
  let order: (keyof typeof candidates)[] = ["institution", "agency", "supplier", "company"];
  if (ctx.direction === "need") order = ["institution", "company", "agency", "supplier"];
  else if (ctx.domain === "workforce") order = ["agency", "institution", "supplier", "company"];
  else if (ctx.domain === "goods" || ctx.domain === "service") {
    order = ["supplier", "institution", "agency", "company"];
  }
  return order.find((k) => candidates[k]) ?? "other";
}

/**
 * Actor of a row served by `market_index_v1`.
 *  - service_offerings: `provider_id` is a profile (no organisation column
 *    exists) -> an individual service provider.
 *  - marketplace_listings without `organization_id`: `owner_id` is a profile
 *    -> a person.
 *  - with `organization_id`: the organisation's capabilities decide, as read
 *    through `org_capabilities_for_visible_listings_v1` (keyed by this listing,
 *    only for published listings); if none are returned the kind stays `other`.
 */
export function indexRowActor(
  row: {
    sourceTable: string;
    /** The LISTING id: capabilities are keyed by the listing the caller sees. */
    id?: string;
    organizationId: string | null;
    domain: string;
    direction: "offer" | "need" | "other";
  },
  capabilitiesByListing?: ReadonlyMap<string, readonly string[]>,
): { actorKind: ActorKind; actorBasis: ActorBasis } {
  if (row.sourceTable === "service_offerings") {
    return { actorKind: "service_provider", actorBasis: "source_column" };
  }
  if (!row.organizationId) return { actorKind: "person", actorBasis: "source_column" };
  const caps = row.id ? capabilitiesByListing?.get(row.id) : undefined;
  if (!caps || caps.length === 0) return { actorKind: "other", actorBasis: "undisclosed" };
  const kind = actorKindForOrganisation(caps, row);
  return kind === "other"
    ? { actorKind: "other", actorBasis: "undisclosed" }
    : { actorKind: kind, actorBasis: "capability" };
}

export function filterByActorKind(
  rows: readonly MarketplaceDiscoveryRow[],
  kind: ActorKind | null,
): MarketplaceDiscoveryRow[] {
  return kind ? rows.filter((r) => r.actorKind === kind) : [...rows];
}

// ── helpers ────────────────────────────────────────────────────────────────

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
function posInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── 1. public vacancies (job, need) ────────────────────────────────────────

/** The anon-boundary projection of `search_public_vacancy_previews_v1`. */
export interface VacancyPreviewRaw {
  readonly id?: unknown;
  /** ALWAYS null in the projection — never read for display (anon boundary). */
  readonly title_raw?: unknown;
  readonly profession_slug?: unknown;
  readonly occupation_raw?: unknown;
  readonly positions?: unknown;
  readonly compensation_currency?: unknown;
  readonly compensation_min?: unknown;
  readonly compensation_max?: unknown;
  readonly published_at?: unknown;
}

/**
 * Descriptive pay text, only when the source states a currency and an amount.
 * A single figure -> `priceAmount`; a range -> text. No conversion, no guess.
 */
function vacancyPay(raw: VacancyPreviewRaw): {
  priceAmount: number | null;
  currency: string | null;
  priceText: string | null;
} {
  const cur = text(raw.compensation_currency)?.toUpperCase() ?? null;
  const min = num(raw.compensation_min);
  const max = num(raw.compensation_max);
  if (!cur || !/^[A-Z]{3}$/.test(cur)) return { priceAmount: null, currency: null, priceText: null };
  if (min !== null && max !== null && min !== max) {
    return { priceAmount: null, currency: null, priceText: `${min}–${max} ${cur}` };
  }
  const one = min ?? max;
  return one === null
    ? { priceAmount: null, currency: null, priceText: null }
    : { priceAmount: one, currency: cur, priceText: null };
}

export function vacancyToRow(raw: VacancyPreviewRaw): MarketplaceDiscoveryRow | null {
  const id = text(raw.id);
  if (!id) return null;
  const published = text(raw.published_at) ?? "";
  const pay = vacancyPay(raw);
  return {
    sourceTable: "public_vacancies",
    id,
    // The source discloses no poster. Absent stays absent — never borrowed.
    ownerId: null,
    organizationId: null,
    domain: "job",
    subject: text(raw.profession_slug),
    direction: FEDERATED_DIRECTION.job,
    // Visible occupation label ONLY. `title_raw` is hidden by the anon
    // boundary and is deliberately never read here.
    title: text(raw.occupation_raw) ?? "",
    description: null,
    locationCountry: null,
    locationLabel: null,
    priceText: pay.priceText,
    priceAmount: pay.priceAmount,
    currency: pay.currency,
    quantity: posInt(raw.positions),
    unit: null,
    expiresAt: null,
    createdAt: published,
    updatedAt: published,
    // The existing public route; the vacancy page applies its own boundary.
    destinationPath: `/jobs/${id}`,
    contactAction: "open_source",
    isMine: false,
    visibility: "public",
    provenance: "external_vacancy",
    publisherName: null,
    // `public_vacancies` is imported public market data; the anon-boundary
    // projection states no poster, so it does not say whether an employer or
    // an agency posted it. Not guessed.
    actorKind: "other",
    actorBasis: "undisclosed",
  };
}

// ── 2. available workforce (workforce, offer) ──────────────────────────────

/** `AvailableSupplyRow` of `lib/supply/employer-supply-discovery.ts`, restated
 *  structurally so this file stays free of server-only imports. */
export interface SupplyRowRaw {
  readonly id: string;
  readonly roleText: string | null;
  readonly country: string | null;
  readonly teamSize: number | null;
  readonly declaredAt: string;
}

export function supplyToRow(raw: SupplyRowRaw): MarketplaceDiscoveryRow | null {
  const id = text(raw.id);
  if (!id) return null;
  const at = text(raw.declaredAt) ?? "";
  return {
    sourceTable: "customer_requests",
    id,
    // Six non-identifying columns only: no supplying organization, no profile.
    ownerId: null,
    organizationId: null,
    domain: "workforce",
    subject: null,
    direction: FEDERATED_DIRECTION.workforce,
    title: text(raw.roleText) ?? "",
    description: null,
    locationCountry: text(raw.country)?.toUpperCase() ?? null,
    locationLabel: null,
    priceText: null,
    priceAmount: null,
    currency: null,
    quantity: posInt(raw.teamSize),
    unit: null,
    expiresAt: null,
    createdAt: at,
    updatedAt: at,
    // Making contact is a separate, consented act owned by the source surface.
    destinationPath: "/dashboard/company/scouting",
    contactAction: "open_source",
    isMine: false,
    visibility: "organizations",
    provenance: "platform",
    publisherName: null,
    // `customer_requests.kind = 'agency_offer'` is only creatable by an
    // organisation holding the agency CAPABILITY (workforce_provider /
    // talent_provider / recruitment_partner), so the row itself is the
    // capability act. The organisation stays undisclosed.
    actorKind: "agency",
    actorBasis: "source_kind",
  };
}

// ── 3. project / contract demand (project_work, need) ──────────────────────

/** `CanonicalDemand` of `lib/demand/canonical-demand-model.ts`, structurally. */
export interface DemandRowRaw {
  readonly id: string;
  readonly source: string;
  readonly actionable: boolean;
  readonly country: string | null;
  readonly cityLabel: string | null;
  readonly quantity: number | null;
  readonly roleText: string | null;
  readonly organizationName: string | null;
  readonly ownedByViewer: boolean;
  readonly createdAt: string | null;
}

export function demandToRow(raw: DemandRowRaw): MarketplaceDiscoveryRow | null {
  // Only live customer_requests an actor can actually act on. A historical
  // job_demand (frozen, 0 rows) has no apply/booking path and is never shown.
  if (raw.source !== "customer_request" || !raw.actionable) return null;
  const id = text(raw.id);
  if (!id) return null;
  const at = text(raw.createdAt) ?? "";
  return {
    sourceTable: "customer_requests",
    id,
    ownerId: null,
    organizationId: null,
    domain: PROJECT_DEMAND_DOMAIN,
    subject: null,
    direction: FEDERATED_DIRECTION.project_work,
    title: text(raw.roleText) ?? "",
    description: null,
    locationCountry: text(raw.country)?.toUpperCase() ?? null,
    locationLabel: text(raw.cityLabel),
    priceText: null,
    priceAmount: null,
    currency: null,
    quantity: posInt(raw.quantity),
    unit: null,
    expiresAt: null,
    createdAt: at,
    updatedAt: at,
    destinationPath: raw.ownedByViewer
      ? `/dashboard/company/scouting?request=${id}`
      : "/dashboard/opportunities",
    contactAction: "open_source",
    isMine: raw.ownedByViewer === true,
    // Own rows come through RLS (`profile_id = auth.uid()`); everyone else's
    // through the worker gate of `list_open_demand_for_workers`.
    visibility: raw.ownedByViewer ? "own" : "workers",
    provenance: "platform",
    // Only the verified-company name the gated reader already disclosed.
    publisherName: text(raw.organizationName),
    // Demand kinds (never agency_offer) disclosed by the verified-company
    // gate. Without a disclosed company the poster kind is not stated.
    actorKind: text(raw.organizationName) ? "company" : "other",
    actorBasis: text(raw.organizationName) ? "source_kind" : "undisclosed",
  };
}

// ── merge ──────────────────────────────────────────────────────────────────

export type FederationSource = "vacancies" | "workforce" | "demand";

export interface FederationOutcome {
  readonly rows: readonly MarketplaceDiscoveryRow[];
  /** Sources that could NOT be read (a failed read is never an empty source). */
  readonly unavailable: readonly FederationSource[];
}

/**
 * Merge adapter rows into the base discovery rows: dedup on
 * `sourceTable:id`, newest first, bounded. Base rows are never replaced by an
 * adapter row (the SQL view stays authoritative for its own tables).
 */
export function mergeDiscoveryRows(
  base: readonly MarketplaceDiscoveryRow[],
  adapters: readonly MarketplaceDiscoveryRow[],
  cap: number = FEDERATION_ROW_CAP,
): MarketplaceDiscoveryRow[] {
  const seen = new Set<string>();
  const out: MarketplaceDiscoveryRow[] = [];
  for (const r of [...base, ...adapters]) {
    const key = `${r.sourceTable}:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return out.slice(0, Math.max(0, cap));
}

/** Direction filter: adapters only emit offer|need, so a kind filter maps 1:1. */
export function filterByDirection(
  rows: readonly MarketplaceDiscoveryRow[],
  direction: "offer" | "need" | "other" | null,
): MarketplaceDiscoveryRow[] {
  return direction ? rows.filter((r) => r.direction === direction) : [...rows];
}

export type { MarketProvenance, MarketVisibility };
