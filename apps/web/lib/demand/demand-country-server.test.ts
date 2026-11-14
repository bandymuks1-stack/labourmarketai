import { describe, expect, it, vi } from "vitest";

/**
 * THE SERVER IS THE RULE, NOT THE WIZARD (Swedish employer audit 2026-11-11,
 * CL-1). The web wizard asks for the country, but the canonical submit core is
 * reached by the web server action, the chat executor and the MCP
 * `demand.create_confirm` alike. These tests call the core directly, with no
 * UI: a need without a resolvable ISO country is refused BEFORE any RPC, so
 * no surface can create a need no country filter can find.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/company/employer-company-context", () => ({ requireEmployerCompany: async () => ({ ok: false }) }));
vi.mock("@/lib/billing/open-needs-gate", () => ({ gateOpenNeeds: async () => ({ allowed: true }) }));
vi.mock("@/lib/telemetry/actions", () => ({ recordTelemetryEvent: async () => undefined }));
vi.mock("@/lib/telemetry/server-locale", () => ({ serverEventLocale: async () => "en" }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: () => undefined }));
vi.mock("@/lib/demand/demand-written-language", () => ({ demandWrittenLanguage: async () => "en" }));
vi.mock("@/lib/scouting/auto-match", () => ({ runAutoMatchForDemand: async () => undefined }));

import { submitDemandRequestCore } from "./demand-request";

function fakeCaller() {
  const rpc = vi.fn(async () => ({ data: "req-1", error: null }));
  const update = vi.fn(() => ({ eq: () => ({ eq: async () => ({ error: null }) }) }));
  const supabase = { rpc, from: () => ({ update }) };
  return { caller: { supabase, userId: "u-1" } as never, rpc, update };
}
const EMPLOYER = { organizationId: "org-1" };

describe("the canonical submit core refuses a need without a country", () => {
  it.each([undefined, "", "Sweden", "XX", "S"])("country %j → country_required, and no RPC runs", async (country) => {
    const { caller, rpc } = fakeCaller();
    const r = await submitDemandRequestCore(caller, EMPLOYER, "hire_workers", {
      description: "Two welders for a shipyard in Gothenburg",
      country,
    });
    expect(r).toEqual({ ok: false, code: "country_required" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the agency-offer intent obeys the same rule", async () => {
    const { caller, rpc } = fakeCaller();
    const r = await submitDemandRequestCore(caller, EMPLOYER, "partner", { description: "A crew of four" });
    expect(r).toEqual({ ok: false, code: "country_required" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("an ISO country (any case) reaches the submit RPC and is written to the column", async () => {
    const { caller, rpc, update } = fakeCaller();
    const r = await submitDemandRequestCore(caller, EMPLOYER, "hire_workers", {
      description: "Two welders for a shipyard in Gothenburg",
      country: "se",
    });
    expect(r).toMatchObject({ ok: true, requestId: "req-1" });
    expect(rpc).toHaveBeenCalledWith("submit_demand_request_v2", expect.objectContaining({ p_organization_id: "org-1" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ country: "SE" }));
  });
});
