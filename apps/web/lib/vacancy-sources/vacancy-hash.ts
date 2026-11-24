/**
 * VACANCY CONTENT HASH — deterministic sha256 over the IDENTITY fields of a
 * canonical vacancy, so the same ad captured twice hashes identically and any
 * real change to what the employer is asking for yields a new hash.
 *
 * WHAT IS AND IS NOT IN THE IDENTITY (this is the whole design):
 *   IN  — provider, the publisher's own ad id, the ad's substance (title,
 *         description, employer, location, compensation, form, headcount,
 *         dates the employer set) and the transform version.
 *   OUT — `capturedAt` (when WE looked), `channel` (how it reached us),
 *         `lifecycle`, the derived categorization, and the translation.
 *
 * The exclusions are what make dedup work. The same ad seen in the snapshot
 * and again in the stream must collapse to one row; re-running the importer
 * must not multiply rows; and re-running the CATEGORIZER (a derived, evolving
 * suggestion) must not fabricate a "new" vacancy. Conversely a salary edit or
 * a headcount change is a real change and must produce a new hash.
 *
 * This mirrors lib/intelligence/observation-hash.ts deliberately — same
 * stable-stringify, same sha256, same "identity not freshness" rule — so the
 * two ingest paths cannot drift into two different notions of "the same thing".
 *
 * Pure logic over node:crypto — server/test only, never a client component.
 */
import { createHash } from "node:crypto";

import type {
  VacancyCompensation,
  VacancyEmployer,
  VacancyEmploymentForm,
  VacancyLocation,
  VacancyProviderKey,
  VacancyWorkingTime,
} from "./vacancy-contract";

/** The fields that define WHICH vacancy this is and WHAT it asks for. */
export interface VacancyIdentityFields {
  readonly providerKey: VacancyProviderKey;
  readonly externalId: string;
  readonly titleRaw: string;
  readonly descriptionRaw: string;
  readonly sourceLanguage: string;
  readonly employer: VacancyEmployer;
  readonly location: VacancyLocation;
  readonly compensation: VacancyCompensation;
  readonly employmentForm: VacancyEmploymentForm;
  readonly workingTime: VacancyWorkingTime;
  readonly positions: number | null;
  readonly startDate: string | null;
  readonly publishedAt: string;
  readonly expiresAt: string | null;
  readonly transformVersion: string;
}

/** JSON stringify with recursively sorted object keys — key order can never
 *  change the hash. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** sha256 hex over the stable serialization of the identity fields. */
export function computeVacancyContentHash(v: VacancyIdentityFields): string {
  // Explicit field pick — extra properties on a wider object never leak in,
  // which is what keeps capturedAt/channel/categorization out of the hash
  // even when the caller passes a whole PublicVacancyV1.
  const identity = {
    providerKey: v.providerKey,
    externalId: v.externalId,
    titleRaw: v.titleRaw,
    descriptionRaw: v.descriptionRaw,
    sourceLanguage: v.sourceLanguage,
    employer: {
      name: v.employer.name,
      externalOrgId: v.employer.externalOrgId,
      homepage: v.employer.homepage,
    },
    location: {
      country: v.location.country,
      region: v.location.region,
      city: v.location.city,
      lat: v.location.lat,
      lng: v.location.lng,
    },
    compensation: {
      currency: v.compensation.currency,
      min: v.compensation.min,
      max: v.compensation.max,
      description: v.compensation.description,
    },
    employmentForm: v.employmentForm,
    workingTime: v.workingTime,
    positions: v.positions,
    startDate: v.startDate,
    publishedAt: v.publishedAt,
    expiresAt: v.expiresAt,
    transformVersion: v.transformVersion,
  };
  return createHash("sha256").update(stableStringify(identity)).digest("hex");
}

/**
 * The stable cross-channel key for "the same ad". Dedup uses the content hash
 * for "has this exact content been stored", and this key for "is this the
 * same ad as one I already have, possibly edited". Both are needed: the hash
 * catches replays, the key catches revisions.
 */
export function vacancyIdentityKey(
  providerKey: VacancyProviderKey,
  externalId: string,
): string {
  return `${providerKey}:${externalId}`;
}
