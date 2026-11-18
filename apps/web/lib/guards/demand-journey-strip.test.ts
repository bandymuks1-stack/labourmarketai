import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildDemandJourney } from "@/lib/demand/demand-journey-model";

/**
 * ONE JOURNEY GRAMMAR FOR COMPANY AND AGENCY (owner command 2026-09-29
 * §15, §18–§19). A need's journey (company) and a placement's journey
 * (agency) are drawn by ONE presentational strip that reads nothing — so
 * the agency view can never be widened by it.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const STRIP = read("components/app/journey-strip.tsx");
const AGENCY = read("components/app/agency-delegation-panel.tsx");
const SCOUT = read("app/[locale]/dashboard/company/scouting/page.tsx");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("buildDemandJourney", () => {
  it("counts a real funnel: a later stage counts toward every earlier step", () => {
    const steps = buildDemandJourney({
      demandStatus: "submitted",
      stages: (["new", "reviewing", "contacted", "interview", "offer", "accepted", "rejected"] as const).map(
        (stage, i) => ({ workerId: `w${i}`, stage }),
      ),
    });
    expect(steps.map((s) => [s.key, s.count, s.state])).toEqual([
      ["need", null, "done"],
      ["candidates", 7, "done"],
      ["shortlist", 5, "done"],
      ["contact", 4, "done"],
      ["offer", 2, "done"],
      ["accepted", 1, "current"],
    ]);
  });

  it("an untouched need is current; nothing ahead of it claims progress", () => {
    const steps = buildDemandJourney({ demandStatus: "submitted", stages: [] });
    expect(steps[0].state).toBe("current");
    expect(steps.slice(1).every((s) => s.state === "upcoming" && s.count === 0)).toBe(true);
  });

  it("a closed need ends the journey; steps never reached are ended, not upcoming", () => {
    const steps = buildDemandJourney({ demandStatus: "closed", stages: [{ workerId: "a", stage: "reviewing" }] });
    expect(steps.at(-1)).toEqual({ key: "closed", count: null, state: "current" });
    expect(steps.find((s) => s.key === "offer")?.state).toBe("ended");
  });
});

describe("agency candidates are candidates of the need — one person, one count", () => {
  it("an agency placement reaches accepted; a person found both ways counts once, at the furthest step", () => {
    const steps = buildDemandJourney({
      demandStatus: "submitted",
      stages: [
        { workerId: "a", stage: "reviewing" },
        { workerId: "b", stage: "new" },
      ],
      agencyOffers: [
        { workerId: "a", bookingStatus: "accepted" },
        { workerId: "c", bookingStatus: null },
        { workerId: "d", bookingStatus: "declined" },
      ],
    });
    const n = Object.fromEntries(steps.map((s) => [s.key, s.count]));
    expect(n).toMatchObject({ candidates: 4, shortlist: 3, offer: 2, accepted: 1 });
  });
});

describe("the strip cannot widen what anyone sees", () => {
  it("reads nothing and names no private work fact", () => {
    expect(code(STRIP)).not.toMatch(/createClient|supabase|fetch\(|\.from\(|project|journal|hours|shortlist/i);
  });

  it("the agency panel keeps its placement steps and their ids", () => {
    expect(AGENCY).toMatch(/placementSteps\(p\)\.map/);
    expect(AGENCY).toContain("agency-placement-step-${s.key}");
    expect(AGENCY).toMatch(/<JourneyStrip/);
  });

  it("the company journey is owner-only — never on a need an agency views for a client", () => {
    expect(SCOUT).toMatch(/result\?\.kind === "ok" && !actsForClient \? \(\s*<section[\s\S]{0,200}data-testid="demand-journey"/);
  });
});
