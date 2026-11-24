import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Admin matching = a real decision layer guard (admin-control-room-map-visual-v1).
 *
 * `/dashboard/admin/matching` must read as a business-decision workbench wired
 * to the platform's real logic — demand (the subject) next to supply (the
 * target), why a pairing surfaced (rule-based reasons), a per-item status, and
 * a human decision action — NOT an isolated technical screen or an empty stub.
 *
 * It does not assert a scoring engine (there is none, by doctrine §7 — human
 * decides). It pins that the meaningful sections stay present and connected.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const page = read("app/[locale]/dashboard/admin/matching/page.tsx");

describe("admin matching surfaces the meaningful decision sections", () => {
  it("frames the screen as a human-run workbench, not an automatic matcher", () => {
    expect(page).toMatch(/data-testid="admin-matching-workbench"/);
    expect(page).toMatch(/data-testid="admin-matching-human-note"/);
  });

  it("shows the subject (demand) next to the target (supply)", () => {
    expect(page).toMatch(/data-testid="admin-matching-demand"/);
    expect(page).toMatch(/data-testid="admin-matching-supply"/);
  });

  it("each demand row carries an honest status (state, not a fabricated score)", () => {
    expect(page).toMatch(/data-status=\{r\.status\}/);
    expect(page).toMatch(/status\.\$\{r\.status\}/);
  });

  it("explains WHY a pairing surfaced via the canonical engine's rule-based tiers (no opaque AI score)", () => {
    // Wagon 4 consolidation: the duplicate token shortlist is gone; the page
    // runs the ONE deterministic engine and renders its explanation tiers.
    expect(page).toMatch(/matchWorkerToNeed/);
    expect(page).toMatch(/MatchTierExplanation/);
    expect(page).toMatch(/compareMatches/);
    // Honesty: no fabricated numeric match score on the page.
    expect(page).not.toMatch(/match\s*score|score:\s*\d|confidence:\s*\d/i);
  });

  it("offers a real human decision action (record the outcome)", () => {
    expect(page).toMatch(/recordInReview|recordApproved|recordFollowup/);
  });
});
