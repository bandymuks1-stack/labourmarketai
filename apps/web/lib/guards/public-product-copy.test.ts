import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: PUBLIC product-content is honest and not roadmap/early-stage framing.
 *
 * Owner correction (2026-06-16): this is a PRODUCT-CONTENT contract, not LT-only.
 * Across LT/EN/RU, public-facing copy must NOT carry:
 *  - work-abroad-ONLY positioning (the product covers local AND international);
 *  - SAMPLE / TEMP / demo placeholder framing;
 *  - roadmap / early-platform language ("will work", "kaip tai veiks",
 *    "how this/it will work", "coming soon", "planned", "numatoma",
 *    "early platform / ankstyva platforma / early-stage", "plečiama");
 *  - internal milestone codes M0–M9;
 *  - owner/lawyer review process notes.
 *
 * Scope = the namespaces actually rendered on the public marketing routes /
 * landing (NOT the authenticated dashboard, where an honest "Ruošiama" status is
 * doctrine-allowed, and NOT the gated /vision system-map). The statistical word
 * "sample" (e.g. "small sample (n<5)") is NOT banned — only placeholder markers
 * (uppercase SAMPLE / "(sample)" / "sample data") are.
 *
 * Static, secret-free, no-DB. Runs in CI via `pnpm -F web test`.
 */

const ROOT = join(__dirname, "..", "..");
const ACTIVE = ["lt", "en", "ru"] as const;
const load = (loc: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, "messages", `${loc}.json`), "utf8"));

/** Top-level namespaces rendered on public marketing routes (components/marketing
 *  + app/[locale]/(marketing) + the public site footer). Dual-use namespaces that
 *  also render inside the authenticated app (companyNeed, workerIntake, common,
 *  legal) and the gated /vision honesty map are intentionally out of scope. */
const PUBLIC_NAMESPACES = [
  "hero",
  "footer",
  "shared",
  "draft",
  "playercards",
  "live",
  "pricing",
  "planBoundary",
  "waitlist",
  "billingStatus",
  "journey",
  "labourMarket",
  "marketPulse",
  "workAbroad",
  "pages",
  "matchPreview",
  "services",
  "benefitCards",
  "ctaBand",
] as const;

// Banned public-copy patterns. Milestone codes are unambiguous; the roadmap/
// early-stage phrases are the owner's explicit list; placeholder markers are the
// uppercase/parenthesised forms (never the statistical word "sample").
const BANNED =
  /\bM[0-9]\b|coming soon|\bplanned\b|will work|kaip tai veiks|how (?:this|it) will work|будет работать|early platform|ankstyva platform|early-stage|ankstyvame etape|раннем этапе|\bplečiam|numatoma|owner review|lawyer review|teisininko per|savininko per|\bSAMPLE\b|\(sample\)|sample data|\bTEMP\b|\bdemo\b/i;

function leaves(node: unknown, prefix: string, out: [string, string][]): void {
  if (typeof node === "string") out.push([prefix, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => leaves(v, `${prefix}[${i}]`, out));
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node as Record<string, unknown>))
      leaves(v, prefix ? `${prefix}.${k}` : k, out);
}

describe("public product copy carries no roadmap / early-stage / placeholder framing", () => {
  for (const loc of ACTIVE) {
    it(`${loc}: public namespaces are clean`, () => {
      const m = load(loc);
      const offenders: string[] = [];
      for (const ns of PUBLIC_NAMESPACES) {
        if (!(ns in m)) continue;
        const out: [string, string][] = [];
        leaves(m[ns], ns, out);
        for (const [k, v] of out) if (BANNED.test(v)) offenders.push(`${k}: "${v}"`);
      }
      expect(
        offenders,
        `${loc} public copy has banned roadmap/placeholder framing:\n${offenders.join("\n")}`,
      ).toEqual([]);
    });
  }
});

describe("public positioning is local AND international (not work-abroad-only)", () => {
  const NEEDS: Record<string, RegExp[]> = {
    en: [/local/i, /international/i],
    lt: [/vietin/i, /tarptautin/i],
    ru: [/местн/i, /международн/i],
  };
  for (const loc of ACTIVE) {
    it(`${loc}: hero frames both local and international work`, () => {
      const hero = (load(loc).hero ?? {}) as Record<string, string>;
      const text = `${hero.headline ?? ""} ${hero.headlineAccent ?? ""} ${hero.subcopy ?? ""}`;
      for (const re of NEEDS[loc]) {
        expect(re.test(text), `${loc} hero must mention ${re} (not abroad-only): "${text}"`).toBe(true);
      }
    });
  }
});

describe("footer is clean (no early-platform stamp; Rexora credit kept)", () => {
  for (const loc of ACTIVE) {
    it(`${loc}: footer has the Rexora credit and no 'preview'/early-platform key`, () => {
      const footer = (load(loc).footer ?? {}) as Record<string, string>;
      expect(footer.rexora, `${loc} footer.rexora must stay`).toMatch(/Rexora/);
      expect(footer.preview, `${loc} footer.preview early-platform stamp must be gone`).toBeUndefined();
    });
  }
});
