import { describe, expect, it } from "vitest";
import { summarizeRecognition } from "./unknown-report";

describe("summarizeRecognition — unknown-phrase improvement loop", () => {
  it("buckets phrases into recognized / weak / unknown", () => {
    const r = summarizeRecognition([
      "klijavau plyteles", // recognized (tiling, exact)
      "pliteles", // weak (fuzzy low)
      "darbas buvo geras", // unknown
      "сегодня устал", // unknown
    ]);
    expect(r.total).toBe(4);
    expect(r.recognized).toBe(1);
    expect(r.weak).toBe(1);
    expect(r.unknown).toBe(2);
  });

  it("aggregates unknown phrases by frequency (folded), highest first", () => {
    const r = summarizeRecognition([
      "darbas buvo geras",
      "darbas buvo geras",
      "сегодня устал",
    ]);
    expect(r.unknownByFrequency[0]).toEqual({
      phrase: "darbas buvo geras",
      count: 2,
    });
    expect(r.unknownByFrequency).toHaveLength(2);
  });

  it("ignores blank phrases and is deterministic", () => {
    const a = summarizeRecognition(["  ", "tinkavau", ""]);
    const b = summarizeRecognition(["tinkavau"]);
    expect(a.total).toBe(1);
    expect(a.recognized).toBe(b.recognized);
  });

  it("never reports a fake skill — only real recognizer output", () => {
    const r = summarizeRecognition(["plyteles"]);
    expect(r.outcomes[0].slugs).toContain("tiling");
    expect(r.outcomes[0].bucket).toBe("recognized");
  });
});
