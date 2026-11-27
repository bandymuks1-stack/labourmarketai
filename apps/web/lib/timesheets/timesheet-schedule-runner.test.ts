import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), emit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/notifications/event-emitters", () => ({
  emitWorkflowStepPendingNotifications: mocks.emit,
}));
import { runTimesheetSchedules } from "./timesheet-schedule-runner";

beforeEach(() => {
  vi.resetAllMocks();
});
describe("scheduled report delivery", () => {
  it("retries an earlier pending notice even when no new report was generated", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          { schedule_id: "own-schedule", instance_id: "existing-approval" },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ error: null });
    mocks.emit.mockResolvedValue(true);
    expect(await runTimesheetSchedules()).toEqual({
      processed: 0,
      submitted: 0,
      blocked: 0,
      notified: 1,
      notificationPending: 0,
    });
    expect(mocks.emit).toHaveBeenCalledWith("existing-approval");
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "ack_timesheet_schedule_notification_v1",
      {
        p_schedule_id: "own-schedule",
        p_instance_id: "existing-approval",
        p_delivered: true,
      },
    );
  });
  it("defers an incomplete delivery without marking it complete", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ outcome: "submitted" }], error: null })
      .mockResolvedValueOnce({
        data: [{ schedule_id: "s", instance_id: "w" }],
        error: null,
      });
    mocks.rpc.mockResolvedValueOnce({ error: null });
    mocks.emit.mockResolvedValue(false);
    expect(await runTimesheetSchedules()).toEqual({
      processed: 1,
      submitted: 1,
      blocked: 0,
      notified: 0,
      notificationPending: 1,
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "ack_timesheet_schedule_notification_v1",
      { p_schedule_id: "s", p_instance_id: "w", p_delivered: false },
    );
  });
  it("keeps a failed acknowledgement pending and reports counts only", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ outcome: "overlap", schedule_id: "PRIVATE" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ schedule_id: "PRIVATE", instance_id: "PRIVATE" }],
        error: null,
      })
      .mockResolvedValueOnce({ error: { message: "PRIVATE" } });
    mocks.emit.mockResolvedValue(true);
    const result = await runTimesheetSchedules();
    expect(result?.notificationPending).toBe(1);
    expect(result?.blocked).toBe(1);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it.each(["dispatch", "pending"])(
    "does not report success on %s read failure",
    async (where) => {
      if (where === "pending")
        mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
      expect(await runTimesheetSchedules()).toBeNull();
      expect(mocks.emit).not.toHaveBeenCalled();
    },
  );
});
