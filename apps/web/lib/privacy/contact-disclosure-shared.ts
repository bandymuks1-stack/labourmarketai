/**
 * Contact-disclosure request — shared pure contract (Wagon 1).
 *
 * The employer-side ASK and the worker-side ANSWER share this closed
 * vocabulary. Pure (no IO, no server-only) so client components, server
 * actions and unit tests all pin the same values.
 *
 * The field whitelist mirrors BOTH the applied grant_employer_data_disclosure
 * RPC (20260711130000) and the draft ask RPC (20260716120000) — a value
 * outside this set is refused at every layer.
 */

/** SHARED CONTRACT status vocabulary (integration addendum 2026-07-16):
 *  created → accepted | declined | withdrawn | expired. `delivered` and
 *  `viewed` are EVENT types in the companion *_events table, not statuses. */
export const CONTACT_DISCLOSURE_STATUSES = [
  "created",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
] as const;
export type ContactDisclosureStatus =
  (typeof CONTACT_DISCLOSURE_STATUSES)[number];

/** The closed disclosure field whitelist (identical to DISCLOSABLE_FIELDS in
 *  consent-definitions.ts, duplicated here because that module is
 *  server-only; the guard test pins the two lists equal). */
export const CONTACT_DISCLOSURE_FIELD_WHITELIST = [
  "full_name",
  "phone",
  "email",
  "cv_document",
  "preferred_locations",
  "availability_details",
  "salary_expectation",
] as const;
export type ContactDisclosureField =
  (typeof CONTACT_DISCLOSURE_FIELD_WHITELIST)[number];

/** What the scouting "request contact details" ask covers by default —
 *  data-minimised to the three actual contact channels. */
export const DEFAULT_CONTACT_REQUEST_FIELDS: readonly ContactDisclosureField[] =
  ["full_name", "phone", "email"];

export function isContactDisclosureStatus(
  value: unknown,
): value is ContactDisclosureStatus {
  return (
    typeof value === "string" &&
    (CONTACT_DISCLOSURE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Validate a requested-fields payload: array, 1..7 entries, no duplicates,
 * every entry in the closed whitelist. Returns the normalized list or null
 * (never a partially-cleaned list — fail closed).
 */
export function validateRequestedFields(
  input: unknown,
): ContactDisclosureField[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > 7) return null;
  const out: ContactDisclosureField[] = [];
  for (const raw of input) {
    if (
      typeof raw !== "string" ||
      !(CONTACT_DISCLOSURE_FIELD_WHITELIST as readonly string[]).includes(raw)
    ) {
      return null;
    }
    if (out.includes(raw as ContactDisclosureField)) return null;
    out.push(raw as ContactDisclosureField);
  }
  return out;
}
