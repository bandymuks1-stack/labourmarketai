import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * D0 (design audit 2026-10-14, docs/design/DESIGN_MOBILE_COMPLETION_AUDIT_2026-10-14.md):
 * one status chip and one figure tile. Screens converge on the shared
 * primitives instead of growing local copies.
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

const MIGRATED = [
  "components/app/absence-panel.tsx",
  "components/app/agency-clients-section.tsx",
  "components/app/marketplace-loop-section.tsx",
  "app/[locale]/dashboard/company/planning/page.tsx",
  "components/app/evidence-import-section.tsx",
];

describe("D0 shared primitives", () => {
  it("migrated surfaces render status through THE StatusChip, not a local uppercase pill", () => {
    for (const f of MIGRATED) {
      const src = read(f);
      expect(src, f).toMatch(/from "@\/components\/app\/status-chip"/);
      expect(src, `${f} defines its own StatusChip`).not.toMatch(/function StatusChip\(/);
      expect(src, `${f} keeps a local Chip`).not.toMatch(/function Chip\(/);
    }
  });

  it("the orphaned preview chip is gone", () => {
    expect(existsSync(join(WEB, "components/app/preview-chip.tsx"))).toBe(false);
  });

  it("Stat renders unknown as an em dash, never zero, with a sentence-case label", () => {
    const src = read("components/app/premium/stat.tsx");
    expect(src).toMatch(/value === null \? "—"/);
    expect(src).toMatch(/data-unknown/);
    expect(src).not.toMatch(/uppercase/);
    expect(read("components/app/organization/company-work-history.tsx")).toMatch(/from "@\/components\/app\/premium\/stat"/);
  });
});
