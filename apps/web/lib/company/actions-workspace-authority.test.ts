import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * M-P0-3 — ACTIVE_WORKSPACE_AUTHORITY_REPLACES_SINGLETON_COMPANY_LOOKUP.
 *
 * Doctrine (MULTI_ORGANIZATION_STRUCTURAL_TRAIN.md): every organization-
 * changing action derives its company from the validated ACTIVE WORKSPACE
 * (`requireEmployerCompany`), verifies membership per request, fails closed
 * when no valid organization is selected, and never infers the first/oldest/
 * only company from `companies.profile_id`.
 *
 * These tests run the REAL server actions with the resolver and RPC wrappers
 * stubbed, and pin:
 *   • workspace A selected → the write is bound to A's company id;
 *   • workspace B selected → the SAME action binds to B instead;
 *   • personal workspace / no organization / not-a-member / stale pointer →
 *     fail closed, and the underlying write wrapper is NEVER invoked;
 *   • infrastructure failure ≠ "you have no organization" (maps to "error");
 *   • needs-migration keeps its dedicated code where the vocabulary has one.
 */

const requireEmployerCompanyMock = vi.fn();

vi.mock("./employer-company-context", async () => {
  const actual = await vi.importActual<
    typeof import("./employer-company-context")
  >("./employer-company-context");
  return {
    ...actual,
    requireEmployerCompany: (...a: unknown[]) => requireEmployerCompanyMock(...a),
  };
});

const inviteMock = vi.fn();
const assignMock = vi.fn();
const provisionMock = vi.fn();
const journalReviewMock = vi.fn();

vi.mock("./company-workers", () => ({
  inviteCompanyWorker: (...a: unknown[]) => inviteMock(...a),
  assignCompanyWorkerRole: (...a: unknown[]) => assignMock(...a),
  provisionCompanyWorkerEngagementContext: (...a: unknown[]) => provisionMock(...a),
  setCompanyWorkerJournalReview: (...a: unknown[]) => journalReviewMock(...a),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const insertProjectMock = vi.fn();
vi.mock("@/lib/projects/create-project-core", () => ({
  insertProjectForCompany: (...a: unknown[]) => insertProjectMock(...a),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({}),
}));

const {
  inviteCompanyWorkerAction,
  assignCompanyWorkerRoleAction,
  provisionCompanyWorkerEngagementContextAction,
  setCompanyWorkerJournalReviewAction,
} = await import("./actions");
const { createProjectContextAction } = await import("./project-context-actions");

const COMPANY_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COMPANY_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const WORKER = "22222222-2222-4222-8222-222222222222";

function okContext(companyId: string) {
  return {
    ok: true,
    companyId,
    organizationId: `org-${companyId.slice(0, 4)}`,
    organizationName: `Org ${companyId.slice(0, 4)}`,
  };
}

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  inviteMock.mockResolvedValue({ kind: "ok", outcome: "invited" });
  assignMock.mockResolvedValue({ kind: "ok", outcome: "assigned" });
  provisionMock.mockResolvedValue({ kind: "ok", outcome: "created" });
  journalReviewMock.mockResolvedValue({ kind: "ok", outcome: "enabled" });
  insertProjectMock.mockResolvedValue({ ok: true, id: "project-1" });
});

describe("workspace selection decides the write target (A vs B)", () => {
  it("invite binds to workspace A's company when A is active", async () => {
    requireEmployerCompanyMock.mockResolvedValue(okContext(COMPANY_A));
    const r = await inviteCompanyWorkerAction(null, form({ email: "w@x.lt" }));
    expect(r.ok).toBe(true);
    expect(inviteMock).toHaveBeenCalledWith(COMPANY_A, "w@x.lt", null);
  });

  it("the SAME invite action binds to B after the workspace switches to B", async () => {
    requireEmployerCompanyMock.mockResolvedValue(okContext(COMPANY_B));
    const r = await inviteCompanyWorkerAction(null, form({ email: "w@x.lt" }));
    expect(r.ok).toBe(true);
    expect(inviteMock).toHaveBeenCalledWith(COMPANY_B, "w@x.lt", null);
  });

  it("role assignment is bound to the active workspace's company only", async () => {
    requireEmployerCompanyMock.mockResolvedValue(okContext(COMPANY_A));
    await assignCompanyWorkerRoleAction(
      null,
      form({ workerId: WORKER, operationsRole: "foreman" }),
    );
    expect(assignMock).toHaveBeenCalledWith(COMPANY_A, WORKER, "foreman", null);

    requireEmployerCompanyMock.mockResolvedValue(okContext(COMPANY_B));
    await assignCompanyWorkerRoleAction(
      null,
      form({ workerId: WORKER, operationsRole: "foreman" }),
    );
    expect(assignMock).toHaveBeenLastCalledWith(COMPANY_B, WORKER, "foreman", null);
  });

  it("engagement provisioning is organization-specific", async () => {
    requireEmployerCompanyMock.mockResolvedValue(okContext(COMPANY_B));
    await provisionCompanyWorkerEngagementContextAction(null, form({ workerId: WORKER }));
    expect(provisionMock).toHaveBeenCalledWith(COMPANY_B, WORKER);
  });

  it("journal review toggling is organization-specific", async () => {
    requireEmployerCompanyMock.mockResolvedValue(okContext(COMPANY_A));
    await setCompanyWorkerJournalReviewAction(
      null,
      form({ workerId: WORKER, enabled: "true" }),
    );
    expect(journalReviewMock).toHaveBeenCalledWith(COMPANY_A, WORKER, true);
  });

  it("project creation inserts into the active workspace's company", async () => {
    requireEmployerCompanyMock.mockResolvedValue(okContext(COMPANY_A));
    await createProjectContextAction(null, form({ name: "Statyba A" }));
    expect(insertProjectMock).toHaveBeenCalledWith(expect.anything(), COMPANY_A, {
      title: "Statyba A",
      city: null,
    });

    requireEmployerCompanyMock.mockResolvedValue(okContext(COMPANY_B));
    await createProjectContextAction(null, form({ name: "Statyba B" }));
    expect(insertProjectMock).toHaveBeenLastCalledWith(expect.anything(), COMPANY_B, {
      title: "Statyba B",
      city: null,
    });
  });
});

describe("fail-closed: no valid workspace → NO write is attempted", () => {
  const closedReasons = [
    "personal-workspace",
    "no-organization",
    "not-a-member",
    "no-company-binding",
    "company-not-owned",
    "unauthenticated",
  ] as const;

  for (const reason of closedReasons) {
    it(`invite fails closed on "${reason}" without invoking the write`, async () => {
      requireEmployerCompanyMock.mockResolvedValue({ ok: false, reason });
      const r = await inviteCompanyWorkerAction(null, form({ email: "w@x.lt" }));
      expect(r).toEqual({ ok: false, code: "no_company" });
      expect(inviteMock).not.toHaveBeenCalled();
    });
  }

  it("role assignment / provisioning / journal review fail closed on the personal workspace", async () => {
    requireEmployerCompanyMock.mockResolvedValue({
      ok: false,
      reason: "personal-workspace",
    });
    expect(
      await assignCompanyWorkerRoleAction(null, form({ workerId: WORKER })),
    ).toEqual({ ok: false, code: "no_org" });
    expect(
      await provisionCompanyWorkerEngagementContextAction(null, form({ workerId: WORKER })),
    ).toEqual({ ok: false, code: "no_org" });
    expect(
      await setCompanyWorkerJournalReviewAction(
        null,
        form({ workerId: WORKER, enabled: "true" }),
      ),
    ).toEqual({ ok: false, code: "no_org" });
    expect(assignMock).not.toHaveBeenCalled();
    expect(provisionMock).not.toHaveBeenCalled();
    expect(journalReviewMock).not.toHaveBeenCalled();
  });

  it("project creation fails closed without a valid workspace", async () => {
    requireEmployerCompanyMock.mockResolvedValue({
      ok: false,
      reason: "no-organization",
    });
    const r = await createProjectContextAction(null, form({ name: "Statyba" }));
    expect(r).toEqual({ ok: false, code: "no_company" });
    expect(insertProjectMock).not.toHaveBeenCalled();
  });
});

describe("honest degradation: infra failure is never 'you have no organization'", () => {
  for (const reason of ["error", "ambiguous-binding", "company-missing"] as const) {
    it(`invite maps "${reason}" to error, not no_company`, async () => {
      requireEmployerCompanyMock.mockResolvedValue({ ok: false, reason });
      const r = await inviteCompanyWorkerAction(null, form({ email: "w@x.lt" }));
      expect(r).toEqual({ ok: false, code: "error" });
      expect(inviteMock).not.toHaveBeenCalled();
    });
  }

  it("needs-migration keeps its dedicated code on the roster actions", async () => {
    requireEmployerCompanyMock.mockResolvedValue({
      ok: false,
      reason: "needs-migration",
    });
    expect(await inviteCompanyWorkerAction(null, form({ email: "w@x.lt" }))).toEqual({
      ok: false,
      code: "needs_migration",
    });
    expect(
      await assignCompanyWorkerRoleAction(null, form({ workerId: WORKER })),
    ).toEqual({ ok: false, code: "needs_migration" });
  });

  it("project creation maps infra failure to error", async () => {
    requireEmployerCompanyMock.mockResolvedValue({
      ok: false,
      reason: "ambiguous-binding",
    });
    const r = await createProjectContextAction(null, form({ name: "Statyba" }));
    expect(r).toEqual({ ok: false, code: "error" });
    expect(insertProjectMock).not.toHaveBeenCalled();
  });
});

describe("static pins — the singleton lookup is gone from the write paths", () => {
  const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");

  it("lib/company/actions.ts derives authority from requireEmployerCompany only", () => {
    const src = read("lib/company/actions.ts");
    expect(src).toMatch(/requireEmployerCompany/);
    expect(src).not.toMatch(/\bgetOwnCompany\b/);
  });

  it("lib/company/project-context-actions.ts derives authority from requireEmployerCompany only", () => {
    const src = read("lib/company/project-context-actions.ts");
    expect(src).toMatch(/requireEmployerCompany/);
    expect(src).not.toMatch(/\bgetOwnCompany\b/);
  });

  it("neither write path reads a company/organization id from the client", () => {
    for (const rel of [
      "lib/company/actions.ts",
      "lib/company/project-context-actions.ts",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(
        /formData\.get\(["']company_?[iI]d["']\)|formData\.get\(["']org/,
      );
    }
  });
});
