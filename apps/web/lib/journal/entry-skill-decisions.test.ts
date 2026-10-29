import { describe, expect, it } from "vitest";
import { latestSkillDecisions, readEntryRecognitionMarkers } from "./entry-recognition-markers";

/**
 * The person's LATEST decision per (entry, slug) wins: a dispute stands until
 * their own later re-link supersedes it; recognition never writes either.
 */
const rej = (slug: string, at: number | null) => ({ metric_slug: "skill_rejected", value_text: slug, value_numeric: at });
const reaf = (slug: string, at: number) => ({ metric_slug: "skill_reaffirmed", value_text: slug, value_numeric: at });

describe("latest decision per slug wins", () => {
  it("dispute → re-link: the link is the person's choice again (no longer rejected)", () => {
    const rows = [rej("flooring", 100), reaf("flooring", 200)];
    expect(latestSkillDecisions(rows).get("flooring")).toBe("reaffirmed");
    expect(readEntryRecognitionMarkers(rows).rejectedSlugs.has("flooring")).toBe(false);
  });

  it("a rejection written before decision times existed is the oldest decision", () => {
    expect(latestSkillDecisions([rej("flooring", null), reaf("flooring", 1)]).get("flooring")).toBe("reaffirmed");
  });

  it("dispute → re-link → dispute again: rejected (and a recognition re-run keeps excluding it)", () => {
    const rows = [rej("flooring", 100), reaf("flooring", 200), rej("flooring", 300)];
    expect(readEntryRecognitionMarkers(rows).rejectedSlugs.has("flooring")).toBe(true);
  });

  it("a dispute alone stays withdrawn; a tie reads as the rejection (cautious)", () => {
    expect(readEntryRecognitionMarkers([rej("flooring", 5)]).rejectedSlugs.has("flooring")).toBe(true);
    expect(latestSkillDecisions([reaf("x", 7), rej("x", 7)]).get("x")).toBe("rejected");
  });

  it("decisions are per slug", () => {
    const m = latestSkillDecisions([rej("flooring", 1), reaf("tiling", 2)]);
    expect(m.get("flooring")).toBe("rejected");
    expect(m.get("tiling")).toBe("reaffirmed");
  });
});
