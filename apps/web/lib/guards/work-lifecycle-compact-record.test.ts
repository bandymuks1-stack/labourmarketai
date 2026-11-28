import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner order 2026-11-24 (decisions 0032 and 0034): on the public pages the
 * "what happens to your work" block listed six stages that each said "not
 * yet" under a rail that already names them. With nothing recorded to show,
 * the record holds the chosen stage only. A record that carries facts (a
 * signed-in person's own chain) still lists every stage.
 */
const graph = readFileSync(
  join(process.cwd(), "components/marketing/work-lifecycle-graph.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("work lifecycle — the record is compact when there is nothing recorded", () => {
  it("knows whether any stage carries a fact", () => {
    expect(graph).toContain("const hasFacts = stages.some((st) => Boolean(st.fact));");
  });

  it("without facts only the chosen stage is drawn; its detail and its action stay", () => {
    expect(graph).toContain("if (!hasFacts && !isCurrent) return null;");
    expect(graph).toContain("{current.detail}");
    expect(graph).toContain("ctaId={`lifecycle_${current.key}`}");
  });

  it("the rail above still names every stage", () => {
    expect(graph).toContain("data-testid={`${testId}-stages`}");
    expect(graph).toContain("data-testid={`${testId}-stage-${s.key}`}");
  });
});
