import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guards for the Buyer Request Understanding Center v1.
 *
 * Doctrine pinned here:
 *   1. Readiness is a PURE helper (no server-only, no clock, no
 *      network, no randomness) so it stays deterministic + testable.
 *   2. The buyer dashboard wires the helper through the existing
 *      requests section (one integrated flow — not a parallel CTA).
 *   3. The new LT + EN copy is honest: no fake AI / OCR / verification
 *      phrases. Every readiness status + next action resolves in both
 *      locales.
 *   4. The admin project-truth page declares the workflow honestly
 *      (Level 1 real, deterministic/manual-review only, no OCR, no AI
 *      extraction, no automatic verification).
 */

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

// Phrases the spec forbids anywhere in this surface's copy.
const FORBIDDEN = [
  "ai suprato",
  "automatiškai patikrinta",
  "garantuotai tinkamiausias",
  "patvirtinta",
  "verified",
  "automatically verified",
  "ai understood",
];

describe("Guard: request-readiness helper is pure + deterministic", () => {
  const src = read("lib/buyer/request-readiness.ts");

  it("is NOT server-only (must run in the client section component)", () => {
    expect(src).not.toMatch(/import\s+["']server-only["']/);
  });

  it("has no clock / network / randomness (deterministic)", () => {
    expect(src).not.toMatch(/Date\.now|new Date\(|Math\.random/);
    expect(src).not.toMatch(/\bfetch\(|supabase|createClient/);
  });

  it("exports the four readiness statuses + three next actions", () => {
    for (const s of [
      "no_files",
      "files_added",
      "enough_for_manual_review",
      "needs_more_info",
    ]) {
      expect(src).toContain(`"${s}"`);
    }
    for (const a of [
      "add_first_file",
      "add_more_project_details",
      "administrator_will_review",
    ]) {
      expect(src).toContain(`"${a}"`);
    }
  });
});

describe("Guard: buyer surface wires the helper through the existing flow", () => {
  it("requests section imports + calls computeRequestReadiness", () => {
    const src = read("components/app/buyer-requests-section.tsx");
    expect(src).toMatch(
      /from\s+["']@\/lib\/buyer\/request-readiness["']/,
    );
    expect(src).toMatch(/computeRequestReadiness\(/);
    // Single integrated panel — readiness + next action live inside the
    // per-request row, not a separate parallel widget/CTA.
    expect(src).toMatch(/data-testid=\{`buyer-request-next-action-\$\{r\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`buyer-request-readiness-\$\{r\.id\}`\}/);
  });

  it("buyer page threads the understanding labels (no second section)", () => {
    const src = read("app/[locale]/dashboard/buyer/page.tsx");
    expect(src).toMatch(
      /getTranslations\(\s*["']roleDashboards\.buyer\.requests\.understanding["']/,
    );
    expect(src).toMatch(/understanding:\s*\{/);
    // Only one BuyerRequestsSection mount (integrated, not duplicated).
    const mounts = src.match(/<BuyerRequestsSection\b/g) ?? [];
    expect(mounts.length).toBe(1);
  });

  it("request status is shown via a localized label, not the raw DB value", () => {
    // Clarity guard (PR A): a buyer must not see raw technical wording like
    // `draft` / `in_review`. The section maps the status through the
    // localized requestStatus dictionary.
    const src = read("components/app/buyer-requests-section.tsx");
    expect(src).toMatch(/u\.requestStatus\[r\.status\]/);
    // The long description must be clamped so a request cannot render a
    // giant dense text block.
    expect(src).toMatch(/line-clamp-3/);
    // Visual status rail (PR D) is keyed to the same readiness state as
    // the chip — a scannable colour anchor, behaviour unchanged.
    expect(src).toMatch(/READINESS_RAIL_CLASS\[readiness\.status\]/);
  });
});

describe("Guard: understanding copy is honest (LT + EN)", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale}.json understanding keys present + no fake AI/OCR/verification copy`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      // Navigate to roleDashboards.buyer.requests.understanding.
      const u = (
        (
          (
            (json.roleDashboards as Record<string, unknown>).buyer as Record<
              string,
              unknown
            >
          ).requests as Record<string, unknown>
        ).understanding as Record<string, unknown>
      );
      expect(u, `${locale} understanding namespace missing`).toBeTruthy();

      const readinessStatus = u.readinessStatus as Record<string, string>;
      const nextAction = u.nextAction as Record<string, string>;
      for (const s of [
        "no_files",
        "files_added",
        "enough_for_manual_review",
        "needs_more_info",
      ]) {
        expect(
          readinessStatus[s],
          `${locale} readinessStatus.${s}`,
        ).toBeTruthy();
      }
      for (const a of [
        "add_first_file",
        "add_more_project_details",
        "administrator_will_review",
      ]) {
        expect(nextAction[a], `${locale} nextAction.${a}`).toBeTruthy();
      }
      const requestStatus = u.requestStatus as Record<string, string>;
      for (const s of [
        "draft",
        "submitted",
        "in_review",
        "needs_followup",
        "approved",
        "closed",
      ]) {
        expect(requestStatus[s], `${locale} requestStatus.${s}`).toBeTruthy();
      }
      for (const key of [
        "panelHeading",
        "labelStatus",
        "labelCreated",
        "labelDescription",
        "noDescription",
        "readinessHeading",
        "honestMessage",
        "nextActionHeading",
        "filesHeading",
        "analysisStatusLabel",
        "analysisNotStarted",
        "fileReviewChip",
      ]) {
        expect(u[key], `${locale} understanding.${key}`).toBeTruthy();
      }

      // Honesty: no forbidden fake phrases.
      const flat = JSON.stringify(u).toLowerCase();
      for (const phrase of FORBIDDEN) {
        expect(
          flat.includes(phrase),
          `${locale} understanding copy must not contain "${phrase}"`,
        ).toBe(false);
      }

      // The honest message must say automatic reading is NOT enabled and
      // a human reviews manually.
      const honest = (u.honestMessage as string).toLowerCase();
      if (locale === "lt") {
        expect(honest).toMatch(/administratorius|rankiniu/);
      } else {
        expect(honest).toMatch(/administrator|manual/);
      }
    });
  }
});

describe("Guard: admin project-truth declares the workflow honestly", () => {
  const src = read("app/[locale]/dashboard/admin/project-truth/page.tsx");

  it("keeps the Level 1 attachments truth row", () => {
    expect(src).toMatch(/id:\s*"buyer-attachments"/);
  });

  it("adds the Request Understanding Center truth row with honest scope", () => {
    expect(src).toMatch(/id:\s*"buyer-request-understanding"/);
    // Pin the honest scope statements required by the spec.
    expect(src).toMatch(/manual-review/i);
    expect(src).toMatch(/No OCR yet/i);
    expect(src).toMatch(/No AI text extraction yet/i);
    expect(src).toMatch(/No automatic verification/i);
    expect(src).toMatch(/request-readiness/);
  });
});
