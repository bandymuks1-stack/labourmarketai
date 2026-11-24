import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * README / repository truth guard (launch repair Scope H).
 *
 * The root README misled sessions for weeks: it still claimed M0
 * Foundation, preview-only hosting, untouched DNS, LT/EN-only locales and
 * a mandatory `dev` integration branch — all long false. This guard pins
 * the corrected claims so the README can never silently rot back.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const deployment = readFileSync(join(ROOT, "docs", "DEPLOYMENT.md"), "utf8");

describe("README carries no superseded launch claims", () => {
  it("no M0 / preview-only / DNS-untouched claims", () => {
    expect(readme).not.toMatch(/M0 \(Foundation\)/);
    expect(readme).not.toMatch(/preview only/i);
    expect(readme).not.toMatch(/DNS untouched/i);
    expect(readme).not.toMatch(/not-yet-executed/);
  });

  it("no stale `dev` integration branch flow", () => {
    expect(readme).not.toMatch(/`dev` \(integration\)/);
    expect(readme).not.toMatch(/PR → `dev`/);
  });

  it("no automatic-matching product claim", () => {
    expect(readme).not.toMatch(/proprietary matching/i);
    expect(readme).not.toMatch(/real-time, two-sided/i);
  });

  it("states the real domains, locales, migration gate and landing freeze", () => {
    expect(readme).toMatch(/https:\/\/labourmarket\.ai/);
    expect(readme).toMatch(/app\.labourmarket\.ai/);
    expect(readme).toMatch(/lt \(default\) · en · ru · nl · de/);
    expect(readme).toMatch(/human-gated/);
    expect(readme).toMatch(/landing-freeze\.test\.ts/);
    expect(readme).toMatch(/operator-coordinated/);
    expect(readme).toMatch(/payments are NOT active/i);
  });

  it("references no files that do not exist", () => {
    expect(readme).not.toMatch(/LAUNCH_CHECKLIST\.md/);
    expect(readme).not.toMatch(/0001-lean-mvp-stack/);
  });
});

describe("DEPLOYMENT.md no longer claims M0/preview-only status", () => {
  it("status header reflects live production + human-gated migrations", () => {
    expect(deployment).not.toMatch(/> Status: M0/);
    expect(deployment).toMatch(/PRODUCTION LIVE/);
    expect(deployment).toMatch(/human-gated/);
  });
});
