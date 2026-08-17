/**
 * Pure work-object (site) model — train D, full-reality audit 2026-08-17
 * ("object/site PARTIAL — no object entity"). Shared by the server read
 * service, the server actions, the guard test and the UI. No server-only
 * imports, no IO.
 *
 * Codes against the `public.work_objects` contract proposed by the gated
 * migration 20260817150000_work_objects_v1. Until the LEAD applies it, the
 * read/action layers degrade honestly — nothing here fakes an object.
 *
 * Train M verdict (binding): the unapplied 20260713120000_company_locations_v1
 * migration is SUPERSEDED and must never be applied — work_objects is the
 * canonical location/site truth. The company workspace section and the
 * market-map company layer read THIS contract now.
 */

export const WORK_OBJECT_STATUSES = ["active", "archived"] as const;
export type WorkObjectStatus = (typeof WORK_OBJECT_STATUSES)[number];

export const WORK_OBJECT_NAME_MIN = 2;
export const WORK_OBJECT_NAME_MAX = 160;
export const WORK_OBJECT_REGION_MAX = 120;
export const WORK_OBJECT_CITY_MAX = 120;
export const WORK_OBJECT_ADDRESS_MAX = 200;

/** Bounded reads everywhere — the object surfaces never stream unbounded rows. */
export const WORK_OBJECT_READ_LIMIT = 200;

/** Postgres/PostgREST codes meaning "the work_objects migration is not
 *  applied yet" — mapped to the honest "not available yet" state. */
export const OBJECT_MIGRATION_MISSING_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
  "PGRST205",
] as const;

export function isObjectMigrationMissingCode(code: string | undefined): boolean {
  return (OBJECT_MIGRATION_MISSING_CODES as readonly string[]).includes(
    code ?? "",
  );
}

export type WorkObject = {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly name: string;
  readonly country: string | null;
  readonly region: string | null;
  readonly city: string | null;
  readonly addressLine: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly responsibleProfileId: string | null;
  readonly status: WorkObjectStatus;
  readonly createdAt: string;
};

export function isValidWorkObjectStatus(v: string): v is WorkObjectStatus {
  return (WORK_OBJECT_STATUSES as readonly string[]).includes(v);
}

/** One-line place summary — city, region, country in display order. */
export function workObjectPlace(o: {
  readonly city: string | null;
  readonly region: string | null;
  readonly country: string | null;
  readonly addressLine: string | null;
}): string {
  return [o.addressLine, o.city, o.region, o.country]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}
