import { resolveCountryCode } from "@/lib/location/country-model";

/**
 * COMPANY INGEST — the pure half (no IO): parse → normalize → dedupe inside
 * the batch → classify. The database half (`ingest_discovered_organizations_v1`)
 * re-validates, matches existing organizations by STRONG identifiers and
 * writes DISCOVERED organizations with owner = NULL. IMPORT ≠ CLAIM: nothing
 * here, and nothing there, can make anybody the owner of anything.
 *
 * Identity keys, strongest first:
 *   registration_code (+country)   the register's own number
 *   vat                            the tax id, prefix kept
 *   web_domain                     the company's own site — a FREE-MAIL domain
 *                                  (gmail.com, …) is never a company identity
 *   name_country                   weak: only raises "possible duplicate"
 *
 * Market class is kept as the owner defined it (2026-09-30): direct employers,
 * contractors and real project demand first; staffing / recruitment agencies
 * are a separate class and never folded into "employer".
 */

export const COMPANY_CLASSES = [
  "direct_employer",
  "contractor",
  "subcontractor",
  "staffing_agency",
  "recruitment_agency",
  "client",
  "supplier",
] as const;
export type CompanyClass = (typeof COMPANY_CLASSES)[number];

/** Market class → the existing `organization_role_types` slug. */
export const CLASS_TO_ROLE: Readonly<Record<CompanyClass, string>> = {
  direct_employer: "employer",
  contractor: "contractor",
  subcontractor: "subcontractor",
  staffing_agency: "workforce_provider",
  recruitment_agency: "recruitment_partner",
  client: "client",
  supplier: "supplier",
};

export const SOURCE_KINDS = [
  "public_register",
  "company_website",
  "job_posting",
  "owner_import",
  "partner_referral",
  "direct_contact",
  "agentai_signal",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export type CompanyIngestRow = {
  readonly ref?: string;
  readonly name: string;
  readonly legalName?: string | null;
  readonly country?: string | null;
  readonly city?: string | null;
  readonly registrationCode?: string | null;
  readonly vat?: string | null;
  readonly website?: string | null;
  /** A PUBLIC business contact only — never a private person's address. */
  readonly publicEmail?: string | null;
  readonly publicPhone?: string | null;
  readonly sector?: string | null;
  readonly classes?: readonly CompanyClass[];
  /** A real, sourced demand signal ("needs 5 welders in SE, Q4"). */
  readonly demandSignal?: string | null;
  readonly source: { readonly kind: SourceKind; readonly ref?: string | null; readonly observedAt: string };
};

export type NormalizedCompany = {
  readonly ref: string;
  readonly displayName: string;
  readonly legalName: string | null;
  readonly country: string | null;
  readonly registrationCode: string | null;
  readonly vat: string | null;
  readonly webDomain: string | null;
  readonly nameKey: string;
  readonly roles: readonly string[];
  readonly classes: readonly CompanyClass[];
  readonly facts: readonly { field: string; value: unknown; source_kind: SourceKind; source_ref: string | null; observed_at: string }[];
  readonly problems: readonly string[];
};

/** Legal-form tokens stripped from the weak name key (never from the name). */
const LEGAL_FORMS = new Set([
  "uab", "ab", "mb", "ii", "vsi", "ltd", "limited", "llc", "inc", "plc", "gmbh", "ag", "kg", "ohg",
  "sp", "z", "o", "oo", "spolka", "sa", "sas", "sarl", "srl", "spa", "bv", "nv", "as", "asa", "aps",
  "oy", "oyj", "ou", "sia", "co", "company", "corp", "corporation", "group", "ug", "kft", "doo", "sro",
]);

export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((t) => t && !LEGAL_FORMS.has(t))
    .join(" ")
    .slice(0, 200);
}

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de",
  "web.de", "mail.ru", "yandex.ru", "yandex.com", "inbox.lt", "one.lt", "zoho.com", "wp.pl", "o2.pl",
  "interia.pl", "onet.pl", "seznam.cz", "mail.com",
]);

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** A company's own web domain from a URL or bare host; null for free mail or junk. */
export function webDomainOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  if (host.includes("@")) host = host.split("@").pop() ?? "";
  host = host.replace(/^[a-z]+:\/\//, "").split(/[/?#:]/)[0].replace(/^www\./, "");
  if (!DOMAIN.test(host) || FREE_MAIL.has(host)) return null;
  return host;
}

export function normalizeRegistrationCode(raw: string | null | undefined): string | null {
  const v = (raw ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return v.length >= 3 && v.length <= 40 ? v : null;
}

export function normalizeVat(raw: string | null | undefined): string | null {
  const v = (raw ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return v.length >= 4 && v.length <= 20 ? v : null;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const plus = raw.trim().startsWith("+") || raw.trim().startsWith("00");
  const digits = raw.replace(/\D/g, "").replace(/^00/, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return plus ? `+${digits}` : digits;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200 ? v : null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeCompany(row: CompanyIngestRow, index: number): NormalizedCompany {
  const problems: string[] = [];
  const displayName = row.name.trim().replace(/\s+/g, " ");
  if (displayName.length < 2 || displayName.length > 200) problems.push("invalid_name");
  const country = row.country ? resolveCountryCode(row.country) : null;
  if (row.country && !country) problems.push("unknown_country");
  const registrationCode = normalizeRegistrationCode(row.registrationCode);
  if (row.registrationCode && !registrationCode) problems.push("invalid_registration_code");
  const vat = normalizeVat(row.vat);
  if (row.vat && !vat) problems.push("invalid_vat");
  const webDomain = webDomainOf(row.website) ?? webDomainOf(row.publicEmail);
  const email = normalizeEmail(row.publicEmail);
  if (row.publicEmail && !email) problems.push("invalid_email");
  const phone = normalizePhone(row.publicPhone);
  if (row.publicPhone && !phone) problems.push("invalid_phone");
  const observedAt = row.source.observedAt;
  if (!ISO_DAY.test(observedAt) || Number.isNaN(Date.parse(observedAt))) problems.push("invalid_observed_at");
  const classes = [...new Set(row.classes ?? [])];

  const src = { source_kind: row.source.kind, source_ref: row.source.ref?.trim() || null, observed_at: observedAt };
  const facts: NormalizedCompany["facts"][number][] = [];
  const add = (field: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "") facts.push({ field, value, ...src });
  };
  add("display_name", displayName);
  add("legal_name", row.legalName?.trim() || null);
  add("country", country);
  add("city", row.city?.trim() || null);
  add("website", webDomainOf(row.website));
  add("sector", row.sector?.trim() || null);
  add("contact_public_email", email);
  add("contact_public_phone", phone);
  add("registration_code", registrationCode);
  add("vat", vat);
  for (const c of classes) add("market_role", c);
  add("demand_signal", row.demandSignal?.trim() || null);

  return {
    ref: (row.ref?.trim() || `row-${index + 1}`).slice(0, 40),
    displayName,
    legalName: row.legalName?.trim() || null,
    country,
    registrationCode,
    vat,
    webDomain,
    nameKey: nameKey(row.legalName?.trim() || displayName),
    roles: classes.map((c) => CLASS_TO_ROLE[c]),
    classes,
    facts,
    problems,
  };
}

export type BatchVerdict =
  | { kind: "invalid"; problems: readonly string[] }
  | { kind: "duplicate_in_batch"; of: string }
  | { kind: "possible_duplicate_in_batch"; of: string }
  | { kind: "candidate" };

/** Dedupe INSIDE the batch: a strong key seen earlier is a duplicate; the
 *  same weak name key + country is only a possible duplicate. */
export function dedupeBatch(rows: readonly NormalizedCompany[]): BatchVerdict[] {
  const strong = new Map<string, string>();
  const weak = new Map<string, string>();
  return rows.map((r) => {
    if (r.problems.length > 0) return { kind: "invalid", problems: r.problems };
    const keys = [
      r.registrationCode ? `reg:${r.country ?? ""}:${r.registrationCode}` : null,
      r.vat ? `vat:${r.vat}` : null,
      r.webDomain ? `dom:${r.webDomain}` : null,
    ].filter((k): k is string => k !== null);
    const hit = keys.map((k) => strong.get(k)).find((v) => v !== undefined);
    if (hit) return { kind: "duplicate_in_batch", of: hit };
    for (const k of keys) strong.set(k, r.ref);
    const wk = `${r.country ?? ""}:${r.nameKey}`;
    const weakHit = weak.get(wk);
    if (weakHit && keys.length === 0) return { kind: "possible_duplicate_in_batch", of: weakHit };
    if (!weak.has(wk)) weak.set(wk, r.ref);
    return { kind: "candidate" };
  });
}

/** The row shape the database function takes. */
export function toRpcRow(r: NormalizedCompany): Record<string, unknown> {
  return {
    ref: r.ref,
    display_name: r.displayName,
    legal_name: r.legalName,
    country: r.country,
    registration_code: r.registrationCode,
    vat: r.vat,
    web_domain: r.webDomain,
    name_key: r.nameKey,
    roles: r.roles,
    facts: r.facts,
  };
}
