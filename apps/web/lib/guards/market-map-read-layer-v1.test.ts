import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market Map read layer v1 guard.
 *
 * Locks the v1 contract: a pure normalization/visibility/aggregation engine +
 * an owner-scoped fetcher, with NO UI wiring, NO privileged cross-user read,
 * and NO new DB migration.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const MODEL = read("lib/market-map/signal-model.ts");
const FETCHER = read("lib/market-map/signals.ts");

describe("pure engine exports the contract", () => {
  it("normalized shape carries every required field", () => {
    for (const f of [
      "signalId",
      "signalType",
      "ownerType",
      "country",
      "region",
      "city",
      "granularity",
      "visibilityLevel",
      "aggregatedCount",
      "canShowExact",
      "sourceStatus",
      "updatedAt",
    ]) {
      expect(MODEL, `field ${f}`).toMatch(new RegExp(`\\b${f}\\b`));
    }
  });
  it("covers the six signal types", () => {
    for (const t of [
      "profile_location",
      "company_location",
      "login_location",
      "preferred_location",
      "company_need_location",
      "project_location",
    ]) {
      expect(MODEL).toContain(`"${t}"`);
    }
  });
  it("exposes the visibility + aggregation functions", () => {
    for (const fn of ["selfSignalsForViewer", "isShareable", "aggregateSignals", "marketSignals"]) {
      expect(MODEL).toMatch(new RegExp(`export function ${fn}`));
    }
    expect(MODEL).toMatch(/DEFAULT_MIN_BUCKET/);
  });
});

describe("owner-scoped fetcher — RLS only, no privileged cross-user read", () => {
  it("is server-only and reads all six sources scoped to the caller", () => {
    expect(FETCHER).toMatch(/server-only/);
    for (const src of [
      "profiles",
      "companies",
      "preferred_locations",
      "consented_login_location_signals",
      "company_demand_locations",
      "projects",
    ]) {
      expect(FETCHER).toContain(`"${src}"`);
    }
  });
  it("uses the RLS client (no service_role, no SECURITY DEFINER RPC)", () => {
    expect(FETCHER).toMatch(/@\/lib\/supabase\/server/);
    expect(FETCHER).not.toMatch(/service_role|SERVICE_ROLE|admin\b|createServiceClient/);
    expect(FETCHER).not.toMatch(/\.rpc\(/);
  });
  it("login signal can never carry an exact point", () => {
    // In the login branch, canShowExact is hard-coded false.
    expect(FETCHER).toMatch(/canShowExact:\s*false,\s*\/\/ login is never an exact point/);
  });
});

describe("owner view wired; public/cross-user aggregate NOT", () => {
  const SHELL = read("components/app/market-map-shell.tsx");
  it("the shell wires the OWNER read layer (getOwnMarketSignals)", () => {
    expect(SHELL).toMatch(/getOwnMarketSignals/);
    expect(SHELL).toMatch(/MarketMapMySignals/);
  });
  it("the owner-view component takes data via props, not the server fetcher", () => {
    const my = read("components/app/market-map-my-signals.tsx");
    expect(my).not.toMatch(/from\s+"@\/lib\/market-map\/signals"/);
    expect(my).not.toMatch(/getOwnMarketSignals/);
  });
  it("NO component uses the public/cross-user aggregate (marketSignals)", () => {
    const compDir = join(APP, "components", "app");
    const offenders = readdirSync(compDir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => /\bmarketSignals\b/.test(readFileSync(join(compDir, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("NO new DB migration in this PR", () => {
  it("adds no migration file (read layer is pure TS on existing tables)", () => {
    const dir = join(REPO, "supabase", "migrations");
    const count = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".sql")).length
      : 0;
    // 87 = baseline after W6 human_in_loop_learning (20260627132759) — ONE
    // additive RED migration, human-gated, NOT applied (previous: 86 for W8
    // service_offerings). The read layer itself adds no migration; the global
    // baseline only grows deliberately.
    // Bumped 91 -> 92 for the P0 admin self-promotion guard
    // (20260702130000_admin_grant_guard) — APPLIED to prod via MCP 2026-07-02.
    // Bumped 92 -> 93 for the worker personal-engagement provisioning draft
    // (20260702140000_worker_personal_engagement) — owner-approved apply.
    // Bumped 93 -> 94 for the pilot_events anon INSERT grant
    // (20260702150000) — owner-approved apply 2026-07-02.
    // Bumped 94 -> 95 for approved-route MODEL A (20260702170000) —
    // owner-approved apply 2026-07-02.
    // Bumped 95 -> 96 for the service-role report read grant
    // (20260702200000) — owner-gated apply.
    // Bumped 96 -> 97 for the universal profession/skill catalogue seed
    // (20260704120000) — strictly additive INSERT-only, owner-gated apply.
    // Bumped 97 -> 98 for the truth-audit legacy-professions repair
    // (20260704130000) — INSERT-only, idempotent, owner-gated apply.
    // Bumped 98 -> 99 for the wave-2 catalogue expansion (20260704150000,
    // class-E labour-market gaps) — INSERT-only, idempotent, owner-gated.
    // Bumped 99 -> 100 for the worker express-interest signal
    // (20260704230000 demand_interest_signals) — additive worker-owned
    // table, applied to prod via MCP 2026-07-05.
    // Bumped 100 -> 101 for company interest acknowledgement
    // (20260705120000) — one gated SECURITY DEFINER RPC, owner-gated apply.
    expect(count).toBeLessThanOrEqual(101);
  });
});
