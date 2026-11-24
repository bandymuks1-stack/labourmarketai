import { describe, expect, it } from "vitest";

import { computeRequestCompletion } from "./request-completion";

/**
 * Buyer request completion checklist guard (PR E). Pins the
 * deterministic per-field evaluation and the first-missing order.
 */

const USEFUL = "Reikia 3 plytelių klojėjų vonios remontui Vilniuje."; // > 20 chars

const EMPTY = {
  description: null,
  attachmentCount: 0,
  location: null,
  country: null,
  startPeriod: null,
  duration: null,
};

describe("computeRequestCompletion", () => {
  it("everything empty → 0 done, firstMissing = description", () => {
    const r = computeRequestCompletion(EMPTY);
    expect(r.doneCount).toBe(0);
    expect(r.totalCount).toBe(4);
    expect(r.firstMissing).toBe("description");
    expect(r.items.map((i) => i.key)).toEqual([
      "description",
      "files",
      "location",
      "timing",
    ]);
  });

  it("fully complete → 4 done, firstMissing = null", () => {
    const r = computeRequestCompletion({
      description: USEFUL,
      attachmentCount: 2,
      location: "Vilnius",
      country: "LT",
      startPeriod: "2026-06",
      duration: "2 weeks",
    });
    expect(r.doneCount).toBe(4);
    expect(r.firstMissing).toBeNull();
  });

  it("location is satisfied by EITHER country or location", () => {
    const onlyCountry = computeRequestCompletion({
      ...EMPTY,
      country: "LT",
    });
    expect(onlyCountry.items.find((i) => i.key === "location")?.done).toBe(true);
    const onlyLocation = computeRequestCompletion({
      ...EMPTY,
      location: "Kaunas",
    });
    expect(onlyLocation.items.find((i) => i.key === "location")?.done).toBe(
      true,
    );
  });

  it("timing is satisfied by EITHER start period or duration", () => {
    const onlyStart = computeRequestCompletion({ ...EMPTY, startPeriod: "ASAP" });
    expect(onlyStart.items.find((i) => i.key === "timing")?.done).toBe(true);
    const onlyDuration = computeRequestCompletion({
      ...EMPTY,
      duration: "1 mėn.",
    });
    expect(onlyDuration.items.find((i) => i.key === "timing")?.done).toBe(true);
  });

  it("whitespace-only fields do not count as present", () => {
    const r = computeRequestCompletion({
      ...EMPTY,
      description: "   ",
      location: "   ",
    });
    expect(r.doneCount).toBe(0);
  });

  it("files present but no description → firstMissing = description", () => {
    const r = computeRequestCompletion({ ...EMPTY, attachmentCount: 1 });
    expect(r.items.find((i) => i.key === "files")?.done).toBe(true);
    expect(r.firstMissing).toBe("description");
  });

  it("description present, no files → firstMissing = files", () => {
    const r = computeRequestCompletion({ ...EMPTY, description: USEFUL });
    expect(r.firstMissing).toBe("files");
  });
});
