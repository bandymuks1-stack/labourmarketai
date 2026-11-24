/**
 * Work Market Atlas — document / legal eligibility model.
 *
 * Map + opportunity visibility must be tied to documents and the right to work.
 * A worker without the documents for another country must NOT be shown as
 * "ready to work abroad"; instead they are routed to legal-route opportunities
 * (company handles paperwork, document support, partner legal path, readiness
 * path). This module is the honest policy layer — it never asserts a legal
 * guarantee and never fabricates eligibility.
 *
 * Pure, deterministic, no DB, no external references.
 */

/** Honest readiness badges shown on map/opportunity cards. */
export type ReadinessBadge =
  | "ready_locally"
  | "needs_documents"
  | "document_support_available"
  | "company_handles_paperwork"
  | "not_eligible_yet"
  | "legal_route_available"
  | "verified_readiness";

export const READINESS_BADGES: readonly ReadinessBadge[] = [
  "ready_locally",
  "needs_documents",
  "document_support_available",
  "company_handles_paperwork",
  "not_eligible_yet",
  "legal_route_available",
  "verified_readiness",
];

/** The legal route an opportunity offers when a worker is not directly eligible. */
export type LegalRoute =
  | "company_handles_paperwork"
  | "document_support_available"
  | "partner_legal_path"
  | "readiness_path_available";

export type EligibilityInput = {
  /** Worker's home/base country (ISO-ish code). */
  homeCountry: string;
  /** Target country of the opportunity. */
  targetCountry: string;
  /** Does the worker hold the documents needed for the target country? */
  hasRequiredDocuments: boolean;
  /** Has a real human/admin verified the readiness? */
  verified: boolean;
  /** Does THIS opportunity provide a legal route (set by the offer/company)? */
  offeredLegalRoutes?: readonly LegalRoute[];
};

export type EligibilityResult = {
  /** The single badge to show. */
  badge: ReadinessBadge;
  /** May the worker be shown as a direct foreign offer match? */
  directForeignVisible: boolean;
  /** Legal routes surfaced to the worker (honest, may be empty). */
  routes: readonly LegalRoute[];
  /** True only for same-country work — always locally visible. */
  local: boolean;
};

/**
 * Resolve eligibility honestly.
 *
 *  - Same country → ready locally (verified upgrades the badge).
 *  - Different country + has documents → eligible (verified → verified badge).
 *  - Different country + no documents → NOT shown as a direct foreign match;
 *    surfaced ONLY via the offered legal routes. If the opportunity offers a
 *    route, badge reflects it; otherwise "not_eligible_yet".
 *
 * Never returns a legal guarantee; routes are possibilities the opportunity
 * itself declared.
 */
export function resolveEligibility(input: EligibilityInput): EligibilityResult {
  const routes = input.offeredLegalRoutes ?? [];
  const sameCountry = input.homeCountry.trim().toLowerCase() === input.targetCountry.trim().toLowerCase();

  if (sameCountry) {
    return {
      badge: input.verified ? "verified_readiness" : "ready_locally",
      directForeignVisible: false,
      routes: [],
      local: true,
    };
  }

  if (input.hasRequiredDocuments) {
    return {
      badge: input.verified ? "verified_readiness" : "ready_locally",
      directForeignVisible: true,
      routes,
      local: false,
    };
  }

  // No documents for the target country — never a direct foreign match.
  if (routes.includes("company_handles_paperwork")) {
    return { badge: "company_handles_paperwork", directForeignVisible: false, routes, local: false };
  }
  if (routes.includes("document_support_available")) {
    return { badge: "document_support_available", directForeignVisible: false, routes, local: false };
  }
  if (routes.length > 0) {
    return { badge: "legal_route_available", directForeignVisible: false, routes, local: false };
  }
  return { badge: "needs_documents", directForeignVisible: false, routes: [], local: false };
}

/** Should this worker appear in the target country's "ready to work abroad"
 *  map signal? Only when directly eligible — a legal-route-only worker is NOT
 *  shown as ready abroad (they see the route, the map does not over-state). */
export function showsAsReadyAbroad(result: EligibilityResult): boolean {
  return result.directForeignVisible;
}
