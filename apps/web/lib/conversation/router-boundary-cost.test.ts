import { describe, expect, it } from "vitest";

import { UNICODE_WORD_BOUNDARY, classifyIntent } from "./intent-router";

/**
 * WHY THIS EXISTS (2026-10-01). The first sentence a process classified cost
 * ~2.8 s (and the next two new rules ~0.9 s and ~0.5 s) — the cold compile of
 * ~700 `u`-flag patterns, every one of which carries this boundary. The
 * boundary spelled its letter class with `\p{L}\p{N}`, which V8 expands into a
 * table of several hundred ranges for each of its eight occurrences per
 * boundary. A compact class over the scripts the product speaks compiles the
 * same patterns in ~90 ms (measured: 2817 ms -> 88 ms for the first sentence),
 * which is also what a phone pays on its first chat message. It was failing
 * conversation-goal.test.ts and documents-gap.test.ts on CI at the 5 s limit.
 *
 * The boundary must keep meaning "edge of a word" for every launch language.
 */
const WB = new RegExp(`^${UNICODE_WORD_BOUNDARY}`, "u");
const atWordStart = (s: string) => WB.test(s);

describe("the word boundary stays a word boundary — and stays cheap", () => {
  it("does not use Unicode property classes (the cost it replaced)", () => {
    expect(UNICODE_WORD_BOUNDARY).not.toMatch(/\\p\{/);
  });

  it.each([
    ["darbą", true],
    ["žuvis", true],
    ["ąžuolas", true],
    ["łódź", true],
    ["æble", true],
    ["öffne", true],
    ["работу", true],
    ["їжак", true],
    ["ქართული", true],
    ["42", true],
    [" darbą", false],
    ["-darbą", false],
  ])("%s starts a word: %s", (s, expected) => {
    expect(atWordStart(s)).toBe(expected);
  });

  it("a stem is bounded inside a word on both sides, across scripts", () => {
    const re = new RegExp(`${UNICODE_WORD_BOUNDARY}cv${UNICODE_WORD_BOUNDARY}`, "u");
    expect(re.test("mano cv")).toBe(true);
    expect(re.test("zxcv")).toBe(false);
    expect(re.test("cvą")).toBe(false);
    expect(re.test("моё cv тут")).toBe(true);
  });

  it("routing is unchanged on diacritic-bearing sentences", () => {
    expect(classifyIntent("Ieškau darbo Norvegijoje").intent).toBe("find-work");
    expect(classifyIntent("Parodyk žinutes").intent).toBe("messages-view");
    expect(classifyIntent("Ищу работу").intent).toBe("find-work");
  });
});
