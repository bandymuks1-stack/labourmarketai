/**
 * T1 at the source: the ONE place a company registers (`saveCompanySetup`, which
 * the web form, the chat capability and MCP all call) raises the two registration
 * e-mails exactly when the company comes into being — never on an edit, never when
 * the save failed. Synthetic data; the database and the mailbox are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { rpc, deliver, readPrivate } = vi.hoisted(() => ({ rpc: vi.fn(), deliver: vi.fn(), readPrivate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-0000000000b1" } } }) } }),
}));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: () => undefined }));
vi.mock("@/lib/company/company-private-read", () => ({
  COMPANY_PRIVATE_SELECT: "*",
  readCompaniesPrivate: (...a: unknown[]) => readPrivate(...a),
}));
vi.mock("@/lib/email/platform-email-delivery-store", () => ({
  deliverCompanyRegistrationEmails: (...a: unknown[]) => deliver(...a),
}));

import { saveCompanySetup } from "./company-setup";

const COMPANY = "00000000-0000-4000-8000-0000000000c1";
const input = { legalName: "QA-SYNTHETIC Statyba UAB", country: "LT", submit: false } as const;

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: COMPANY, error: null });
  deliver.mockReset().mockResolvedValue(undefined);
  readPrivate.mockReset();
});

describe("company registration → the two e-mails", () => {
  it("a newly created company raises them once, keyed by the company the save returned", async () => {
    const r = await saveCompanySetup({ ...input, companyId: null });
    expect(r).toEqual({ kind: "ok", companyId: COMPANY });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith({ companyId: COMPANY });
  });

  it("a failed save raises nothing", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await saveCompanySetup({ ...input, companyId: null })).kind).toBe("error");
    expect(deliver).not.toHaveBeenCalled();
  });

  it("a refused input (unknown country) raises nothing", async () => {
    expect((await saveCompanySetup({ ...input, country: "ZZ", companyId: null })).kind).toBe("invalid-country");
    expect(deliver).not.toHaveBeenCalled();
  });

  it("a failing e-mail path never fails the person's save", async () => {
    deliver.mockRejectedValue(new Error("mail down"));
    expect(await saveCompanySetup({ ...input, companyId: null })).toEqual({ kind: "ok", companyId: COMPANY });
  });
});
