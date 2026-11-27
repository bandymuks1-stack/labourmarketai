import { beforeEach, describe, expect, it, vi } from "vitest";

const { assignments, client } = vi.hoisted(() => ({ assignments: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: client }));
vi.mock("@/lib/projects/operations", () => ({ readActiveAssignmentRowsForProjects: assignments }));
vi.mock("@/lib/communication/contact-permission", () => ({ readCounterpartIdentities: vi.fn() }));

import { listWorkerInstructions, listAttentionInstructions, listProjectAssignedWorkers, mergeInstructionRecipients } from "./instructions";

beforeEach(() => { assignments.mockReset(); client.mockReset().mockResolvedValue({}); });

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

describe("personal instructions stay in the caller's own conversations", () => {
  type Row = Record<string, unknown>;
  let rows: Record<string, Row[]>;
  let errors: Record<string, { code: string }>;
  let user: { id: string } | null;
  let reads: string[];
  const instruction = (id: string, conversation: string, date = "2026-11-26T10:00:00Z"): Row => ({
    id, conversation_id: conversation, is_instruction: true, author_id: "manager",
    body: id, created_at: date, author: { full_name: "Test manager" },
  });

  beforeEach(() => {
    user = { id: "viewer" };
    reads = [];
    errors = {};
    // Simulate a client whose database role can read other conversations too.
    // The personal list must still use the actual participant, not that wider view.
    rows = {
      conversation_participants: [
        { profile_id: "viewer", conversation_id: "mine", revoked_at: null, last_read_at: "2026-11-25T10:00:00Z" },
        { profile_id: "someone-else", conversation_id: "other", revoked_at: null, last_read_at: null },
      ],
      conversation_messages: [instruction("own incoming", "mine"), instruction("other incoming", "other")],
    };
    client.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user } }) },
      from: (table: string) => {
        const filters: Array<(row: Row) => boolean> = [];
        let limit = Infinity;
        let descending = false;
        const chain = {
          select: () => chain,
          eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
          is: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
          neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return chain; },
          in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return chain; },
          order: () => { descending = true; return chain; },
          limit: (count: number) => { limit = count; return chain; },
          then: (resolve: (result: { data: Row[] | null; error: { code: string } | null }) => unknown) => {
            reads.push(table);
            let data = (rows[table] ?? []).filter(row => filters.every(filter => filter(row)));
            if (descending) data = [...data].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
            return Promise.resolve({ data: errors[table] ? null : data.slice(0, limit), error: errors[table] ?? null }).then(resolve);
          },
        };
        return chain;
      },
    });
  });

  it("shows incoming own instructions, not another thread or the caller's sent instructions", async () => {
    rows.conversation_messages.push({ ...instruction("own sent", "mine"), author_id: "viewer" });
    const result = await listWorkerInstructions();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.instructions.map(i => i.id)).toEqual(["own incoming"]);
  });

  it("a hundred newer foreign messages cannot displace an older own instruction", async () => {
    rows.conversation_messages = [
      ...Array.from({ length: 110 }, (_, i) => instruction(`foreign ${i}`, "other")),
      instruction("older own", "mine", "2026-11-20T10:00:00Z"),
    ];
    const result = await listWorkerInstructions();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.instructions.map(i => i.id)).toEqual(["older own"]);
  });

  it("a revoked participant row does not turn broader visibility into a personal instruction", async () => {
    rows.conversation_participants.push({
      profile_id: "viewer", conversation_id: "revoked", revoked_at: "2026-11-25T09:00:00Z", last_read_at: null,
    });
    rows.conversation_messages.push(instruction("after revocation", "revoked"));
    const result = await listWorkerInstructions();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.instructions.map(i => i.id)).toEqual(["own incoming"]);
    expect((await listAttentionInstructions()).map(i => i.id)).toEqual(["own incoming"]);
  });

  it("no own participation means an empty list without reading messages", async () => {
    rows.conversation_participants = rows.conversation_participants.filter(p => p.profile_id !== "viewer");
    expect(await listWorkerInstructions()).toEqual({ kind: "ok", instructions: [] });
    expect(reads).toEqual(["conversation_participants"]);
  });

  it("a failed scope read is unavailable, never a wider or falsely empty list", async () => {
    errors.conversation_participants = { code: "XX000" };
    await expect(listWorkerInstructions()).rejects.toThrow("instruction_participants_unavailable");
    expect(reads).toEqual(["conversation_participants"]);
  });

  it("keeps the existing missing-migration state", async () => {
    errors.conversation_participants = { code: "42P01" };
    expect(await listWorkerInstructions()).toEqual({ kind: "needs-migration" });
    expect(reads).toEqual(["conversation_participants"]);
  });

  it("an unauthenticated call never reads messages or participation", async () => {
    user = null;
    expect(await listWorkerInstructions()).toEqual({ kind: "ok", instructions: [] });
    expect(reads).toEqual([]);
  });

  it("the attention summary still contains only unread incoming own instructions", async () => {
    rows.conversation_messages.push(instruction("already read", "mine", "2026-11-24T10:00:00Z"));
    expect((await listAttentionInstructions()).map(i => i.id)).toEqual(["own incoming"]);
  });
});
