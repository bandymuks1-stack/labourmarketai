import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: Player Identity answers WHERE / FOR WHOM / WHEN with the work-world
 * grammar — the history is ONE work spine, dates are mono stamps, the
 * country-level place is the dashed country chip — with no CV form, no
 * score, no photo fabricated and no standing claimed the row cannot back.
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const HUB = read("components/app/profile-hub-overview.tsx");
const EVIDENCE = read("components/app/organization-evidence-section.tsx");

describe("Guard: PLAYER IDENTITY wears the work-world grammar (PLAYER_IDENTITY_REACHABLE + IDENTITY_TEMPORAL_PERIOD_VISIBLE)", () => {
  it("work history is ONE WorkSpine — a node per real engagement, no standing claimed", () => {
    expect(HUB).toContain('from "@/components/app/work-world/primitives"');
    expect(HUB).toMatch(/data-testid="live-profile-history"[\s\S]{0,80}<WorkSpine>/);
    expect(HUB).toMatch(/playerCard\.workHistory\.map\(\(e\) => \(\s*<WorkSpineNode key=\{e\.id\}>/);
    // the row carries no provenance, so the node states none (no state=/solid)
    expect(HUB).not.toMatch(/<WorkSpineNode key=\{e\.id\} (state|solid)=/);
  });

  it("dates are a mono stamp; the only place the row knows is the dashed country chip", () => {
    expect(HUB).toMatch(/<PlaceTimeStamp>\s*\{e\.startedAt \?\? tLive\("dateUnknown"\)\}/);
    expect(HUB).toMatch(/e\.countryCode \? \(\s*<PlacePrecision kind="country" label=\{e\.countryCode\} \/>/);
    expect(HUB).not.toMatch(/PlacePrecision kind="(city|address)"/);
  });

  it("the evidence surface still leads with EvidenceState + PeriodBand (800 h stays a time ribbon)", () => {
    expect(EVIDENCE).toContain("<EvidenceState");
    expect(read("components/app/period-monthly-share.tsx")).toContain("<PeriodBand");
  });

  it("no score, no stars, no fabricated photo entered the identity", () => {
    // code only — the hub's own doctrine comments say "no rating" out loud
    const code = HUB.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(code).not.toMatch(/★|score:|rating|\bstars\b/i);
    expect(code).not.toMatch(/photoUrl=\{?"https?:/);
  });
});

describe("Guard: history, evidence and opportunities are visible ON ARRIVAL, not behind the done-bar", () => {
  const HUB = read("components/app/profile-hub-overview.tsx");
  it("the work-world block stands BEFORE the 'what is already done' disclosure and outside it", () => {
    const block = HUB.indexOf('data-testid="profile-hub-work-world"');
    const details = HUB.indexOf("<details");
    expect(block).toBeGreaterThan(-1);
    expect(details).toBeGreaterThan(block);
    // the four blocks live in the visible region, before <details>
    const visible = HUB.slice(block, details);
    for (const id of ["profile-hub-activity", "live-profile-history", "live-profile-evidence", "live-profile-opportunity"]) {
      expect(visible, id).toContain(id);
    }
    // and no longer inside the disclosure
    const inside = HUB.slice(details);
    for (const id of ["live-profile-history", "live-profile-evidence", "live-profile-opportunity"]) {
      expect(inside, id).not.toContain(`data-testid="${id}"`);
    }
    // the checklist and the CV grid stay behind the bar (progressive disclosure kept)
    expect(inside).toContain('data-testid="profile-hub-done-steps"');
    expect(inside).toContain("<CvCompletenessGrid");
  });
});
