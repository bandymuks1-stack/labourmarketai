import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RENAME THE ACTIVE ORGANIZATION — the domain core (owner program
 * 2026-09-23). The canonical layers are MOCKED: the employer resolver, the
 * company read and the canonical writer. These tests pin that the core
 *   · takes the organization from the SERVER-resolved workspace only,
 *   · refuses honestly (no company profile, no governance, verified name,
 *     personal workspace) and NEVER calls the writer when it refuses,
 *   · keeps a pending verification pending,
 *   · passes every other stored field back unchanged,
 *   · reports old → new from a READBACK, never from what was asked.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/company/employer-company-context", () => ({
  resolveEmployerCompanyContext: vi.fn(),
}));
vi.mock("@/lib/company/company-setup", () => ({
  getOwnedCompanyById: vi.fn(),
  saveCompanySetup: vi.fn(),
  isKnownCountryCode: (c: string) => ["LT", "NL", "SE"].includes(c),
}));

import { revalidatePath } from "next/cache";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOwnedCompanyById, saveCompanySetup } from "@/lib/company/company-setup";
import { renameActiveOrganization, resolveRenameTarget } from "./organization-rename";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMock = (f: unknown) => f as any;

const ORG = "2e3a4744-0000-4000-8000-000000000001";
const COMPANY = "19f47e78-0000-4000-8000-000000000002";

function row(over: Record<string, unknown> = {}) {
  return {
    id: COMPANY,
    profileId: "p1",
    legalName: "Old Name UAB",
    displayName: "Old Name UAB",
    companyType: "staffing_agency",
    country: "LT",
    registrationCode: "305000000",
    address: "Vilnius",
    website: "https://old.example",
    contactEmail: "info@old.example",
    contactPhone: "+37060000000",
    requesterRole: "owner",
    verificationStatus: "active_unverified",
    verificationNote: null,
    requestedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function okContext(role = "owner") {
  asMock(resolveEmployerCompanyContext).mockResolvedValue({
    kind: "ok",
    companyId: COMPANY,
    organizationId: ORG,
    organizationName: "Old Name UAB",
    role,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refusals are honest and never reach the writer", () => {
  it("an organization with NO company binding (legacy agency-backed) is refused as that — never retargeted", async () => {
    asMock(resolveEmployerCompanyContext).mockResolvedValue({
      kind: "unavailable",
      reason: "no-company-binding",
      activeWorkspaceName: "",
    });
    expect(await renameActiveOrganization("Nonstop Group UAB")).toEqual({
      ok: false,
      code: "no_company_profile",
    });
    expect(saveCompanySetup).not.toHaveBeenCalled();
    expect(getOwnedCompanyById).not.toHaveBeenCalled();
  });

  it("the personal workspace asks which organization — nothing is renamed on a guess", async () => {
    asMock(resolveEmployerCompanyContext).mockResolvedValue({
      kind: "unavailable",
      reason: "personal-workspace",
      activeWorkspaceName: null,
    });
    expect(await renameActiveOrganization("Nonstop Group UAB")).toEqual({
      ok: false,
      code: "personal_workspace",
    });
    expect(saveCompanySetup).not.toHaveBeenCalled();
  });

  it("GOVERNANCE: a manager runs operations, not company identity — refused", async () => {
    okContext("manager");
    expect(await renameActiveOrganization("Nonstop Group UAB")).toEqual({
      ok: false,
      code: "not_authorized",
    });
    expect(saveCompanySetup).not.toHaveBeenCalled();
  });

  it("a member who is not a governance role is refused by the resolver", async () => {
    asMock(resolveEmployerCompanyContext).mockResolvedValue({
      kind: "unavailable",
      reason: "company-not-owned",
      activeWorkspaceName: "Old Name UAB",
    });
    expect(await renameActiveOrganization("Nonstop Group UAB")).toEqual({
      ok: false,
      code: "not_authorized",
    });
  });

  it("THE VERIFIED-NAME LOCK: a verified company is refused BEFORE any write (the writer would fake ok)", async () => {
    okContext();
    asMock(getOwnedCompanyById).mockResolvedValue({
      kind: "ok",
      row: row({ verificationStatus: "verified" }),
    });
    expect(await renameActiveOrganization("Nonstop Group UAB")).toEqual({
      ok: false,
      code: "legal_name_verified",
    });
    expect(saveCompanySetup).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a failed read is OUR failure — never 'you have no organization'", async () => {
    asMock(resolveEmployerCompanyContext).mockResolvedValue({
      kind: "unavailable",
      reason: "error",
      activeWorkspaceName: null,
    });
    expect(await renameActiveOrganization("Nonstop Group UAB")).toEqual({
      ok: false,
      code: "unavailable",
    });
  });

  it("the workspace changed while the form was open → refused, nothing written", async () => {
    // Opened for ORG, saved while ANOTHER organization is active.
    okContext();
    asMock(getOwnedCompanyById).mockResolvedValue({ kind: "ok", row: row() });
    expect(
      await renameActiveOrganization("Nonstop Group UAB", {
        expectedOrganizationId: "0f9e8d7c-6b5a-4f3e-9d1c-2b3a4c5d6e7f",
      }),
    ).toEqual({ ok: false, code: "workspace_changed" });
    expect(saveCompanySetup).not.toHaveBeenCalled();
  });

  it("NEGATIVE CONTROL — the SAME organization proceeds, and the target is still the server's", async () => {
    okContext();
    asMock(getOwnedCompanyById)
      .mockResolvedValueOnce({ kind: "ok", row: row() })
      .mockResolvedValueOnce({ kind: "ok", row: row({ legalName: "Nordbau", displayName: "Nordbau" }) });
    asMock(saveCompanySetup).mockResolvedValue({ kind: "ok", companyId: COMPANY });
    const r = await renameActiveOrganization("Nordbau", { expectedOrganizationId: ORG });
    expect(r).toMatchObject({ ok: true, organizationId: ORG, name: "Nordbau" });
    // The writer is told the SERVER-resolved company, never an id from the form.
    expect(asMock(saveCompanySetup).mock.calls[0][0].companyId).toBe(COMPANY);
  });

  it("the canonical bounds hold before anything is read", async () => {
    expect(await renameActiveOrganization(" X ")).toEqual({ ok: false, code: "invalid" });
    expect(await renameActiveOrganization("A".repeat(201))).toEqual({ ok: false, code: "invalid" });
    expect(resolveEmployerCompanyContext).not.toHaveBeenCalled();
  });
});

describe("the write goes through the ONE canonical writer, for the SERVER-resolved company", () => {
  it("renames exactly the workspace's company, passing every other stored field back", async () => {
    okContext();
    asMock(getOwnedCompanyById)
      .mockResolvedValueOnce({ kind: "ok", row: row() })
      .mockResolvedValueOnce({
        kind: "ok",
        row: row({ legalName: "Nonstop Group UAB", displayName: "Nonstop Group UAB" }),
      });
    asMock(saveCompanySetup).mockResolvedValue({ kind: "ok", companyId: COMPANY });

    const r = await renameActiveOrganization("  Nonstop Group UAB  ");

    expect(saveCompanySetup).toHaveBeenCalledTimes(1);
    expect(asMock(saveCompanySetup).mock.calls[0][0]).toEqual({
      companyId: COMPANY,
      legalName: "Nonstop Group UAB",
      companyType: undefined,
      country: "LT",
      registrationCode: "305000000",
      address: "Vilnius",
      website: "https://old.example",
      contactEmail: "info@old.example",
      contactPhone: "+37060000000",
      requesterRole: "owner",
      submit: false,
    });
    expect(r).toEqual({
      ok: true,
      organizationId: ORG,
      previousName: "Old Name UAB",
      name: "Nonstop Group UAB",
      unchanged: false,
    });
    // The chip label comes from the layout — the whole tree is revalidated.
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("a PENDING verification stays pending — the current submit state is passed through", async () => {
    okContext("admin");
    asMock(getOwnedCompanyById)
      .mockResolvedValueOnce({ kind: "ok", row: row({ verificationStatus: "pending_verification" }) })
      .mockResolvedValueOnce({
        kind: "ok",
        row: row({
          legalName: "Nonstop Group UAB",
          displayName: "Nonstop Group UAB",
          verificationStatus: "pending_verification",
        }),
      });
    asMock(saveCompanySetup).mockResolvedValue({ kind: "ok", companyId: COMPANY });
    await renameActiveOrganization("Nonstop Group UAB");
    expect(asMock(saveCompanySetup).mock.calls[0][0].submit).toBe(true);
  });

  it("NEGATIVE CONTROL for the pending rule: a non-pending company is saved with submit false", async () => {
    okContext();
    asMock(getOwnedCompanyById)
      .mockResolvedValueOnce({ kind: "ok", row: row({ verificationStatus: "needs_checks" }) })
      .mockResolvedValueOnce({ kind: "ok", row: row({ displayName: "New Co", legalName: "New Co" }) });
    asMock(saveCompanySetup).mockResolvedValue({ kind: "ok", companyId: COMPANY });
    await renameActiveOrganization("New Co");
    expect(asMock(saveCompanySetup).mock.calls[0][0].submit).toBe(false);
  });

  it("an unnamed organization (a shell) is named: previous name is null", async () => {
    okContext();
    asMock(getOwnedCompanyById)
      .mockResolvedValueOnce({ kind: "ok", row: row({ legalName: null, displayName: null }) })
      .mockResolvedValueOnce({ kind: "ok", row: row({ legalName: "Nonstop", displayName: "Nonstop" }) });
    asMock(saveCompanySetup).mockResolvedValue({ kind: "ok", companyId: COMPANY });
    const r = await renameActiveOrganization("Nonstop");
    expect(r).toMatchObject({ ok: true, previousName: null, name: "Nonstop" });
  });

  it("a stored country outside today's selectable list is left to the RPC's coalesce, never sent", async () => {
    okContext();
    asMock(getOwnedCompanyById)
      .mockResolvedValueOnce({ kind: "ok", row: row({ country: "XX" }) })
      .mockResolvedValueOnce({ kind: "ok", row: row({ displayName: "Nordbau", legalName: "Nordbau" }) });
    asMock(saveCompanySetup).mockResolvedValue({ kind: "ok", companyId: COMPANY });
    await renameActiveOrganization("Nordbau");
    expect(asMock(saveCompanySetup).mock.calls[0][0].country).toBeUndefined();
  });

  it("the same name again writes nothing and says so", async () => {
    okContext();
    asMock(getOwnedCompanyById).mockResolvedValue({ kind: "ok", row: row() });
    const r = await renameActiveOrganization("Old Name UAB");
    expect(r).toEqual({
      ok: true,
      organizationId: ORG,
      previousName: "Old Name UAB",
      name: "Old Name UAB",
      unchanged: true,
    });
    expect(saveCompanySetup).not.toHaveBeenCalled();
  });
});

describe("the receipt is a READBACK", () => {
  it("a readback that does not carry the new name is a failure — never a claimed success", async () => {
    okContext();
    asMock(getOwnedCompanyById)
      .mockResolvedValueOnce({ kind: "ok", row: row() })
      // Became verified in between: the lock kept the old legal name.
      .mockResolvedValueOnce({ kind: "ok", row: row({ verificationStatus: "verified" }) });
    asMock(saveCompanySetup).mockResolvedValue({ kind: "ok", companyId: COMPANY });
    expect(await renameActiveOrganization("Nonstop Group UAB")).toEqual({
      ok: false,
      code: "legal_name_verified",
    });
  });

  it("the canonical writer's refusals keep their meaning", async () => {
    for (const [kind, code] of [
      ["not-owner", "not_authorized"],
      ["duplicate-company", "duplicate_company"],
      ["needs-migration", "needs_migration"],
      ["invalid-country", "invalid"],
      ["error", "error"],
    ] as const) {
      vi.clearAllMocks();
      okContext();
      asMock(getOwnedCompanyById).mockResolvedValue({ kind: "ok", row: row() });
      asMock(saveCompanySetup).mockResolvedValue({ kind, message: "x" });
      expect(await renameActiveOrganization("Nonstop Group UAB"), kind).toEqual({ ok: false, code });
      expect(revalidatePath, kind).not.toHaveBeenCalled();
    }
  });
});

describe("resolveRenameTarget — the read the chat asks first", () => {
  it("ready carries the current stored name; the organization comes from the server context", async () => {
    okContext();
    asMock(getOwnedCompanyById).mockResolvedValue({ kind: "ok", row: row() });
    const t = await resolveRenameTarget();
    expect(t).toMatchObject({ kind: "ready", organizationId: ORG, companyId: COMPANY, currentName: "Old Name UAB" });
  });

  it("the resolver is called with NO client argument — there is nothing to forge", async () => {
    okContext();
    asMock(getOwnedCompanyById).mockResolvedValue({ kind: "ok", row: row() });
    await resolveRenameTarget();
    expect(asMock(resolveEmployerCompanyContext).mock.calls[0]).toEqual([]);
  });
});
