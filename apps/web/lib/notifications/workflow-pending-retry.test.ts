import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  slotError: false,
  stepError: false,
  instanceMissing: false,
  terminal: false,
  outcomes: ["written", "written"],
  emit: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const data =
        table === "workflow_instances"
          ? state.instanceMissing
            ? null
            : {
                id: "i",
                organization_id: "o",
                current_step_order: state.terminal ? null : 1,
              }
          : table === "workflow_instance_steps"
            ? { id: "s", status: "active" }
            : [
                { approver_profile_id: "a", decision: null },
                { approver_profile_id: "b", decision: null },
              ];
      const error =
        (table === "workflow_instance_steps" && state.stepError) ||
        (table === "workflow_instance_approvers" && state.slotError)
          ? { code: "42501" }
          : null;
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data, error }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data, error }).then(resolve),
      };
      return chain;
    },
  }),
}));
vi.mock("./events", async (original) => ({
  ...(await original<typeof import("./events")>()),
  isNotificationStoreWriteBlocked: () => false,
  emitNotificationEvent: state.emit,
}));
vi.mock("./notification-preferences", async (original) => ({
  ...(await original<typeof import("./notification-preferences")>()),
  readNotificationPreferencesFor: async () => ({ kind: "ok", rows: [] }),
}));
vi.mock("./email-dispatch", () => ({
  maybeDispatchNotificationEmail: async () => ({ kind: "channel_disabled" }),
}));
vi.mock("./web-push-dispatch", () => ({
  maybeDispatchWebPush: async () => ({ kind: "channel_disabled" }),
}));
vi.mock("../data/worker-core", () => ({ getWorkerCoreRow: async () => null }));
vi.mock("@/lib/opportunities/recommendations", () => ({
  getWorkerJobRecommendations: async () => ({ kind: "unavailable" }),
}));
vi.mock("../worker/weekly-intelligence", () => ({
  getWeeklyPersonalIntelligence: async () => ({ kind: "unavailable" }),
}));
import { emitWorkflowStepPendingNotifications } from "./event-emitters";
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(state, {
    slotError: false,
    stepError: false,
    instanceMissing: false,
    terminal: false,
    outcomes: ["written", "written"],
  });
  state.emit.mockImplementation(async () => ({
    kind: state.outcomes.shift() ?? "written",
  }));
});
describe("workflow pending acknowledgement", () => {
  it("acknowledges only after every approver has a durable notice", async () => {
    expect(await emitWorkflowStepPendingNotifications("i")).toBe(true);
    expect(state.emit).toHaveBeenCalledTimes(2);
  });
  it("keeps the notification pending if one recipient write failed", async () => {
    state.outcomes = ["written", "feature_unavailable"];
    expect(await emitWorkflowStepPendingNotifications("i")).toBe(false);
  });
  it("allows a retry to acknowledge already-written notices without another insert", async () => {
    state.outcomes = ["duplicate", "duplicate"];
    expect(await emitWorkflowStepPendingNotifications("i")).toBe(true);
  });
  it.each(["slotError", "stepError", "instanceMissing"] as const)(
    "retains retry on %s",
    async (key) => {
      state[key] = true;
      expect(await emitWorkflowStepPendingNotifications("i")).toBe(false);
      expect(state.emit).not.toHaveBeenCalled();
    },
  );
  it("does not notify a completed workflow", async () => {
    state.terminal = true;
    expect(await emitWorkflowStepPendingNotifications("i")).toBe(true);
    expect(state.emit).not.toHaveBeenCalled();
  });
});
