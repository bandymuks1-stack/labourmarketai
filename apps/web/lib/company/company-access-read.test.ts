import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The company-by-id read, in BOTH access modes, over a stubbed PostgREST
 * client. Pins the READ ≠ EDIT split: "govern" admits the creator and
 * owner/admin members (every write surface keys on it); "open" admits every
 * governance role (the doors and pages key on it). Negative controls: a
 * membership in ANOTHER company admits nothing in either mode, a failed
 * membership read fails closed, and no mode ever widens what the caller's
 * own membership row says.
 */

const getUserMock = vi.fn();
const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: getUserMock }, from: fromMock, rpc: rpcMock }),
}));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));

const { getOwnedCompanyById, getAccessibleCompanyById, readCompanyByIdForAccess } =
  await import("./company-setup");

const USER = "11111111-1111-4111-8111-111111111111";
const CREATOR = "22222222-2222-4222-8222-222222222222";
const COMPANY_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COMPANY_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const companyRow = {
  id: COMPANY_A,
  profile_id: CREATOR,
  legal_name: "Alpha Statyba",
  display_name: null,
  company_type: "construction",
  country: "LT",
  registration_code: null,
  address: null,
  website: null,
  contact_email: null,
  contact_phone: null,
  requester_role: null,
  verification_status: "active_unverified",
  verification_note: null,
  requested_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

/** The caller's membership rows, as the stub filters them: role + company. */
type MembershipRow = { role: string; company: string };

let memberships: MembershipRow[] = [];
let membershipError: { code: string } | null = null;
/** What the LAST membership query filtered on — proves the SQL-side filter
 *  follows the access mode instead of a copy-pasted list. */
let lastRoleFilter: string[] = [];
let lastCompanyFilter: string | null = null;

/** K2-1 v2: the private reader. Default = migration UNAPPLIED (PostgREST
 *  answers PGRST202), so the read falls back to the table as it does today;
 *  `readerApplied` flips it to the definer answering the row itself. */
let readerApplied = false;
function stubRpc(fn: string) {
  if (fn !== "read_companies_private_v1") throw new Error(`unexpected rpc ${fn}`);
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () =>
      readerApplied
        ? { data: companyRow, error: null }
        : { data: null, error: { code: "PGRST202", message: "function not found" } },
  };
  return chain;
}

function stubFrom(table: string) {
  if (table === "companies") {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: companyRow, error: null }),
    };
    return chain;
  }
  if (table === "company_memberships") {
    const chain = {
      select: () => chain,
      eq: (col: string, value: string) => {
        if (col === "organizations.legacy_company_id") lastCompanyFilter = value;
        return chain;
      },
      in: (_col: string, roles: string[]) => {
        lastRoleFilter = roles;
        return chain;
      },
      limit: async () => {
        if (membershipError) return { data: null, error: membershipError };
        const rows = memberships.filter(
          (m) => lastRoleFilter.includes(m.role) && m.company === lastCompanyFilter,
        );
        return { data: rows.map((m) => ({ id: `${m.role}:${m.company}` })), error: null };
      },
    };
    return chain;
  }
  throw new Error(`unexpected table ${table}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  memberships = [];
  membershipError = null;
  lastRoleFilter = [];
  lastCompanyFilter = null;
  readerApplied = false;
  getUserMock.mockResolvedValue({ data: { user: { id: USER } } });
  fromMock.mockImplementation(stubFrom);
  rpcMock.mockImplementation(stubRpc);
});

describe("a MANAGER of the organization (the canonical case)", () => {
  beforeEach(() => {
    memberships = [{ role: "manager", company: COMPANY_A }];
  });

  it("govern: refused — a manager does not edit identity", async () => {
    const r = await getOwnedCompanyById(COMPANY_A);
    expect(r).toEqual({ kind: "ok", row: null });
    expect(lastRoleFilter).toEqual(["owner", "admin"]);
  });

  it("open: admitted — the doors and pages read the company", async () => {
    const r = await getAccessibleCompanyById(COMPANY_A);
    expect(r.kind).toBe("ok");
    expect(r.kind === "ok" && r.row?.id).toBe(COMPANY_A);
    expect(lastRoleFilter).toEqual(["owner", "admin", "manager", "external_manager", "member"]);
    expect(lastCompanyFilter).toBe(COMPANY_A);
  });
});

describe("owner / admin members govern AND open", () => {
  for (const role of ["owner", "admin"] as const) {
    it(`${role}: both modes admit`, async () => {
      memberships = [{ role, company: COMPANY_A }];
      expect((await getOwnedCompanyById(COMPANY_A)).kind === "ok").toBe(true);
      expect(await getOwnedCompanyById(COMPANY_A)).toMatchObject({ row: { id: COMPANY_A } });
      expect(await getAccessibleCompanyById(COMPANY_A)).toMatchObject({ row: { id: COMPANY_A } });
    });
  }
});

describe("member: opens, never governs", () => {
  it("open admits, govern refuses", async () => {
    memberships = [{ role: "member", company: COMPANY_A }];
    expect(await getAccessibleCompanyById(COMPANY_A)).toMatchObject({ row: { id: COMPANY_A } });
    expect(await getOwnedCompanyById(COMPANY_A)).toEqual({ kind: "ok", row: null });
  });
});

describe("the creator arm is unchanged in both modes", () => {
  it("the creator reads the row without any membership row", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: CREATOR } } });
    expect(await getOwnedCompanyById(COMPANY_A)).toMatchObject({ row: { id: COMPANY_A } });
    expect(await getAccessibleCompanyById(COMPANY_A)).toMatchObject({ row: { id: COMPANY_A } });
    // No membership query was needed for the creator.
    expect(lastCompanyFilter).toBeNull();
  });
});

describe("NEGATIVE controls", () => {
  it("a manager of ANOTHER company opens nothing here, in either mode", async () => {
    memberships = [{ role: "manager", company: COMPANY_B }];
    expect(await getAccessibleCompanyById(COMPANY_A)).toEqual({ kind: "ok", row: null });
    expect(await getOwnedCompanyById(COMPANY_A)).toEqual({ kind: "ok", row: null });
  });

  it("an owner of ANOTHER company governs nothing here", async () => {
    memberships = [{ role: "owner", company: COMPANY_B }];
    expect(await getOwnedCompanyById(COMPANY_A)).toEqual({ kind: "ok", row: null });
    expect(await getAccessibleCompanyById(COMPANY_A)).toEqual({ kind: "ok", row: null });
  });

  it("no membership at all: nothing, in either mode", async () => {
    expect(await getAccessibleCompanyById(COMPANY_A)).toEqual({ kind: "ok", row: null });
    expect(await getOwnedCompanyById(COMPANY_A)).toEqual({ kind: "ok", row: null });
  });

  it("a FAILED membership read fails CLOSED in both modes (never 'you own this')", async () => {
    memberships = [{ role: "owner", company: COMPANY_A }];
    membershipError = { code: "XX000" };
    expect(await getOwnedCompanyById(COMPANY_A)).toEqual({ kind: "ok", row: null });
    expect(await getAccessibleCompanyById(COMPANY_A)).toEqual({ kind: "ok", row: null });
  });

  it("no session: nothing, no query", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await getAccessibleCompanyById(COMPANY_A)).toEqual({ kind: "ok", row: null });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("the two wrappers are the ONE implementation with a different access mode", async () => {
    memberships = [{ role: "external_manager", company: COMPANY_A }];
    expect(await readCompanyByIdForAccess(COMPANY_A, "open")).toMatchObject({ row: { id: COMPANY_A } });
    expect(await readCompanyByIdForAccess(COMPANY_A, "govern")).toEqual({ kind: "ok", row: null });
  });
});

describe("K2-1 v2: the private reader, before and after the migration", () => {
  it("unapplied: the definer is tried first, then the table read answers (today's behaviour)", async () => {
    memberships = [{ role: "manager", company: COMPANY_A }];
    expect(await getAccessibleCompanyById(COMPANY_A)).toMatchObject({ row: { id: COMPANY_A } });
    expect(rpcMock).toHaveBeenCalledWith("read_companies_private_v1");
    expect(fromMock).toHaveBeenCalledWith("companies");
  });

  it("applied: the definer answers and the table is never read for private columns", async () => {
    readerApplied = true;
    memberships = [{ role: "manager", company: COMPANY_A }];
    expect(await getAccessibleCompanyById(COMPANY_A)).toMatchObject({ row: { id: COMPANY_A } });
    expect(fromMock).not.toHaveBeenCalledWith("companies");
    // The app's own open/govern check still runs on top of the definer.
    expect(await getOwnedCompanyById(COMPANY_A)).toEqual({ kind: "ok", row: null });
  });

  it("applied: any other reader error is surfaced, never a silent fallback to the table", async () => {
    rpcMock.mockImplementation(() => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: null, error: { code: "42501", message: "denied" } }),
      };
      return chain;
    });
    expect(await getAccessibleCompanyById(COMPANY_A)).toEqual({ kind: "error", message: "denied" });
    expect(fromMock).not.toHaveBeenCalledWith("companies");
  });
});
