import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompany: async () => ({ ok: false, reason: "personal-workspace" }),
  resolveEmployerCompanyContext: async () => ({ kind: "unavailable" }),
}));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: () => {} }));

import { setShortlistCore, type ScoutingEmployer } from "./scouting";

/**
 * THE colleague rule (2026-09-30), executed against the real core: the
 * need's creator may decide; a colleague may decide only when their role in
 * the ACTING organization carries `manage-demand`. Membership alone is never
 * enough.
 */

const USER = "user-a";
const REQ = "req-1";
const WORKER = "worker-1";

function client(needCreator: string, status = "submitted") {
  const upserts: Record<string, unknown>[] = [];
  const c = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "or", "order", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () =>
        table === "customer_requests"
          ? { data: { id: REQ, status, profile_id: needCreator }, error: null }
          : { data: null, error: null };
      chain.upsert = async (p: Record<string, unknown>) => {
        upserts.push(p);
        return { error: null };
      };
      return chain;
    },
  };
  return { supabase: c as never, upserts };
}

const employer = (role: ScoutingEmployer["role"]): ScoutingEmployer => ({
  companyId: "comp-1",
  organizationId: "org-1",
  organizationName: "Org One",
  role,
});

describe("setShortlistCore — who may decide on a need's shortlist", () => {
  it("the creator may, whatever the role", async () => {
    const { supabase, upserts } = client(USER);
    const r = await setShortlistCore({ supabase, userId: USER }, employer("member"), {
      requestId: REQ,
      workerId: WORKER,
      status: "saved",
    });
    expect(r.kind).toBe("ok");
    expect(upserts[0]).toMatchObject({ owner_id: USER, request_id: REQ, worker_id: WORKER, status: "saved" });
  });

  it("a manager may on a colleague's need — written as THEIR decision", async () => {
    const { supabase, upserts } = client("someone-else");
    const r = await setShortlistCore({ supabase, userId: USER }, employer("manager"), {
      requestId: REQ,
      workerId: WORKER,
      status: "interested",
    });
    expect(r.kind).toBe("ok");
    expect(upserts[0].owner_id).toBe(USER);
    expect(upserts[0]).not.toHaveProperty("organization_id");
  });

  it("a member may not on a colleague's need", async () => {
    const { supabase, upserts } = client("someone-else");
    const r = await setShortlistCore({ supabase, userId: USER }, employer("member"), {
      requestId: REQ,
      workerId: WORKER,
      status: "saved",
    });
    expect(r.kind).toBe("not-owner");
    expect(upserts).toEqual([]);
  });

  it("a closed need refuses everyone", async () => {
    const { supabase, upserts } = client(USER, "closed");
    const r = await setShortlistCore({ supabase, userId: USER }, employer("owner"), {
      requestId: REQ,
      workerId: WORKER,
      status: "saved",
    });
    expect(r.kind).toBe("closed");
    expect(upserts).toEqual([]);
  });
});
