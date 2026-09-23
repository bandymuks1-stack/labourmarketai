import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE RENAME'S CONFIRMATION IS SINGLE-USE, AND BOUND TO THE TARGET THE WRITE
 * RESOLVES — exercised through the REAL dispatcher and the REAL token module,
 * not grepped (adversarial review of #1848).
 *
 * The first shape fingerprinted `workspace:<active id>` from a second
 * workspace read. Two defects: (1) that read (`getWorkspaceContext("company")`)
 * can resolve differently from the writer's (`resolveEmployerCompanyContext`,
 * which honours the caller's real identity) when no pointer is stored, and
 * (2) a successful rename did not change it, so the same token could be spent
 * again within the TTL — and a replay could revert someone else's later
 * rename. The fingerprint is now the organization + current name from
 * `resolveRenameTarget()`, the writer's own resolver.
 *
 * Mocked: the session, the role read, the executors (a spy stands in for the
 * rename executor), the rename target and the workspace read. Real: the
 * dispatcher, the action registry, the zod schemas, the authorization core
 * and the HMAC confirmation token.
 */

const h = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  exec: vi.fn(),
  target: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length",
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  },
}));
vi.mock("@/lib/auth/actions", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: h.userId } } }) },
    from: () => {
      throw new Error("the rename fingerprint must not query a table itself");
    },
  }),
}));
vi.mock("@/lib/auth/profile-roles", () => ({
  readActiveProfileRoles: async () => [{ role: "company" }],
}));
vi.mock("@/lib/conversation/worker-executors", () => ({ WORKER_EXECUTORS: {} }));
vi.mock("@/lib/engagements/engagement-executors", () => ({ ENGAGEMENT_EXECUTORS: {} }));
vi.mock("@/lib/conversation/company-executors", () => ({
  COMPANY_EXECUTORS: { "company.rename-organization": h.exec },
}));
vi.mock("@/lib/company/organization-rename", () => ({ resolveRenameTarget: h.target }));
vi.mock("@/lib/company/active-organization", () => ({ getWorkspaceContext: h.workspace }));
vi.mock("@/lib/opportunities/interest", () => ({ interestStateFingerprint: vi.fn() }));
vi.mock("@/lib/invitations/attention", () => ({ invitationStateFingerprint: vi.fn() }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));

import { dispatchWorkerAction, prepareConfirmationAction } from "./dispatch";

const ORG_A = "2e3a4744-0000-4000-8000-000000000001";
const ORG_B = "19f47e78-0000-4000-8000-000000000002";
const ACTION = "company.rename-organization";
const INPUT = { name: "Nonstop Group UAB", expectedOrganizationId: ORG_A };

function targetIs(organizationId: string, currentName: string | null) {
  h.target.mockResolvedValue({
    kind: "ready",
    organizationId,
    companyId: "33333333-3333-4333-8333-333333333333",
    currentName,
    row: {},
  });
}

async function mint(): Promise<string> {
  const prep = await prepareConfirmationAction(ACTION, INPUT);
  expect(prep.ok, JSON.stringify(prep)).toBe(true);
  return prep.ok ? prep.token : "";
}

const dispatch = (token: string) =>
  dispatchWorkerAction(ACTION, INPUT, { locale: "lt", confirmationToken: token });

beforeEach(() => {
  vi.clearAllMocks();
  // The SECOND workspace read the first shape fingerprinted. It stays on A
  // throughout, so any refusal below comes from the writer's own resolver.
  h.workspace.mockResolvedValue({ activeWorkspaceId: ORG_A, workspaces: [] });
  h.exec.mockResolvedValue({ ok: true, data: { organizationId: ORG_A } });
  targetIs(ORG_A, "Old Name UAB");
});

describe("the rename confirmation", () => {
  it("a fresh token for the unchanged target reaches the writer exactly once", async () => {
    const token = await mint();
    expect(await dispatch(token)).toEqual({ ok: true, data: { organizationId: ORG_A } });
    expect(h.exec).toHaveBeenCalledTimes(1);
  });

  it("is SINGLE-USE — once the rename took, the same token is stale", async () => {
    const token = await mint();
    expect((await dispatch(token)).ok).toBe(true);
    // The rename succeeded: the stored name is now the new one.
    targetIs(ORG_A, "Nonstop Group UAB");
    expect(await dispatch(token)).toEqual({ ok: false, code: "stale_confirmation" });
    expect(h.exec).toHaveBeenCalledTimes(1);
  });

  it("a replay cannot revert someone else's later rename", async () => {
    const token = await mint();
    // Another administrator renamed the organization in between.
    targetIs(ORG_A, "Someone Else's Name UAB");
    expect(await dispatch(token)).toEqual({ ok: false, code: "stale_confirmation" });
    expect(h.exec).not.toHaveBeenCalled();
  });

  it("follows the WRITER's target — a switch the second workspace read would miss is refused", async () => {
    const token = await mint();
    // The writer's resolver now lands on B (e.g. the identity changed with no
    // stored pointer), while `getWorkspaceContext("company")` still says A —
    // the old fingerprint would have let this token through.
    targetIs(ORG_B, "Old Name UAB");
    expect(await h.workspace("company")).toEqual({ activeWorkspaceId: ORG_A, workspaces: [] });
    expect(await dispatch(token)).toEqual({ ok: false, code: "stale_confirmation" });
    expect(h.exec).not.toHaveBeenCalled();
  });

  it("an unnamed organization is a state of its own — naming it spends the token", async () => {
    targetIs(ORG_A, null);
    const token = await mint();
    expect((await dispatch(token)).ok).toBe(true);
    targetIs(ORG_A, "Nonstop Group UAB");
    expect(await dispatch(token)).toEqual({ ok: false, code: "stale_confirmation" });
    expect(h.exec).toHaveBeenCalledTimes(1);
  });

  it("the fingerprint carries no raw name", async () => {
    const prep = await prepareConfirmationAction(ACTION, INPUT);
    expect(prep.ok).toBe(true);
    if (!prep.ok) return;
    // Lane A (#1849) binds every confirm-tier fingerprint to the workspace it
    // was minted in (`workspaceBoundFingerprint`); the rename's own
    // organization + name digest follows that prefix unchanged.
    expect(prep.stateFingerprint.startsWith(`ws:${ORG_A}|rename:${ORG_A}:`)).toBe(true);
    expect(prep.stateFingerprint).not.toContain("Old Name");
  });
});
