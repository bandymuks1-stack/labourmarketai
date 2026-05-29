import { describe, expect, it } from "vitest";

import {
  MIN_USEFUL_DESCRIPTION_LENGTH,
  computeRequestReadiness,
  hasUsefulDescription,
  type RequestNextAction,
  type RequestReadinessStatus,
} from "./request-readiness";

/**
 * Buyer Request Understanding Center v1 — readiness logic guard.
 *
 * The helper is pure transparent product logic (no AI / OCR /
 * verification / matching). These tests pin the full truth table so a
 * future edit cannot silently change what the buyer sees.
 */

const LONG = "Reikia 3 plytelių klojėjų vonios kambario remontui Vilniuje."; // > 20 chars

describe("hasUsefulDescription", () => {
  it("rejects null / undefined / empty / whitespace", () => {
    expect(hasUsefulDescription(null)).toBe(false);
    expect(hasUsefulDescription(undefined)).toBe(false);
    expect(hasUsefulDescription("")).toBe(false);
    expect(hasUsefulDescription("    ")).toBe(false);
  });

  it("rejects text shorter than the minimum after trim", () => {
    const short = "x".repeat(MIN_USEFUL_DESCRIPTION_LENGTH - 1);
    expect(hasUsefulDescription(short)).toBe(false);
    // Leading/trailing whitespace does not pad it over the threshold.
    expect(
      hasUsefulDescription(`   ${"x".repeat(MIN_USEFUL_DESCRIPTION_LENGTH - 1)}   `),
    ).toBe(false);
  });

  it("accepts text at or above the minimum after trim", () => {
    expect(hasUsefulDescription("y".repeat(MIN_USEFUL_DESCRIPTION_LENGTH))).toBe(
      true,
    );
    expect(hasUsefulDescription(LONG)).toBe(true);
  });

  it("honours a custom minimum length", () => {
    expect(hasUsefulDescription("hello", 5)).toBe(true);
    expect(hasUsefulDescription("hell", 5)).toBe(false);
  });
});

describe("computeRequestReadiness — full truth table", () => {
  const cases: ReadonlyArray<{
    name: string;
    description: string | null | undefined;
    attachmentCount: number;
    status: RequestReadinessStatus;
    nextAction: RequestNextAction;
  }> = [
    {
      name: "no files, no useful text",
      description: null,
      attachmentCount: 0,
      status: "no_files",
      nextAction: "add_first_file",
    },
    {
      name: "no files, useful text present",
      description: LONG,
      attachmentCount: 0,
      status: "needs_more_info",
      nextAction: "add_first_file",
    },
    {
      name: "files present, thin text",
      description: "remontas",
      attachmentCount: 1,
      status: "files_added",
      nextAction: "add_more_project_details",
    },
    {
      name: "files present, useful text",
      description: LONG,
      attachmentCount: 2,
      status: "enough_for_manual_review",
      nextAction: "administrator_will_review",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const r = computeRequestReadiness({
        description: c.description,
        attachmentCount: c.attachmentCount,
      });
      expect(r.status).toBe(c.status);
      expect(r.nextAction).toBe(c.nextAction);
      expect(r.hasFiles).toBe(c.attachmentCount > 0);
    });
  }

  it("treats a non-finite attachment count as zero files", () => {
    const r = computeRequestReadiness({
      description: LONG,
      attachmentCount: Number.NaN,
    });
    expect(r.hasFiles).toBe(false);
    expect(r.status).toBe("needs_more_info");
  });

  it("is deterministic — same input yields same output", () => {
    const input = { description: LONG, attachmentCount: 1 };
    expect(computeRequestReadiness(input)).toEqual(
      computeRequestReadiness(input),
    );
  });
});
