/**
 * Documents & readiness engine config (S3 / s3-documents-readiness).
 *
 * Flag-flip: ON since 2026-06-10 — the worker_documents_readiness migration
 * is APPLIED to prod via MCP apply_migration (ledger 20260610172333). The
 * page derives statuses from the worker's own rows + date arithmetic and
 * stays honest while empty; country_document_requirements ships EMPTY
 * (needs_legal_source — no invented legal facts). File upload and the
 * primary-nav promotion are separate follow-up slices.
 */
export const DOCUMENTS_READINESS_ENABLED = true;

/** Days before valid_until at which a ready document counts as expiring. */
export const DOCUMENT_EXPIRING_WINDOW_DAYS = 30;

/** Launch markets for the country selector (Belgium = future, included in
 *  the structure but never promoted above the nine — product plan §20). */
export const DOCUMENT_COUNTRIES = [
  "LT", "LV", "EE", "NL", "DE", "DK", "NO", "SE", "PL",
] as const;
