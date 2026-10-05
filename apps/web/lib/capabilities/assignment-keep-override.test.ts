import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length",
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  },
}));

vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompanyForCaller: async () => ({
    ok: true,
    companyId: "comp-1",
    organizationId: "org-1",
    organizationName: "Org One",
    role: "owner",
  }),
}));
vi.mock("@/lib/projects/create-project-core", () => ({
  PROJECT_TITLE_MIN: 2,
  PROJECT_TITLE_MAX: 200,
  insertProjectForCompany: vi.fn(),
}));
vi.mock("@/lib/company/company-workers", () => ({
  listActiveCompanyWorkers: async () => ({ kind: "ok", rows: [] }),
}));

// The ONE keep core is mocked at its boundary: these tests are about what the
// MCP door does AROUND it (draft -> confirm, server-recomputed clash, pending
// decision), never about re-implementing it.
const verdictFor = vi.fn();
const currentCollisions = vi.fn();
const keepCore = vi.fn();
vi.mock("@/lib/projects/override-keep-core", () => ({
  reservationVerdictFor: (...a: unknown[]) => verdictFor(...a),
  currentReceiptCollisions: (...a: unknown[]) => currentCollisions(...a),
  keepOverrideCore: (...a: unknown[]) => keepCore(...a),
}));

import { EMPLOYER_OPERATIONS_CAPABILITIES } from "./employer-operations-capabilities";
import type { CapabilityCaller } from "./contract";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const WORKER_PROFILE = "22222222-2222-4222-8222-222222222222";
const SRC = "33333333-3333-4333-8333-333333333333";
const COLLISIONS = [{ kind: "booking", sourceId: SRC, overlapStart: "2026-10-05", overlapEnd: "2026-10-07" }];

function makeCaller(assignmentStatus: string | null = null) {
  const rpcCalls: string[] = [];
  const table: Record<string, unknown> = {
    projects: { data: { id: PROJECT, title: "Site A", status: "draft", city: "Vilnius", company_id: "comp-x", organization_id: "org-1" }, error: null },
    workers: { data: { id: "w-1", display_name: "Jonas" }, error: null },
    project_worker_assignments: { data: assignmentStatus ? { status: assignmentStatus } : null, error: null },
  };
  const supabase = {
    from(name: string) {
      const outcome = table[name] ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "or", "order", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () => outcome;
      chain.then = (resolve: (v: unknown) => unknown) => resolve(outcome);
      return chain;
    },
    async rpc(fn: string) {
      rpcCalls.push(fn);
      return { data: null, error: null };
    },
  } as unknown as CapabilityCaller["supabase"];
  const caller: CapabilityCaller = { userId: "00000000-0000-4000-8000-0000000000aa", transport: "bearer", supabase, locale: "en" };
  return { caller, rpcCalls };
}

const cap = (id: string) => {
  const c = EMPLOYER_OPERATIONS_CAPABILITIES.find((x) => x.id === id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
};
const collides = {
  verdict: {
    state: "collides",
    gaps: [],
    collisions: [
      { source: "booking", sourceId: SRC, label: null, startDate: "2026-10-01", endDate: "2026-10-07", overlapStart: "2026-10-05", overlapEnd: "2026-10-07" },
      { source: "absence", sourceId: "abs-1", label: null, startDate: "2026-10-12", endDate: "2026-10-13", overlapStart: "2026-10-12", overlapEnd: "2026-10-13" },
    ],
  },
  window: { startDate: "2026-10-05", endDate: "2026-10-20" },
};
const dataOf = (r: { ok: boolean }) => (r as unknown as { data: Record<string, unknown> }).data;

beforeEach(() => {
  verdictFor.mockReset();
  currentCollisions.mockReset();
  keepCore.mockReset();
});

describe("MCP: an assignment over a known clash leaves the SAME pending decision the page leaves", () => {
  it("assignment.create_confirm returns the verdict AFTER the write and an override still PENDING - no receipt", async () => {
    verdictFor.mockResolvedValue(collides);
    const { caller, rpcCalls } = makeCaller();
    const d = await cap("assignment.create_draft").run(caller, { projectId: PROJECT, workerProfileId: WORKER_PROFILE });
    expect(d.ok).toBe(true);
    // the draft already names the clash (advisory) and writes nothing
    expect((dataOf(d).calendar as { state: string }).state).toBe("collides");
    expect(rpcCalls).toEqual([]);
    const token = (dataOf(d).confirmationToken as string) ?? "";
    const r = await cap("assignment.create_confirm").run(caller, { projectId: PROJECT, workerProfileId: WORKER_PROFILE, confirmationToken: token });
    expect(r.ok).toBe(true);
    expect(rpcCalls).toEqual(["assign_worker_to_project"]);
    const data = dataOf(r);
    expect(data.status).toBe("assigned");
    expect((data.calendar as { state: string; collisions: unknown[] }).collisions).toHaveLength(2);
    expect(data.override).toMatchObject({ status: "pending" });
    expect(String((data.override as { next: string }).next)).toContain("assignment.keep_confirm");
    // pending = nothing recorded: the core is NOT called by an assignment
    expect(keepCore).not.toHaveBeenCalled();
    // an absence never carries a label to the model
    const absence = (data.calendar as { collisions: { kind: string; label: unknown }[] }).collisions.find((c) => c.kind === "absence");
    expect(absence?.label).toBeNull();
    expect(JSON.stringify(data)).not.toMatch(/abs-1/);
    // the verdict was computed with the caller's OWN client (never the cookie session)
    expect(verdictFor.mock.calls[0][3]).toMatchObject({ userId: caller.userId });
  });

  it("no clash -> no pending decision; an unreadable calendar says unknown, never clear", async () => {
    verdictFor.mockResolvedValue({ verdict: { state: "clear", gaps: [], collisions: [] }, window: { startDate: null, endDate: null } });
    const a = makeCaller();
    const d1 = await cap("assignment.create_draft").run(a.caller, { projectId: PROJECT, workerProfileId: WORKER_PROFILE });
    const r1 = await cap("assignment.create_confirm").run(a.caller, {
      projectId: PROJECT,
      workerProfileId: WORKER_PROFILE,
      confirmationToken: dataOf(d1).confirmationToken as string,
    });
    expect(dataOf(r1).override).toBeUndefined();
    verdictFor.mockResolvedValue(null);
    const b = makeCaller();
    const d2 = await cap("assignment.create_draft").run(b.caller, { projectId: PROJECT, workerProfileId: WORKER_PROFILE });
    expect((dataOf(d2).calendar as { state: string }).state).toBe("unknown");
  });
});

describe("MCP: assignment.keep_draft / assignment.keep_confirm", () => {
  const input = { projectId: PROJECT, workerProfileId: WORKER_PROFILE, reasonCode: "agreed_with_worker" } as const;

  it("is a draft -> confirm pair; the draft writes nothing and binds the SERVER-recomputed clash", async () => {
    currentCollisions.mockResolvedValue({ state: "collides", collisions: COLLISIONS });
    const { caller, rpcCalls } = makeCaller("active");
    const d = await cap("assignment.keep_draft").run(caller, input);
    expect(d.ok).toBe(true);
    expect(rpcCalls).toEqual([]);
    expect(keepCore).not.toHaveBeenCalled();
    expect(dataOf(d).preview).toMatchObject({ reasonCode: "agreed_with_worker", clashes: [{ kind: "booking", overlapStart: "2026-10-05", overlapEnd: "2026-10-07" }] });
    expect(cap("assignment.keep_draft").annotations.readOnlyHint).toBe(true);
    expect(cap("assignment.keep_confirm").annotations.readOnlyHint).toBe(false);
  });

  it("collisions are NOT an input (strict schema) and the reason is a CLOSED code", async () => {
    const { caller } = makeCaller("active");
    await expect(cap("assignment.keep_draft").run(caller, { ...input, collisions: COLLISIONS })).rejects.toThrow();
    await expect(cap("assignment.keep_draft").run(caller, { ...input, reasonCode: "he is sick" })).rejects.toThrow();
  });

  it("there is nothing to keep without a clash; an unreadable calendar is never recorded blind", async () => {
    const { caller } = makeCaller("active");
    currentCollisions.mockResolvedValue({ state: "clear", collisions: [] });
    const none = await cap("assignment.keep_draft").run(caller, input);
    expect(none.ok === false && none.code).toBe("no_clash");
    currentCollisions.mockResolvedValue(null);
    const blind = await cap("assignment.keep_draft").run(caller, input);
    expect(blind.ok === false && blind.code).toBe("unavailable");
  });

  it("confirm calls the ONE core with ids + reason only, and reports kept only when the receipt exists", async () => {
    currentCollisions.mockResolvedValue({ state: "collides", collisions: COLLISIONS });
    const { caller } = makeCaller("active");
    const d = await cap("assignment.keep_draft").run(caller, input);
    const token = dataOf(d).confirmationToken as string;
    keepCore.mockResolvedValue({ ok: true, receipt: "recorded", receiptId: "rcpt-1" });
    const r = await cap("assignment.keep_confirm").run(caller, { ...input, confirmationToken: token });
    expect(r.ok).toBe(true);
    expect(dataOf(r)).toMatchObject({ status: "kept", receiptId: "rcpt-1", reasonCode: "agreed_with_worker" });
    expect(keepCore).toHaveBeenCalledTimes(1);
    const arg = keepCore.mock.calls[0][1];
    expect(arg).toMatchObject({ projectId: PROJECT, workerProfileId: WORKER_PROFILE, reasonCode: "agreed_with_worker" });
    expect(arg).not.toHaveProperty("collisions");
    expect(arg.caller).toMatchObject({ userId: caller.userId });
  });

  it("FAIL-LOUD: a failed receipt is never reported as kept", async () => {
    currentCollisions.mockResolvedValue({ state: "collides", collisions: COLLISIONS });
    const { caller } = makeCaller("active");
    for (const code of ["error", "not_authorized", "needs_migration", "invalid", "auth"] as const) {
      const d = await cap("assignment.keep_draft").run(caller, input);
      keepCore.mockResolvedValue({ ok: false, code });
      const r = await cap("assignment.keep_confirm").run(caller, { ...input, confirmationToken: dataOf(d).confirmationToken as string });
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toMatch(/"kept"/);
    }
  });

  it("a changed calendar between draft and confirm voids the token; the core is not reached", async () => {
    currentCollisions.mockResolvedValue({ state: "collides", collisions: COLLISIONS });
    const { caller } = makeCaller("active");
    const d = await cap("assignment.keep_draft").run(caller, input);
    currentCollisions.mockResolvedValue({
      state: "collides",
      collisions: [...COLLISIONS, { kind: "trip", sourceId: SRC, overlapStart: "2026-10-10", overlapEnd: "2026-10-11" }],
    });
    const r = await cap("assignment.keep_confirm").run(caller, { ...input, confirmationToken: dataOf(d).confirmationToken as string });
    expect(r.ok === false && r.code).toBe("confirmation_rejected");
    expect(keepCore).not.toHaveBeenCalled();
  });

  it("a different reason code than the one drafted voids the token (the token binds the exact input)", async () => {
    currentCollisions.mockResolvedValue({ state: "collides", collisions: COLLISIONS });
    const { caller } = makeCaller("active");
    const d = await cap("assignment.keep_draft").run(caller, input);
    const r = await cap("assignment.keep_confirm").run(caller, { ...input, reasonCode: "other", confirmationToken: dataOf(d).confirmationToken as string });
    expect(r.ok === false && r.code).toBe("confirmation_rejected");
    expect(keepCore).not.toHaveBeenCalled();
  });

  it("BASIS-AGNOSTIC: no person assignment is required by the tool (the database resolves person vs team basis)", async () => {
    currentCollisions.mockResolvedValue({ state: "collides", collisions: COLLISIONS });
    const { caller } = makeCaller(null); // no project_worker_assignments row at all - a team member
    const d = await cap("assignment.keep_draft").run(caller, input);
    expect(d.ok).toBe(true);
    keepCore.mockResolvedValue({ ok: true, receipt: "recorded", receiptId: "rcpt-2" });
    const r = await cap("assignment.keep_confirm").run(caller, { ...input, confirmationToken: dataOf(d).confirmationToken as string });
    expect(r.ok).toBe(true);
  });
});
