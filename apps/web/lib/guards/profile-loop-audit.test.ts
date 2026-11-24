import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Journal→skills→profile→outputs loop audit pin (quality-train PR H).
 *
 * The 2026-07-06 audit found the canonical loop CONNECTED and HONEST —
 * zero fake-verification instances, no contradictory completeness
 * engines. The detailed honesty invariants are each pinned by their own
 * guards (journal-evidence-clarity, evidence-status-honesty,
 * profile-cv-evidence-hub, verified-cv-honesty, player-card-profile,
 * journal-entry-skill-links, product-readiness). This pin holds the audit
 * map itself and the single load-bearing fact the others assume: the only
 * write path to worker_skills.verified=true is the manager confirmation
 * flow — no client surface flips it.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

describe("loop audit map stays present and truthful", () => {
  it("the audit doc exists with the verdict and the engine analysis", () => {
    const doc = read("../../docs/launch/profile-skill-journal-loop-v1.md");
    expect(doc).toMatch(/connected and honest end-to-end/);
    expect(doc).toMatch(/stop condition[\s\S]*does NOT apply/i);
    expect(doc).toMatch(/manager confirmation RPC/);
    expect(doc).toMatch(/never answer the same question twice/);
  });

  it("no client-side code sets verified=true on worker skills", () => {
    // The auto-link path (journal save) must stay evidence-support only.
    const autoLink = read("lib/journal/journal-entry-skills-actions.ts");
    expect(autoLink).not.toMatch(/verified:\s*true/);
    // The self-declared claim path must stay unverified.
    const evidence = read("lib/profile/skill-evidence.ts");
    expect(evidence).not.toMatch(/verified:\s*true/);
  });
});
