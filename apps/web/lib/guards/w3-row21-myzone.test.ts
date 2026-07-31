import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 row 21 — MYZONE: the classification, pinned.
 *
 * The audit split the row into its real sub-capabilities rather than
 * labelling the whole surface once:
 *
 *   1. READINESS STATUS + MISSING-ITEM DEEP LINKS → `ALREADY`. The canonical,
 *      RICHER implementation is the work-card model rendered inside the
 *      `player-card` RESULT (W3 row 1): five dimensions (work / availability /
 *      location / pay / evidence) against MyZone's two (profession, first
 *      entry), each missing dimension producing ONE best next action with a
 *      per-dimension "why it helps". MyZone's two dimensions are a strict
 *      subset: `work` requires the profession, `evidence` requires journal
 *      entries.
 *
 *   2. "KAS KĄ GERINA" EXPLAINER → `OBSOLETE`. Standalone help copy consumed
 *      only by this component; the surviving explanation lives WHERE THE
 *      ACTION IS — the work-card model's `whyKey` per dimension. Help
 *      detached from action dies with the route.
 *
 * These guards pin the facts that make the classification safe to keep.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".turbo") continue;
      walk(p, out);
    } else if (
      (p.endsWith(".ts") || p.endsWith(".tsx")) &&
      !p.endsWith(".test.ts")
    ) {
      out.push(p);
    }
  }
  return out;
}

describe("W3 row 21 — MyZone is presentation over state that lives elsewhere", () => {
  it("MyZone reads nothing and writes nothing — presentation only", () => {
    const src = read("components/app/my-zone.tsx");
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/\.from\(/);
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/fetch\(/);
    expect(src).not.toMatch(/"use server"/);
  });

  it("MyZone has exactly ONE mount — the dying advanced page", () => {
    const mounts = ["app", "components", "lib"]
      .flatMap((d) => walk(join(ROOT, d)))
      .filter((p) => /<MyZone[\s>]/.test(readFileSync(p, "utf8")))
      .map((p) => p.replaceAll("\\", "/"));
    expect(mounts).toHaveLength(1);
    expect(mounts[0]).toContain("dashboard/advanced/page.tsx");
  });

  it("MyZone's two dimensions are a strict subset of the canonical work-card model", () => {
    const model = read("lib/worker/work-card-state.ts");
    // `work` covers the profession dimension…
    expect(model).toMatch(/case "work":\s*\n\s*return s\.hasProfession/);
    // …and `evidence` covers the first-journal-entry dimension, with the
    // journal as its next-action destination — the same place MyZone's
    // `firstEntry` deep link points.
    expect(model).toMatch(/case "evidence":\s*\n\s*return s\.evidenceCount > 0/);
    expect(model).toMatch(/evidence: "\/dashboard\/journal"/);
    // Every missing dimension explains WHY it helps — the surviving form of
    // the "Kas ką gerina" explainer, attached to the action itself.
    expect(model).toMatch(/whyKey/);
  });

  it("the canonical surface renders the editor: the player-card result", () => {
    const result = read("components/app/workspace/player-card-result.tsx");
    expect(result).toContain("player-card-work-editor");
    expect(result).toMatch(/WorkCardEditor/);
  });

  it("the explainer copy has no consumer besides MyZone — deletion is clean", () => {
    const consumers = ["app", "components", "lib"]
      .flatMap((d) => walk(join(ROOT, d)))
      .filter((p) => readFileSync(p, "utf8").includes("improvesHeading"))
      .map((p) => p.replaceAll("\\", "/"));
    expect(consumers).toHaveLength(1);
    expect(consumers[0]).toContain("components/app/my-zone.tsx");
  });
});
