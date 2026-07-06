/**
 * Privacy self-service v1 — pure model (quality-train PR G).
 *
 * Closed request-type set, mirrored in the DRAFT RPC
 * submit_privacy_request_v1 (supabase/migrations/20260706150000) — the
 * guard pins both sides so they cannot drift apart.
 */

export const PRIVACY_REQUEST_TYPES = [
  "data_export",
  "account_deletion",
] as const;

export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

export function isPrivacyRequestType(v: string): v is PrivacyRequestType {
  return (PRIVACY_REQUEST_TYPES as readonly string[]).includes(v);
}

/** Note cap mirrors the RPC's server-side check. */
export const PRIVACY_REQUEST_NOTE_MAX = 500;
