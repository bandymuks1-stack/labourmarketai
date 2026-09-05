import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Company home (P5/C1 subset, #1532) — HONESTY pins from the read-only QA of
 * 2026-09-05 (Q-2): a FAILED read of the opening brief must render a NAMED
 * unavailable state, never the calm "all clear" that a genuinely empty brief
 * earns (doctrine §18.1 / §7). Structural pins on the composition and the
 * section; the pure model has its own tests.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const FIELD = read("lib/company/company-home-field.ts");
const SECTION = read("components/app/company-home-field-section.tsx");

describe("company home — a failed brief is unavailable, not all clear", () => {
  it("the attention read degrades to `unavailable`, never to `none`", () => {
    expect(FIELD).toContain('loadEmployerOpeningBrief().catch((): { kind: "unavailable" } => ({ kind: "unavailable" }))');
    expect(FIELD).not.toMatch(/\.catch\([^
]*\{ kind: "none" \}/);
    expect(FIELD).toMatch(/readonly attention: OpeningBrief \| \{ readonly kind: "unavailable" \}/);
  });
  it("the section renders the unavailable branch before the all-clear branch", () => {
    const unavailable = SECTION.indexOf('field.attention.kind === "unavailable"');
    const none = SECTION.indexOf('data-testid="company-home-attention-none"');
    expect(unavailable).toBeGreaterThan(-1);
    expect(none).toBeGreaterThan(unavailable);
    expect(SECTION).toContain('data-testid="company-home-attention-unavailable"');
    expect(SECTION).toContain('t("attention.unavailable")');
  });
  it("the unavailable copy exists in every locale that carries companyHome and differs from the all-clear copy", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de", "da", "et", "lv", "no", "pl", "sv"]) {
      const m = JSON.parse(read(`messages/${locale}.json`)) as { companyHome: { attention: Record<string, string> } };
      expect(typeof m.companyHome.attention.unavailable).toBe("string");
      expect(m.companyHome.attention.unavailable).not.toBe(m.companyHome.attention.none);
    }
  });
});
