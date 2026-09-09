import { describe, expect, it } from "vitest";
import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * SAYING WHERE MUST NOT BREAK SAYING WHEN.
 *
 * Owner readiness window, 2026-09-09. §5A's probe "I can work in Germany from
 * Monday." is one sentence carrying BOTH facts §5B asks a person for —
 * mobility and availability — and it is how people actually say them.
 *
 * Measured before the fix: Lithuanian understood it, the other four routed
 * locales did not, and German answered it with a JOB SEARCH. Removing the
 * country made all five work, which located the cause exactly: every
 * non-Lithuanian pattern demanded the time word immediately after the verb,
 * and the place phrase pushed it out of reach.
 */

const intentOf = (s: string) => classifyIntent(s)?.intent ?? null;

const WITH_PLACE: ReadonlyArray<readonly [string, string]> = [
  ["lt", "Galiu dirbti Vokietijoje nuo pirmadienio"],
  ["en", "I can work in Germany from Monday"],
  ["de", "Ich kann in Deutschland ab Montag arbeiten"],
  ["nl", "Ik kan in Duitsland vanaf maandag werken"],
  ["ru", "Могу работать в Германии с понедельника"],
];

const WITHOUT_PLACE: ReadonlyArray<readonly [string, string]> = [
  ["lt", "Galiu dirbti nuo pirmadienio"],
  ["en", "I can work from Monday"],
  ["de", "Ich kann ab Montag arbeiten"],
  ["nl", "Ik kan vanaf maandag werken"],
  ["ru", "Могу работать с понедельника"],
];

describe("1. availability is heard in every routed language, with or without a place", () => {
  it.each(WITH_PLACE)("%s (naming the country): %s", (_loc, s) => {
    expect(intentOf(s)).toBe("availability");
  });

  it.each(WITHOUT_PLACE)("%s (no country): %s", (_loc, s) => {
    expect(intentOf(s)).toBe("availability");
  });

  it("German no longer answers a stated availability with a job search", () => {
    // The single worst reading of the five: not silence, but a confident
    // wrong surface (§14 — a fluent wrong answer is a failure).
    expect(intentOf("Ich kann in Deutschland ab Montag arbeiten")).not.toBe("find-work");
  });
});

describe("2. NEGATIVE CONTROLS — the gap is a PLACE, not a wildcard", () => {
  /** The reason `WHERE_GAP` admits only a locative preposition. A bare
   *  `.{0,20}` between the verb and the from-word passes every one of these,
   *  turning ordinary sentences into stated availabilities. */
  it("a non-place phrase before a 'from' is not an availability", () => {
    for (const s of [
      "I can work with people from Poland",
      "I can work with tools from the van",
      "I am free with help from a colleague",
    ]) {
      expect(intentOf(s), s).not.toBe("availability");
    }
  });

  it("a place with no time word after it is still not an availability", () => {
    for (const s of ["I can work in a team", "I can work in Germany"]) {
      expect(intentOf(s), s).not.toBe("availability");
    }
  });

  /** The seek guard is untouched: a sentence that also asks for work keeps
   *  the search, so the person gets results rather than an acknowledgement. */
  it("also asking for work still runs the search", () => {
    expect(intentOf("Galiu dirbti Vokietijoje nuo pirmadienio, ieskau darbo")).toBe(
      "find-work",
    );
    expect(intentOf("I can work in Germany from Monday, looking for work")).toBe(
      "find-work",
    );
  });

  /** The market directions must not have moved. A place phrase now sits in
   *  ten patterns; none of them may start reading an organisation's sentence. */
  it("supply and demand are untouched by the widened gap", () => {
    expect(intentOf("We have 20 welders")).toBe("offer-capacity");
    expect(intentOf("We need 10 welders in Germany from Monday")).toBe("need-workers");
    expect(intentOf("Reikia 12 pastoliniku Roterdame")).toBe("need-workers");
  });
});
