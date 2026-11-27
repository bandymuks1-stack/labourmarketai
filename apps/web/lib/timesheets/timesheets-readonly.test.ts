import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/projects/worker-project-access", () => ({
  getOwnWorkerId: async () => "worker-1",
}));

import { createClient } from "@/lib/supabase/server";
import { getTimesheetsOverview } from "./timesheets";

const SHEET = "00000000-0000-4000-8000-000000000001";
const ORG = "00000000-0000-4000-8000-000000000002";
let sheetStatus: string;
const rpc = vi.fn(async () => {
  sheetStatus = "approved";
  return { data: "approved", error: null };
});

function rows(table: string): Record<string, unknown>[] {
  if (table === "timesheets")
    return [
      {
        id: SHEET,
        organization_id: ORG,
        worker_id: "worker-1",
        status: sheetStatus,
        period_start: "2026-01-01",
        period_end: "2026-01-07",
        created_at: "2026-01-08T10:00:00Z",
        lines_snapshot: {},
      },
    ];
  if (table === "workflow_instances")
    return [{ id: "request-1", context_entity_id: SHEET, status: "approved" }];
  return [];
}

beforeEach(() => {
  vi.clearAllMocks();
  sheetStatus = "submitted";
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "profile-1" } },
        error: null,
      }),
    },
    rpc,
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        limit: () => query,
        then: (
          resolve: (result: {
            data: Record<string, unknown>[];
            error: null;
          }) => unknown,
        ) => Promise.resolve({ data: rows(table), error: null }).then(resolve),
      };
      return query;
    },
  };
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
});

describe("the same timesheet reader can serve a strictly read-only consumer", () => {
  it("keeps document and workflow states, without writing to synchronize them", async () => {
    const result = await getTimesheetsOverview({ syncDecisions: false });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected report");
    expect(result.mine[0].status).toBe("submitted");
    expect(result.workflows.get(SHEET)?.instanceStatus).toBe("approved");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves the existing web page's default synchronization", async () => {
    const result = await getTimesheetsOverview();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected report");
    expect(result.mine[0].status).toBe("approved");
    expect(result.workflows.get(SHEET)?.instanceStatus).toBe("approved");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("sync_timesheet_decision_v1", {
      p_timesheet_id: SHEET,
    });
  });
});
