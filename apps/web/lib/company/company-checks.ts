/**
 * Automated, honest company checks — the AUTOMATIC-FIRST layer.
 *
 * These are basic shape/presence checks on what the user provided. They are
 * NOT a registry/official verification (we do not claim that — no real registry
 * API is connected). The derived status mirrors save_company_setup
 * (20260604140000) so the UI can preview the same outcome the DB will persist:
 *   - all required present + provided fields well-formed → "active_unverified"
 *     (usable now, just not identity-verified);
 *   - any failure → "needs_checks" (still usable, flagged to fix).
 *
 * `verified` is never produced here — it is a stronger trust state set only by
 * an admin / a real registry path.
 */

export type CompanyCheckKey =
  | "name"
  | "country"
  | "registrationCode"
  | "website"
  | "contactEmail"
  | "requesterRole"
  | "domainEmailConsistency";

export type CompanyCheckOutcome = "pass" | "warn" | "skipped";

export interface CompanyCheckResult {
  readonly key: CompanyCheckKey;
  /** Did this check pass, warn (provided-but-malformed / missing required), or
   *  is it skipped (optional + not provided)? */
  readonly outcome: CompanyCheckOutcome;
}

export interface CompanyCheckInput {
  readonly legalName?: string | null;
  readonly country?: string | null;
  readonly registrationCode?: string | null;
  readonly website?: string | null;
  readonly contactEmail?: string | null;
  readonly requesterRole?: string | null;
}

// Mirror the SQL regexes (case-insensitive).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/i;
const WEBSITE_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i;
const REGCODE_RE = /^[a-z0-9 ._/-]{3,40}$/i;

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : null;
}

function websiteHost(website: string): string | null {
  const m = website
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  return m.length > 0 ? m.replace(/^www\./, "") : null;
}

/**
 * Run the automated checks. `requiredOnly` failures (name, country) and
 * malformed provided fields produce "warn"; optional+absent fields are
 * "skipped". Order is stable for display.
 */
export function runCompanyChecks(input: CompanyCheckInput): CompanyCheckResult[] {
  const name = clean(input.legalName);
  const country = clean(input.country);
  const reg = clean(input.registrationCode);
  const site = clean(input.website);
  const email = clean(input.contactEmail);
  const role = clean(input.requesterRole);

  const results: CompanyCheckResult[] = [
    { key: "name", outcome: name ? "pass" : "warn" },
    { key: "country", outcome: country ? "pass" : "warn" },
    {
      key: "registrationCode",
      outcome: !reg ? "skipped" : REGCODE_RE.test(reg) ? "pass" : "warn",
    },
    {
      key: "website",
      outcome: !site ? "skipped" : WEBSITE_RE.test(site) ? "pass" : "warn",
    },
    {
      key: "contactEmail",
      outcome: !email ? "skipped" : EMAIL_RE.test(email) ? "pass" : "warn",
    },
    { key: "requesterRole", outcome: role ? "pass" : "skipped" },
  ];

  // Optional consistency: if BOTH email + website are provided and well-formed,
  // do their domains line up? A mismatch is a soft warn, never a hard block.
  if (email && site && EMAIL_RE.test(email) && WEBSITE_RE.test(site)) {
    const ed = emailDomain(email);
    const wh = websiteHost(site);
    const consistent = !!ed && !!wh && (ed === wh || ed.endsWith(`.${wh}`) || wh.endsWith(`.${ed}`));
    results.push({ key: "domainEmailConsistency", outcome: consistent ? "pass" : "warn" });
  } else {
    results.push({ key: "domainEmailConsistency", outcome: "skipped" });
  }

  return results;
}

/**
 * Derived automatic status — matches save_company_setup. A failed REQUIRED
 * check (name/country) or a malformed PROVIDED field → "needs_checks";
 * otherwise "active_unverified". The optional domain/email consistency is a
 * soft signal only and never forces "needs_checks".
 */
export function deriveAutomaticStatus(
  input: CompanyCheckInput,
): "active_unverified" | "needs_checks" {
  const results = runCompanyChecks(input);
  const blocking = new Set<CompanyCheckKey>([
    "name",
    "country",
    "registrationCode",
    "website",
    "contactEmail",
  ]);
  const failed = results.some((r) => blocking.has(r.key) && r.outcome === "warn");
  return failed ? "needs_checks" : "active_unverified";
}
