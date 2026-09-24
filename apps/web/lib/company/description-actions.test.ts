import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The company description save (public business page) over mocked canonical
 * layers. Pins that the action
 *   · refuses a stale screen first and never reaches the write,
 *   · writes only for the manage-company-profile capability (owner, admin),
 *   · saves through `set_company_description_v1` — the one write path the
 *     production authorization model admits — and never touches the table
 *     when the function answered (success or a real refusal),
 *   · falls back to the old direct UPDATE only while the function is absent
 *     (42883 / PGRST202), i.e. before the migration is applied,
 *   · sends an empty description as null (clears it) and refuses over 2000.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/company/stale-workspace", () => ({ refuseStaleWorkspace: vi.fn() }));
vi.mock("@/lib/company/employer-company-context", () => ({ requireEmployerCompany: vi.fn() }));

const rpcMock = vi.fn();
const updateEqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: updateEqMock }));
const fromMock = vi.fn(() => ({ update: updateMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: rpcMock, from: fromMock }),
}));

import { refuseStaleWorkspace } from "@/lib/company/stale-workspace";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { saveOrganizationDescriptionAction } from "./description-actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMock = (f: unknown) => f as any;
const COMPANY = "048aa7e1-0000-4000-8000-000000000001";

function company(role: string) {
  asMock(requireEmployerCompany).mockResolvedValue({
    ok: true,
    companyId: COMPANY,
    organizationId: "20b2c802-0000-4000-8000-000000000002",
    organizationName: "Org",
    role,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  asMock(refuseStaleWorkspace).mockResolvedValue(undefined);
  rpcMock.mockResolvedValue({ data: null, error: null });
  updateEqMock.mockResolvedValue({ error: null });
  company("owner");
});

describe("the definer is the write path", () => {
  it("owner: saves through set_company_description_v1 with the workspace company, table untouched", async () => {
    expect(await saveOrganizationDescriptionAction("  We tile.  ", "lt", "ws-1")).toEqual({ kind: "ok" });
    expect(rpcMock).toHaveBeenCalledWith("set_company_description_v1", {
      p_company_id: COMPANY,
      p_description: "We tile.",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("admin member: same path", async () => {
    company("admin");
    expect(await saveOrganizationDescriptionAction("x", "en")).toEqual({ kind: "ok" });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("an empty description clears it (null), never an empty string", async () => {
    await saveOrganizationDescriptionAction("   ", "lt");
    expect(rpcMock).toHaveBeenCalledWith("set_company_description_v1", {
      p_company_id: COMPANY,
      p_description: null,
    });
  });

  it("a real refusal from the definer is an error — never a silent retry on the table", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "not_authorized" } });
    expect(await saveOrganizationDescriptionAction("x", "lt")).toEqual({ kind: "error" });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("before the migration is applied", () => {
  for (const code of ["PGRST202", "42883"]) {
    it(`${code}: falls back to the previous direct UPDATE of the workspace company`, async () => {
      rpcMock.mockResolvedValue({ data: null, error: { code, message: "function not found" } });
      expect(await saveOrganizationDescriptionAction("We tile.", "lt")).toEqual({ kind: "ok" });
      expect(fromMock).toHaveBeenCalledWith("companies");
      expect(updateMock).toHaveBeenCalledWith({ description: "We tile." });
      expect(updateEqMock).toHaveBeenCalledWith("id", COMPANY);
    });
  }

  it("the fallback's own refusal (today's production state) stays an honest error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "function not found" } });
    updateEqMock.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    expect(await saveOrganizationDescriptionAction("x", "lt")).toEqual({ kind: "error" });
  });
});

describe("refusals before any write", () => {
  it("manager / external manager / member: no capability → no write", async () => {
    for (const role of ["manager", "external_manager", "member"]) {
      company(role);
      expect(await saveOrganizationDescriptionAction("x", "lt")).toEqual({ kind: "no-company" });
    }
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("over 2000 characters → invalid, no write", async () => {
    expect(await saveOrganizationDescriptionAction("a".repeat(2001), "lt")).toEqual({ kind: "invalid" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("a stale screen is refused first: nothing else runs", async () => {
    asMock(refuseStaleWorkspace).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveOrganizationDescriptionAction("x", "lt", "stale-ws")).rejects.toThrow("NEXT_REDIRECT");
    expect(refuseStaleWorkspace).toHaveBeenCalledWith("stale-ws");
    expect(requireEmployerCompany).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
