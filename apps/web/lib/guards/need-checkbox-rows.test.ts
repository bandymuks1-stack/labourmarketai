import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — UX gaps 2026-11-18, E-5 (part): the need form's checkboxes were
 * 16 × 16 px targets. Each sits in a label row at the 44 px floor, so the whole
 * row toggles it. The launch-path clusters stay open by default
 * (demand-first-launch-path.test.ts): collapsing them on phones is NOT done
 * here — a cluster nobody opens is a field nobody fills.
 */
const src = readFileSync(join(__dirname, "../../components/app/demand-advanced-sections.tsx"), "utf8");

describe("need form checkboxes", () => {
  it("every checkbox sits in a 44 px label row", () => {
    const boxes = src.match(/<label className="[^"]*"\>\s*<input\s+type="checkbox"/g) ?? [];
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) expect(b).toMatch(/min-h-11/);
    expect(src.split('type="checkbox"').length - 1).toBe(boxes.length);
  });
});
