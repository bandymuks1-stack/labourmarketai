import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ARCHIVED ORGANIZATIONS are no workspace (owner decision 2026-09-23 — one
 * canonical Nonstop Group; migration 20260923114500_nonstop_org_consolidation_v1).
 *
 * The archived duplicate/test organizations keep their memberships,
 * engagements and journal history, so EVERY read that lets a person select or
 * act in a workspace has to leave them out itself. These tests run the REAL
 * readers against a PostgREST-shaped stub modelled on the production rows and
 * pin, each with a negative control:
 *
 *   • the owned / governance / engagement sources leave archived orgs out;
 *   • the switch core refuses an archived org as `not-member` and writes nothing;
 *   • the employer resolver fails CLOSED on an archived org even when a stale
 *     workspace list still names it;
 *   • the "may act for" / "governs" lists leave archived orgs out;
 *   • a database WITHOUT the column (42703) is the pre-migration truth — nothing
 *     archived, nothing dropped — while a REAL archive-read failure never lets an
 *     unchecked organization through.
 */

const createClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...a: unknown[]) => createClientMock(...a),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth/session-profile", () => ({
  getSessionProfile: vi.fn(),
  readProfileRow: vi.fn(),
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const {
  isArchivedOrganizationRow,
  isAbsentArchiveSchema,
  readArchivedOrganizationIds,
  withoutArchivedOrganizations,
} = await import("./archived-organizations");
const { readWorkspaceMemberships } = await import("./active-organization");
const { readOwnedOrganizations } = await import("./owned-organizations");
const { switchActiveWorkspaceCore } = await import("./workspace-switch-core");
const { resolveEmployerCompanyCore } = await import("./employer-company-context");
const { getManagedOrganizationIds, getGovernedOrganizations } = await import(
  "./managed-organizations"
);
const { PERSONAL_WORKSPACE_ID } = await import("./organization-switch");

// ── Production-shaped ids (2026-09-23) ──────────────────────────────────────
const RAMUNAS = "01353767-1dcd-40b2-a17d-c9d786429a7c";
const DONATAS = "dc3284ea-026f-4b1a-8d28-4f043973ed34";
const BANDY = "6fd1bd46-52a5-4058-b478-20b2916a1665";
const NONSTOP = "20b2c802-c624-43c0-b368-8fa6c1fbeae3"; // canonical
const LMAI = "19f47e78-7bd1-4120-9937-603dba769f8a";
const LEGACY_NONSTOP = "f2315826-5501-4bfd-a976-3c674559dedd"; // archived
const DONATAS_AGENCY = "2e3a4744-3eb1-482c-bbae-1bf0646d1802"; // archived
const TEST_AGENCY = "af6cc3d6-5c85-4bb0-8390-2d092047207d"; // archived
const TEST_COMPANY = "a3d59458-373e-4939-8897-9f22ae2d35cb"; // archived
const NONSTOP_COMPANY = "048aa7e1-0c77-4484-ad7d-00eb1288d7e3";

const ARCHIVED_AT = "2026-09-23T12:00:00+00:00";

interface OrgRow {
  id: string;
  display_name: string | null;
  legal_name: string | null;
  organization_type: string;
  owner_profile_id: string;
  legacy_company_id: string | null;
  archived_at: string | null;
}

const ORGS: Record<string, OrgRow> = {
  [NONSTOP]: { id: NONSTOP, display_name: "UAB NONSTOP GROUP", legal_name: "UAB NONSTOP GROUP", organization_type: "company", owner_profile_id: RAMUNAS, legacy_company_id: NONSTOP_COMPANY, archived_at: null },
  [LMAI]: { id: LMAI, display_name: "Labour market ai Sp. z o.o", legal_name: null, organization_type: "company", owner_profile_id: DONATAS, legacy_company_id: "788225e9-035b-4ed3-9bce-bf19aab61b14", archived_at: null },
  [LEGACY_NONSTOP]: { id: LEGACY_NONSTOP, display_name: null, legal_name: "Nonstop", organization_type: "agency", owner_profile_id: RAMUNAS, legacy_company_id: null, archived_at: ARCHIVED_AT },
  [DONATAS_AGENCY]: { id: DONATAS_AGENCY, display_name: null, legal_name: null, organization_type: "agency", owner_profile_id: DONATAS, legacy_company_id: null, archived_at: ARCHIVED_AT },
  [TEST_AGENCY]: { id: TEST_AGENCY, display_name: null, legal_name: null, organization_type: "agency", owner_profile_id: BANDY, legacy_company_id: null, archived_at: ARCHIVED_AT },
  [TEST_COMPANY]: { id: TEST_COMPANY, display_name: null, legal_name: null, organization_type: "company", owner_profile_id: BANDY, legacy_company_id: "39b75887-3bdd-495a-8e47-7c9401086a47", archived_at: ARCHIVED_AT },
};

/** Active governance memberships AFTER the migration. */
const MEMBERSHIPS: { organization_id: string; profile_id: string; role: string }[] = [
  { organization_id: NONSTOP, profile_id: RAMUNAS, role: "owner" },
  { organization_id: LEGACY_NONSTOP, profile_id: RAMUNAS, role: "owner" },
  { organization_id: LMAI, profile_id: DONATAS, role: "owner" },
  { organization_id: DONATAS_AGENCY, profile_id: DONATAS, role: "owner" },
  { organization_id: NONSTOP, profile_id: DONATAS, role: "manager" },
  { organization_id: TEST_AGENCY, profile_id: BANDY, role: "owner" },
  { organization_id: TEST_COMPANY, profile_id: BANDY, role: "owner" },
];

/** ACTIVE engagements with an organization AFTER the migration (2698c6e3 ended). */
const ENGAGEMENTS: { organization_id: string; profile_id: string; relationship_slug: string }[] = [
  { organization_id: LMAI, profile_id: RAMUNAS, relationship_slug: "employee" },
  { organization_id: LEGACY_NONSTOP, profile_id: RAMUNAS, relationship_slug: "owner" },
  { organization_id: NONSTOP, profile_id: RAMUNAS, relationship_slug: "owner" },
  { organization_id: NONSTOP, profile_id: RAMUNAS, relationship_slug: "employee" },
  { organization_id: LMAI, profile_id: DONATAS, relationship_slug: "owner" },
  { organization_id: DONATAS_AGENCY, profile_id: DONATAS, relationship_slug: "owner" },
  { organization_id: TEST_COMPANY, profile_id: BANDY, relationship_slug: "owner" },
  { organization_id: TEST_AGENCY, profile_id: BANDY, relationship_slug: "owner" },
];

// ── A PostgREST-shaped stub ─────────────────────────────────────────────────
type Op = [string, unknown[]];
interface Call {
  table: string;
  ops: Op[];
}
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };

function arg(call: Call, method: string, index = 0): unknown {
  return call.ops.find(([m]) => m === method)?.[1][index];
}
function eqValue(call: Call, column: string): unknown {
  const hit = call.ops.find(([m, a]) => m === "eq" && a[0] === column);
  return hit?.[1][1];
}
function has(call: Call, method: string): boolean {
  return call.ops.some(([m]) => m === method);
}

function makeClient(resolve: (call: Call) => Answer) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "not", "is", "order", "limit", "update", "maybeSingle"]) {
        chain[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return chain;
        };
      }
      chain.then = (
        onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
        onRejected: (e: unknown) => unknown,
      ) =>
        Promise.resolve()
          .then(() => resolve(call))
          .then((a) => ({ data: a.data ?? null, error: a.error ?? null }))
          .then(onFulfilled, onRejected);
      return chain;
    },
  };
  return { client, calls };
}

interface WorldOptions {
  /** The archive column does not exist (pre-migration database). */
  columnAbsent?: boolean;
  /** The bounded archive read (`id in (...)`) fails for real. */
  archiveReadFails?: boolean;
  /** Rows as they stand BEFORE the migration (nothing archived). */
  orgs?: Record<string, OrgRow>;
}

function world(opts: WorldOptions = {}) {
  const orgs = opts.orgs ?? ORGS;
  const embed = (id: string) => {
    const o = orgs[id];
    return o
      ? { display_name: o.display_name, legal_name: o.legal_name, organization_type: o.organization_type }
      : null;
  };
  const project = (o: OrgRow, select: string) => {
    const out: Record<string, unknown> = {};
    for (const col of select.split(",").map((s) => s.trim())) {
      out[col] = (o as unknown as Record<string, unknown>)[col];
    }
    return out;
  };
  return makeClient((call) => {
    if (call.table === "organizations") {
      const select = String(arg(call, "select") ?? "");
      if (has(call, "in")) {
        // readArchivedOrganizationIds: select id, in id, not archived_at is null
        if (opts.columnAbsent) return { error: { code: "42703" } };
        if (opts.archiveReadFails) return { error: { code: "XX000", message: "boom" } };
        const ids = arg(call, "in", 1) as string[];
        return {
          data: ids
            .map((id) => orgs[id])
            .filter((o): o is OrgRow => !!o && o.archived_at !== null)
            .map((o) => ({ id: o.id })),
        };
      }
      if (opts.columnAbsent && select.includes("archived_at")) return { error: { code: "42703" } };
      const owner = eqValue(call, "owner_profile_id");
      if (typeof owner === "string") {
        return { data: Object.values(orgs).filter((o) => o.owner_profile_id === owner).map((o) => project(o, select)) };
      }
      const id = eqValue(call, "id");
      if (typeof id === "string") {
        const o = orgs[id];
        return { data: o ? [project(o, select)] : [] };
      }
      return { data: [] };
    }
    if (call.table === "company_memberships") {
      const profile = eqValue(call, "profile_id");
      const org = eqValue(call, "organization_id");
      const roleIn = arg(call, "in", 1) as string[] | undefined;
      const rows = MEMBERSHIPS.filter(
        (m) =>
          m.profile_id === profile &&
          (org === undefined || m.organization_id === org) &&
          (!roleIn || roleIn.includes(m.role)),
      );
      return {
        data: rows.map((m) => ({
          organization_id: m.organization_id,
          role: m.role,
          organizations: embed(m.organization_id),
        })),
      };
    }
    if (call.table === "engagement_contexts") {
      const profile = eqValue(call, "profile_id");
      const slugIn = arg(call, "in", 1) as string[] | undefined;
      const rows = ENGAGEMENTS.filter(
        (e) => e.profile_id === profile && (!slugIn || slugIn.includes(e.relationship_slug)),
      );
      return {
        data: rows.map((e) => ({
          organization_id: e.organization_id,
          relationship_slug: e.relationship_slug,
          organizations: embed(e.organization_id),
        })),
      };
    }
    if (call.table === "companies") {
      const id = eqValue(call, "id");
      return { data: id === NONSTOP_COMPANY ? [{ id: NONSTOP_COMPANY, profile_id: RAMUNAS }] : [] };
    }
    if (call.table === "profiles") return { data: null };
    return { data: [] };
  });
}

function caller(userId: string, client: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: client as any, userId };
}

function orgIds(list: readonly { id: string; kind: string }[]): string[] {
  return list.filter((w) => w.kind === "organization").map((w) => w.id);
}

const BEFORE: Record<string, OrgRow> = Object.fromEntries(
  Object.entries(ORGS).map(([k, o]) => [k, { ...o, archived_at: null }]),
);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── The shared predicate ────────────────────────────────────────────────────
describe("the archive predicate", () => {
  it("a row is archived only when archived_at carries a timestamp", () => {
    expect(isArchivedOrganizationRow({ archived_at: ARCHIVED_AT })).toBe(true);
    expect(isArchivedOrganizationRow({ archived_at: null })).toBe(false);
    expect(isArchivedOrganizationRow({})).toBe(false);
    expect(isArchivedOrganizationRow(null)).toBe(false);
    expect(isArchivedOrganizationRow({ archived_at: "" })).toBe(false);
  });

  it("only a missing column/table is schema absence — a real failure is not", () => {
    for (const code of ["42703", "PGRST204", "42P01", "PGRST205"]) {
      expect(isAbsentArchiveSchema(code)).toBe(true);
    }
    for (const code of ["42501", "XX000", "PGRST301", "", null, undefined]) {
      expect(isAbsentArchiveSchema(code)).toBe(false);
    }
  });

  it("an empty id list costs no query", async () => {
    const { client, calls } = world();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const read = await readArchivedOrganizationIds(client as any, []);
    expect(read).toEqual({ ok: true, archived: new Set() });
    expect(calls).toHaveLength(0);
  });

  it("reads the archived subset in ONE bounded id-in query", async () => {
    const { client, calls } = world();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const read = await readArchivedOrganizationIds(client as any, [NONSTOP, LEGACY_NONSTOP, LEGACY_NONSTOP]);
    expect(read.ok && [...read.archived]).toEqual([LEGACY_NONSTOP]);
    expect(calls).toHaveLength(1);
    expect(arg(calls[0], "in", 1)).toEqual([NONSTOP, LEGACY_NONSTOP]);
    expect(calls[0].ops).toContainEqual(["not", ["archived_at", "is", null]]);
  });

  it("column absent (pre-migration) = nothing archived; a real failure = ok:false", async () => {
    const absent = world({ columnAbsent: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readArchivedOrganizationIds(absent.client as any, [LEGACY_NONSTOP])).toEqual({
      ok: true,
      archived: new Set(),
    });
    const failing = world({ archiveReadFails: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readArchivedOrganizationIds(failing.client as any, [LEGACY_NONSTOP])).toEqual({ ok: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await withoutArchivedOrganizations(failing.client as any, [{ id: NONSTOP }])).toEqual({ ok: false });
  });

  it("a thrown client error is a failure, never an empty 'nothing archived'", async () => {
    const throwing = {
      from() {
        throw new Error("network");
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readArchivedOrganizationIds(throwing as any, [NONSTOP])).toEqual({ ok: false });
  });
});

// ── Workspace list (owned + governance + engagement) ────────────────────────
describe("the workspace list leaves archived organizations out", () => {
  it("Ramunas: Personal, UAB NONSTOP GROUP (owner), and his real employee engagement — never the legacy 'Nonstop'", async () => {
    const { client } = world();
    const read = await readWorkspaceMemberships(caller(RAMUNAS, client));
    expect(read.complete).toBe(true);
    expect(read.workspaces[0]).toMatchObject({ id: PERSONAL_WORKSPACE_ID, kind: "personal" });
    expect(orgIds(read.workspaces)).toEqual([NONSTOP, LMAI]);
    expect(read.workspaces.find((w) => w.id === NONSTOP)).toMatchObject({ relationship: "owner" });
    expect(read.workspaces.find((w) => w.id === LMAI)).toMatchObject({ relationship: "employee" });
  });

  it("Donatas: Personal, Labour market ai (owner), UAB NONSTOP GROUP (manager) — no unnamed shells", async () => {
    const { client } = world();
    const read = await readWorkspaceMemberships(caller(DONATAS, client));
    expect(read.complete).toBe(true);
    expect(orgIds(read.workspaces)).toEqual([LMAI, NONSTOP]);
    expect(read.workspaces.find((w) => w.id === NONSTOP)).toMatchObject({ relationship: "manager" });
    expect(orgIds(read.workspaces)).not.toContain(DONATAS_AGENCY);
    expect(orgIds(read.workspaces)).not.toContain(TEST_COMPANY);
  });

  it("bandymuks1: only the personal context once both test shells are archived", async () => {
    const { client } = world();
    const read = await readWorkspaceMemberships(caller(BANDY, client));
    expect(read.complete).toBe(true);
    expect(orgIds(read.workspaces)).toEqual([]);
  });

  it("NEGATIVE CONTROL: the same rows unarchived list every shell (the filter is what removes them)", async () => {
    const { client } = world({ orgs: BEFORE });
    const donatas = await readWorkspaceMemberships(caller(DONATAS, client));
    expect(orgIds(donatas.workspaces)).toEqual([LMAI, DONATAS_AGENCY, NONSTOP]);
    const bandy = await readWorkspaceMemberships(caller(BANDY, world({ orgs: BEFORE }).client));
    expect(orgIds(bandy.workspaces)).toEqual([TEST_AGENCY, TEST_COMPANY]);
  });

  it("a database without the column (42703) keeps today's list — nothing archived, nothing lost", async () => {
    const { client, calls } = world({ columnAbsent: true, orgs: BEFORE });
    const read = await readWorkspaceMemberships(caller(RAMUNAS, client));
    expect(read.complete).toBe(true);
    expect(orgIds(read.workspaces)).toEqual([NONSTOP, LEGACY_NONSTOP, LMAI]);
    // The owned read retried WITHOUT the column rather than degrading.
    const owned = calls.filter((c) => c.table === "organizations" && eqValue(c, "owner_profile_id") === RAMUNAS);
    expect(owned).toHaveLength(2);
    expect(String(arg(owned[0], "select"))).toContain("archived_at");
    expect(String(arg(owned[1], "select"))).not.toContain("archived_at");
  });

  it("a REAL archive-read failure drops the member-sourced rows and says the list is incomplete", async () => {
    const { client } = world({ archiveReadFails: true });
    const read = await readWorkspaceMemberships(caller(DONATAS, client));
    expect(read.complete).toBe(false);
    // Owned rows are verified by their own read and stay; nothing unchecked is added.
    expect(orgIds(read.workspaces)).toEqual([LMAI]);
  });

  it("readOwnedOrganizations leaves archived owned organizations out", async () => {
    const { client } = world();
    const owned = await readOwnedOrganizations(caller(RAMUNAS, client));
    expect(owned.kind === "ok" && owned.organizations.map((o) => o.id)).toEqual([NONSTOP]);
  });
});

// ── Switch core ─────────────────────────────────────────────────────────────
describe("the switch core refuses an archived organization", () => {
  it("switching INTO an archived org is not-member and writes nothing", async () => {
    const { client, calls } = world();
    const result = await switchActiveWorkspaceCore(caller(DONATAS, client), DONATAS_AGENCY);
    expect(result).toEqual({ ok: false, code: "not-member" });
    expect(calls.some((c) => c.table === "profiles")).toBe(false);
  });

  it("NEGATIVE CONTROL: switching into the canonical Nonstop workspace writes the pointer", async () => {
    const { client, calls } = world();
    const result = await switchActiveWorkspaceCore(caller(DONATAS, client), NONSTOP);
    expect(result).toEqual({ ok: true, workspaceId: NONSTOP });
    const write = calls.find((c) => c.table === "profiles");
    expect(write && arg(write, "update")).toEqual({ active_organization_id: NONSTOP });
  });
});

// ── Employer resolver ───────────────────────────────────────────────────────
describe("the employer resolver fails closed on an archived organization", () => {
  function staleWorkspace(activeId: string) {
    return {
      workspaces: [
        { id: PERSONAL_WORKSPACE_ID, name: "", kind: "personal" as const, accentIndex: 0 },
        { id: activeId, name: "x", kind: "organization" as const, accentIndex: 0 },
      ],
      activeWorkspaceId: activeId,
      pointerAvailable: true,
    };
  }

  it("a stale list naming the archived test company resolves NO employer company", async () => {
    const { client } = world();
    const ctx = await resolveEmployerCompanyCore(caller(BANDY, client), staleWorkspace(TEST_COMPANY));
    expect(ctx).toMatchObject({ kind: "unavailable", reason: "not-a-member" });
  });

  it("NEGATIVE CONTROL: the live canonical organization resolves for its owner", async () => {
    const { client } = world();
    const ctx = await resolveEmployerCompanyCore(caller(RAMUNAS, client), staleWorkspace(NONSTOP));
    expect(ctx).toMatchObject({ kind: "ok", organizationId: NONSTOP, companyId: NONSTOP_COMPANY, role: "owner" });
  });

  it("Donatas resolves Nonstop as a MANAGER (never owner)", async () => {
    const { client } = world();
    const ctx = await resolveEmployerCompanyCore(caller(DONATAS, client), staleWorkspace(NONSTOP));
    expect(ctx).toMatchObject({ kind: "ok", organizationId: NONSTOP, role: "manager" });
  });

  it("a database without the column re-reads without it and still resolves", async () => {
    const { client, calls } = world({ columnAbsent: true, orgs: BEFORE });
    const ctx = await resolveEmployerCompanyCore(caller(RAMUNAS, client), staleWorkspace(NONSTOP));
    expect(ctx).toMatchObject({ kind: "ok", organizationId: NONSTOP });
    const orgReads = calls.filter((c) => c.table === "organizations" && eqValue(c, "id") === NONSTOP);
    expect(orgReads).toHaveLength(2);
  });
});

// ── "May act for" / "governs" lists ─────────────────────────────────────────
describe("the managed and governed lists leave archived organizations out", () => {
  it("getManagedOrganizationIds drops archived orgs; a failed archive read degrades to none", async () => {
    const live = world();
    createClientMock.mockResolvedValue({
      ...live.client,
      auth: { getUser: async () => ({ data: { user: { id: DONATAS } } }) },
    });
    expect((await getManagedOrganizationIds()).sort()).toEqual([LMAI, NONSTOP].sort());

    const failing = world({ archiveReadFails: true });
    createClientMock.mockResolvedValue({
      ...failing.client,
      auth: { getUser: async () => ({ data: { user: { id: DONATAS } } }) },
    });
    expect(await getManagedOrganizationIds()).toEqual([]);
  });

  it("getGovernedOrganizations drops the archived test shells", async () => {
    const live = world();
    createClientMock.mockResolvedValue({
      ...live.client,
      auth: { getUser: async () => ({ data: { user: { id: BANDY } } }) },
    });
    expect(await getGovernedOrganizations()).toEqual([]);

    const before = world({ orgs: BEFORE });
    createClientMock.mockResolvedValue({
      ...before.client,
      auth: { getUser: async () => ({ data: { user: { id: BANDY } } }) },
    });
    expect((await getGovernedOrganizations()).map((o) => o.id).sort()).toEqual(
      [TEST_AGENCY, TEST_COMPANY].sort(),
    );
  });
});
