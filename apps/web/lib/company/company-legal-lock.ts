/**
 * Verified-legal lock — PURE (no server-only, no fs/net). Safe to unit-test
 * and to import from both the server service and tests.
 *
 * When a company is already VERIFIED, its legal-registry fields (legal name,
 * registration code, country, address) are LOCKED at the app layer: a normal
 * user may still edit contacts / website / company type, but can NEVER
 * silently overwrite verified legal data — the STORED legal values are
 * persisted regardless of what the form posted. Changing verified legal data
 * is an operator/admin follow-up.
 */

/** The legal-registry subset of a company that is LOCKED once verified. */
export interface CompanyLegalFields {
  readonly legalName: string | null;
  readonly country: string | null;
  readonly registrationCode: string | null;
  readonly address: string | null;
}

/**
 * Decide the legal-registry params to persist. When `verified` is provided
 * the stored values win (input ignored, `locked: true`); otherwise the
 * user's input wins (trimmed; country upper-cased; empty → null).
 */
export function resolveCompanyLegalParams(args: {
  readonly inputLegalName: string;
  readonly inputCountry?: string;
  readonly inputRegistrationCode?: string;
  readonly inputAddress?: string;
  readonly verified: CompanyLegalFields | null;
}): {
  legalName: string;
  country: string | null;
  registrationCode: string | null;
  address: string | null;
  locked: boolean;
} {
  if (args.verified) {
    return {
      legalName: (args.verified.legalName ?? args.inputLegalName).trim(),
      country: args.verified.country,
      registrationCode: args.verified.registrationCode,
      address: args.verified.address,
      locked: true,
    };
  }
  return {
    legalName: args.inputLegalName.trim(),
    country: args.inputCountry?.trim().toUpperCase() || null,
    registrationCode: args.inputRegistrationCode?.trim() || null,
    address: args.inputAddress?.trim() || null,
    locked: false,
  };
}
