import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length",
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  },
}));

type Employer =
  | { ok: true; companyId: string; organizationId: string; organizationName: string; role: string }
  | { ok: false; reason: string };
const OWNER: Employer = { ok: true, companyId: "comp-1", organizationId: "org-1", organizationName: "Org One", role: "owner" };
const employerGate = vi.fn(async (): Promise<Employer> => OWNER);
vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompanyForCaller: (...a: unknown[]) => employerGate(...(a as [])),
}));
vi.mock("@/lib/company/company-workers", () => ({
  listActiveCompanyWorkers: async () => ({ kind: "ok", rows: [] }),
}));
const scout = vi.fn();
const shortlistWrite = vi.fn(async (...args: unknown[]) => ({ kind: "ok", status: "saved", note: null, argc: args.length }));
vi.mock("@/lib/scouting/scouting", () => ({
  runScoutingCore: (...a: unknown[]) => scout(...a),
  setShortlistCore: (...a: unknown[]) => shortlistWrite(...a),
}));

import { activationConditions, MARKETPLACE_CAPABILITIES } from "./marketplace-capabilities";
import type { CapabilityCaller } from "./contract";

type Outcome = { data: unknown; error: { code?: string; message: string } | null };
const USER = "00000000-0000-4000-8000-0000000000aa";

function makeCaller(script: Record<string, Outcome>) {
  const supabase = {
    from(table: string) {
      const outcome = () => script[table] ?? { data: null, error: { message: `unscripted ${table}` } };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "or", "order", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () => outcome();
      chain.then = (resolve: (v: unknown) => unknown) => resolve(outcome());
      return chain;
    },
    async rpc(fn: string) {
      return script[`rpc:${fn}`] ?? { data: null, error: { message: `unscripted rpc ${fn}` } };
    },
  } as unknown as CapabilityCaller["supabase"];
  return { userId: USER, transport: "bearer", supabase, locale: "lt" } as CapabilityCaller;
}

const cap = (id: string) => {
  const c = MARKETPLACE_CAPABILITIES.find((x) => x.id === id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
};

const REQ = "11111111-1111-4111-8111-111111111111";
const WORKER = "22222222-2222-4222-8222-222222222222";
const COLLEAGUE = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  employerGate.mockReset();
  employerGate.mockResolvedValue(OWNER);
  scout.mockReset();
  shortlistWrite.mockClear();
});

describe("candidate.search runs the product's own scouting core", () => {
  it("hands the caller and the gate-resolved employer to runScoutingCore", async () => {
    scout.mockResolvedValue({
      kind: "ok",
      demand: { id: REQ, title: "Welders", status: "submitted" },
      candidates: [],
      retrieval: { capped: false },
    });
    const caller = makeCaller({});
    const r = await cap("candidate.search").run(caller, { requestId: REQ });
    expect(r.ok).toBe(true);
    expect(scout).toHaveBeenCalledWith(caller, OWNER, REQ);
  });

  it("an unstructured need is named, never an empty candidate list", async () => {
    scout.mockResolvedValue({ kind: "not-structured", demand: {} });
    const r = await cap("candidate.search").run(makeCaller({}), { requestId: REQ });
    expect(r.ok === false && r.code).toBe("not_structured");
  });

  it("outside an organization it refuses before searching", async () => {
    employerGate.mockResolvedValue({ ok: false, reason: "personal-workspace" });
    const r = await cap("candidate.search").run(makeCaller({}), { requestId: REQ });
    expect(r.ok === false && r.code).toBe("personal_workspace");
    expect(scout).not.toHaveBeenCalled();
  });
});

describe("shortlist: role, not membership, admits a colleague", () => {
  const colleaguesNeed = (status = "submitted"): Record<string, Outcome> => ({
    customer_requests: { data: { id: REQ, title: "Welders", status, profile_id: COLLEAGUE }, error: null },
    workers: { data: { id: WORKER }, error: null },
    demand_shortlist: { data: [], error: null },
  });

  it("a manager may draft on a colleague's need", async () => {
    employerGate.mockResolvedValue({ ...OWNER, role: "manager" } as Employer);
    const r = await cap("shortlist.add_draft").run(makeCaller(colleaguesNeed()), { requestId: REQ, workerId: WORKER });
    expect(r.ok).toBe(true);
    expect(shortlistWrite).not.toHaveBeenCalled();
  });

  it("a plain member may not", async () => {
    employerGate.mockResolvedValue({ ...OWNER, role: "member" } as Employer);
    const r = await cap("shortlist.add_draft").run(makeCaller(colleaguesNeed()), { requestId: REQ, workerId: WORKER });
    expect(r.ok === false && r.code).toBe("not_authorized");
  });

  it("a closed need refuses", async () => {
    const r = await cap("shortlist.add_draft").run(makeCaller(colleaguesNeed("closed")), { requestId: REQ, workerId: WORKER });
    expect(r.ok === false && r.code).toBe("need_closed");
  });

  it("a person discovery does not admit cannot be shortlisted", async () => {
    const script = colleaguesNeed();
    script.workers = { data: null, error: null };
    const r = await cap("shortlist.add_draft").run(makeCaller(script), { requestId: REQ, workerId: WORKER });
    expect(r.ok === false && r.code).toBe("not_found");
  });

  it("draft → confirm writes through the core once and reads the row back", async () => {
    const script = colleaguesNeed();
    const caller = makeCaller(script);
    const d = await cap("shortlist.add_draft").run(caller, { requestId: REQ, workerId: WORKER, status: "interested" });
    const token = d.ok ? (d.data as { confirmationToken: string }).confirmationToken : "";

    const tampered = await cap("shortlist.add_confirm").run(caller, {
      requestId: REQ,
      workerId: WORKER,
      status: "saved",
      confirmationToken: token,
    });
    expect(tampered.ok === false && tampered.code).toBe("confirmation_rejected");
    expect(shortlistWrite).not.toHaveBeenCalled();

    const ok = await cap("shortlist.add_confirm").run(caller, {
      requestId: REQ,
      workerId: WORKER,
      status: "interested",
      confirmationToken: token,
    });
    expect(ok.ok).toBe(true);
    expect(shortlistWrite).toHaveBeenCalledTimes(1);
    expect(shortlistWrite.mock.calls[0][2]).toMatchObject({ requestId: REQ, workerId: WORKER, status: "interested" });
  });

  it("remove needs the person to be on the shortlist, and writes not_fit with the reason", async () => {
    const script = colleaguesNeed();
    const r1 = await cap("shortlist.remove_draft").run(makeCaller(script), { requestId: REQ, workerId: WORKER, reason: "no licence" });
    expect(r1.ok === false && r1.code).toBe("not_shortlisted");

    script.demand_shortlist = {
      data: [{ worker_id: WORKER, owner_id: USER, status: "saved", note: null, updated_at: "2026-09-30" }],
      error: null,
    };
    const caller = makeCaller(script);
    const d = await cap("shortlist.remove_draft").run(caller, { requestId: REQ, workerId: WORKER, reason: "no licence" });
    expect(d.ok).toBe(true);
    const token = d.ok ? (d.data as { confirmationToken: string }).confirmationToken : "";
    const c = await cap("shortlist.remove_confirm").run(caller, {
      requestId: REQ,
      workerId: WORKER,
      reason: "no licence",
      confirmationToken: token,
    });
    expect(c.ok).toBe(true);
    expect(shortlistWrite.mock.calls[0][2]).toMatchObject({ status: "not_fit", note: "no licence" });
  });
});

describe("activation conditions are facts, never a score", () => {
  const complete = {
    hasProfession: true,
    currentCountry: "LT",
    preferredCountries: ["SE"],
    availabilityStatus: "available",
    hasSkills: true,
    hasLanguage: true,
    hasContact: true,
    discoverable: true,
  };

  it("a complete, discoverable person has nothing missing", () => {
    expect(activationConditions(complete)).toEqual({ missing: [], matchable: true, discoverable: true });
  });

  it("profession, country and availability decide matchability; the rest does not", () => {
    const r = activationConditions({ ...complete, hasSkills: false, preferredCountries: [] });
    expect(r.matchable).toBe(true);
    expect(r.missing).toEqual(["MISSING_PREFERRED_COUNTRY", "MISSING_SKILLS"]);
    expect(activationConditions({ ...complete, availabilityStatus: null }).matchable).toBe(false);
  });

  it("UNKNOWN is not MISSING: an unreadable fact is never reported as absent", () => {
    const r = activationConditions({ ...complete, hasContact: null, hasSkills: null, discoverable: null });
    expect(r.missing).toEqual(["CONSENT_STATE_UNKNOWN"]);
    expect(r.discoverable).toBeNull();
  });

  it("no consent grant is NOT_DISCOVERABLE, and still matchable", () => {
    const r = activationConditions({ ...complete, discoverable: false });
    expect(r.missing).toEqual(["NOT_DISCOVERABLE"]);
    expect(r.matchable).toBe(true);
  });

  it("the platform scope is administrators only", async () => {
    const r = await cap("worker.activation_queue.get").run(makeCaller({ "rpc:is_admin": { data: false, error: null } }), {
      scope: "platform",
    });
    expect(r.ok === false && r.code).toBe("not_authorized");
  });
});
