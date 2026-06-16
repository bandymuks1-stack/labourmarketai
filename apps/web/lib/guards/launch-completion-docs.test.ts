import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveBillingConfig } from "@/lib/billing/config-core";

/**
 * Launch Completion (before Stripe) guard.
 *
 *  - The launch documentation package exists and is non-empty.
 *  - Billing stays DISABLED and live is impossible to activate (behavioural).
 *  - The Stripe handoff exists but explicitly states Stripe is NOT connected
 *    this stage.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const LAUNCH_DIR = join(REPO_ROOT, "docs", "launch");

const REQUIRED_DOCS = [
  "README.md",
  "user-flows.md",
  "worker-guide.md",
  "company-guide.md",
  "marketplace-map-guide.md",
  "communication-guide.md",
  "admin-operator-guide.md",
  "payment-logic-before-stripe.md",
  "stripe-next-sprint-handoff.md",
  "known-limits.md",
  "first-users-checklist.md",
];

describe("launch documentation package exists", () => {
  it("the launch audit exists and is non-trivial", () => {
    const audit = join(REPO_ROOT, "docs", "audits", "launch-completion-v1-audit.md");
    expect(existsSync(audit)).toBe(true);
    expect(readFileSync(audit, "utf8").length).toBeGreaterThan(400);
  });

  for (const doc of REQUIRED_DOCS) {
    it(`docs/launch/${doc} exists and is non-empty`, () => {
      const full = join(LAUNCH_DIR, doc);
      expect(existsSync(full), `${doc} missing`).toBe(true);
      expect(readFileSync(full, "utf8").trim().length, `${doc} empty`).toBeGreaterThan(120);
    });
  }
});

describe("billing remains disabled; live is impossible to activate", () => {
  const emptyInput = {
    paymentsEnabled: undefined,
    provider: undefined,
    mode: undefined,
    secretKey: undefined,
    webhookSecret: undefined,
    publishableKey: undefined,
  };

  it("default (no env) → disabled, payments off", () => {
    const cfg = resolveBillingConfig(emptyInput);
    expect(cfg.state).toBe("disabled");
    expect(cfg.paymentsEnabled).toBe(false);
  });

  it("a live key can never activate payments", () => {
    // Built from parts so no live-key literal exists in source (no-live-payments
    // guard scans for the contiguous literal).
    const liveKey = ["sk", "live", "abc123def456"].join("_");
    const cfg = resolveBillingConfig({
      ...emptyInput,
      paymentsEnabled: true,
      provider: "stripe",
      mode: "live",
      secretKey: liveKey,
    });
    expect(cfg.paymentsEnabled).toBe(false);
    expect(["disabled", "stripe_live_blocked"]).toContain(cfg.state);
  });
});

describe("Stripe handoff exists but Stripe is not connected this stage", () => {
  it("handoff names test-mode-first and keeps live blocked", () => {
    const handoff = readFileSync(join(LAUNCH_DIR, "stripe-next-sprint-handoff.md"), "utf8");
    expect(handoff).toMatch(/not connect Stripe|does \*\*not\*\* connect Stripe/i);
    expect(handoff).toMatch(/test mode/i);
    expect(handoff).toMatch(/no-live-payments/);
  });

  it("payment doc states payments are not active (honest copy)", () => {
    const doc = readFileSync(join(LAUNCH_DIR, "payment-logic-before-stripe.md"), "utf8");
    expect(doc).toMatch(/inert|disabled|not (yet )?active|being prepared|ruošiami|neaktyvi/i);
  });
});
