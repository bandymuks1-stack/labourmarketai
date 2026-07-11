import type { DerivedDocumentStatus } from "@/lib/documents/readiness";

/**
 * Document & work-proof centre — pure model (control room PR H, gap map §8).
 *
 * Pure data + pure derivations over rows the EXISTING read layer
 * (lib/documents/readiness.ts) already returns. No IO, no DB, no store of
 * its own — the composition (document-centre.ts) fetches, the page renders.
 *
 * HONESTY CONTRACT (guard: lib/guards/document-centre.test.ts):
 *   - Attention comes ONLY from the real fields: the derived valid_until
 *     status (30-day expiring window / expired→missing, computed by
 *     deriveDocumentStatus) and the stored verification enum. No score, no
 *     invented urgency, no ranking.
 *   - Statuses and verification states pass through VERBATIM — the enums the
 *     database stores are the enums the page shows.
 *   - When the verification axis is not readable in an environment the rows
 *     carry `verification: null` and NOTHING verification-shaped is derived.
 */

/** The stored verification enum (20260613100200) — shown verbatim. */
export const DOCUMENT_VERIFICATION_STATES = [
  "unverified",
  "pending",
  "verified",
  "rejected",
] as const;

export type DocumentVerificationState =
  (typeof DOCUMENT_VERIFICATION_STATES)[number];

/** The derived statuses the inventory can filter by (readiness.ts enums). */
export const DOCUMENT_STATUS_FILTERS = [
  "missing",
  "ready",
  "expiring",
  "blocked",
] as const satisfies readonly DerivedDocumentStatus[];

/** One inventory row: the readiness row + its derived status + the
 *  verification state (null = axis not readable → nothing is claimed). */
export type CentreDocumentRow = {
  readonly id: string;
  readonly documentTypeSlug: string;
  readonly country: string | null;
  readonly validUntil: string | null;
  readonly derivedStatus: DerivedDocumentStatus;
  readonly verification: DocumentVerificationState | null;
};

/** Attention counts — each traces to real rows with real field values. */
export type DocumentAttention = {
  /** derived status `expiring` (valid_until inside the 30-day window). */
  readonly expiring: number;
  /** derived status `missing` (stored missing OR expired coverage). */
  readonly missing: number;
  /** verification `pending` (sent for review) or `rejected` (needs the
   *  worker's re-action) — the two states that ask for attention. */
  readonly reviewNeeded: number;
};

/** Bounded read sizes (guard-pinned). */
export const DOC_CENTRE_VERIFICATION_READ_LIMIT = 200;

/** Anchor of the inventory section — attention chips resolve into it. */
export const DOC_CENTRE_INVENTORY_ANCHOR = "#doc-centre-inventory";

/** Count attention from the real fields only. Rows without a readable
 *  verification axis (null) contribute NOTHING review-shaped. */
export function deriveDocumentAttention(
  rows: readonly CentreDocumentRow[],
): DocumentAttention {
  let expiring = 0;
  let missing = 0;
  let reviewNeeded = 0;
  for (const r of rows) {
    if (r.derivedStatus === "expiring") expiring += 1;
    if (r.derivedStatus === "missing") missing += 1;
    if (r.verification === "pending" || r.verification === "rejected") {
      reviewNeeded += 1;
    }
  }
  return { expiring, missing, reviewNeeded };
}

export type InventoryFilters = {
  readonly type: string | null;
  readonly status: DerivedDocumentStatus | null;
};

/** Validate the ?type= / ?status= searchParams against the REAL value sets —
 *  an unknown value silently means "no filter" (never an error surface). */
export function parseInventoryFilters(
  sp: { type?: string; status?: string },
  validTypeSlugs: readonly string[],
): InventoryFilters {
  const type =
    sp.type && validTypeSlugs.includes(sp.type) ? sp.type : null;
  const status = (DOCUMENT_STATUS_FILTERS as readonly string[]).includes(
    sp.status ?? "",
  )
    ? (sp.status as DerivedDocumentStatus)
    : null;
  return { type, status };
}

/** Apply the validated filters. Pure — same rows in, a subset out. */
export function filterCentreDocuments(
  rows: readonly CentreDocumentRow[],
  filters: InventoryFilters,
): readonly CentreDocumentRow[] {
  return rows.filter(
    (r) =>
      (filters.type === null || r.documentTypeSlug === filters.type) &&
      (filters.status === null || r.derivedStatus === filters.status),
  );
}

/** Build the inventory href for a filter state (keeps the country param the
 *  page already supports; anchors into the inventory section). */
export function inventoryHref(opts: {
  type?: string | null;
  status?: string | null;
  country?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts.country) params.set("country", opts.country);
  if (opts.type) params.set("type", opts.type);
  if (opts.status) params.set("status", opts.status);
  const qs = params.toString();
  return `/dashboard/documents${qs ? `?${qs}` : ""}${DOC_CENTRE_INVENTORY_ANCHOR}`;
}

/** One aggregate row of the s6 consent-gated RPC (counts only — the RPC can
 *  never return document contents, so neither can this type). */
export type OrgDocsAggregateRow = {
  readonly workerId: string;
  readonly docsTotal: number;
  readonly docsValid: number;
  readonly docsExpiring: number;
  readonly docsAttention: number;
};

export type OrgDocsSummary = {
  /** Pool workers who consented to aggregate visibility. */
  readonly workers: number;
  readonly total: number;
  readonly valid: number;
  readonly expiring: number;
  readonly attention: number;
};

/** Sum the consent-gated aggregate rows — plain addition, nothing derived. */
export function summarizeOrgDocsAggregates(
  rows: readonly OrgDocsAggregateRow[],
): OrgDocsSummary {
  const sum: { workers: number; total: number; valid: number; expiring: number; attention: number } = {
    workers: rows.length,
    total: 0,
    valid: 0,
    expiring: 0,
    attention: 0,
  };
  for (const r of rows) {
    sum.total += r.docsTotal;
    sum.valid += r.docsValid;
    sum.expiring += r.docsExpiring;
    sum.attention += r.docsAttention;
  }
  return sum;
}
