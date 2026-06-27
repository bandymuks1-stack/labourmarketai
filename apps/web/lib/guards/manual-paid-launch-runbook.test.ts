import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Manual paid-launch runbook guard (PR #542).
 *
 * The runbook documents onboarding a paying pilot with NO automated payments —
 * off-platform collection + the existing superadmin manual grant. This guard
 * keeps it honest and anchored: it must reference the real admin/billing
 * surfaces that exist, keep the no-automated-payments boundary, and cover the
 * authenticated smoke. Pure docs guard — no DB/RLS/RPC/behaviour.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const DOC = "docs/launch/manual-paid-launch-runbook.md";
const doc = readFileSync(join(REPO, DOC), "utf8");
const lower = doc.toLowerCase();

describe("the runbook anchors to surfaces that actually exist", () => {
  const anchors = [
    "apps/web/app/[locale]/dashboard/admin/billing/page.tsx",
    "apps/web/lib/admin/billing-actions.ts",
    "apps/web/lib/billing/config-core.ts",
    "apps/web/lib/guards/no-live-payments.test.ts",
  ];
  for (const rel of anchors) {
    it(`exists: ${rel}`, () => {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
    });
  }
  it("names the real manual grant/revoke actions", () => {
    expect(doc).toContain("grantPilotAccessAction");
    expect(doc).toContain("revokePilotAccessAction");
  });
});

describe("the runbook keeps the no-automated-payments boundary", () => {
  it("states no automated payments / no checkout and off-platform collection", () => {
    expect(lower).toMatch(/no automated payment/);
    expect(lower).toMatch(/off-platform|off platform/);
    expect(lower).toMatch(/no in-app checkout|no checkout/);
    // does not pretend payments are flipped on
    expect(lower).toMatch(/payments_enabled.*false|stays false|never flips|flips `payments_enabled`/i);
  });
});

describe("the runbook carries the manual procedure + final authenticated smoke", () => {
  for (const section of [
    "manual paid-launch procedure",
    "final authenticated smoke checklist",
  ]) {
    it(`has section: ${section}`, () => {
      expect(lower).toContain(section);
    });
  }
  it("the smoke covers the train surfaces (#538–#541) + manual billing", () => {
    expect(lower).toContain("player card identity");
    expect(lower).toContain("profile completion");
    expect(lower).toContain("cv import is discoverable");
    expect(lower).toContain("requester tile");
    expect(lower).toContain("manual billing round-trip");
  });
});
