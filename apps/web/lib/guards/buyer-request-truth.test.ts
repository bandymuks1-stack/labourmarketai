import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Consolidated truth guards for the whole buyer-request surface
 * (long-cycle-2 plan PR I). One place that fails loudly if the surface
 * drifts back toward fake AI / OCR / extraction / verification, or grows
 * competing CTAs. Intentionally coarse + stable — it pins invariants,
 * not implementation detail.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

// ── 1. No AI / OCR / PDF provider packages in buyer request code ────────

describe("no AI/OCR/PDF provider packages in buyer request code", () => {
  const BANNED_IMPORT = [
    /from\s+["']openai["']/i,
    /from\s+["']@anthropic[^"']*["']/i,
    /from\s+["']tesseract[^"']*["']/i,
    /from\s+["']pdf-parse["']/i,
    /from\s+["']pdfjs[^"']*["']/i,
    /from\s+["']sharp["']/i,
    /from\s+["']@google-cloud\/vision["']/i,
  ];

  // Every buyer lib module + the two request components.
  const buyerLibDir = join(APP_ROOT, "lib", "buyer");
  const buyerLibFiles = readdirSync(buyerLibDir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join("lib", "buyer", f));
  const files = [
    ...buyerLibFiles,
    "components/app/buyer-requests-section.tsx",
    "components/app/buyer-request-attachment-uploader.tsx",
    "app/[locale]/dashboard/admin/page.tsx",
  ];

  it("scans a non-empty set of files", () => {
    expect(buyerLibFiles.length).toBeGreaterThan(3);
  });

  for (const rel of files) {
    it(`${rel} imports no AI/OCR/PDF provider`, () => {
      const src = read(rel);
      for (const re of BANNED_IMPORT) {
        expect(re.test(src), `${rel} must not import ${re}`).toBe(false);
      }
    });
  }
});

// ── 2. Extraction readiness state stays "not_enabled" ───────────────────

describe("extraction readiness never claims it is active", () => {
  it("EXTRACTION_STATE remains not_enabled, no completed/extracted state", () => {
    const src = read("lib/buyer/attachment-readiness.ts");
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(codeOnly).toContain('"not_enabled"');
    expect(codeOnly).not.toMatch(/"completed"|"extracted"|"done"/);
  });
});

// ── 3. Buyer card exposes exactly ONE next-action CTA ───────────────────

describe("buyer card has one next action, not competing CTAs", () => {
  const src = read("components/app/buyer-requests-section.tsx");

  it("renders a single next-action block per request", () => {
    const hits = src.match(/buyer-request-next-action-/g) ?? [];
    // One literal in the map → one rendered block per request.
    expect(hits.length).toBe(1);
  });

  it("the next-action block is guidance text, not a button or link", () => {
    // Grab the next-action <div> ... </div> and assert no interactive
    // element lives inside it (the only buttons on the card belong to the
    // file uploader: add / remove).
    const start = src.indexOf("buyer-request-next-action-");
    expect(start).toBeGreaterThan(0);
    const slice = src.slice(start, start + 600);
    expect(slice).not.toMatch(/<button|<Link\b|<a\b/);
  });
});

// ── 4. Buyer + admin request copy carries no forbidden claims ───────────

describe("no forbidden product claims in buyer/admin request copy", () => {
  const FORBIDDEN = [
    "ai understood",
    "ai suprato",
    "automatically verified",
    "automatiškai patikrinta",
    "verified",
    "patvirtinta",
    "garantuotai tinkamiausias",
    "best match",
    "guaranteed candidate",
    "automatic offer",
  ];

  for (const locale of ["lt", "en"] as const) {
    it(`${locale}: understanding + admin.requestReview copy is clean`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const understanding = (
        (
          (json.roleDashboards as Record<string, unknown>).buyer as Record<
            string,
            unknown
          >
        ).requests as Record<string, unknown>
      ).understanding;
      const requestReview = (json.admin as Record<string, unknown>)
        .requestReview;
      const flat = (
        JSON.stringify(understanding) + JSON.stringify(requestReview)
      ).toLowerCase();
      for (const phrase of FORBIDDEN) {
        expect(
          flat.includes(phrase),
          `${locale} buyer/admin request copy must not contain "${phrase}"`,
        ).toBe(false);
      }
    });
  }
});

// ── 5. Admin review priority + readiness helpers stay deterministic ─────

describe("buyer request helpers stay pure + deterministic", () => {
  const PURE_HELPERS = [
    "lib/buyer/request-readiness.ts",
    "lib/buyer/request-completion.ts",
    "lib/buyer/request-timeline.ts",
    "lib/buyer/admin-review-priority.ts",
    "lib/buyer/attachment-readiness.ts",
  ];
  for (const rel of PURE_HELPERS) {
    it(`${rel} has no clock / randomness / network / IO`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/import\s+["']server-only["']/);
      expect(src).not.toMatch(
        /Date\.now|new Date\(|Math\.random|fetch\(|createClient|node:fs|readFile/,
      );
    });
  }
});
