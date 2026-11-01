import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ForecastFactRows } from "./forecast-facts";

vi.mock("server-only", () => ({}));

const sessionRpc = vi.fn();
const adminRpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: sessionRpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: adminRpc }) }));

const { readProjectForecast } = await import("./forecast-read");

const emptyFactRows = (): ForecastFactRows => ({
  project: { status: "live", start_date: "2026-10-01", end_date: "2026-12-01" },
  tasks: { rows: [], truncated: false },
  stages: { rows: [], truncated: false },
  journal: { rows: [], truncated: false },
  allocations: { rows: [], truncated: false },
  team: { active_people: 0, absences: [] },
  defects: { rows: [], failed_corrections: 0 },
  readiness: { workers_with_missing: 0 },
  economics: { budget_total_cents: null, budget_lines_cents: null, budget_lines: 0, actual_cost_cents: null },
});

const PROJECT = "11111111-1111-4111-8111-111111111111";

describe("readProjectForecast — authority first, then the service-only facts door", () => {
  beforeEach(() => {
    sessionRpc.mockReset();
    adminRpc.mockReset();
  });

  it("asks the viewer's own session can_manage_project for exactly this project", async () => {
    sessionRpc.mockResolvedValue({ data: false, error: null });
    await readProjectForecast(PROJECT, "2026-11-01");
    expect(sessionRpc).toHaveBeenCalledWith("can_manage_project", { p_project_id: PROJECT });
  });

  it("a viewer who does not manage the project never reaches the service-role door", async () => {
    sessionRpc.mockResolvedValue({ data: false, error: null });
    expect(await readProjectForecast(PROJECT, "2026-11-01")).toEqual({ state: "not_manager" });
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("a failed authority read is unavailable, and still never reaches the door", async () => {
    sessionRpc.mockResolvedValue({ data: null, error: { code: "PGRST301" } });
    expect(await readProjectForecast(PROJECT, "2026-11-01")).toEqual({ state: "unavailable" });
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("a manager gets a forecast computed from the door's rows, labelled as a forecast", async () => {
    sessionRpc.mockResolvedValue({ data: true, error: null });
    adminRpc.mockResolvedValue({ data: emptyFactRows(), error: null });
    const read = await readProjectForecast(PROJECT, "2026-11-01");
    expect(adminRpc).toHaveBeenCalledWith("forecast_project_facts_v1", { p_project_id: PROJECT, p_today: "2026-11-01" });
    expect(read.state).toBe("ok");
    if (read.state === "ok") {
      expect(read.forecast.kind).toBe("forecast");
      expect(read.forecast.projectId).toBe(PROJECT);
      expect(read.forecast.asOf).toBe("2026-11-01");
    }
  });

  it("a failed or missing door is unavailable — never a forecast that says 'on track'", async () => {
    sessionRpc.mockResolvedValue({ data: true, error: null });
    adminRpc.mockResolvedValue({ data: null, error: { code: "42883" } });
    expect(await readProjectForecast(PROJECT, "2026-11-01")).toEqual({ state: "unavailable" });
  });
});
