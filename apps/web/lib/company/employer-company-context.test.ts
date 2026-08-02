import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE canonical employer company resolver — BEHAVIOUR tests (W8 slice 1).
 *
 * The audit's P0-1 was that the active organization was decorative: every
 * employer path resolved through `companies.profile_id = auth.uid()`, so the
 * workspace switch changed nothing. These tests run the REAL resolver with the
 * canonical reads stubbed and pin the properties that make the workspace real:
 *
 *   • the personal workspace can NEVER resolve an employer company;
 *   • a legitimate organization resolves ONLY its own `legacy_company_id`;
 *   • an organization that is not in the membership-validated workspace list is
 *     refused — including when the org row itself is readable (it is: the org
 *     directory is readable by any authenticated user, W4 finding M7);
 *   • a missing / dangling / unowned binding fails CLOSED with its own reason —
 *     never a fallback to "the first company this profile owns";
 *   • an ambiguous or failing read is NEVER converted into `null` / "no data";
 *   • a client-supplied company or organization id changes nothing, because the
 *     resolver takes no input at all.
 */

const getUserMock = vi.fn();
const sessionProfileMock = vi.fn();
const workspaceContextMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: getUserMock }, from: fromMock }),
}));

vi.mock("@/lib/auth/session-profile", () => ({
  getSessionProfile: (...a: unknown[]) => sessionProfileMock(...a),
}));

vi.mock("@/lib/company/active-organization", () => ({
  getWorkspaceContext: (...a: unknown[]) => workspaceContextMock(...a),
}));

// `cache()` is React's request-scoped memo; outside a request it must not make
// the resolver return the FIRST scenario's answer for every later test.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const { resolveEmployerCompanyContext, requireEmployerCompany, isEmployerContextFailure } =
  await import("./employer-company-context");

const USER = { id: "11111111-1111-4111-8111-111111111111" };
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMPANY_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COMPANY_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type TableAnswer = { data?: unknown[] | null; error?: { code?: string } | null };

/** Minimal PostgREST-shaped builder: `.select().eq().limit()` resolves. */
function tableStub(answers: Record<string, TableAnswer>) {
  return (table: string) => {
    const answer = answers[table] ?? { data: [], error: null };
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: async () => ({ data: answer.data ?? null, error: answer.error ?? null }),
    };
    return chain;
  };
}

function workspace(ids: string[], activeId: string) {
  return {
    workspaces: [
      { id: "personal", name: "", kind: "personal", accentIndex: 0 },
      ...ids.map((id) => ({
        id,
        name: `Org ${id.slice(0, 4)}`,
        kind: "organization" as const,
        accentIndex: 0,
      })),
    ],
    activeWorkspaceId: activeId,
    pointerAvailable: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: USER } });
  sessionProfileMock.mockResolvedValue({
    user: USER,
    profile: { id: USER.id, active_role: "company" },
  });
  workspaceContextMock.mockResolvedValue(workspace([ORG_A], ORG_A));
  fromMock.mockImplementation(
    tableStub({
      organizations: {
        data: [
          {
            id: ORG_A,
            display_name: "Alpha Statyba",
            legal_name: null,
            legacy_company_id: COMPANY_A,
          },
        ],
      },
      companies: { data: [{ id: COMPANY_A, profile_id: USER.id }] },
    }),
  );
});

describe("the happy path", () => {
  it("resolves the ACTIVE organization's own legacy company", async () => {
    const ctx = await resolveEmployerCompanyContext();
    expect(ctx).toEqual({
      kind: "ok",
      companyId: COMPANY_A,
      organizationId: ORG_A,
      organizationName: "Alpha Statyba",
    });
  });

  it("resolves the workspace with the caller's REAL identity, never a hardcoded one", async () => {
    await resolveEmployerCompanyContext();
    expect(workspaceContextMock).toHaveBeenCalledWith("company");

    vi.clearAllMocks();
    sessionProfileMock.mockResolvedValue({
      user: USER,
      profile: { id: USER.id, active_role: "worker" },
    });
    workspaceContextMock.mockResolvedValue(workspace([ORG_A], "personal"));
    await resolveEmployerCompanyContext();
    expect(workspaceContextMock).toHaveBeenCalledWith("person");
  });
});

describe("fail-closed states", () => {
  it("the personal workspace can never resolve an employer company", async () => {
    workspaceContextMock.mockResolvedValue(workspace([ORG_A], "personal"));
    const ctx = await resolveEmployerCompanyContext();
    expect(ctx).toMatchObject({ kind: "unavailable", reason: "personal-workspace" });
    // The decisive assertion: an owned company EXISTS, and it is still not
    // returned. That is the whole P0-1 fix — no first-company fallback.
    expect(ctx.kind === "unavailable").toBe(true);
  });

  it("no organizations at all → no-organization, not an error", async () => {
    workspaceContextMock.mockResolvedValue(workspace([], ORG_A));
    await expect(resolveEmployerCompanyContext()).resolves.toMatchObject({
      reason: "no-organization",
    });
  });

  it("an organization outside the validated membership list is refused", async () => {
    // The workspace pointer names ORG_B while only ORG_A is a membership. The
    // org row for ORG_B is deliberately READABLE (the org directory is), so
    // this proves the gate is membership, not row visibility.
    workspaceContextMock.mockResolvedValue(workspace([ORG_A], ORG_B));
    fromMock.mockImplementation(
      tableStub({
        organizations: {
          data: [
            { id: ORG_B, display_name: "Beta", legal_name: null, legacy_company_id: COMPANY_B },
          ],
        },
        companies: { data: [{ id: COMPANY_B, profile_id: USER.id }] },
      }),
    );
    await expect(resolveEmployerCompanyContext()).resolves.toMatchObject({
      reason: "not-a-member",
    });
  });

  it("an organization with no company binding fails closed", async () => {
    fromMock.mockImplementation(
      tableStub({
        organizations: {
          data: [{ id: ORG_A, display_name: "Team", legal_name: null, legacy_company_id: null }],
        },
        companies: { data: [{ id: COMPANY_A, profile_id: USER.id }] },
      }),
    );
    await expect(resolveEmployerCompanyContext()).resolves.toMatchObject({
      reason: "no-company-binding",
    });
  });

  it("a dangling company pointer fails closed", async () => {
    fromMock.mockImplementation(
      tableStub({
        organizations: {
          data: [
            { id: ORG_A, display_name: "Alpha", legal_name: null, legacy_company_id: COMPANY_A },
          ],
        },
        companies: { data: [] },
      }),
    );
    await expect(resolveEmployerCompanyContext()).resolves.toMatchObject({
      reason: "company-missing",
    });
  });

  it("a company owned by somebody else is refused (manager collaboration is not W8-1)", async () => {
    fromMock.mockImplementation(
      tableStub({
        organizations: {
          data: [
            { id: ORG_A, display_name: "Alpha", legal_name: null, legacy_company_id: COMPANY_A },
          ],
        },
        companies: { data: [{ id: COMPANY_A, profile_id: "someone-else" }] },
      }),
    );
    await expect(resolveEmployerCompanyContext()).resolves.toMatchObject({
      reason: "company-not-owned",
    });
  });

  it("no session → unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await expect(resolveEmployerCompanyContext()).resolves.toMatchObject({
      reason: "unauthenticated",
    });
  });
});

describe("ambiguity and failure are never 'no data'", () => {
  it("a multi-row organization answer is ambiguous, not silently reduced", async () => {
    fromMock.mockImplementation(
      tableStub({
        organizations: {
          data: [
            { id: ORG_A, display_name: "Alpha", legal_name: null, legacy_company_id: COMPANY_A },
            { id: ORG_A, display_name: "Alpha dup", legal_name: null, legacy_company_id: COMPANY_B },
          ],
        },
        companies: { data: [{ id: COMPANY_A, profile_id: USER.id }] },
      }),
    );
    const ctx = await resolveEmployerCompanyContext();
    expect(ctx).toMatchObject({ reason: "ambiguous-binding" });
    expect(isEmployerContextFailure("ambiguous-binding")).toBe(true);
  });

  it("a multi-row company answer is ambiguous, not silently reduced", async () => {
    fromMock.mockImplementation(
      tableStub({
        organizations: {
          data: [
            { id: ORG_A, display_name: "Alpha", legal_name: null, legacy_company_id: COMPANY_A },
          ],
        },
        companies: {
          data: [
            { id: COMPANY_A, profile_id: USER.id },
            { id: COMPANY_A, profile_id: USER.id },
          ],
        },
      }),
    );
    await expect(resolveEmployerCompanyContext()).resolves.toMatchObject({
      reason: "ambiguous-binding",
    });
  });

  it("a DB error is reported as a failure, never as an empty employer state", async () => {
    fromMock.mockImplementation(
      tableStub({ organizations: { data: null, error: { code: "57014" } } }),
    );
    const ctx = await resolveEmployerCompanyContext();
    expect(ctx).toMatchObject({ reason: "error" });
    expect(isEmployerContextFailure("error")).toBe(true);
    // "personal-workspace" and "no-organization" are legitimate product states,
    // NOT infrastructure failures — the distinction the old `callerCompanyId`
    // could not express, because everything collapsed to null.
    expect(isEmployerContextFailure("personal-workspace")).toBe(false);
    expect(isEmployerContextFailure("no-organization")).toBe(false);
  });

  it("an absent organizations table degrades to needs-migration, not error", async () => {
    fromMock.mockImplementation(
      tableStub({ organizations: { data: null, error: { code: "42P01" } } }),
    );
    await expect(resolveEmployerCompanyContext()).resolves.toMatchObject({
      reason: "needs-migration",
    });
  });
});

describe("the client is never an authority", () => {
  it("takes no arguments at all, so a forged company/organization id cannot enter", () => {
    // The strongest possible form of "never trust the client": there is no
    // parameter to forge. Every input comes from the session and the
    // server-side workspace resolver.
    expect(resolveEmployerCompanyContext.length).toBe(0);
    expect(requireEmployerCompany.length).toBe(0);
  });

  it("requireEmployerCompany mirrors the resolver without widening it", async () => {
    await expect(requireEmployerCompany()).resolves.toEqual({
      ok: true,
      companyId: COMPANY_A,
      organizationId: ORG_A,
      organizationName: "Alpha Statyba",
    });
    workspaceContextMock.mockResolvedValue(workspace([ORG_A], "personal"));
    await expect(requireEmployerCompany()).resolves.toEqual({
      ok: false,
      reason: "personal-workspace",
    });
  });
});

describe("two organizations, two answers", () => {
  it("the SAME person in workspace A and workspace B resolves DIFFERENT companies", async () => {
    const orgs = {
      [ORG_A]: {
        id: ORG_A,
        display_name: "Alpha",
        legal_name: null,
        legacy_company_id: COMPANY_A,
      },
      [ORG_B]: {
        id: ORG_B,
        display_name: "Beta",
        legal_name: null,
        legacy_company_id: COMPANY_B,
      },
    } as const;

    const forActive = (activeId: string) => {
      workspaceContextMock.mockResolvedValue(workspace([ORG_A, ORG_B], activeId));
      fromMock.mockImplementation((table: string) => {
        const answer =
          table === "organizations"
            ? [orgs[activeId as keyof typeof orgs]]
            : [
                {
                  id: orgs[activeId as keyof typeof orgs].legacy_company_id,
                  profile_id: USER.id,
                },
              ];
        const chain = {
          select: () => chain,
          eq: () => chain,
          limit: async () => ({ data: answer, error: null }),
        };
        return chain;
      });
    };

    forActive(ORG_A);
    await expect(resolveEmployerCompanyContext()).resolves.toMatchObject({
      kind: "ok",
      companyId: COMPANY_A,
    });

    forActive(ORG_B);
    await expect(resolveEmployerCompanyContext()).resolves.toMatchObject({
      kind: "ok",
      companyId: COMPANY_B,
    });
  });
});
