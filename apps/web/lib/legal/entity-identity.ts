/**
 * Canonical legal-entity identity — SINGLE SOURCE OF TRUTH for every public
 * legal text (footer, legal notice, privacy policy, terms).
 *
 * Values verified against official registers on 2026-07-11
 * (docs/legal/corporate-identity-source-of-truth-v1.md):
 * - Poland: KRS API (odpis aktualny), MF VAT White List, VIES;
 * - Lithuania: Registrų centras JAR open data, VIES.
 *
 * HARD RULES (guarded by legal-entity-truth.test.ts):
 * - "LabourMarket.ai" is a platform/brand name, NEVER a legal entity;
 * - the Polish company is IP OWNER / LICENSOR only — never the seller,
 *   operator, customer contracting party or data controller;
 * - UAB „Nonstop Group“ is the operator/seller/contracting party and the
 *   PRIMARY DATA CONTROLLER — never the IP owner;
 * - DPO is NOT appointed; info@labourmarket.ai is a contact mailbox only;
 * - NO bank accounts, personal codes or unverified registry numbers may
 *   ever appear in public text.
 */

export const IP_OWNER = {
  /** Short legal form used in running text. */
  name: "Labour Market AI Sp. z o.o.",
  /** Full registered spelling (KRS, verified 2026-07-11). */
  officialName: "LABOUR MARKET AI SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
  krs: "0001218752",
  nip: "7011295735",
  regon: "543779454",
  euVat: "PL7011295735",
  address: {
    street: "ul. Żurawia 47/49, lok. 415",
    city: "00-680 Warszawa",
    country: "Poland",
  },
  /** KRS-verified representation method (2026-07-11). */
  representationMethod:
    "Management board; each board member is authorised to represent the company independently (KRS)",
  role: "IP owner and licensor",
} as const;

export const PLATFORM_OPERATOR = {
  name: "UAB „Nonstop Group“",
  /** ASCII variant for contexts where Lithuanian quotes break (e.g. JSON-LD). */
  namePlain: 'UAB "Nonstop Group"',
  companyCode: "302676973",
  vatCode: "LT100010790613",
  address: {
    street: "Mūšos g. 2C, Aukštikalnių k.",
    city: "LT-39103 Pasvalio r. sav.",
    country: "Lithuania",
  },
  director: "Ramūnas Šukys",
  businessEmail: "info@nonstopgroup.lt",
  role: "platform operator, commercial seller, customer contracting party, primary data controller, IP licensee",
} as const;

export const PRIVACY_CONTACT_EMAIL = "info@labourmarket.ai";

/** DPO is NOT appointed (docs/legal/dpo-requirement-assessment-v1.md).
 *  Never render the privacy contact as a DPO. */
export const DPO_APPOINTED = false as const;

/** Copyright line owner — the IP owner, never the brand name alone. */
export function copyrightLine(year: number): string {
  return `© ${year} ${IP_OWNER.name}`;
}
