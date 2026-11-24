import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Launch Readiness — Source Audit guard.
 *
 * The audit (docs/audits/launch-readiness-source-audit-v1.md) is the drift gate:
 * it lists what already exists ("do not rebuild") and the only sanctioned next
 * PRs. This guard keeps the doc honest and present — its governance sections
 * cannot be silently gutted, its "do not rebuild" anchors must point at files
 * that actually exist, and its own prose carries no demo/coming-soon framing.
 * Pure docs guard: no DB / RLS / RPC / route / behaviour here.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const DOC = "docs/audits/launch-readiness-source-audit-v1.md";
const doc = readFileSync(join(REPO, DOC), "utf8");
const lower = doc.toLowerCase();

describe("the audit carries every required governance section", () => {
  it("has real content", () => {
    expect(doc.length).toBeGreaterThan(4000);
  });
  for (const section of [
    "executive cutline",
    "existing surfaces inventory",
    "do not rebuild",
    "duplication / drift risks",
    "missing for first *paid* launch",
    "red items",
    "allowed next prs",
    "forbidden until first paid launch",
    "source evidence table",
  ]) {
    it(`mentions: ${section}`, () => {
      expect(lower).toContain(section);
    });
  }
  it("states the governance rule that gates new implementation", () => {
    expect(lower).toContain("allowed next prs");
    expect(lower).toMatch(/no agent may start|out of bounds|must be refused/);
  });
});

describe("the 'do not rebuild' anchors point at files that exist", () => {
  // If one of these is renamed/removed, the audit must be updated in the same PR.
  const anchors = [
    "apps/web/components/app/profile-hub-overview.tsx",
    "apps/web/components/app/worker-player-card.tsx",
    "apps/web/lib/identity/player-card-minimum.ts",
    "apps/web/lib/player-card/readiness.ts",
    "apps/web/app/api/cv/extract/route.ts",
    "apps/web/lib/billing/config-core.ts",
    "apps/web/lib/guards/no-live-payments.test.ts",
  ];
  for (const rel of anchors) {
    it(`exists: ${rel}`, () => {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
    });
    it(`is referenced by the audit: ${rel}`, () => {
      // the audit cites repo-relative paths without the leading apps/web
      const cited = rel.replace(/^apps\/web\//, "");
      expect(doc).toContain(cited);
    });
  }
});

describe("the audit's own prose stays honest (no banned framing)", () => {
  it("forbids rather than uses demo/coming-soon framing", () => {
    // It names the banned tokens once, inside the forbidden-list line.
    expect(lower).toMatch(/no .{0,40}coming-soon.{0,40}framing/);
  });
});
