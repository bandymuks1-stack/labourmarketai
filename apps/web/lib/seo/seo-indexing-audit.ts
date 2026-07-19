/**
 * Public SEO indexing audit — pure invariant checker shared by the
 * CLI guard (`pnpm -F web check:public-seo-indexing`) and the CI
 * vitest guard (lib/guards/public-seo-indexing.test.ts).
 *
 * It locks the foundation laid in fix/public-seo-indexing-foundation-v1:
 *   - the public canonical is the apex labourmarket.ai (NOT the app
 *     subdomain, localhost, or a preview/vercel host);
 *   - the apex serves content and www → apex (redirect rule present);
 *   - robots blocks the app / internal zones but allows the public root;
 *   - the old / confused "Labma — Construction OS" brand is not a public
 *     title/meta signal;
 *   - the SEO copy carries no fabricated user/client/match claims.
 *
 * PURE: takes an injected file reader so it has no fs/net of its own.
 */

/** Files the audit needs to read (paths relative to apps/web). */
export const SEO_AUDIT_FILES = [
  "lib/domain/canonical.ts",
  "lib/seo/metadata.ts",
  "app/robots.ts",
  "app/sitemap.ts",
  "middleware.ts",
  "app/[locale]/layout.tsx",
] as const;

export type SeoFileReader = (relPath: string) => string | null;

/** Hosts that must never appear as a canonical / sitemap / robots origin. */
const FORBIDDEN_ORIGINS = [
  "http://localhost",
  "https://localhost",
  "app.labourmarket.ai", // app host is not the public canonical
  ".vercel.app", // preview + managed alias are not public canonicals
];

/** Old / confused brand signals banned from the public SEO surface. */
const BANNED_BRAND = [
  /labma\s*[—–-]\s*construction\s*os/i,
  /\bconstruction\s+os\b/i,
  /\blabma\s+os\b/i,
];

/**
 * Construction-FIRST brand signals banned (owner 2026-06-15): LabourMarket.ai
 * is a cross-sector labour-market platform — construction is one sector among
 * many, never the brand centre. A brand title line `"LabourMarket.ai — …
 * construction…"` (any active locale) re-narrows the whole platform to one
 * sector and fails here. Construction is still allowed as ONE example among
 * several in page-level copy (e.g. "logistics, manufacturing, … construction").
 */
const CONSTRUCTION_FIRST_BRAND = [
  /"LabourMarket\.ai\s*[—–-][^"]*\b(construction|statyb\w*|строит\w*|стройк\w*)/i,
];

/** Fabricated-traction phrases banned from public SEO copy. */
const FAKE_CLAIMS = [
  /thousands of (workers|companies|employers|clients|users|teams)/i,
  /guaranteed (match|matches|job|jobs|placement|work|results?)/i,
  /\btūkstanči\w*\s+(darbuotoj|įmoni|klient)/i,
  /garantuot\w*\s+(darb|atitik|rezultat)/i,
  /тысячи\s+(работник|компани|клиент)/i,
  /гаранти\w*\s+(работ|подбор|результат)/i,
];

function add(violations: string[], file: string, msg: string): void {
  violations.push(`${file}: ${msg}`);
}

export function auditPublicSeoIndexing(read: SeoFileReader): {
  violations: string[];
} {
  const violations: string[] = [];

  // Read all required files; a missing file is itself a violation.
  const files: Record<string, string> = {};
  for (const rel of SEO_AUDIT_FILES) {
    const content = read(rel);
    if (content == null) {
      add(violations, rel, "required SEO file is missing");
      continue;
    }
    files[rel] = content;
  }

  // 1. Canonical host = apex labourmarket.ai — the ONLY product origin
  //    (single-domain policy 2026-07-19).
  const canonical = files["lib/domain/canonical.ts"];
  if (canonical) {
    if (!/CANONICAL_HOST\s*=\s*"labourmarket\.ai"/.test(canonical)) {
      add(
        violations,
        "lib/domain/canonical.ts",
        'CANONICAL_HOST must be exactly "labourmarket.ai" (apex)',
      );
    }
    if (/CANONICAL_HOST\s*=\s*"(app|www)\.labourmarket\.ai"/.test(canonical)) {
      add(
        violations,
        "lib/domain/canonical.ts",
        "a subdomain must never be the canonical product host",
      );
    }
    if (!/LEGACY_APP_HOST\s*=\s*"app\.labourmarket\.ai"/.test(canonical)) {
      add(
        violations,
        "lib/domain/canonical.ts",
        "LEGACY_APP_HOST must be defined so the app alias stays a redirect",
      );
    }
    if (!/WWW_HOST\s*=\s*"www\.labourmarket\.ai"/.test(canonical)) {
      add(violations, "lib/domain/canonical.ts", "WWW_HOST must be defined for the www→apex redirect");
    }
    // The split-domain CTA upgrade must stay removed.
    if (/preferAppHostHref/.test(canonical)) {
      add(
        violations,
        "lib/domain/canonical.ts",
        "preferAppHostHref (split-domain auth CTA upgrade) must not be reintroduced",
      );
    }
  }

  // 2. Legacy-alias (www + app) → apex redirect rule present in middleware.
  const mw = files["middleware.ts"];
  if (mw) {
    if (!/isLegacyRedirectHost/.test(mw) || !/CANONICAL_ORIGIN/.test(mw)) {
      add(
        violations,
        "middleware.ts",
        "must implement the legacy-host→apex redirect via isLegacyRedirectHost + CANONICAL_ORIGIN",
      );
    }
    // The apex must never redirect to a subdomain.
    if (/redirect[^\n]*"https:\/\/(app|www)\.labourmarket\.ai/i.test(mw)) {
      add(violations, "middleware.ts", "must not redirect to a subdomain");
    }
  }

  // 3. metadataBase must be the apex public origin.
  const layout = files["app/[locale]/layout.tsx"];
  if (layout) {
    if (!/metadataBase[^\n]*MARKETING_ORIGIN/.test(layout)) {
      add(
        violations,
        "app/[locale]/layout.tsx",
        "metadataBase must be the apex MARKETING_ORIGIN",
      );
    }
  }

  // 4. robots: blocks app + internal, allows public root, apex sitemap.
  const robots = files["app/robots.ts"];
  if (robots) {
    if (!/sitemap[^\n]*MARKETING_ORIGIN/.test(robots)) {
      add(violations, "app/robots.ts", "sitemap URL must use the apex MARKETING_ORIGIN");
    }
    for (const must of ["/*/dashboard", "/*/auth"]) {
      if (!robots.includes(must)) {
        add(violations, "app/robots.ts", `must disallow ${must}`);
      }
    }
    if (!/allow:\s*"\/"/.test(robots)) {
      add(violations, "app/robots.ts", 'must allow the public root ("/")');
    }
  }

  // 5. No forbidden origins literal in robots / sitemap.
  for (const rel of ["app/robots.ts", "app/sitemap.ts"]) {
    const c = files[rel];
    if (!c) continue;
    for (const bad of FORBIDDEN_ORIGINS) {
      if (c.includes(bad)) {
        add(violations, rel, `must not reference "${bad}" as a public origin`);
      }
    }
  }

  // 6. No banned brand signal + no construction-FIRST brand title in the
  //    public SEO metadata layer.
  for (const rel of ["app/[locale]/layout.tsx", "lib/seo/metadata.ts"]) {
    const c = files[rel];
    if (!c) continue;
    for (const re of BANNED_BRAND) {
      if (re.test(c)) {
        add(violations, rel, `banned legacy brand signal matched ${re}`);
      }
    }
    for (const re of CONSTRUCTION_FIRST_BRAND) {
      if (re.test(c)) {
        add(
          violations,
          rel,
          `construction-first brand title matched ${re} — LabourMarket.ai is cross-sector; construction is one example, not the brand centre`,
        );
      }
    }
  }

  // 7. No fake-traction claims in the SEO copy.
  const seo = files["lib/seo/metadata.ts"];
  if (seo) {
    for (const re of FAKE_CLAIMS) {
      if (re.test(seo)) {
        add(violations, "lib/seo/metadata.ts", `fake-traction claim matched ${re}`);
      }
    }
  }

  return { violations };
}
