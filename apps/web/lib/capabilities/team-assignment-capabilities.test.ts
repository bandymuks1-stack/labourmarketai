import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length",
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  },
}));

type Gate =
  | { ok: true; companyId: string; organizationId: string; organizationName: string; role: string }
  | { ok: false; reason: string };
const employerGate = vi.fn(
  async (): Promise<Gate> => ({
    ok: true,
    companyId: "comp-1",
    organizationId: "org-1",
    organizationName: "Org One",
    role: "owner",
  }),
);
vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompanyForCaller: (...a: unknown[]) => employerGate(...(a as [])),
}));
// The person-assignment module (shared refusal) pulls these; same stubs as its own test.
vi.mock("@/lib/projects/create-project-core", () => ({
  PROJECT_TITLE_MIN: 2,
  PROJECT_TITLE_MAX: 200,
  insertProjectForCompany: async () => ({ ok: true as const, id: "x" }),
}));
vi.mock("@/lib/company/company-workers", () => ({
  listActiveCompanyWorkers: async () => ({ kind: "ok", rows: [] }),
}));

// THE CORE the web UI uses. The tools must call exactly these.
const assignCore = vi.fn(async (..._a: unknown[]) => ({
  status: "ok" as const,
  outcome: "created" as const,
  assignmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  memberCalendar: [] as unknown[],
}));
const endCore = vi.fn(async (..._a: unknown[]) => ({ status: "ok" as const, outcome: "ended" as const }));
const previewCore = vi.fn(async (..._a: unknown[]) => ({
  known: true,
  members: [
    {
      profileId: "p-clash",
      name: null,
      verdict: {
        state: "collides",
        collisions: [{ source: "project", sourceId: "x", label: "Other site", startDate: "2026-10-01", endDate: "2026-10-30", overlapStart: "2026-10-10", overlapEnd: "2026-10-30" }],
        gaps: [],
      },
    },
    { profileId: "p-clear", name: null, verdict: { state: "clear", collisions: [], gaps: [] } },
    { profileId: "p-unknown", name: null, verdict: { state: "unknown", collisions: [], gaps: [{ reason: "undated_window" }] } },
  ],
}));
vi.mock("@/lib/projects/team-assignment", () => ({
  assignTeamToWork: (...a: unknown[]) => assignCore(...a),
  endTeamAssignment: (...a: unknown[]) => endCore(...a),
  previewTeamAssignmentCalendar: (...a: unknown[]) => previewCore(...a),
}));

import type { CapabilityCaller } from "./contract";
import { TEAM_ASSIGNMENT_CAPABILITIES } from "./team-assignment-capabilities";

type Outcome = { data: unknown; error: { code?: string; message: string } | null };
type Script = {
  projects?: Outcome;
  organizations?: Outcome;
  list?: Outcome; // team_assignments, array read
  single?: Outcome; // team_assignments, one row by id
};

const USER = "00000000-0000-4000-8000-0000000000aa";

function makeCaller(script: Script, userId = USER) {
  const supabase = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "or", "order", "limit"]) chain[m] = () => chain;
      const pick = (kind: "list" | "single"): Outcome => {
        if (table === "projects") return script.projects ?? { data: null, error: null };
        if (table === "organizations") return script.organizations ?? { data: null, error: null };
        if (table === "team_assignments") return (kind === "list" ? script.list : script.single) ?? { data: null, error: null };
        return { data: null, error: { message: `unscripted ${table}` } };
      };
      chain.maybeSingle = async () => pick("single");
      chain.then = (resolve: (v: unknown) => unknown) => resolve(pick("list"));
      return chain;
    },
  } as unknown as CapabilityCaller["supabase"];
  const caller: CapabilityCaller = { userId, transport: "bearer", supabase, locale: "lt" };
  return caller;
}

const cap = (id: string) => {
  const c = TEAM_ASSIGNMENT_CAPABILITIES.find((x) => x.id === id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
};

const TEAM = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const TASK = "33333333-3333-4333-8333-333333333333";
const OBJECT = "44444444-4444-4444-8444-444444444444";
const OLD = "55555555-5555-4555-8555-555555555555";

const project = (over: Record<string, unknown> = {}): Outcome => ({
  data: { id: PROJECT, title: "Hall", status: "live", city: "Vilnius", company_id: "comp-1", organization_id: "org-1", ...over },
  error: null,
});
const team = (over: Record<string, unknown> = {}): Outcome => ({
  data: { organization_type: "team", display_name: "Brigade A", legal_name: null, ...over },
  error: null,
});
const active = (rows: Record<string, unknown>[]): Outcome => ({ data: rows, error: null });
const row = (over: Record<string, unknown> = {}) => ({
  id: OLD,
  team_org_id: TEAM,
  project_id: PROJECT,
  work_object_id: null,
  task_id: null,
  ended_at: null,
  ...over,
});
const base = (over: Script = {}): Script => ({ projects: project(), organizations: team(), list: active([]), ...over });

beforeEach(() => {
  employerGate.mockClear();
  assignCore.mockClear();
  endCore.mockClear();
  previewCore.mockClear();
});

async function draftToken(id: string, caller: CapabilityCaller, input: Record<string, unknown>) {
  const r = await cap(id).run(caller, input);
  if (!r.ok) throw new Error(`draft refused: ${r.code}`);
  return (r.data as { confirmationToken: string }).confirmationToken;
}

describe("shape and registration", () => {
  it("three draft -> confirm pairs, drafts read-only, none destructive, all exposed", () => {
    const ids = TEAM_ASSIGNMENT_CAPABILITIES.map((c) => c.id);
    expect(ids).toEqual([
      "team_assignment.create_draft",
      "team_assignment.create_confirm",
      "team_assignment.replace_draft",
      "team_assignment.replace_confirm",
      "team_assignment.end_draft",
      "team_assignment.end_confirm",
    ]);
    for (const c of TEAM_ASSIGNMENT_CAPABILITIES) {
      if (c.kind === "draft") {
        expect(ids).toContain(c.id.replace(/_draft$/, "_confirm"));
        expect(c.annotations.readOnlyHint).toBe(true);
      } else {
        expect(c.annotations.readOnlyHint).toBe(false);
      }
      expect(c.annotations.destructiveHint).toBe(false);
      expect(c.exposed).toBe(true);
    }
  });

  it("schemas are strict: no identity argument, no unknown keys, ONE scope only", () => {
    const d = cap("team_assignment.create_draft").inputSchema;
    expect(d.safeParse({ teamId: TEAM, projectId: PROJECT }).success).toBe(true);
    expect(d.safeParse({ teamId: TEAM, projectId: PROJECT, profileId: USER }).success).toBe(false);
    expect(d.safeParse({ teamId: TEAM, projectId: PROJECT, userId: USER }).success).toBe(false);
    expect(d.safeParse({ teamId: TEAM, projectId: PROJECT, taskId: TASK, workObjectId: OBJECT }).success).toBe(false);
    expect(d.safeParse({ teamId: "nope", projectId: PROJECT }).success).toBe(false);
    expect(cap("team_assignment.end_draft").inputSchema.safeParse({ assignmentId: OLD, extra: 1 }).success).toBe(false);
  });
});

describe("create_draft writes nothing and names the clash verdict", () => {
  it("returns a preview with project, team, scope, the CLASH VERDICT and a token; the core is never called", async () => {
    const r = await cap("team_assignment.create_draft").run(makeCaller(base()), { teamId: TEAM, projectId: PROJECT, taskId: TASK });
    expect(r.ok).toBe(true);
    const data = (r as unknown as { data: { preview: Record<string, any>; confirmationToken: string } }).data; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(data.preview.actingFor).toBe("Org One");
    expect(data.preview.team).toEqual({ id: TEAM, name: "Brigade A" });
    expect(data.preview.scope).toBe(`task:${TASK}`);
    expect(data.preview.memberCalendar).toMatchObject({ known: true, members: 3, clear: 1 });
    expect(data.preview.memberCalendar.collides[0].collisions[0]).toMatchObject({ label: "Other site", overlapStart: "2026-10-10" });
    expect(data.preview.memberCalendar.unknown).toHaveLength(1);
    expect(data.preview.memberCalendar.advisory).toMatch(/never blocks/);
    expect(data.confirmationToken.length).toBeGreaterThan(10);
    expect(assignCore).not.toHaveBeenCalled();
    expect(endCore).not.toHaveBeenCalled();
  });
  it("refuses a team that is not a team, a project of another organization, a completed project and a duplicate", async () => {
    const call = (s: Script) => cap("team_assignment.create_draft").run(makeCaller(s), { teamId: TEAM, projectId: PROJECT });
    expect(await call(base({ organizations: team({ organization_type: "company" }) }))).toMatchObject({ ok: false, code: "invalid" });
    expect(await call(base({ projects: project({ organization_id: "org-x", company_id: "comp-x" }) }))).toMatchObject({ ok: false, code: "not_found" });
    expect(await call(base({ projects: project({ status: "completed" }) }))).toMatchObject({ ok: false, code: "invalid" });
    expect(await call(base({ list: active([row()]) }))).toMatchObject({ ok: false, code: "already_assigned" });
    expect(await call(base({ list: { data: null, error: { message: "boom" } } }))).toMatchObject({ ok: false, code: "unavailable" });
  });
});

describe("wrong party / authority", () => {
  it("a personal-workspace caller and a role without manage-projects are refused before anything is read or written", async () => {
    employerGate.mockResolvedValueOnce({ ok: false, reason: "personal-workspace" });
    expect(await cap("team_assignment.create_draft").run(makeCaller(base()), { teamId: TEAM, projectId: PROJECT })).toMatchObject({ ok: false, code: "personal_workspace" });
    employerGate.mockResolvedValueOnce({ ok: true, companyId: "comp-1", organizationId: "org-1", organizationName: "Org One", role: "member" });
    expect(await cap("team_assignment.create_draft").run(makeCaller(base()), { teamId: TEAM, projectId: PROJECT })).toMatchObject({ ok: false, code: "not_authorized" });
    expect(assignCore).not.toHaveBeenCalled();
  });
  it("the database refusal at confirm surfaces honestly (the caller does not manage the team)", async () => {
    const caller = makeCaller(base());
    const token = await draftToken("team_assignment.create_draft", caller, { teamId: TEAM, projectId: PROJECT });
    assignCore.mockResolvedValueOnce({ status: "not_authorized" } as never);
    const r = await cap("team_assignment.create_confirm").run(caller, { teamId: TEAM, projectId: PROJECT, confirmationToken: token });
    expect(r).toMatchObject({ ok: false, code: "not_authorized" });
  });
});

describe("create_confirm - the SAME core as the UI, token-bound", () => {
  const input = { teamId: TEAM, projectId: PROJECT };

  it("calls the core exactly once with the normalized scope and the caller's own client, then reports the outcome", async () => {
    const caller = makeCaller(base());
    const token = await draftToken("team_assignment.create_draft", caller, input);
    const r = await cap("team_assignment.create_confirm").run(caller, { ...input, confirmationToken: token });
    expect(r.ok).toBe(true);
    expect(assignCore).toHaveBeenCalledTimes(1);
    const [arg, callerArg] = assignCore.mock.calls[0] as [Record<string, unknown>, { supabase: unknown; userId: string }];
    expect(arg).toEqual({ teamId: TEAM, projectId: PROJECT, workObjectId: null, taskId: null, replaceAssignmentId: null });
    expect(callerArg.userId).toBe(USER);
    expect(callerArg.supabase).toBe(caller.supabase);
    expect((r as unknown as { data: { status: string; assignmentId: string } }).data).toMatchObject({ status: "created" });
  });
  it("a REPLAYED token is refused: the state it was bound to moved (the team is now actively assigned)", async () => {
    const draftCaller = makeCaller(base());
    const token = await draftToken("team_assignment.create_draft", draftCaller, input);
    const after = makeCaller(base({ list: active([row()]) }));
    const r = await cap("team_assignment.create_confirm").run(after, { ...input, confirmationToken: token });
    expect(r).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(assignCore).not.toHaveBeenCalled();
  });
  it("a token for a different input, a different scope, or minted for another caller is refused", async () => {
    const caller = makeCaller(base());
    const token = await draftToken("team_assignment.create_draft", caller, input);
    const run = (c: CapabilityCaller, i: Record<string, unknown>) => cap("team_assignment.create_confirm").run(c, { ...i, confirmationToken: token });
    expect(await run(caller, { ...input, taskId: TASK })).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(await run(caller, { teamId: "99999999-9999-4999-8999-999999999999", projectId: PROJECT })).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(await run(makeCaller(base(), "00000000-0000-4000-8000-0000000000bb"), input)).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(assignCore).not.toHaveBeenCalled();
  });
  it("a draft token cannot be used on another tool (domain-separated by action id)", async () => {
    const caller = makeCaller(base());
    const token = await draftToken("team_assignment.create_draft", caller, input);
    const r = await cap("team_assignment.end_confirm").run(makeCaller({ ...base(), single: { data: row(), error: null } }), { assignmentId: OLD, confirmationToken: token });
    expect(r).toMatchObject({ ok: false, code: "confirmation_rejected" });
  });
});

describe("replace", () => {
  const input = { teamId: TEAM, projectId: PROJECT, replaceAssignmentId: OLD };
  it("refuses a target that is not active on the project", async () => {
    const r = await cap("team_assignment.replace_draft").run(makeCaller(base({ list: active([]) })), input);
    expect(r).toMatchObject({ ok: false, code: "invalid" });
  });
  it("confirm hands the replace target to the SAME core call (one transaction in the RPC)", async () => {
    const other = "66666666-6666-4666-8666-666666666666";
    const caller = makeCaller(base({ list: active([row({ team_org_id: other })]) }));
    const token = await draftToken("team_assignment.replace_draft", caller, input);
    const r = await cap("team_assignment.replace_confirm").run(caller, { ...input, confirmationToken: token });
    expect(r.ok).toBe(true);
    expect((assignCore.mock.calls[0] as [Record<string, unknown>])[0]).toMatchObject({ replaceAssignmentId: OLD, teamId: TEAM });
  });
  it("replaying a replace token after the target ended is refused", async () => {
    const other = "66666666-6666-4666-8666-666666666666";
    const token = await draftToken("team_assignment.replace_draft", makeCaller(base({ list: active([row({ team_org_id: other })]) })), input);
    const r = await cap("team_assignment.replace_confirm").run(makeCaller(base({ list: active([]) })), { ...input, confirmationToken: token });
    expect(r).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(assignCore).not.toHaveBeenCalled();
  });
});

describe("end", () => {
  const input = { assignmentId: OLD, reason: "crew moved" };
  it("refuses an already ended assignment and one the caller cannot see", async () => {
    expect(await cap("team_assignment.end_draft").run(makeCaller(base({ single: { data: row({ ended_at: "2026-10-01T00:00:00Z" }), error: null } })), input)).toMatchObject({ ok: false, code: "not_assigned" });
    expect(await cap("team_assignment.end_draft").run(makeCaller(base({ single: { data: null, error: null } })), input)).toMatchObject({ ok: false, code: "not_found" });
  });
  it("confirm calls the same end core with the reason, then a replay is refused (state is now ended)", async () => {
    const caller = makeCaller(base({ single: { data: row(), error: null } }));
    const token = await draftToken("team_assignment.end_draft", caller, input);
    const r = await cap("team_assignment.end_confirm").run(caller, { ...input, confirmationToken: token });
    expect(r.ok).toBe(true);
    expect(endCore).toHaveBeenCalledTimes(1);
    expect((endCore.mock.calls[0] as [Record<string, unknown>])[0]).toEqual({ assignmentId: OLD, reason: "crew moved" });
    const replay = await cap("team_assignment.end_confirm").run(
      makeCaller(base({ single: { data: row({ ended_at: "2026-10-05T00:00:00Z" }), error: null } })),
      { ...input, confirmationToken: token },
    );
    expect(replay).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(endCore).toHaveBeenCalledTimes(1);
  });
  it("a project of another organization is not endable through this door", async () => {
    const r = await cap("team_assignment.end_draft").run(
      makeCaller({ ...base({ single: { data: row(), error: null } }), projects: project({ organization_id: "org-x", company_id: "comp-x" }) }),
      input,
    );
    expect(r).toMatchObject({ ok: false, code: "not_found" });
  });
});
