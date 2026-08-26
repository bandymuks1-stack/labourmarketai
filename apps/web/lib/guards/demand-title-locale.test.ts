import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  resolveDemandTitle,
  sanitizeDemandTitle,
  syntheticDemandTitleKey,
} from "@/lib/demand/sanitize-demand-title";

/**
 * §23 + §39 — the product must not show a stored ENGLISH placeholder title to
 * a user reading in another language.
 *
 * Production really holds "Hiring workers — demand" on live rows: the write
 * path stamps that label when an employer submits a need without naming the
 * role. The row is read by people in every supported locale, so the stored
 * string cannot be right for all of them — it is a PLACEHOLDER, and the
 * display layer owns it. These tests pin that contract from both ends:
 * a synthetic title localizes, and a title the employer actually typed never
 * does.
 */
describe("demand title is localized only when it is synthetic", () => {
  it("recognizes the exact strings production stores", () => {
    expect(syntheticDemandTitleKey("Hiring workers — demand")).toBe(
      "hiringWorkers",
    );
    expect(syntheticDemandTitleKey("Agency partnership — offer")).toBe(
      "agencyPartnership",
    );
  });

  it("recognizes the legacy pilot titles through the sanitizer", () => {
    // sanitizeDemandTitle maps these forward; the key must follow.
    expect(sanitizeDemandTitle("Pilot request — hiring workers")).toBe(
      "Hiring workers — demand",
    );
    expect(syntheticDemandTitleKey("Pilot request — hiring workers")).toBe(
      "hiringWorkers",
    );
  });

  it("renders the caller's localized label for a synthetic title", () => {
    expect(
      resolveDemandTitle("Hiring workers — demand", {
        hiringWorkers: "Ieškoma darbuotojų",
        agencyPartnership: "Partnerystės pasiūlymas",
      }),
    ).toBe("Ieškoma darbuotojų");
  });

  it("NEVER rewrites a title the employer actually typed", () => {
    const real = "Klinkerio specialistai";
    expect(syntheticDemandTitleKey(real)).toBeNull();
    expect(
      resolveDemandTitle(real, {
        hiringWorkers: "Ieškoma darbuotojų",
        agencyPartnership: "Partnerystės pasiūlymas",
      }),
    ).toBe(real);
  });

  it("degrades to the stored string when no labels are supplied", () => {
    // Additive contract: an un-migrated caller keeps the old behaviour.
    expect(resolveDemandTitle("Hiring workers — demand")).toBe(
      "Hiring workers — demand",
    );
    expect(resolveDemandTitle(null)).toBe("");
  });

  it("carries the label in every supported locale", () => {
    const dir = path.join(process.cwd(), "messages");
    const locales = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
    expect(locales.length).toBeGreaterThan(1);
    for (const loc of locales) {
      const msgs = JSON.parse(
        fs.readFileSync(path.join(dir, `${loc}.json`), "utf-8"),
      );
      const node = msgs?.demandReadback?.syntheticTitle;
      expect(node, `${loc}: demandReadback.syntheticTitle missing`).toBeTruthy();
      for (const key of ["hiringWorkers", "agencyPartnership"]) {
        const v = node[key];
        expect(typeof v, `${loc}.${key} type`).toBe("string");
        expect(v.trim().length, `${loc}.${key} empty`).toBeGreaterThan(0);
      }
      // The non-English locales must not simply echo the English placeholder.
      if (loc !== "en") {
        expect(
          node.hiringWorkers.toLowerCase(),
          `${loc} still shows the English placeholder`,
        ).not.toContain("hiring workers");
      }
    }
  });
});

describe("every surface that shows a stored demand title uses the seam", () => {
  /**
   * The first pass covered the two read-back surfaces and MISSED scouting —
   * the screen the employer is on when they actually answer somebody. It was
   * rendering `{d.title}` straight from the row, so the English synthetic
   * title showed there too, and its data layer had hardcoded `?? "—"`: an
   * internal placeholder chosen inside a query.
   */
  const read = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), "utf-8");

  it("the scouting demand list resolves the title", () => {
    const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
    expect(page).toMatch(/resolveDemandTitle\(d\.title, demandTitleLabels\)/);
    // Never the bare stored value.
    expect(page).not.toMatch(/\{d\.title\}/);
  });

  it("the scouting data layer picks no display string", () => {
    const src = read("lib/scouting/scouting.ts");
    expect(src).not.toMatch(/title: r\.title \?\? "—"/);
    expect(src).toMatch(/title: r\.title \?\? ""/);
  });

  it("an empty title falls back to a localized label, never a dash", () => {
    const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
    expect(page).toMatch(/tDemandReadback\("untitledInquiry"\)/);
  });

  it("untitledInquiry ships in every catalogue file", () => {
    const dir = path.join(process.cwd(), "messages");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const msgs = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      const v = msgs?.demandReadback?.untitledInquiry;
      expect(typeof v, `${f} untitledInquiry`).toBe("string");
      expect(v.trim().length, `${f} untitledInquiry empty`).toBeGreaterThan(0);
      expect(v.trim(), `${f} untitledInquiry is a dash`).not.toBe("—");
    }
  });
});
