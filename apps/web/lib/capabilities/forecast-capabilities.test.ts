import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/confirmation-spend", () => ({
  spendConfirmation: async () => "spent",
  spendConfirmationForRequest: async () => "spent",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
const employer = vi.fn(async () => ({ ok: true, organizationId: ORG, companyId: "c", organizationName: "Org", role: "owner" }));
vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompanyForCaller: () => employer(),
}));

import { computeProjectForecast } from "@/lib/forecast/forecast-engine";
import { baseFacts } from "@/lib/forecast/forecast-test-fixtures";

import type { CapabilityCaller } from "./contract";
import { FORECAST_CAPABILITIES } from "./forecast-capabilities";

const ORG = "0a000000-0000-4000-8000-000000000001";
const PRJ = "0b000000-0000-4000-8000-000000000001";

const cap = (id: string) => FORECAST_CAPABILITIES.find((c) => c.id === id)!;

type Tables = Record<string, { data: unknown; error: { code?: string } | null }>;

function makeCaller(opts: { tables?: Tables; admin?: boolean; rpcError?: { code: string } }) {
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const writes: string[] = [];
  const query = (table: string) => {
    const result = opts.tables?.[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: result.error });
    for (const m of ["insert", "update", "upsert", "delete"]) chain[m] = () => (writes.push(`${m}:${table}`), chain);
    chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return chain;
  };
  const supabase = {
    from: query,
    async rpc(fn: string, args: unknown) {
      rpcCalls.push({ fn, args });
      if (fn === "is_admin") return { data: opts.admin === true, error: null };
      if (fn === "forecast_set_mode_v1") {
        return opts.rpcError ? { data: null, error: opts.rpcError } : { data: { mode: (args as { p_mode: string }).p_mode }, error: null };
      }
      return { data: null, error: { code: "42883" } };
    },
  } as unknown as CapabilityCaller["supabase"];
  const caller: CapabilityCaller = { userId: "0c000000-0000-4000-8000-000000000001", transport: "cookie", supabase, locale: "en" };
  return { caller, rpcCalls, writes };
}

const row = (version: number, over: Record<string, unknown> = {}) => ({
  project_id: PRJ,
  organization_id: ORG,
  version,
  mode: "live",
  reason: "signal",
  computed_at: `2026-10-${10 + version}T06:00:00Z`,
  as_of: `2026-10-${10 + version}`,
  engine_version: "forecast-engine-v1",
  forecast: computeProjectForecast(baseFacts()),
  comparison: version > 1 ? { previousVersion: version - 1, completionShiftDays: 2 } : null,
  facts_summary: { totalHours: 100 * version, unitsRemaining: 5 },
  ...over,
});

describe("forecast capabilities — shape", () => {
  it("one read, one draft → confirm pair; the draft writes nothing; all exposed", () => {
    expect(FORECAST_CAPABILITIES.map((c) => [c.id, c.kind])).toEqual([
      ["project.forecast.get", "read"],
      ["forecast.mode.set_draft", "draft"],
      ["forecast.mode.set_confirm", "confirm"],
    ]);
    for (const c of FORECAST_CAPABILITIES) expect(c.exposed).toBe(true);
    expect(cap("project.forecast.get").annotations.readOnlyHint).toBe(true);
    expect(cap("forecast.mode.set_draft").annotations.readOnlyHint).toBe(true);
    expect(cap("forecast.mode.set_confirm").annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("the reads and the draft say a forecast is not a fact", () => {
    expect(cap("project.forecast.get").description).toMatch(/never a fact/);
  });
});

describe("project.forecast.get", () => {
  it("latest + history + comparison + cadence, labelled a forecast", async () => {
    const { caller } = makeCaller({
      tables: {
        project_forecasts: { data: [row(3), row(2), row(1)], error: null },
        organization_forecast_settings: { data: [{ organization_id: ORG, mode: "live", enabled: true }], error: null },
      },
    });
    const r = await cap("project.forecast.get").run(caller, { projectId: PRJ });
    expect(r.ok).toBe(true);
    const d = (r as unknown as { data: Record<string, unknown> }).data as {
      kind: string;
      cadence: unknown;
      latest: { version: number; comparisonWithPrevious: unknown; forecast: { kind: string } };
      history: { version: number }[];
      actualVsForecast: unknown;
    };
    expect(d.kind).toBe("forecast");
    expect(d.latest.version).toBe(3);
    expect(d.latest.forecast.kind).toBe("forecast");
    expect(d.latest.comparisonWithPrevious).toMatchObject({ completionShiftDays: 2 });
    expect(d.history.map((h) => h.version)).toEqual([2, 1]);
    expect(d.cadence).toEqual({ mode: "live", enabled: true });
    expect(d.actualVsForecast).toBeNull(); // work remains: no actual yet
  });

  it("once nothing remains, each version is measured against the actual", async () => {
    const done = row(3, { facts_summary: { totalHours: 300, unitsRemaining: 0, lastUnitCompletedOn: "2026-11-20" } });
    const { caller } = makeCaller({ tables: { project_forecasts: { data: [done, row(2), row(1)], error: null } } });
    const r = await cap("project.forecast.get").run(caller, { projectId: PRJ });
    const a = (r as unknown as { data: { actualVsForecast: { actual: unknown; measured: number } } }).data.actualVsForecast;
    expect(a.actual).toEqual({ completedOn: "2026-11-20", totalHours: 300 });
    expect(a.measured).toBeGreaterThan(0);
  });

  it("a missing table is needs_migration and a failed read is unavailable — never an empty answer", async () => {
    const missing = makeCaller({ tables: { project_forecasts: { data: null, error: { code: "42P01" } } } });
    expect(await cap("project.forecast.get").run(missing.caller, {})).toMatchObject({ ok: false, code: "needs_migration" });
    const failed = makeCaller({ tables: { project_forecasts: { data: null, error: { code: "57014" } } } });
    expect(await cap("project.forecast.get").run(failed.caller, { projectId: PRJ })).toMatchObject({ ok: false, code: "unavailable" });
  });
});

describe("forecast.mode.set — administrators only, draft → confirm, audited by the database", () => {
  it("a non-administrator is refused at the draft, nothing written", async () => {
    const { caller, rpcCalls, writes } = makeCaller({ admin: false });
    expect(await cap("forecast.mode.set_draft").run(caller, { mode: "live" })).toMatchObject({ ok: false, code: "not_authorized" });
    expect(rpcCalls.map((c) => c.fn)).toEqual(["is_admin"]);
    expect(writes).toEqual([]);
  });

  it("the owner switches the organization to live: preview, then the one database door", async () => {
    const { caller, rpcCalls, writes } = makeCaller({ admin: true });
    const draft = await cap("forecast.mode.set_draft").run(caller, { mode: "live" });
    expect(draft.ok).toBe(true);
    const { preview, confirmationToken } = (draft as unknown as { data: { preview: unknown; confirmationToken: string } }).data;
    expect(preview).toEqual({ organizationId: ORG, from: { mode: "weekly", enabled: true }, to: { mode: "live", enabled: true } });
    expect(writes).toEqual([]);

    const confirmed = await cap("forecast.mode.set_confirm").run(caller, { mode: "live", confirmationToken });
    expect(confirmed).toMatchObject({ ok: true });
    const set = rpcCalls.find((c) => c.fn === "forecast_set_mode_v1");
    expect(set?.args).toEqual({ p_organization_id: ORG, p_mode: "live", p_enabled: true, p_note: null });
    expect(writes).toEqual([]); // no direct table write — only the audited door
  });

  it("a token for one input never confirms another", async () => {
    const { caller } = makeCaller({ admin: true });
    const draft = await cap("forecast.mode.set_draft").run(caller, { mode: "daily" });
    const token = (draft as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    expect(await cap("forecast.mode.set_confirm").run(caller, { mode: "live", confirmationToken: token })).toMatchObject({
      ok: false,
      code: "confirmation_invalid",
    });
  });

  it("the database's own refusal (42501) is reported as not authorized", async () => {
    const { caller } = makeCaller({ admin: true, rpcError: { code: "42501" } });
    const draft = await cap("forecast.mode.set_draft").run(caller, { mode: "hourly", enabled: false });
    const token = (draft as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    expect(await cap("forecast.mode.set_confirm").run(caller, { mode: "hourly", enabled: false, confirmationToken: token })).toMatchObject({
      ok: false,
      code: "not_authorized",
    });
  });
});
