/**
 * Guard: the student's own door to practice places (owner direction
 * 2026-11-14, group 4 — "a dedicated internship listing / discovery path with
 * filters, applications and communication").
 *
 * The door is the ONE opportunities board narrowed by the type the employer
 * stated (`?opportunityType=internship`): the same filters, the same interest
 * button and the same employer conversation. It must never become a second
 * listing engine (lib/conversation/education-next-steps.ts: "an internship is
 * a subset of one board, never a second engine").
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseDiscoveryParams } from "@/lib/opportunities/discovery-filters";

const web = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");
const COMPASS = "components/app/learning-compass-section.tsx";
const ROUTED = ["lt", "en", "ru", "pl", "de", "nl"] as const;

describe("student internship door", () => {
  it("the learning compass links the board narrowed to internships", () => {
    const src = read(COMPASS);
    expect(src).toMatch(/href="\/dashboard\/opportunities\?opportunityType=internship"/);
    expect(src).toMatch(/data-testid="compass-open-internships"/);
    // the plain board door stays beside it
    expect(src).toMatch(/data-testid="compass-open-board"/);
  });

  it("the door's address is a real board filter, not a new route", () => {
    const { filters: f } = parseDiscoveryParams({ opportunityType: "internship" });
    expect(f.opportunityType).toBe("internship");
  });

  it("every routed locale names the door", () => {
    for (const loc of ROUTED) {
      const label = JSON.parse(read(`messages/${loc}.json`)).learningCompass?.openInternships;
      expect(typeof label === "string" && label.trim().length > 0, `${loc}: learningCompass.openInternships`).toBe(true);
    }
  });
});
