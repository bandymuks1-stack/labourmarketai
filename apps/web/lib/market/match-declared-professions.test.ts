import { describe, expect, it } from "vitest";
import { declaredProfessionSlugs, matchWorkerToNeed, type MatchSubject } from "./match-v1";

/**
 * Owner decision 2026-09-28: a person may be tiler + painter + scaffolder —
 * every declared profession is a real profession, and any of them can meet a
 * need's profession. The ONE engine judges the need against the declared
 * profession that fits it best; with one profession nothing changes.
 */
const base: MatchSubject = {
  skills: [{ uri: "surface-preparation", evidence: "self_declared" }],
  country: "SE",
  preferredCountries: ["SE"],
};
// A need must state a required skill before the engine judges anything else.
const need = (professionSlug: string) => ({ professionSlug, skillIds: ["surface-preparation"] });
const codes = (s: MatchSubject, professionSlug: string) =>
  matchWorkerToNeed(need(professionSlug), s).reasons.map((r) => r.code);

describe("every declared profession can meet a need", () => {
  it("one profession → exactly the previous verdict", () => {
    const tilerOnly: MatchSubject = { ...base, professionSlug: "tiler" };
    const tilerListed: MatchSubject = { ...base, professionSlug: "tiler", professionSlugs: ["tiler"] };
    for (const n of ["tiler", "painter", "electrician"]) {
      expect(matchWorkerToNeed(need(n), tilerListed)).toEqual(
        matchWorkerToNeed(need(n), tilerOnly),
      );
    }
  });

  it("a second declared profession meets a need in that profession", () => {
    const tiler: MatchSubject = { ...base, professionSlug: "tiler" };
    const tilerPainter: MatchSubject = { ...base, professionSlug: "tiler", professionSlugs: ["tiler", "painter"] };
    expect(codes(tiler, "painter")).not.toContain("profession_match");
    expect(codes(tilerPainter, "painter")).toContain("profession_match");
    // The primary still meets its own needs.
    expect(codes(tilerPainter, "tiler")).toContain("profession_match");
  });

  it("removing the second profession removes its contribution", () => {
    const before: MatchSubject = { ...base, professionSlug: "tiler", professionSlugs: ["tiler", "painter"] };
    const after: MatchSubject = { ...base, professionSlug: "tiler", professionSlugs: ["tiler"] };
    expect(codes(before, "painter")).toContain("profession_match");
    expect(codes(after, "painter")).not.toContain("profession_match");
  });

  it("the declared list is primary first, de-duplicated, never invented", () => {
    expect(declaredProfessionSlugs({ ...base, professionSlug: "tiler", professionSlugs: ["painter", "tiler", "painter"] })).toEqual([
      "tiler",
      "painter",
    ]);
    expect(declaredProfessionSlugs({ ...base, professionSlug: null })).toEqual([]);
    expect(declaredProfessionSlugs({ ...base, professionSlug: null, professionSlugs: ["painter"] })).toEqual(["painter"]);
  });

  it("no profession → no profession verdict at all (existing fallback)", () => {
    const r = matchWorkerToNeed(need("painter"), { ...base, professionSlug: null });
    const all = r.reasons.map((x) => x.code);
    expect(all).not.toContain("profession_match");
    expect(all).not.toContain("profession_related");
  });
});
