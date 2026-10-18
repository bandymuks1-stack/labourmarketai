import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications/event-emitters", () => ({
  emitWorkTaskAssignedNotification: vi.fn(async () => undefined),
}));
vi.mock("@/lib/tasks/tasks", () => ({
  readWorkTaskAssignmentFacts: vi.fn(async () => ({})),
}));

import { createWorkTaskCore, isStructureOutcome } from "@/lib/tasks/create-task-core";

const STAGE = "11111111-1111-4111-8111-111111111111";
const PARENT = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const NEW_ID = "55555555-5555-4555-8555-555555555555";

type Call = { fn: string; args: Record<string, unknown> };

function client(
  respond: (call: Call) => { data?: unknown; error?: { code: string } | null },
) {
  const calls: Call[] = [];
  const supabase = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const call = { fn, args };
      calls.push(call);
      const r = respond(call);
      return { data: r.data ?? null, error: r.error ?? null };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, calls };
}

const base = { title: "Pour the slab", projectId: PROJECT, assignSelf: true };

describe("createWorkTaskCore — stage / parent honest degradation", () => {
  it("a plain create keeps the exact pre-migration argument set", async () => {
    const { supabase, calls } = client(() => ({ data: NEW_ID }));
    const r = await createWorkTaskCore(supabase, USER, base);
    expect(r).toEqual({ kind: "created", id: NEW_ID });
    expect(Object.keys(calls[0].args)).not.toContain("p_stage_id");
    expect(Object.keys(calls[0].args)).not.toContain("p_parent_task_id");
  });

  it("sends the stage when one is chosen", async () => {
    const { supabase, calls } = client(() => ({ data: NEW_ID }));
    await createWorkTaskCore(supabase, USER, { ...base, stageId: STAGE });
    expect(calls[0].args.p_stage_id).toBe(STAGE);
  });

  it("a subtask sends only the parent (it inherits the parent's stage)", async () => {
    const { supabase, calls } = client(() => ({ data: NEW_ID }));
    await createWorkTaskCore(supabase, USER, {
      ...base,
      stageId: STAGE,
      parentTaskId: PARENT,
    });
    expect(calls[0].args.p_parent_task_id).toBe(PARENT);
    expect(calls[0].args).not.toHaveProperty("p_stage_id");
  });

  it.each(["42883", "PGRST202", "42703"])(
    "stage/parent with the migration unapplied (%s) → needs_migration, never an error",
    async (code) => {
      const { supabase, calls } = client(() => ({ error: { code } }));
      const r = await createWorkTaskCore(supabase, USER, {
        ...base,
        stageId: STAGE,
      });
      expect(r).toEqual({ kind: "needs_migration" });
      // and no v1 fallback silently drops the requested structure
      expect(calls.map((c) => c.fn)).toEqual(["create_work_task_v2"]);
    },
  );

  it("a plain create still falls back to v1 when v2 is unapplied", async () => {
    const { supabase, calls } = client((c) =>
      c.fn === "create_work_task_v2"
        ? { error: { code: "42883" } }
        : { data: NEW_ID },
    );
    const r = await createWorkTaskCore(supabase, USER, base);
    expect(r.kind).toBe("created");
    expect(calls.map((c) => c.fn)).toEqual([
      "create_work_task_v2",
      "create_work_task_v1",
    ]);
  });

  it.each(["invalid_stage", "invalid_parent", "depth_exceeded"])(
    "RPC outcome %s maps to invalid_structure",
    async (word) => {
      expect(isStructureOutcome(word)).toBe(true);
      const { supabase } = client(() => ({ data: word }));
      const r = await createWorkTaskCore(supabase, USER, {
        ...base,
        stageId: STAGE,
      });
      expect(r).toEqual({ kind: "invalid_structure" });
    },
  );

  it("rejects a malformed stage / parent id before any RPC", async () => {
    const { supabase, calls } = client(() => ({ data: NEW_ID }));
    expect(
      await createWorkTaskCore(supabase, USER, { ...base, stageId: "nope" }),
    ).toEqual({ kind: "invalid" });
    expect(
      await createWorkTaskCore(supabase, USER, { ...base, parentTaskId: "nope" }),
    ).toEqual({ kind: "invalid" });
    expect(calls).toHaveLength(0);
  });
});
