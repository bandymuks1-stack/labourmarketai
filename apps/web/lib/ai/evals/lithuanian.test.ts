/**
 * Lithuanian evals — every registered agent (bar the owner-excluded
 * vacancy_translation) through the MOCK pipeline, judged by the three checks
 * in harness.ts: output schema, Lithuanian reader-facing text, no invented
 * employer / date / certificate. No env, key, or network. The live twin is
 * scripts/ai-evals-live.ts (opt-in, never in CI).
 */
import { describe, it, expect } from "vitest";
import {
  inventedFacts,
  judgeLithuanianCase,
  looksLithuanian,
  runAgentEval,
} from "./harness";
import {
  LITHUANIAN_CHECKER_NEGATIVES,
  LITHUANIAN_EVAL_CASES,
  LITHUANIAN_EVAL_EXCLUDED,
} from "./lithuanian.fixtures";
import { REGISTERED_AGENTS } from "../registry/registry";

describe("Lithuanian evals — coverage", () => {
  it("every registered agent has a Lithuanian case or a recorded exclusion", () => {
    const covered = new Set(LITHUANIAN_EVAL_CASES.map(({ entry }) => entry.agent));
    for (const agent of REGISTERED_AGENTS) {
      expect(
        covered.has(agent) || agent in LITHUANIAN_EVAL_EXCLUDED,
        `${agent} has no Lithuanian eval case`,
      ).toBe(true);
    }
    // An exclusion is for an agent that is NOT covered — never both.
    for (const agent of Object.keys(LITHUANIAN_EVAL_EXCLUDED)) {
      expect(covered.has(agent as never)).toBe(false);
    }
  });

  it("every case is a Lithuanian request", () => {
    for (const { c } of [...LITHUANIAN_EVAL_CASES, ...LITHUANIAN_CHECKER_NEGATIVES]) {
      expect(c.locale).toBe("lt");
    }
  });
});

describe("Lithuanian evals — mock provider", () => {
  it.each(LITHUANIAN_EVAL_CASES.map(({ entry, c }) => [c.name, entry, c] as const))(
    "%s",
    async (_name, entry, c) => {
      const out = await runAgentEval(entry, c);
      const v = judgeLithuanianCase(entry, c.input, out);
      expect(v.schema, v.schema.detail).toMatchObject({ ok: true });
      expect(v.language, v.language.detail).toMatchObject({ ok: true });
      expect(v.facts, v.facts.detail).toMatchObject({ ok: true });
      expect(v.pass).toBe(true);
    },
  );
});

describe("Lithuanian evals — the checks catch what they claim", () => {
  it.each(
    LITHUANIAN_CHECKER_NEGATIVES.map((n) => [n.c.name, n] as const),
  )("%s", async (_name, n) => {
    const out = await runAgentEval(n.entry, n.c);
    const v = judgeLithuanianCase(n.entry, n.c.input, out);
    // The schema accepts it — only the Lithuanian checks stand between it
    // and the reader.
    expect(v.schema.ok).toBe(true);
    expect(v[n.fails].ok).toBe(false);
    expect(v[n.fails].detail).toContain(n.mentions);
    expect(v.pass).toBe(false);
  });

  it("language heuristic: Lithuanian passes, English / Polish / empty do not", () => {
    expect(looksLithuanian(["Įkelkite savo A1 pažymėjimą."]).ok).toBe(true);
    expect(looksLithuanian(["Plytelių klojėjas"]).ok).toBe(true);
    expect(looksLithuanian(["Upload your certificate for the job."]).ok).toBe(false);
    expect(looksLithuanian(["Prześlij swój certyfikat."]).ok).toBe(false);
    expect(looksLithuanian([]).ok).toBe(false);
  });

  it("facts heuristic: a certificate word survives translation, an unknown month does not", () => {
    expect(inventedFacts({ m: "Upload your A1 certificate." }, { t: "A1 pažymėjimas" })).toEqual([]);
    expect(inventedFacts({ m: "Pradžia 2026-11-05." }, { t: "Pradžia lapkričio mėnesį." })).toEqual([]);
    expect(inventedFacts({ m: "Pradžia 2026 m." }, { t: "Pradžia gruodžio mėnesį." })).toEqual([
      "date: month 12",
    ]);
    // A question about a document is not a claim that one exists.
    expect(inventedFacts({ m: "Klojau plyteles." }, { missing_fields: ["A1 pažymėjimas"] })).toEqual([]);
  });
});
