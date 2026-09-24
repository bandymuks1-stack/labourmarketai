import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/company/employer-company-context", () => ({
  resolveEmployerCompanyContext: vi.fn(),
}));
vi.mock("@/lib/company/company-setup", () => ({ getOwnedCompanyById: vi.fn() }));
vi.mock("@/lib/organizations/capability-read", () => ({
  readOrganizationCapabilities: vi.fn(),
}));
vi.mock("@/lib/agency/bridge-read", () => ({
  listMyClientBridgeConnections: vi.fn(),
  listMyConnectionInvites: vi.fn(),
}));

import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOwnedCompanyById } from "@/lib/company/company-setup";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import {
  listMyClientBridgeConnections,
  listMyConnectionInvites,
} from "@/lib/agency/bridge-read";
import { loadOrganizationDoors } from "@/lib/company/organization-doors";

/**
 * The partners door opens on the MERGED bridge read (2026-09-24): invites
 * addressed to the caller's e-mail PLUS every active connection the
 * company owns. A connection accepted by another owner of the same company
 * used to leave the door closed although the relationship existed.
 */
const COMPANY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const asMock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const connection = (status: "pending" | "active") => ({
  id: "11111111-1111-4111-8111-111111111111",
  agencyName: "Agency",
  invitedEmail: "other-owner@example.com",
  status,
  createdAt: "2026-09-20T10:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  asMock(resolveEmployerCompanyContext).mockResolvedValue({
    kind: "ok",
    companyId: COMPANY,
    organizationId: ORG,
    organizationName: "Client Co",
    role: "owner",
  });
  asMock(getOwnedCompanyById).mockResolvedValue({
    kind: "ok",
    row: { id: COMPANY, companyType: "employer" },
  });
  asMock(readOrganizationCapabilities).mockResolvedValue([]);
});

describe("loadOrganizationDoors — partners opens on the merged bridge read", () => {
  it("asks the MERGED read for THIS company, never the e-mail-only read", async () => {
    asMock(listMyClientBridgeConnections).mockResolvedValue({ kind: "ok", rows: [] });
    await loadOrganizationDoors();
    expect(listMyClientBridgeConnections).toHaveBeenCalledWith(COMPANY);
    expect(listMyConnectionInvites).not.toHaveBeenCalled();
  });

  it("a connection the COMPANY owns (accepted under another owner's e-mail) opens the door", async () => {
    asMock(listMyClientBridgeConnections).mockResolvedValue({
      kind: "ok",
      rows: [connection("active")],
    });
    const doors = await loadOrganizationDoors();
    expect(doors.hasPartners).toBe(true);
    expect(doors.doors).toContain("partners");
  });

  it("a pending invite addressed to the caller opens the door too", async () => {
    asMock(listMyClientBridgeConnections).mockResolvedValue({
      kind: "ok",
      rows: [connection("pending")],
    });
    const doors = await loadOrganizationDoors();
    expect(doors.hasPartners).toBe(true);
  });

  it("NEGATIVE: no relationship → no door (a first-visit employer sees no empty room)", async () => {
    asMock(listMyClientBridgeConnections).mockResolvedValue({ kind: "ok", rows: [] });
    const doors = await loadOrganizationDoors();
    expect(doors.hasPartners).toBe(false);
    expect(doors.doors).not.toContain("partners");
  });

  it("NEGATIVE: an UNKNOWN list opens no door and never pretends to be empty", async () => {
    for (const state of [{ kind: "error" as const }, { kind: "needs-migration" as const }]) {
      asMock(listMyClientBridgeConnections).mockResolvedValue(state);
      const doors = await loadOrganizationDoors();
      expect(doors.hasPartners, state.kind).toBe(false);
    }
  });

  it("a staffing agency always has the door and makes no client-side read", async () => {
    asMock(getOwnedCompanyById).mockResolvedValue({
      kind: "ok",
      row: { id: COMPANY, companyType: "staffing_agency" },
    });
    const doors = await loadOrganizationDoors();
    expect(doors.isStaffingAgency).toBe(true);
    expect(doors.hasPartners).toBe(true);
    expect(listMyClientBridgeConnections).not.toHaveBeenCalled();
  });

  it("no company workspace → no doors at all, and no bridge read", async () => {
    asMock(resolveEmployerCompanyContext).mockResolvedValue({
      kind: "unavailable",
      reason: "personal-workspace",
    });
    const doors = await loadOrganizationDoors();
    expect(doors.organizationId).toBeNull();
    expect(doors.doors).toEqual([]);
    expect(listMyClientBridgeConnections).not.toHaveBeenCalled();
  });
});
