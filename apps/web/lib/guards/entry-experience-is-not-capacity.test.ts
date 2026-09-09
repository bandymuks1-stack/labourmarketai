import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import {
  DURATION_UNIT_SOURCE,
  TRADE_STEM_SOURCE,
} from "@/lib/structuring/role-label";

/**
 * PERSON + YEARS + TRADE is not WORKFORCE SUPPLY.
 *
 * ── THE REGRESSION THIS LOCKS OUT ──────────────────────────────────────────
 *
 * #1669 gave the supply side the trades vocabulary the demand side already
 * had — a real fix, and every one of its own cases still passes below. But
 * its new rule asked only for HAVE, a number, and a trade within 24
 * characters, and a person's plainest self-introduction satisfies all three:
 *
 *     "I have 3 years experience as a welder"
 *
 * was classified `offer-capacity` — a `domain: "company"`, `access: "write"`,
 * GOAL-BEARING intent. A person describing themselves was read as an
 * organisation describing its workforce: SEP-4 (DEMAND != SUPPLY) and SEP-5
 * (IDENTITY != ROLE) collapsing together. Bisected to `342e74d1` (#1669);
 * `d78ed603` (#1668) answered `experiences`.
 *
 * ── WHY THE COUNT IS THE DISCRIMINATOR, AND NOT THE PRONOUN ────────────────
 *
 * The honest question is not "who is speaking" — a sole trader saying "I have
 * 20 welders available" IS offering capacity, and a pronoun test would break
 * them. It is what the NUMBER counts. A number before a time unit is a
 * DURATION; a number before a trade is a HEADCOUNT. The demand rule has drawn
 * that line since #1668 ("reikia 12 valandu" is a question about time); the
 * supply rules copied its shape without its guard.
 *
 * ── WHY NOT ALSO EXCLUDE THE WORD "EXPERIENCE" ─────────────────────────────
 *
 * Because an agency says it too: "turime 20 suvirintoju su 5 metu patirtimi"
 * is genuine supply that happens to mention experience. Excluding the noun
 * anywhere in the sentence would trade this regression for its mirror image.
 * The duration test answers the question exactly; the noun test only
 * correlates with it. That sentence is asserted below in the supply block.
 */

const CAPACITY = "offer-capacity";

/** A person describing their own background. Never workforce supply. */
const PERSON_EXPERIENCE = [
  "I have 3 years experience as a welder",
  "I have 10 years of experience as a welder",
  "I have 5 years experience as an electrician",
  "turiu 3 metus suvirintojo patirties",
  "turiu 3 metus patirties suvirintoju",
  "turiu 10 metų patirties elektriku",
  "turiu 2 metu patirti dazytoju",
  "ik heb 3 jaar ervaring als lasser",
  "ich habe 5 Jahre Erfahrung als Maurer",
  "I have 6 months experience as a painter",
  "turiu 6 menesius patirties dazytoju",
] as const;

/** An organisation stating how many people it has. Must stay supply. */
const REAL_CAPACITY = [
  "turime 20 pastolininku",
  "turime 20 pastolininkų",
  "turim 8 suvirintojus nuo pirmadienio",
  "we have 20 scaffolders",
  "wij hebben 12 lassers beschikbaar",
  "turime laisvu 12 dazytoju",
  "nuo spalio 5 d. laisvi 3 elektrikai",
  "we are an agency with 20 welders available",
  // Genuine supply that MENTIONS experience — the mirror-image regression a
  // noun-based exclusion would have caused.
  "turime 20 suvirintoju su 5 metu patirtimi",
] as const;

/** The opposite direction. A need is a need. */
const DEMAND = [
  "reikia 12 pastolininku",
  "we need 5 welders",
  "wij hebben 12 lassers nodig",
  "wir brauchen 5 Schweisser",
  "нам нужны 5 сварщиков",
] as const;

describe("a person's years of experience are never workforce capacity", () => {
  for (const text of PERSON_EXPERIENCE) {
    it(`does not read capacity from: ${text}`, () => {
      expect(classifyIntent(text).intent).not.toBe(CAPACITY);
    });
  }

  it("the English and Lithuanian originals land on a PERSON-side intent", () => {
    // Not pinned to one intent id: `experiences`, `profile` and
    // `profession-statement` are all honest answers to a person describing
    // themselves, and which one wins is a separate product question. What may
    // never happen is the COMPANY-domain write.
    for (const text of [
      "I have 3 years experience as a welder",
      "turiu 3 metus suvirintojo patirties",
    ]) {
      const intent = String(classifyIntent(text).intent);
      expect(intent).not.toBe(CAPACITY);
      expect(intent).not.toBe("need-workers");
    }
  });
});

describe("#1669's own capacity sentences still work", () => {
  for (const text of REAL_CAPACITY) {
    it(`still reads capacity from: ${text}`, () => {
      expect(classifyIntent(text).intent).toBe(CAPACITY);
    });
  }
});

describe("the demand direction is untouched", () => {
  for (const text of DEMAND) {
    it(`still reads demand from: ${text}`, () => {
      expect(classifyIntent(text).intent).toBe("need-workers");
    });
  }
});

describe("the duration vocabulary is shared, not copied", () => {
  it("covers the units the routed locales actually use", () => {
    for (const stem of ["metu", "men", "year", "month", "jahr", "jaar", "год"]) {
      expect(DURATION_UNIT_SOURCE).toContain(stem);
    }
  });

  it("the router holds no second inline time-unit list", () => {
    // The whole point: #1669 drifted because the guard existed in one rule and
    // not the other. A copy is how that happens again.
    const src = readRouterSource();
    const inlineLists = src.match(/valand\|dien\|savait/g) ?? [];
    expect(inlineLists.length).toBe(0);
    expect(src).toContain("DURATION_UNIT_SOURCE");
  });

  it("both supply rules and the demand rule all use it", () => {
    const src = readRouterSource();
    const uses = src.match(/\$\{DURATION_UNIT_SOURCE\}/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });

  it("trades stay shared too — this fix does not narrow #1669", () => {
    for (const stem of ["pastolinink", "suvirin", "lasser", "scaffolder"]) {
      expect(TRADE_STEM_SOURCE).toContain(stem);
    }
  });
});

function readRouterSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("node:path") as typeof import("node:path");
  return readFileSync(
    join(process.cwd(), "lib/conversation/intent-router.ts"),
    "utf8",
  );
}
