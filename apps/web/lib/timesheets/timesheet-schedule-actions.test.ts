import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: true }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    auth: {
      getUser: async () => ({
        data: { user: mocks.user ? { id: "actor" } : null },
      }),
    },
  }),
}));
import { saveTimesheetScheduleAction } from "./timesheet-schedule-actions";
const ORG = "11111111-1111-4111-8111-111111111111",
  DEF = "22222222-2222-4222-8222-222222222222";
function form(extra: Partial<Record<string, string>> = {}) {
  const f = new FormData();
  Object.entries({
    locale: "lt",
    organizationId: ORG,
    definitionId: DEF,
    frequency: "weekly",
    localTime: "09:15",
    timeZone: "Europe/Vilnius",
    weekday: "2",
    enabled: "true",
    ...extra,
  }).forEach(([k, v]) => {
    if (v !== undefined) f.set(k, v);
  });
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user = true;
  mocks.rpc.mockResolvedValue({ data: "saved", error: null });
});
describe("own report scheduling action", () => {
  it("passes the selected settings to the canonical command without accepting an actor id", async () => {
    await expect(
      saveTimesheetScheduleAction(form({ profileId: "other" })),
    ).rejects.toThrow("ts=schedule_saved");
    expect(mocks.rpc).toHaveBeenCalledWith("save_timesheet_schedule_v1", {
      p_organization_id: ORG,
      p_definition_id: DEF,
      p_frequency: "weekly",
      p_local_time: "09:15",
      p_time_zone: "Europe/Vilnius",
      p_weekday: 2,
      p_enabled: true,
    });
  });
  it.each([
    { localTime: "25:00" },
    { timeZone: "Invalid/Zone" },
    { weekday: "0" },
    { frequency: "hourly" },
  ])("rejects invalid settings %j before a write", async (invalid) => {
    await expect(saveTimesheetScheduleAction(form(invalid))).rejects.toThrow(
      "ts=invalid",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("allows opt-out when the previous template no longer exists", async () => {
    await expect(
      saveTimesheetScheduleAction(form({ enabled: "", definitionId: "" })),
    ).rejects.toThrow("ts=schedule_saved");
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_enabled: false,
      p_definition_id: null,
    });
  });
  it("does not write without authentication", async () => {
    mocks.user = false;
    await expect(saveTimesheetScheduleAction(form())).rejects.toThrow(
      "ts=not_authorized",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not claim success when SQL denies the template", async () => {
    mocks.rpc.mockResolvedValue({ data: "no_template", error: null });
    await expect(saveTimesheetScheduleAction(form())).rejects.toThrow(
      "ts=no_template",
    );
  });
});
