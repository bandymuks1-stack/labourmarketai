/**
 * Client-safe shared constants/types for the canonical company profile.
 * (No "server-only" import — the setup form renders these in the browser;
 * the server service re-exports them for one source of truth.)
 */

/** Kind of organisation the company profile represents. "Agency" is NOT a
 *  separate root user role — a staffing agency is a company whose
 *  companyType = 'staffing_agency'. One canonical company profile; changing
 *  the type only changes labels/visible blocks, never the profile itself. */
export type CompanyType =
  | "construction"
  | "staffing_agency"
  | "subcontractor"
  | "manufacturing"
  | "services"
  | "client_customer"
  | "other";

export const COMPANY_TYPES: readonly CompanyType[] = [
  "construction",
  "staffing_agency",
  "subcontractor",
  "manufacturing",
  "services",
  "client_customer",
  "other",
];

/** Country codes seeded in public.countries (0002_reference_data.sql).
 *  companies.country is mirrored into organizations.country which has a
 *  FOREIGN KEY to countries(code) — only these codes are safe to persist.
 *  The setup form renders a select over this list (free text caused the
 *  organizations_country_fkey crash the owner hit in smoke). */
export const COMPANY_COUNTRY_CODES = [
  "LT",
  "LV",
  "EE",
  "PL",
  "NL",
  "DK",
  "DE",
  "SE",
  "NO",
] as const;

export type CompanyCountryCode = (typeof COMPANY_COUNTRY_CODES)[number];

export function isKnownCountryCode(v: string): v is CompanyCountryCode {
  return (COMPANY_COUNTRY_CODES as readonly string[]).includes(v);
}
