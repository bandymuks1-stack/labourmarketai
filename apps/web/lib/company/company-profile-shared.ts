import { isIsoCountry } from "@/lib/location/country-model";

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

/** The countries a company may be registered in: EVERY ISO country (global-access rule,
 *  owner 2026-09-22). `organizations.country` carries a FOREIGN KEY to `public.countries(code)`;
 *  the migration `20260922120000_countries_all_iso_v1` seeds every code there, and until it is
 *  applied a not-yet-seeded country is refused by the FK and shown as the explicit
 *  `invalid-country` state (never a silent drop, never a crash). `COMPANY_PRIORITY_COUNTRY_CODES`
 *  are the seeded target markets, rendered first in the select. */
export const COMPANY_PRIORITY_COUNTRY_CODES = [
  "LT",
  "LV",
  "EE",
  "PL",
  "NL",
  "DK",
  "DE",
  "SE",
  "NO",
  "FI",
] as const;

/** Back-compat name: the priority list. It is NOT the eligibility list any more. */
export const COMPANY_COUNTRY_CODES = COMPANY_PRIORITY_COUNTRY_CODES;

export type CompanyCountryCode = (typeof COMPANY_COUNTRY_CODES)[number];

/** Any assigned ISO-3166-1 alpha-2 code. The priority list orders the select; it does not
 *  decide which country a company may be in. */
export function isKnownCountryCode(v: string): boolean {
  return isIsoCountry(v);
}
