import { describe, expect, it } from "vitest";
import { classifyIntent } from "./intent-router";

/**
 * Real-user fitness walk on production, 2026-09-06: "kas man trūksta?" — the
 * way people actually ask what they are missing — had no deterministic
 * pattern (only "ko / ką man trūksta"); three runs in a row were rescued by
 * the proposer, which is neither free nor guaranteed. The bare question is
 * skill-gap by contract (owner 2026-09-04 §16); a PROJECT's readiness keeps
 * its own intent.
 */
describe("'kas man trūksta?' is deterministic skill-gap", () => {
  it.each(["kas man trūksta?", "Kas man trūksta", "kas man truksta?", "ko man trūksta?", "ką man trūksta?"])(
    "%s → skill-gap",
    (s) => {
      expect(classifyIntent(s).intent).toBe("skill-gap");
    },
  );

  it("the project's readiness question keeps project-readiness", () => {
    expect(classifyIntent("kas trūksta projektui Vilnius?").intent).toBe("project-readiness");
  });
});
