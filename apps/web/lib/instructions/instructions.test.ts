import { beforeEach, describe, expect, it, vi } from "vitest";

const { assignments } = vi.hoisted(() => ({ assignments: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/projects/operations", () => ({ readActiveAssignmentRowsForProjects: assignments }));
vi.mock("@/lib/communication/contact-permission", () => ({ readCounterpartIdentities: vi.fn() }));

import { listProjectAssignedWorkers, mergeInstructionRecipients } from "./instructions";

beforeEach(() => { assignments.mockReset(); });

describe("instruction recipients keep read failure separate from no assignments", () => {
  const row = { worker: { profile_id: "worker-1", display_name: "Test worker", profiles: null } };

  it("an empty managed-project set needs no assignment read", async () => {
    await expect(listProjectAssignedWorkers([])).resolves.toEqual([]);
    expect(assignments).not.toHaveBeenCalled();
  });

  it("a successful empty read is an empty picker", async () => {
    assignments.mockResolvedValue(new Map([["project-1", { data: [], error: null }]]));
    await expect(listProjectAssignedWorkers(["project-1"])).resolves.toEqual([]);
  });

  it.each([false, true])("a failed read is not an empty or partial success (other project succeeds: %s)", async (partial) => {
    assignments.mockResolvedValue(new Map([
      ...(partial ? [["project-1", { data: [row], error: null }] as const] : []),
      ["project-2", { data: null, error: { code: "read_failed" } }],
    ]));
    await expect(listProjectAssignedWorkers(["project-1", "project-2"]))
      .rejects.toThrow("instruction_recipients_unavailable");
  });

  it("one recipient keeps every active project, while the roster retains its existing team scope", async () => {
    assignments.mockResolvedValue(new Map([
      ["project-1", { data: [row], error: null }],
      ["project-2", { data: [row], error: null }],
    ]));
    const assigned = await listProjectAssignedWorkers(["project-1", "project-2"]);
    expect(assigned).toEqual([{ profileId: "worker-1", name: "Test worker", projectIds: ["project-1", "project-2"] }]);
    const roster = [{ profileId: "worker-1", name: "Test worker" }];
    expect(mergeInstructionRecipients(roster, assigned)).toEqual(roster);
  });
});
