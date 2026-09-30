import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length",
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  },
}));

const employerGate = vi.fn(
  async (): Promise<
    | { ok: true; companyId: string; organizationId: string; organizationName: string; role: string }
    | { ok: false; reason: string }
  > => ({ ok: true, companyId: "comp-1", organizationId: "org-1", organizationName: "Org One", role: "owner" }),
);
vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompanyForCaller: (...a: unknown[]) => employerGate(...(a as [])),
}));
const insertProject = vi.fn(async () => ({ ok: true as const, id: "proj-new" }));
vi.mock("@/lib/projects/create-project-core", () => ({
  PROJECT_TITLE_MIN: 2,
  PROJECT_TITLE_MAX: 200,
  insertProjectForCompany: (...a: unknown[]) => insertProject(...(a as [])),
}));
vi.mock("@/lib/company/company-workers", () => ({
  listActiveCompanyWorkers: async () => ({ kind: "ok", rows: [] }),
}));

import { EMPLOYER_OPERATIONS_CAPABILITIES } from "./employer-operations-capabilities";
import type { CapabilityCaller } from "./contract";

type Outcome = { data: unknown; error: { code?: string; message: string } | null };

/** Scripted client: `from(table)` answers the script; every rpc call is
 *  recorded so a test can prove whether the write was reached. */
function makeCaller(script: Record<string, Outcome>) {
  const rpcCalls: string[] = [];
  const supabase = {
    from(table: string) {
      const outcome = script[table] ?? { data: null, error: { message: `unscripted ${table}` } };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "or", "order", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () => outcome;
      chain.then = (resolve: (v: unknown) => unknown) => resolve(outcome);
      return chain;
    },
    async rpc(fn: string) {
      rpcCalls.push(fn);
      return script[`rpc:${fn}`] ?? { data: null, error: null };
    },
  } as unknown as CapabilityCaller["supabase"];
  const caller: CapabilityCaller = {
    userId: "00000000-0000-4000-8000-0000000000aa",
    transport: "bearer",
    supabase,
    locale: "lt",
  };
  return { caller, rpcCalls };
}

const cap = (id: string) => {
  const c = EMPLOYER_OPERATIONS_CAPABILITIES.find((x) => x.id === id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
};

const PROJECT = "11111111-1111-4111-8111-111111111111";
const WORKER_PROFILE = "22222222-2222-4222-8222-222222222222";
const projectRow = (org: string) => ({
  data: { id: PROJECT, title: "Site A", status: "draft", city: "Vilnius", company_id: "comp-x", organization_id: org },
  error: null,
});

beforeEach(() => {
  employerGate.mockClear();
  insertProject.mockClear();
});

describe("employer operations capabilities", () => {
  it("every write is a draft → confirm pair and every draft writes nothing", () => {
    const ids = EMPLOYER_OPERATIONS_CAPABILITIES.map((c) => c.id);
    for (const c of EMPLOYER_OPERATIONS_CAPABILITIES) {
      if (c.kind === "draft") {
        expect(ids).toContain(c.id.replace(/_draft$/, "_confirm"));
        expect(c.annotations.readOnlyHint).toBe(true);
      }
      if (c.kind === "confirm") expect(c.annotations.readOnlyHint).toBe(false);
      expect(c.annotations.destructiveHint).toBe(false);
      expect(c.exposed).toBe(true);
    }
  });

  it("a personal-space caller is refused, never answered for someone else's org", async () => {
    employerGate.mockResolvedValueOnce({ ok: false, reason: "personal-workspace" });
    const { caller } = makeCaller({});
    const r = await cap("demand.list").run(caller, {});
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("personal_workspace");
  });

  it("demand.list lists needs, never an agency's supply offer, and closed only on request", async () => {
    const { caller } = makeCaller({
      customer_requests: {
        data: [
          { id: "r1", kind: "company_request", status: "submitted", team_size: 5, created_at: "2026-09-01" },
          { id: "r2", kind: "agency_offer", status: "submitted", created_at: "2026-09-01" },
          { id: "r3", kind: "company_request", status: "closed", created_at: "2026-08-01" },
        ],
        error: null,
      },
      demand_interest_signals: {
        data: [
          { request_id: "r1", status: "interested" },
          { request_id: "r1", status: "withdrawn" },
        ],
        error: null,
      },
      demand_shortlist: { data: [{ request_id: "r1" }], error: null },
    });
    const r = await cap("demand.list").run(caller, {});
    expect(r.ok).toBe(true);
    const needs = (r.ok ? (r.data as { needs: { id: string; interestedPeople: number; shortlisted: number; headcount: number }[] }).needs : []);
    expect(needs.map((n) => n.id)).toEqual(["r1"]);
    expect(needs[0]).toMatchObject({ interestedPeople: 1, shortlisted: 1, headcount: 5 });
  });

  it("demand.list: a failed read is a failure, not an empty list (SEP-7)", async () => {
    const { caller } = makeCaller({ customer_requests: { data: null, error: { message: "boom" } } });
    const r = await cap("demand.list").run(caller, {});
    expect(r.ok).toBe(false);
  });

  it("a member (no manage-projects) cannot even draft a project", async () => {
    employerGate.mockResolvedValue({ ok: true, companyId: "comp-1", organizationId: "org-1", organizationName: "Org One", role: "member" });
    const { caller } = makeCaller({});
    const r = await cap("project.create_draft").run(caller, { title: "Site A" });
    expect(r.ok === false && r.code).toBe("not_authorized");
    employerGate.mockResolvedValue({ ok: true, companyId: "comp-1", organizationId: "org-1", organizationName: "Org One", role: "owner" });
  });

  it("project: the confirm writes only with the draft's token, for the SAME organization", async () => {
    const { caller } = makeCaller({ projects: { data: { id: "proj-new", title: "Site A" }, error: null } });
    const d = await cap("project.create_draft").run(caller, { title: "Site A", city: "Vilnius" });
    expect(d.ok).toBe(true);
    expect(insertProject).not.toHaveBeenCalled();
    const token = d.ok ? (d.data as { confirmationToken: string }).confirmationToken : "";

    // Tampered input → rejected, nothing written.
    const bad = await cap("project.create_confirm").run(caller, { title: "Site B", city: "Vilnius", confirmationToken: token });
    expect(bad.ok === false && bad.code).toBe("confirmation_rejected");

    // Workspace switched to another org between draft and confirm → rejected.
    employerGate.mockResolvedValueOnce({ ok: true, companyId: "comp-2", organizationId: "org-2", organizationName: "Org Two", role: "owner" });
    const switched = await cap("project.create_confirm").run(caller, { title: "Site A", city: "Vilnius", confirmationToken: token });
    expect(switched.ok === false && switched.code).toBe("confirmation_rejected");
    expect(insertProject).not.toHaveBeenCalled();

    const ok = await cap("project.create_confirm").run(caller, { title: "Site A", city: "Vilnius", confirmationToken: token });
    expect(ok.ok).toBe(true);
    expect(insertProject).toHaveBeenCalledTimes(1);
    expect(insertProject.mock.calls[0]).toContain("comp-1");
  });

  it("assignment: a project of another organization is not found, and nothing is called", async () => {
    const { caller, rpcCalls } = makeCaller({ projects: projectRow("org-other") });
    const r = await cap("assignment.create_draft").run(caller, { projectId: PROJECT, workerProfileId: WORKER_PROFILE });
    expect(r.ok === false && r.code).toBe("not_found");
    expect(rpcCalls).toEqual([]);
  });

  it("assignment: draft → confirm reaches the canonical RPC; a state change in between voids the token", async () => {
    const script: Record<string, Outcome> = {
      projects: projectRow("org-1"),
      workers: { data: { id: "w-1", display_name: "Jonas" }, error: null },
      project_worker_assignments: { data: null, error: null },
    };
    const { caller, rpcCalls } = makeCaller(script);
    const d = await cap("assignment.create_draft").run(caller, { projectId: PROJECT, workerProfileId: WORKER_PROFILE });
    expect(d.ok).toBe(true);
    expect(rpcCalls).toEqual([]);
    const token = d.ok ? (d.data as { confirmationToken: string }).confirmationToken : "";

    // Someone assigned the person meanwhile — the bound state moved.
    script.project_worker_assignments = { data: { status: "active" }, error: null };
    const stale = await cap("assignment.create_confirm").run(caller, {
      projectId: PROJECT,
      workerProfileId: WORKER_PROFILE,
      confirmationToken: token,
    });
    expect(stale.ok === false && stale.code).toBe("confirmation_rejected");
    expect(rpcCalls).toEqual([]);

    script.project_worker_assignments = { data: null, error: null };
    const ok = await cap("assignment.create_confirm").run(caller, {
      projectId: PROJECT,
      workerProfileId: WORKER_PROFILE,
      confirmationToken: token,
    });
    expect(ok.ok).toBe(true);
    expect(rpcCalls).toEqual(["assign_worker_to_project"]);
  });

  it("assignment: the database's refusal is reported as not_authorized", async () => {
    const script: Record<string, Outcome> = {
      projects: projectRow("org-1"),
      workers: { data: { id: "w-1", display_name: "Jonas" }, error: null },
      project_worker_assignments: { data: null, error: null },
      "rpc:assign_worker_to_project": { data: null, error: { code: "42501", message: "no" } },
    };
    const { caller } = makeCaller(script);
    const d = await cap("assignment.create_draft").run(caller, { projectId: PROJECT, workerProfileId: WORKER_PROFILE });
    const token = d.ok ? (d.data as { confirmationToken: string }).confirmationToken : "";
    const r = await cap("assignment.create_confirm").run(caller, {
      projectId: PROJECT,
      workerProfileId: WORKER_PROFILE,
      confirmationToken: token,
    });
    expect(r.ok === false && r.code).toBe("not_authorized");
  });

  it("ending needs an ACTIVE assignment", async () => {
    const { caller } = makeCaller({
      projects: projectRow("org-1"),
      workers: { data: { id: "w-1", display_name: "Jonas" }, error: null },
      project_worker_assignments: { data: { status: "ended" }, error: null },
    });
    const r = await cap("assignment.end_draft").run(caller, { projectId: PROJECT, workerProfileId: WORKER_PROFILE });
    expect(r.ok === false && r.code).toBe("not_assigned");
  });

  it("review queue: empty is empty, a failed read is a failure", async () => {
    const empty = makeCaller({ "rpc:reviewable_journal_entry_ids": { data: [], error: null } });
    const r1 = await cap("journal.review_queue.get").run(empty.caller, {});
    expect(r1).toEqual({ ok: true, data: { pending: [], total: 0 } });

    const failed = makeCaller({ "rpc:reviewable_journal_entry_ids": { data: null, error: { code: "XX000", message: "x" } } });
    const r2 = await cap("journal.review_queue.get").run(failed.caller, {});
    expect(r2.ok).toBe(false);
  });
});
