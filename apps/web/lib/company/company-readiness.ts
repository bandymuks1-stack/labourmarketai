/**
 * Company readiness — pure derivation (Stage 5).
 *
 * Implements §3.2 of docs/product/pre-payment-product-readiness.md from the
 * company fields that ALREADY exist (no new columns). Honest: a `verified`
 * state is admin-set only (verificationStatus), never asserted here; readiness
 * is purely "has the company filled what a real hire needs".
 *
 * Extra legal fields (hiring model, insurance, countries of operation, legal
 * representative) are a documented future enhancement — see the final report.
 *
 * Pure. No IO. Reused by the company dashboard summary + tests.
 */

export type CompanyReadinessStatus = "incomplete" | "basic" | "hiring_ready";

/** The subset of company fields the readiness derivation needs. */
export interface CompanyReadinessInput {
  readonly legalName: string | null;
  readonly country: string | null;
  readonly registrationCode: string | null;
  readonly contactEmail: string | null; // billing/contact email
  readonly companyType: string | null; // activity; 'other' = unspecified
  readonly verificationStatus: string | null;
}

export type CompanyReadinessField =
  | "legal_name"
  | "country"
  | "registration_code"
  | "billing_email"
  | "activity";

export interface CompanyReadinessResult {
  readonly status: CompanyReadinessStatus;
  readonly missing: readonly CompanyReadinessField[];
  /** True only when an admin has set verification to 'verified'. */
  readonly verified: boolean;
}

function isSet(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function computeCompanyReadiness(
  input: CompanyReadinessInput,
): CompanyReadinessResult {
  const missing: CompanyReadinessField[] = [];
  if (!isSet(input.legalName)) missing.push("legal_name");
  if (!isSet(input.country)) missing.push("country");
  if (!isSet(input.registrationCode)) missing.push("registration_code");
  if (!isSet(input.contactEmail)) missing.push("billing_email");

  const activitySet = isSet(input.companyType) && input.companyType !== "other";
  const verified = input.verificationStatus === "verified";

  let status: CompanyReadinessStatus;
  if (missing.length > 0) {
    status = "incomplete";
  } else if (!activitySet) {
    // core legal/billing present, but the activity/hiring context is unspecified
    missing.push("activity");
    status = "basic";
  } else {
    status = "hiring_ready";
  }

  return { status, missing, verified };
}
