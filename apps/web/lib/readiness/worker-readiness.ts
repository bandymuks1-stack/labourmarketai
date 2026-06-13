/**
 * Worker readiness — pure status derivation (Stage 4).
 *
 * Implements §3.1 of docs/product/pre-payment-product-readiness.md. The status
 * is the LOWEST that applies, derived ONLY from real fields (the worker's own
 * documents + availability) — never a fabricated score. A worker is NEVER
 * "ready_for_country" while a required document is missing/expired or while a
 * present required document is still pending verification.
 *
 * Pure. No IO. Reused by the worker readiness UI (PR4), the company candidate
 * summary (PR7), and tests.
 */

export type WorkerCountryReadinessStatus =
  | "not_enough_information"
  | "missing_documents"
  | "needs_verification"
  | "almost_ready"
  | "ready_for_country";

export type DocVerification = "unverified" | "pending" | "verified" | "rejected";

/** One required/recommended document evaluated against the worker's records. */
export interface ReadinessDocItem {
  readonly slug: string;
  /** Worker has logged this document with status 'ready' (their own claim). */
  readonly present: boolean;
  /** Present but past valid_until (no longer covers the worker). */
  readonly expired: boolean;
  /** Admin verification axis (PR2). 'unverified' if the column isn't applied. */
  readonly verification: DocVerification;
}

export interface WorkerReadinessInput {
  /** availability_status==='available' OR an available_from date is set. */
  readonly availabilitySet: boolean;
  readonly requiredItems: readonly ReadinessDocItem[];
  readonly recommendedItems: readonly Omit<ReadinessDocItem, "verification">[];
  /** Any present document is within its expiry window. */
  readonly expiringSoon: boolean;
}

export interface WorkerReadinessResult {
  readonly status: WorkerCountryReadinessStatus;
  readonly missingRequired: readonly string[];
  readonly pendingVerification: readonly string[];
  readonly expiringSoon: boolean;
}

/** True once at least one real input exists (availability or any document). */
function hasAnyInput(input: WorkerReadinessInput): boolean {
  return (
    input.availabilitySet ||
    input.requiredItems.some((i) => i.present) ||
    input.recommendedItems.some((i) => i.present)
  );
}

export function computeWorkerCountryReadiness(
  input: WorkerReadinessInput,
): WorkerReadinessResult {
  const missingRequired = input.requiredItems
    .filter((i) => !i.present || i.expired || i.verification === "rejected")
    .map((i) => i.slug);

  const pendingVerification = input.requiredItems
    .filter(
      (i) => i.present && !i.expired && i.verification === "pending",
    )
    .map((i) => i.slug);

  const base = {
    missingRequired,
    pendingVerification,
    expiringSoon: input.expiringSoon,
  };

  // Lowest-applicable ladder.
  if (!hasAnyInput(input)) {
    return { status: "not_enough_information", ...base };
  }
  if (missingRequired.length > 0) {
    return { status: "missing_documents", ...base };
  }
  if (pendingVerification.length > 0) {
    return { status: "needs_verification", ...base };
  }
  const recommendedGap = input.recommendedItems.some(
    (i) => !i.present || i.expired,
  );
  if (recommendedGap || input.expiringSoon) {
    return { status: "almost_ready", ...base };
  }
  return { status: "ready_for_country", ...base };
}

/**
 * Whether a candidate may be shown to a company as "ready to start" for a
 * country. Honest gate used by discovery (PR7): only the top of the ladder.
 */
export function isReadyToStart(result: WorkerReadinessResult): boolean {
  return result.status === "ready_for_country";
}

/** Short label key (i18n namespace workerReadiness.status.*). */
export function readinessStatusKey(
  status: WorkerCountryReadinessStatus,
): string {
  return status;
}

/** One per-document checklist item as derived by the documents flow. */
export interface CountryChecklistItem {
  readonly documentTypeSlug: string;
  readonly requirementLevel: "required" | "recommended" | "conditional";
  /** Derived status: 'ready' | 'expiring' | 'missing' | 'blocked'. */
  readonly status: string;
}

/**
 * Adapter: turn the documents-flow country checklist + an availability signal
 * into the §3.1 readiness ladder. A 'ready' or 'expiring' item is present (it is
 * logged and currently valid); 'missing'/'blocked' is not. Verification is not
 * known from the checklist alone (the verification column is additive/PR2), so
 * it defaults to 'unverified' — which never blocks readiness for a present doc.
 */
export function workerReadinessFromChecklist(
  items: readonly CountryChecklistItem[],
  availabilitySet: boolean,
): WorkerReadinessResult {
  const present = (s: string) => s === "ready" || s === "expiring";
  return computeWorkerCountryReadiness({
    availabilitySet,
    requiredItems: items
      .filter((i) => i.requirementLevel === "required")
      .map((i) => ({
        slug: i.documentTypeSlug,
        present: present(i.status),
        expired: false,
        verification: "unverified" as const,
      })),
    recommendedItems: items
      .filter((i) => i.requirementLevel === "recommended")
      .map((i) => ({
        slug: i.documentTypeSlug,
        present: present(i.status),
        expired: false,
      })),
    expiringSoon: items.some((i) => i.status === "expiring"),
  });
}
