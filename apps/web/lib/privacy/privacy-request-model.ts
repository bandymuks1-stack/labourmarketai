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

/** The payload marker submit_privacy_request_v1 stamps on every row. */
export const PRIVACY_REQUEST_SOURCE = "privacy_self_service";

/**
 * Is this customer_requests payload a privacy self-service request?
 *
 * THE one classifier (V8 W4-C item 2): the matching workbench uses it to
 * keep privacy rows OUT of the labour-demand queue, and the admin privacy
 * section uses the same rule to list them — one predicate, no drift. Both
 * markers the RPC writes are accepted, so either alone still classifies.
 */
export function isPrivacyRequestPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    p.source === PRIVACY_REQUEST_SOURCE ||
    typeof p.privacy_request_type === "string"
  );
}
