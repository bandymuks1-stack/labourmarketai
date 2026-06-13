/**
 * Step 2/6 guard — the CV professional summary is honest + empty-tolerant.
 *
 * The worker's self-written `profile_text` is surfaced on the print CV as a
 * "Professional summary". It must be: self-declared (never rendered as
 * verified/confirmed), omitted when empty (a new/empty profile must not break
 * the CV), and localized en/lt/ru. The rest of the worker profile / player-card
 * / CV layer already exists — this only closes the missing-summary gap.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf-8");

const builder = read("lib/cv-export/verified-cv.ts");
const page = read("app/[locale]/cv/page.tsx");

describe("CV professional summary — sourced from the worker's own profile_text", () => {
  it("the CV builder reads profile_text and exposes a self-declared summary", () => {
    expect(builder).toMatch(/select\("full_name, email, profile_text"\)/);
    expect(builder).toMatch(/professionalSummary/);
    // Trimmed to null when empty — an empty profile yields no summary.
    expect(builder).toMatch(/profile_text[\s\S]*\.trim\(\) \|\| null/);
  });

  it("the CV page renders the summary ONLY when present (empty-tolerant)", () => {
    expect(page).toMatch(/cv\.professionalSummary \?/);
    expect(page).toContain('data-testid="cv-summary-section"');
  });

  it("the summary is NOT presented as verified/confirmed (no fake state)", () => {
    // The summary's own rendered markup (testid → its closing </section>)
    // carries no verified/confirmed badge — it's plain self-declared text.
    const start = page.indexOf('data-testid="cv-summary-section"');
    const block = page.slice(start, page.indexOf("</section>", start));
    expect(block).not.toMatch(/verified|confirmed|✓/i);
    expect(block).toContain("cv.professionalSummary");
  });
});

describe("summary title localized for active locales (en/lt/ru)", () => {
  for (const locale of ["en", "lt", "ru"] as const) {
    it(`${locale}: cvExport.summaryTitle exists`, () => {
      const j = JSON.parse(read(`messages/${locale}.json`));
      expect(typeof j.cvExport.summaryTitle).toBe("string");
      expect(j.cvExport.summaryTitle.length).toBeGreaterThan(0);
    });
  }
});
