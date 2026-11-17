import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE PERSON WHO SETS UP A COMPANY ACTS FOR IT (employer-flow audit 2026-11-15).
 *
 * Someone who chose "work" and "hire" at onboarding has `worker` as the
 * primary role. Company setup pinned the new company as the workspace but
 * never moved the acting role, and pinned nothing when the company was
 * already the default workspace. The employer reads (`is_employer()` needs the
 * company or agency role to be the active one) then answered nothing in their
 * own company: no discoverable candidates, and a booking proposal refused as
 * "worker not reachable". The header's workspace switch makes the role follow
 * the workspace (decision d3); setup now runs the same two cores.
 */

const m = vi.hoisted(() => ({
  ctx: vi.fn(),
  pin: vi.fn(),
  follow: vi.fn(),
  save: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./company-setup", () => ({ saveCompanySetup: (...a: unknown[]) => m.save(...a) }));
vi.mock("./active-organization", () => ({ getActiveOrganizationContext: () => m.ctx() }));
vi.mock("./workspace-switch-core", () => ({ switchActiveWorkspaceCore: (...a: unknown[]) => m.pin(...a) }));
vi.mock("@/lib/auth/active-role-core", () => ({ followWorkspaceRoleCore: (...a: unknown[]) => m.follow(...a) }));
vi.mock("@/lib/organizations/capability-actions", () => ({ declareOrganizationCapabilities: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } }),
}));

import { saveCompanySetupAction } from "./setup-actions";

const WORKSPACE = {
  id: "org-new",
  name: "New company",
  kind: "organization",
  organizationType: "company",
  relationship: "owner",
  accentIndex: 0,
} as const;

function form(): FormData {
  const f = new FormData();
  f.set("legal_name", "New company");
  f.set("country", "LT");
  f.set("company_id", "new");
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.save.mockResolvedValue({ kind: "ok", companyId: "company-new" });
  m.pin.mockResolvedValue({ ok: true, workspaceId: "org-new", workspace: WORKSPACE });
  m.follow.mockResolvedValue({ ok: true, role: "company" });
});

describe("company setup makes the person act for the company they set up", () => {
  it("the new company is already the default workspace: it is still pinned, and the role follows", async () => {
    m.ctx.mockResolvedValue({
      organizations: [{ id: "org-new", legacyCompanyId: "company-new" }],
      activeOrganizationId: "org-new",
    });
    const r = await saveCompanySetupAction(null, form());
    expect(r).toEqual({ ok: true, companyId: "company-new", submitted: false, capabilityDeclared: undefined });
    expect(m.pin).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), "org-new");
    expect(m.follow).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), WORKSPACE);
  });

  it("another workspace was active: the new company is pinned and the role follows", async () => {
    m.ctx.mockResolvedValue({
      organizations: [
        { id: "org-employer", legacyCompanyId: "company-elsewhere" },
        { id: "org-new", legacyCompanyId: "company-new" },
      ],
      activeOrganizationId: "org-employer",
    });
    await saveCompanySetupAction(null, form());
    expect(m.pin).toHaveBeenCalledWith(expect.anything(), "org-new");
    expect(m.follow).toHaveBeenCalledWith(expect.anything(), WORKSPACE);
  });

  it("the role follows only from a membership the switch core validated", async () => {
    m.ctx.mockResolvedValue({ organizations: [{ id: "org-new", legacyCompanyId: "company-new" }], activeOrganizationId: null });
    m.pin.mockResolvedValue({ ok: false, code: "not-member" });
    const r = await saveCompanySetupAction(null, form());
    expect(r.ok).toBe(true);
    expect(m.follow).not.toHaveBeenCalled();
  });

  it("a role that cannot follow never fails the setup the person just completed", async () => {
    m.ctx.mockResolvedValue({ organizations: [{ id: "org-new", legacyCompanyId: "company-new" }], activeOrganizationId: "org-new" });
    m.follow.mockResolvedValue({ ok: false, code: "error" });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await saveCompanySetupAction(null, form());
    expect(r.ok).toBe(true);
    expect(quiet).toHaveBeenCalledWith(
      "[saveCompanySetupAction] acting role did not follow the company",
      { code: "error" },
    );
    quiet.mockRestore();
  });

  it("a refused setup moves neither the workspace nor the role", async () => {
    m.save.mockResolvedValue({ kind: "invalid", message: "name" });
    const r = await saveCompanySetupAction(null, form());
    expect(r).toEqual({ ok: false, code: "invalid", message: "name" });
    expect(m.pin).not.toHaveBeenCalled();
    expect(m.follow).not.toHaveBeenCalled();
  });
});
