/**
 * Guard — NO LIVE PAYMENTS (Stripe sprint evolution of the pre-payment guard).
 *
 * The chain may now run in Stripe TEST mode (env-gated), but LIVE must remain
 * impossible. Fails the build if:
 *   - the static default PAYMENTS_ENABLED const is flipped true (off by default);
 *   - any source OUTSIDE the allowlisted adapter imports the Stripe SDK;
 *   - a LIVE key literal (sk_live_/pk_live_/rk_live_<chars>) appears in source;
 *   - the config resolver would ever return an ACTIVE provider for live mode or
 *     a live key (behavioral assertion — the real safety net).
 *
 * This guard is STRENGTHENED, never disabled.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAYMENTS_ENABLED } from "../billing/plans";
import { resolveBillingConfig } from "../billing/config-core";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");

// The ONLY file permitted to import the Stripe SDK.
const STRIPE_ADAPTER_ALLOWLIST = ["lib/billing/providers/stripe-test.ts"];

function sources(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next") continue;
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) sources(p, acc);
    else if (/\.(ts|tsx)$/.test(p) && !/no-live-payments\.test\.ts$/.test(p)) acc.push(p);
  }
  return acc;
}

const rel = (file: string) => file.split(/[\\/]apps[\\/]web[\\/]/)[1]?.replace(/\\/g, "/") ?? file;

// Real SDK import shapes (static or dynamic) — not the word "stripe" in prose.
const SDK_IMPORT =
  /\b(?:import|require|import\s*\()\b[^\n;]*?["']((?:@?stripe|stripe\/|@stripe\/)[^"']*|montonio[^"']*)["']/i;
// A real LIVE key literal — chars after the prefix (the config regex `sk_live_`
// with nothing after does NOT match, so the safety code is not flagged).
const LIVE_KEY_LITERAL = /\b(?:sk|pk|rk)_live_[A-Za-z0-9]{6,}/;

describe("no live payments (Stripe test-mode guard)", () => {
  it("PAYMENTS_ENABLED static default is false (off by default)", () => {
    expect(PAYMENTS_ENABLED).toBe(false);
  });

  it("Stripe SDK is imported ONLY in the allowlisted adapter (production code)", () => {
    const offenders: string[] = [];
    for (const file of [...sources(join(webRoot, "lib")), ...sources(join(webRoot, "app"))]) {
      // Test files may import the SDK to sign/verify TEST events — the rule is
      // about PRODUCTION code never reaching Stripe except via the adapter.
      if (/\.(test|integration\.test)\.tsx?$/.test(file)) continue;
      const r = rel(file);
      const txt = readFileSync(file, "utf8");
      const importsSdk = txt.split(/\r?\n/).some((l) => SDK_IMPORT.test(l));
      if (importsSdk && !STRIPE_ADAPTER_ALLOWLIST.includes(r)) offenders.push(r);
    }
    expect(offenders, `Stripe SDK imported outside the adapter:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("no LIVE key literal appears anywhere in source", () => {
    const hits: string[] = [];
    for (const file of [...sources(join(webRoot, "lib")), ...sources(join(webRoot, "app"))]) {
      const txt = readFileSync(file, "utf8");
      if (LIVE_KEY_LITERAL.test(txt)) hits.push(rel(file));
    }
    expect(hits, `LIVE key literal found:\n${hits.join("\n")}`).toEqual([]);
  });

  // ── Behavioral: the config resolver can NEVER activate live. ──────────────
  it("live MODE is blocked (never an active provider)", () => {
    const c = resolveBillingConfig({
      paymentsEnabled: "true", provider: "stripe", mode: "live",
      secretKey: "sk_test_abc", webhookSecret: "whsec_abc", publishableKey: "pk_test_abc",
    });
    expect(c.state).toBe("stripe_live_blocked");
    expect(c.paymentsEnabled).toBe(false);
  });

  it("a live KEY is blocked even if mode says test", () => {
    const c = resolveBillingConfig({
      paymentsEnabled: "true", provider: "stripe", mode: "test",
      secretKey: "sk_live_REALKEY123", webhookSecret: "whsec_abc", publishableKey: undefined,
    });
    expect(c.state).toBe("stripe_live_blocked");
    expect(c.paymentsEnabled).toBe(false);
  });

  it("a live PUBLISHABLE key is blocked", () => {
    const c = resolveBillingConfig({
      paymentsEnabled: "true", provider: "stripe", mode: "test",
      secretKey: "sk_test_abc", webhookSecret: "whsec_abc", publishableKey: "pk_live_REALKEY123",
    });
    expect(c.state).toBe("stripe_live_blocked");
  });

  it("payments are disabled by default (no env)", () => {
    const c = resolveBillingConfig({
      paymentsEnabled: undefined, provider: undefined, mode: undefined,
      secretKey: undefined, webhookSecret: undefined, publishableKey: undefined,
    });
    expect(c.state).toBe("disabled");
    expect(c.paymentsEnabled).toBe(false);
    expect(c.reason).toBe("payments_disabled");
  });
});

// ─── D3 (2026-09-02): live is reachable ONLY through the owner-armed path ───
// Every assertion above still holds: with no `liveActivation` input a live
// signal is blocked exactly as before. What is new is the NAMED path that
// activates it — and the proof that production cannot take it from env alone.
describe("live activation is owner-armed, never implicit", () => {
  const LIVE_SK = ["sk", "live", "ABC123456"].join("_");
  const LIVE_PK = ["pk", "live", "ABC123456"].join("_");
  const base = {
    paymentsEnabled: "true", provider: "stripe", mode: "live",
    secretKey: LIVE_SK, webhookSecret: "whsec_abc", publishableKey: LIVE_PK,
  };

  it("without the activation input every live signal is blocked (all callers before D3)", () => {
    expect(resolveBillingConfig(base).state).toBe("stripe_live_blocked");
  });

  it("the token alone does not activate: the price table must be owner-confirmed in code", () => {
    const c = resolveBillingConfig({
      ...base,
      liveActivation: { pricingConfirmed: false, token: "approved-by-owner" },
    });
    expect(c.state).toBe("stripe_live_blocked");
    expect(c.paymentsEnabled).toBe(false);
  });

  it("PRICING_READINESS_STATE is still draft on main — production cannot arm live from env alone", async () => {
    const { PRICING_READINESS_STATE } = await import("../billing/readiness");
    expect(PRICING_READINESS_STATE).toBe("draft_pricing");
  });

  it("the resolver's live branch names every requirement", () => {
    const src = readFileSync(join(webRoot, "lib/billing/config-core.ts"), "utf8");
    for (const needle of [
      "LIVE_ACTIVATION_TOKEN",
      "pricingConfirmed",
      "live_keys_incomplete",
      "missing_webhook_secret",
    ]) {
      expect(src).toContain(needle);
    }
  });
});
