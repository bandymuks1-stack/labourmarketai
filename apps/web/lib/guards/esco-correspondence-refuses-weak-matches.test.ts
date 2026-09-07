import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A WRONG ESCO CORRESPONDENCE IS WORSE THAN NONE.
 *
 * This guard exists because of a measurement, not a worry. On production,
 * 2026-09-08, prefix-matching ONE recognizer term against ESCO skill labels
 * failed in two directions:
 *
 *   MISSES — ESCO phrases skills as ACTIONS ("statyti pastolius" = build
 *   scaffolding) while the recognizer's matched term is usually the NOUN out
 *   of the person's sentence. Three of four real terms taken from the live
 *   recognizer matched nothing.
 *
 *   FALSE POSITIVES — a bare verb prefix matches whatever skill starts with
 *   it. `montuoti` (to install) resolves to `montuoti ekranus`, MOUNT VISUAL
 *   DISPLAYS. Shipping that would tell a formwork installer, in an
 *   authoritative European vocabulary, that their work denotes display
 *   mounting.
 *
 * So the evidence correspondence accepts EXACT label matches only. This test
 * pins that decision to the measurement, so a future author who widens it back
 * to prefix has to argue with the false positive rather than rediscover it.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8").replace(/\r\n/g, "\n");
const SRC = "lib/esco/evidence-correspondence.ts";

describe("the evidence→ESCO correspondence refuses weak matches", () => {
  it("accepts only an EXACT label match", () => {
    const src = read(SRC);
    expect(src).toContain('m.method === "exact_label"');
    // A prefix hit must never be the one selected here.
    expect(src).not.toMatch(/found\.value\[0\]/);
  });

  it("the measured false positive is named in the code, not just avoided", () => {
    // A constraint whose reason is not written down is a constraint the next
    // person removes.
    const src = read(SRC);
    expect(src).toContain("montuoti ekranus");
    expect(src.toLowerCase()).toContain("false positive");
  });

  it("it writes nothing and confirms nothing", () => {
    const src = read(SRC);
    expect(src).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
    // The accept/reject/correct loop stays where it already is.
    expect(src).not.toMatch(/journal_entry_skills|confirmJournal|rejectJournal/);
  });

  it("every result carries the disclaimer that bounds it", () => {
    const src = read(SRC);
    // A consumer must not be able to render a correspondence without the list
    // of things an ESCO code is NOT.
    expect(src).toContain("isNot: ESCO_IS_NOT");
  });

  it("an unreadable lookup makes the WHOLE answer unavailable", () => {
    // Returning the successful half would present a partial correspondence as
    // a complete one — the quiet version of lying.
    const src = read(SRC);
    expect(src).toMatch(/if \(found\.status !== "ok"\) return found;/);
    expect(src).toMatch(/if \(labels\.status !== "ok"\) return labels;/);
  });
});
