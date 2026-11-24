import { db } from "./market-map-db-state";

/**
 * FIXTURE IDS THAT SURVIVE A `db reset`.
 *
 * ## The defect this exists to kill
 *
 * Two of the most important authenticated specs in the suite —
 * `education-pilot-institution-learner` and `pilot-cross-actor-loop`, which
 * between them ARE `CAPABILITY_INVENTORY` §4 blockers 1 and 3 — pinned
 * organization and worker ids as string literals:
 *
 *     const ORG = "589620e6-4e36-4369-8cc7-0bb35b202ce3"; // Dev Construction
 *     const LEARNER_WORKER = "b43c82a1-153b-4c38-bbde-9840f3c61986";
 *
 * Those ids are GENERATED. `organizations` rows are backfilled from
 * `companies` and `workers` rows are inserted with `gen_random_uuid()`, so
 * every `npx supabase db reset` mints new ones. Measured on a fresh stack
 * 2026-08-28: the organization was `c11236c6-…`, the worker `4bb2ee60-…`.
 * Neither literal above existed.
 *
 * The consequence is worse than a flaky test. The spec did not fail with
 * "the id changed" — it failed with *"fixture drift: the learner must already
 * be an employee for this to prove anything"*, because a filter on a
 * nonexistent organization returns an empty set, which reads exactly like a
 * missing fixture. So the two specs that were supposed to prove the education
 * and cross-actor chains **could not pass on any freshly reset database**, and
 * the reason they gave pointed at the wrong thing.
 *
 * That is the mirror image of the #1319 finding. There, a selector could never
 * FAIL; here, a spec could never PASS. Both leave the same hole: a chain
 * everybody believes is covered, and no run behind the belief.
 *
 * ## What is actually stable
 *
 * The fixture's own anchors, which `dev-fixtures.sql` writes by hand:
 *
 *   profiles           `aaaaaaaa-0000-0000-0000-00000000000{1,2,3}`
 *   companies          `cccccccc-0000-0000-0000-000000000001`
 *   → organizations    resolved via `legacy_company_id` / `legacy_agency_id`
 *   → workers          resolved via `profile_id`
 *
 * So every id below is LOOKED UP from one of those, never written down. A
 * lookup that finds nothing throws with the fixture command to run — never
 * returns undefined, because an undefined id in a PostgREST filter is what
 * produced the misleading empty set in the first place.
 */

/** The three fixture people. These ARE hand-written in dev-fixtures.sql. */
export const FIXTURE_PROFILES = {
  worker: "aaaaaaaa-0000-0000-0000-000000000001",
  company: "aaaaaaaa-0000-0000-0000-000000000002",
  agency: "aaaaaaaa-0000-0000-0000-000000000003",
} as const;

/** The fixture company/agency legacy ids — also hand-written, also stable. */
const LEGACY_COMPANY = "cccccccc-0000-0000-0000-000000000001";
const LEGACY_AGENCY = "dddddddd-0000-0000-0000-000000000001";

const FIXTURE_HINT =
  "run `npx supabase db reset && pnpm -C apps/web db:fixtures:local` first";

async function one(path: string, what: string): Promise<Record<string, unknown>> {
  const res = await db("GET", path);
  if (!res.ok) {
    throw new Error(`${what}: lookup failed (${res.status}) — ${FIXTURE_HINT}`);
  }
  const rows = (await res.json()) as Record<string, unknown>[];
  if (rows.length === 0) {
    throw new Error(`${what}: not present in the fixtures — ${FIXTURE_HINT}`);
  }
  return rows[0];
}

/**
 * The fixture COMPANY organization ("Dev Construction").
 *
 * This is the organization the education specs use as the institution: it is
 * the one the fixtures give an owner, an employee and a demand, so it is the
 * only one where "the learner was already an employee" can be true.
 */
export async function fixtureCompanyOrgId(): Promise<string> {
  const row = await one(
    `organizations?legacy_company_id=eq.${LEGACY_COMPANY}&select=id`,
    "fixture company organization (Dev Construction)",
  );
  return String(row.id);
}

/**
 * The fixture AGENCY organization ("Dev Staffing UAB").
 *
 * Used as the negative control: an organization that never declared it
 * provides education must not be able to call anybody a learner.
 */
export async function fixtureAgencyOrgId(): Promise<string> {
  const row = await one(
    `organizations?legacy_agency_id=eq.${LEGACY_AGENCY}&select=id`,
    "fixture agency organization (Dev Staffing UAB)",
  );
  return String(row.id);
}

/** The `workers` row id for one of the fixture profiles. */
export async function fixtureWorkerId(
  profileId: string = FIXTURE_PROFILES.worker,
): Promise<string> {
  const row = await one(
    `workers?profile_id=eq.${profileId}&select=id`,
    `fixture worker row for profile ${profileId}`,
  );
  return String(row.id);
}
