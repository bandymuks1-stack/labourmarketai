import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompanyForCaller: async () => ({
    ok: true,
    companyId: "comp-1",
    organizationId: "org-1",
    organizationName: "Org One",
    role: "manager",
  }),
}));
const close = vi.fn(async (...args: unknown[]) => (args.length, { kind: "ok", status: "closed" }));
const reopen = vi.fn(async (...args: unknown[]) => (args.length, { kind: "over-limit", limit: 1, next: "upgrade" }));
vi.mock("@/lib/demand/demand-lifecycle", () => ({
  closeDemand: (...a: unknown[]) => close(...a),
  reopenDemand: (...a: unknown[]) => reopen(...a),
}));

import { EMPLOYER_OPERATIONS_CAPABILITIES } from "./employer-operations-capabilities";
import type { CapabilityCaller } from "./contract";

const REQ = "11111111-1111-4111-8111-111111111111";

function caller(need: { status: string; kind?: string }) {
  const state = { need: { id: REQ, title: "Welders", kind: "company_request", ...need } };
  const supabase = {
    from() {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "or"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: state.need, error: null });
      return chain;
    },
  } as unknown as CapabilityCaller["supabase"];
  return { c: { userId: "u-1", transport: "bearer", supabase, locale: "lt" } as CapabilityCaller, state };
}
const cap = (id: string) => EMPLOYER_OPERATIONS_CAPABILITIES.find((c) => c.id === id)!;

describe("demand close / reopen over the ONE lifecycle", () => {
  it("a closed need cannot be closed again, and nothing is called", async () => {
    const { c } = caller({ status: "closed" });
    const r = await cap("demand.close_draft").run(c, { requestId: REQ });
    expect(r.ok === false && r.code).toBe("invalid_transition");
    expect(close).not.toHaveBeenCalled();
  });

  it("an agency's supply offer is not a need to close", async () => {
    const { c } = caller({ status: "submitted", kind: "agency_offer" });
    const r = await cap("demand.close_draft").run(c, { requestId: REQ });
    expect(r.ok === false && r.code).toBe("not_found");
  });

  it("confirm hands the lifecycle the caller's OWN client and gate-resolved organization; a moved status voids it", async () => {
    const { c, state } = caller({ status: "submitted" });
    const d = await cap("demand.close_draft").run(c, { requestId: REQ });
    const token = d.ok ? (d.data as { confirmationToken: string }).confirmationToken : "";

    state.need = { ...state.need, status: "closed" };
    const stale = await cap("demand.close_confirm").run(c, { requestId: REQ, confirmationToken: token });
    expect(stale.ok === false && stale.code).toBe("confirmation_rejected");
    expect(close).not.toHaveBeenCalled();

    state.need = { ...state.need, status: "submitted" };
    const ok = await cap("demand.close_confirm").run(c, { requestId: REQ, confirmationToken: token });
    expect(ok.ok).toBe(true);
    expect(close).toHaveBeenCalledWith(REQ, { supabase: c.supabase, userId: "u-1", organizationId: "org-1" });
  });

  it("reopening over the plan ceiling is refused honestly — nothing charged or reopened", async () => {
    const { c } = caller({ status: "closed" });
    const d = await cap("demand.reopen_draft").run(c, { requestId: REQ });
    const token = d.ok ? (d.data as { confirmationToken: string }).confirmationToken : "";
    const r = await cap("demand.reopen_confirm").run(c, { requestId: REQ, confirmationToken: token });
    expect(r.ok === false && r.code).toBe("over_open_need_limit");
  });
});
