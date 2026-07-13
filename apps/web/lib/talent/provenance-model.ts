/**
 * Multi-source talent provenance — pure model (Labour Market OS P5).
 *
 * Every person-shaped record on the platform should be able to answer
 * "where did this data come from, under what consent, and when was it last
 * confirmed?". This module types the provenance ledger
 * (talent_source_records, DRAFT migration 20260713210000_multi_source_talent_v1
 * — human-gated, NOT applied) and holds the pure consent-lifecycle rules.
 *
 * Hard rules encoded here:
 *   - 8 CLOSED source types — no free-text source kind.
 *   - consent transitions are one-way where it matters: once 'revoked', a
 *     record can NEVER move back to 'granted' automatically. A new explicit
 *     grant is a NEW record with its own timestamp — never a mutation of the
 *     revoked one (see canTransitionConsent).
 *   - NO scraping source exists in the vocabulary by design: there is no
 *     'scraped' source type, and none may be added — the platform does not
 *     scrape (contract: docs/product/multi-source-talent-provenance-contract-v1.md).
 *
 * Pure (no server imports) so the transition matrix is unit-testable.
 */

export {
  isMissingRpcCode,
  isMissingTableCode,
} from "@/lib/agency/clients-model";

export const TALENT_SOURCE_TYPES = [
  "direct_registration",
  "cv_import",
  "external_profile",
  "agency",
  "partner",
  "referral",
  "company_added_contact",
  "official_integration",
] as const;
export type TalentSourceType = (typeof TALENT_SOURCE_TYPES)[number];

export const CONSENT_STATUSES = [
  "not_required",
  "pending",
  "granted",
  "revoked",
] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export interface TalentSourceRecord {
  readonly id: string;
  readonly sourceType: TalentSourceType;
  readonly sourceName: string | null;
  readonly sourceReference: string | null;
  readonly consentStatus: ConsentStatus;
  readonly firstSeenAt: string;
  readonly lastConfirmedAt: string | null;
  readonly importMethod: string | null;
}

export function parseTalentSourceType(
  value: string | null | undefined,
): TalentSourceType | null {
  return (TALENT_SOURCE_TYPES as readonly string[]).includes(value ?? "")
    ? (value as TalentSourceType)
    : null;
}

export function parseConsentStatus(
  value: string | null | undefined,
): ConsentStatus | null {
  return (CONSENT_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as ConsentStatus)
    : null;
}

/**
 * Consent-state transition matrix.
 *
 *   not_required → pending | granted | revoked   (source becomes consent-relevant)
 *   pending      → granted | revoked
 *   granted      → revoked                        (withdrawal always allowed)
 *   revoked      → (NOTHING)                      revoked is terminal for the
 *                                                 record — re-granting requires
 *                                                 a NEW explicit record, never a
 *                                                 flip back on the old one.
 *
 * Identity transitions (x → x) are not "transitions" and return false.
 */
export function canTransitionConsent(
  from: ConsentStatus,
  to: ConsentStatus,
): boolean {
  if (from === to) return false;
  switch (from) {
    case "not_required":
      return to === "pending" || to === "granted" || to === "revoked";
    case "pending":
      return to === "granted" || to === "revoked";
    case "granted":
      return to === "revoked";
    case "revoked":
      // Terminal. Never auto-regranted — a new grant is a NEW record.
      return false;
  }
}

export interface TalentSourceInput {
  readonly sourceType: string;
  readonly sourceName?: string | null;
  readonly sourceReference?: string | null;
  readonly importMethod?: string | null;
  readonly consentStatus?: string | null;
}

export type TalentSourceValidation =
  | {
      ok: true;
      value: {
        sourceType: TalentSourceType;
        sourceName: string | null;
        sourceReference: string | null;
        importMethod: string | null;
        consentStatus: ConsentStatus;
      };
    }
  | {
      ok: false;
      reason:
        | "sourceType"
        | "sourceName"
        | "sourceReference"
        | "importMethod"
        | "consentStatus";
    };

/** Mirrors the server-side checks in record_talent_source_v1 exactly. */
export function validateTalentSourceInput(
  input: TalentSourceInput,
): TalentSourceValidation {
  const sourceType = parseTalentSourceType(input.sourceType);
  if (!sourceType) return { ok: false, reason: "sourceType" };

  const sourceName = (input.sourceName ?? "").trim() || null;
  if (sourceName && sourceName.length > 160) {
    return { ok: false, reason: "sourceName" };
  }

  const sourceReference = (input.sourceReference ?? "").trim() || null;
  if (sourceReference && sourceReference.length > 300) {
    return { ok: false, reason: "sourceReference" };
  }

  const importMethod = (input.importMethod ?? "").trim() || null;
  if (importMethod && importMethod.length > 80) {
    return { ok: false, reason: "importMethod" };
  }

  const consentStatus = parseConsentStatus(input.consentStatus ?? "not_required");
  if (!consentStatus) return { ok: false, reason: "consentStatus" };

  return {
    ok: true,
    value: { sourceType, sourceName, sourceReference, importMethod, consentStatus },
  };
}
