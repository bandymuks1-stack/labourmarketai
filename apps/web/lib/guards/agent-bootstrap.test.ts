import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE BOOTSTRAP MUST SURVIVE THE NEXT AGENT.
 *
 * The whole executable constitution rests on one assumption: that an agent
 * entering this repository with no access to the owner's chat history MEETS it
 * before changing anything. That assumption has exactly three load-bearing
 * parts, and each of them is a file somebody could delete in a tidy-up without
 * noticing what it was for:
 *
 *   · the entry points — `CLAUDE.md` and `AGENTS.md` — must name the command;
 *   · the command itself must exist and must read the registers;
 *   · CI must run it, so a PR that quietly drops the check fails.
 *
 * This guard is deliberately about WIRING, not content. It cannot prove an
 * agent read anything. What it can prove is that the path from "new agent opens
 * the repository" to "new agent learns what this product is" has not been
 * broken — which is the failure this window existed to prevent, and the one
 * failure the rest of the register cannot catch, because a register nobody is
 * pointed at protects nothing.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

const BOOTSTRAP = ".github/scripts/product-truth.mjs";
const REGISTERS = [
  "apps/web/lib/product-gate/capability-register.ts",
  "apps/web/lib/product-gate/product-graph.ts",
  "apps/web/lib/product-gate/journey-register.ts",
  "apps/web/lib/product-gate/semantic-separations.ts",
  "docs/CAPABILITY_INVENTORY.md",
];

describe("a new agent is told what this product is, before it can narrow it", () => {
  it("the bootstrap command exists", () => {
    expect(
      existsSync(join(REPO_ROOT, BOOTSTRAP)),
      `${BOOTSTRAP} is gone. Removing the agent bootstrap is a product-governance decision, not a cleanup.`,
    ).toBe(true);
  });

  it("both agent entry points name the command", () => {
    for (const entry of ["CLAUDE.md", "AGENTS.md"]) {
      const source = read(entry);
      expect(
        source.includes("product-truth.mjs"),
        `${entry} no longer points at the bootstrap. An agent that never runs it starts from guesses.`,
      ).toBe(true);
    }
  });

  it("the entry points still say what the product must not be reduced to", () => {
    const claude = read("CLAUDE.md");
    const agents = read("AGENTS.md");
    expect(claude + agents).toMatch(/labour\/work graph/i);
    expect(
      /never be narrowed into|must never be narrowed/i.test(claude + agents),
      "the narrowing warning is the single most load-bearing sentence for a new agent",
    ).toBe(true);
  });

  it("the bootstrap reads every register, so it cannot go stale against them", () => {
    const source = read(BOOTSTRAP);
    for (const register of REGISTERS) {
      const relative = register.replace("apps/web/", "apps/web/");
      expect(
        source.includes(relative.split("/").pop()!) || source.includes(relative),
        `${BOOTSTRAP} no longer reads ${register}; its briefing would drift from what CI enforces`,
      ).toBe(true);
    }
  });

  it("CI runs the bootstrap's check, so dropping it fails a PR rather than passing quietly", () => {
    const workflow = read(".github/workflows/quality.yml");
    expect(
      workflow.includes("product-truth.mjs --check"),
      "quality.yml no longer runs the product-truth check. Without it the two halves of the capability register can drift apart silently, which is exactly how a capability leaves the product.",
    ).toBe(true);
  });

  it("the registers it depends on all exist", () => {
    for (const register of REGISTERS) {
      expect(existsSync(join(REPO_ROOT, register)), `${register} is missing`).toBe(true);
    }
  });
});
