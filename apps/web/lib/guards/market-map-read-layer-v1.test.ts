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

describe("NO UI wiring in this PR", () => {
  const SHELL = read("components/app/market-map-shell.tsx");
  const SELF = read("components/app/market-map-self-signal.tsx");
  it("the map components do not import the new read layer yet", () => {
    for (const ui of [SHELL, SELF]) {
      expect(ui).not.toMatch(/market-map\/signals\b/);
      expect(ui).not.toMatch(/getOwnMarketSignals|signal-model/);
    }
  });
  it("no public/market aggregated output is wired into any component", () => {
    const compDir = join(APP, "components", "app");
    const offenders = readdirSync(compDir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => /marketSignals\b/.test(readFileSync(join(compDir, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("NO new DB migration in this PR", () => {
  it("adds no migration file (read layer is pure TS on existing tables)", () => {
    const dir = join(REPO, "supabase", "migrations");
    const count = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".sql")).length
      : 0;
    // 84 = baseline after market_map_data_model_v1 (#458). This PR must not grow it.
    expect(count).toBeLessThanOrEqual(84);
  });
});
