import { writeFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PERF 2026-10-22 — one `/dashboard/company` render, counted.
 *
 * Production (owner of a real organization, Supabase edge logs, 2026-10-22
 * 16:16 UTC): ONE server render of the company home issued ~127 PostgREST
 * calls in ~15 sequential waves, and the same request repeated identical reads
 * — `read_companies_private_v1` x3, `organization_roles`, the reviewable-set
 * RPC x2, the agency bridge RPCs x2, a project's roster / teams / header row
 * twice per project, the session's availability several times.
 *
 * This suite renders nothing. It drives the SAME data loaders the page, the
 * organization doors (company layout) and the bell (dashboard layout) call in
 * that render against a RECORDING fake Supabase client, with a request-scoped
 * stand-in for React `cache()` (Next gives every server render its own cache;
 * here `beginRequest()` starts a new one). It then asserts that every reader
 * this change deduplicated reaches the database ONCE per render — and again on
 * the next render, because `cache()` is request deduplication, never data
 * caching.
 *
 * `TRACE_OUT=<file>` writes the full call trace for the next perf pass.
 */

const USER = "00000000-0000-4000-8000-000000000001";
const ORG = "00000000-0000-4000-8000-0000000000a1";
const CO = "00000000-0000-4000-8000-0000000000c1";
const P1 = "00000000-0000-4000-8000-0000000000e1";
const P2 = "00000000-0000-4000-8000-0000000000e2";
const W1 = "00000000-0000-4000-8000-0000000000f1";
const WP1 = "00000000-0000-4000-8000-0000000000f2";
const R1 = "00000000-0000-4000-8000-0000000000d1";

type Call = { kind: "from" | "rpc"; name: string; ops: string[]; single: boolean };
const log: Call[] = [];

// ── React cache(): one memo per "request", keyed like React keys it ─────────
// (primitives by value, objects by identity), cleared by beginRequest().
const requestStores: Map<string, unknown>[] = [];
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
function argKey(args: unknown[]): string {
  return args
    .map((a) => {
      if ((typeof a === "object" && a !== null) || typeof a === "function") {
        let id = objectIds.get(a as object);
        if (id === undefined) {
          id = nextObjectId++;
          objectIds.set(a as object, id);
        }
        return `#${id}`;
      }
      return JSON.stringify(a);
    })
    .join("|");
}
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...a: A) => R) => {
      const store = new Map<string, R>();
      requestStores.push(store as Map<string, unknown>);
      return (...args: A): R => {
        const k = argKey(args);
        if (!store.has(k)) store.set(k, fn(...args));
        return store.get(k) as R;
      };
    },
  };
});
async function beginRequest(): Promise<void> {
  log.length = 0;
  for (const s of requestStores) s.clear();
  // The bell's slow badges sit behind a process-level TTL memo; every
  // simulated render here is the worst case (the TTL has expired), so the
  // bell's bridge and team-offer reads run too.
  const { clearBadgeCache } = await import("@/lib/perf/badge-ttl-cache");
  clearBadgeCache();
}

// ── The recording fake client ───────────────────────────────────────────────
function projectRow(id: string) {
  return {
    id,
    title: `Project ${id.slice(-2)}`,
    status: "live",
    city: null,
    country: null,
    start_date: null,
    end_date: null,
    organization_id: ORG,
    company_id: CO,
    organizations: { display_name: "Org", legal_name: "Org UAB" },
  };
}
const workerEmbed = {
  id: W1,
  profile_id: WP1,
  display_name: "Worker",
  profiles: { full_name: "Worker", email: null },
};
// An organization that acts as an agency by a declared role (not by type) and
// has two live projects, one worker on the roster and one open need — the
// shape of the production organization the trace was taken from.
const TABLE_ROWS: Record<string, unknown[]> = {
  projects: [projectRow(P1), projectRow(P2)],
  organization_roles: [{ role_slug: "workforce_provider" }, { role_slug: "employer" }],
  company_workers: [
    {
      worker_id: W1,
      company_id: CO,
      status: "active",
      created_at: "2026-10-01T00:00:00Z",
      workers: { ...workerEmbed, availability_status: "available" },
    },
  ],
  project_worker_assignments: [
    {
      worker_id: W1,
      project_id: P1,
      status: "active",
      assigned_at: "2026-10-01T00:00:00Z",
      worker: workerEmbed,
      workers: workerEmbed,
    },
  ],
  workers: [{ ...workerEmbed, availability_status: "available" }],
  customer_requests: [
    {
      id: R1,
      title: "Need",
      status: "submitted",
      kind: "company_request",
      payload: {},
      organization_id: ORG,
      profile_id: USER,
      created_at: "2026-10-01T00:00:00Z",
      team_size: 2,
    },
  ],
};

function fixture(c: Call): { data: unknown; error: null; count: number } {
  if (c.kind === "rpc" && c.name === "can_manage_project") return { data: true, error: null, count: 0 };
  const rows: unknown[] =
    c.kind === "from"
      ? (TABLE_ROWS[c.name] ?? [])
      : c.name === "read_companies_private_v1"
        ? [
            {
              id: CO,
              profile_id: USER,
              legal_name: "Org UAB",
              display_name: "Org",
              company_type: "construction",
            },
          ]
        : [];
  if (c.single) {
    if (c.kind === "from" && c.name === "projects") {
      const idOp = c.ops.find((o) => o.startsWith('eq(["id"'));
      const id = idOp ? (JSON.parse(idOp.slice(3, -1)) as string[])[1] : P1;
      return { data: projectRow(id), error: null, count: 0 };
    }
    return { data: rows[0] ?? null, error: null, count: 0 };
  }
  return { data: rows, error: null, count: rows.length };
}

function builder(c: Call): unknown {
  const p: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(fixture(c)).then(res, rej);
      }
      return (...args: unknown[]) => {
        if (prop === "maybeSingle" || prop === "single") c.single = true;
        c.ops.push(`${String(prop)}(${JSON.stringify(args)})`);
        return p;
      };
    },
  });
  return p;
}

function makeClient() {
  return {
    from(name: string) {
      const c: Call = { kind: "from", name, ops: [], single: false };
      log.push(c);
      return builder(c);
    },
    rpc(name: string, args?: unknown) {
      const c: Call = { kind: "rpc", name, ops: [JSON.stringify(args ?? null)], single: false };
      log.push(c);
      return builder(c);
    },
    auth: {
      getUser: async () => ({ data: { user: { id: USER, email: null } }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    storage: {
      from: () => ({
        createSignedUrls: async () => ({ data: [], error: null }),
        createSignedUrl: async () => ({ data: null, error: null }),
      }),
    },
  };
}
// ONE client per request, like the request-cached cookie client in production.
const requestClient = makeClient();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => requestClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => requestClient }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    Object.assign((k: string) => k, { has: () => true, rich: (k: string) => k, raw: (k: string) => k }),
  getLocale: async () => "lt",
  setRequestLocale: () => undefined,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined, has: () => false }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: <T,>(fn: T) => fn,
  unstable_noStore: () => undefined,
}));
// The workspace resolvers are already request-cached in production
// (`resolveEmployerCompanyContext = cache(...)`, `getActiveOrganizationContext
// = cache(...)`); they are fixed here so the counted reads are the readers
// this change is about.
const EMPLOYER = {
  companyId: CO,
  organizationId: ORG,
  organizationName: "Org",
  role: "owner" as const,
  isCreator: true,
  invitationDelegate: false,
};
vi.mock("@/lib/company/employer-company-context", async (orig) => ({
  ...(await orig<typeof import("@/lib/company/employer-company-context")>()),
  resolveEmployerCompanyContext: async () => ({ kind: "ok", ...EMPLOYER }),
  requireEmployerCompany: async () => ({ ok: true, ...EMPLOYER }),
}));
vi.mock("@/lib/company/active-organization", async (orig) => ({
  ...(await orig<typeof import("@/lib/company/active-organization")>()),
  getActiveOrganizationContext: async () => ({
    organizations: [{ id: ORG, legacyCompanyId: CO, displayName: "Org", legalName: "Org UAB" }],
    activeOrganizationId: ORG,
    activeOrganization: { id: ORG, name: "Org", organizationType: "company", relationship: "owner" },
    canSwitch: false,
    pointerAvailable: true,
  }),
}));

/** Every read of `/lt/dashboard/company` in one render: the dashboard layout's
 *  bell, the company layout's doors, and the page's own reads and batch —
 *  in the page's order (page.tsx). */
async function renderCompanyHomeReads(): Promise<void> {
  const { loadOrganizationDoors } = await import("@/lib/company/organization-doors");
  const { getSpineCounts } = await import("@/lib/notifications/spine");
  const { getAccessibleCompanyById } = await import("@/lib/company/company-setup");
  const { readOrganizationCapabilities } = await import("@/lib/organizations/capability-read");
  const { listOwnCustomerRequests } = await import("@/lib/buyer/customer-requests");
  const { listClaimablePublicIntakes } = await import("@/lib/company/claim-public-intake");
  const { listMyConnectionInvites } = await import("@/lib/agency/bridge-read");
  const { listAgencyClients } = await import("@/lib/agency/clients");
  const { listActiveCompanyWorkers, listCompanyWorkerInvitations } = await import(
    "@/lib/company/company-workers"
  );
  const { getTeamBrigadesData } = await import("@/lib/company/team-brigades");
  const { countReviewablePendingEntries } = await import("@/lib/journal/reviewable-count");
  const { countCounterpartyToDecide } = await import("@/lib/journal/counterparty-to-decide-count");
  const { countWorkersWithUnconfirmableWork } = await import("@/lib/operations/org-members");
  const { countRosterConflicts } = await import("@/lib/planning/roster-conflicts");
  const { loadCompanyHomeField } = await import("@/lib/company/company-home-field");

  // Layouts (streamed beside the page in the same request).
  const layouts = Promise.all([loadOrganizationDoors(), getSpineCounts()]);
  // page.tsx
  await getAccessibleCompanyById(CO);
  await readOrganizationCapabilities(ORG);
  const roster = listActiveCompanyWorkers(CO);
  await Promise.all([
    listOwnCustomerRequests(["company_request", "agency_offer"]),
    listClaimablePublicIntakes(),
    listMyConnectionInvites(),
    listAgencyClients(),
    listCompanyWorkerInvitations(CO),
    getTeamBrigadesData(),
    countReviewablePendingEntries(),
    countWorkersWithUnconfirmableWork(ORG),
    loadCompanyHomeField({ roster }),
    countCounterpartyToDecide(),
    countRosterConflicts(),
  ]);
  await layouts;
}

const sig = (c: Call) => `${c.kind} ${c.name} ${c.ops.join(".")}`;
const count = (pred: (c: Call) => boolean) => log.filter(pred).length;
const rpcCount = (name: string) => count((c) => c.kind === "rpc" && c.name === name);
const fromCount = (name: string, opIncludes?: string) =>
  count((c) => c.kind === "from" && c.name === name && (!opIncludes || c.ops.join(".").includes(opIncludes)));

// The first render imports the whole loader graph; warm it once outside the
// per-test timeout (a cold import under a loaded test runner can take seconds).
beforeAll(async () => {
  await beginRequest();
  await renderCompanyHomeReads();
}, 120_000);
beforeEach(async () => {
  await beginRequest();
});

describe("one /dashboard/company render reads each shared fact ONCE", () => {
  it("the readers several surfaces share hit the database once per render", async () => {
    await renderCompanyHomeReads();
    if (process.env.TRACE_OUT) {
      writeFileSync(process.env.TRACE_OUT, `${log.length} calls\n${log.map(sig).join("\n")}\n`);
    }

    // The company row: doors + page + chat starter + bridge spine (was 4).
    expect(rpcCount("read_companies_private_v1")).toBe(1);
    // The organization's declared capabilities: same four callers (was 4).
    expect(fromCount("organization_roles")).toBe(1);
    // The gated reviewable set: decisions count + brief queue + every
    // project's readiness pulse (was 4).
    expect(rpcCount("reviewable_journal_entry_ids")).toBe(1);
    // Teams: the partners strip + the workforce read behind the conflicts
    // count (was 2 probes + 2 team lists).
    expect(rpcCount("get_team_capability_summary_v1")).toBe(1);
    expect(fromCount("organizations", '"organization_type","team"')).toBe(1);
    // Agency bridge: chat starter + opening brief + bell (was 3 / 3 / 2).
    expect(rpcCount("list_shared_requests_for_agency_v1")).toBe(1);
    expect(rpcCount("list_agency_offer_progress_v1")).toBe(1);
    expect(rpcCount("list_agency_placements_v1")).toBe(1);
    // A demand's team offers: opening brief + bell (was 2).
    expect(rpcCount("list_team_offers_for_request_v2")).toBe(1);
    // The company's demands: opening brief + bell (was 2).
    expect(fromCount("customer_requests", "created_at, kind, profile_id")).toBe(1);
    // The booking-loop seen timestamp: bell + brief (was 2).
    expect(fromCount("booking_requests_seen")).toBe(1);
    // The session's availability: brief + conflicts + who-is-free (was 3).
    expect(fromCount("worker_absence_scheduling")).toBe(1);
    expect(fromCount("company_workers", "worker_id, workers(id, display_name)")).toBe(1);
  });

  it("per project: the header row, the roster and the teams are read once, not twice", async () => {
    await renderCompanyHomeReads();
    for (const id of [P1, P2]) {
      // detail read + operations pulse (was 2 each).
      expect(fromCount("projects", `"id","${id}"`), `header row ${id}`).toBe(1);
      expect(
        fromCount("project_worker_assignments", `"project_id","${id}"`),
        `roster ${id}`,
      ).toBe(1);
      expect(fromCount("team_assignments", `["${id}"]`), `teams ${id}`).toBe(1);
    }
  });

  it("no deduplicated read is issued twice with the same arguments", async () => {
    await renderCompanyHomeReads();
    const seen = new Map<string, number>();
    for (const c of log) seen.set(sig(c), (seen.get(sig(c)) ?? 0) + 1);
    const deduped = [
      "read_companies_private_v1",
      "organization_roles",
      "reviewable_journal_entry_ids",
      "get_team_capability_summary_v1",
      "list_shared_requests_for_agency_v1",
      "list_agency_offer_progress_v1",
      "list_agency_placements_v1",
      "list_team_offers_for_request_v2",
      "booking_requests_seen",
      "worker_absence_scheduling",
      "company_memberships",
    ];
    const repeated = [...seen.entries()].filter(
      ([k, n]) => n > 1 && deduped.some((name) => k.split(" ")[1] === name),
    );
    expect(repeated).toEqual([]);
  });

  it("is request deduplication, not data caching: the next render reads again", async () => {
    await renderCompanyHomeReads();
    const first = log.length;
    await beginRequest();
    await renderCompanyHomeReads();
    expect(log.length).toBe(first);
    expect(rpcCount("read_companies_private_v1")).toBe(1);
    expect(rpcCount("reviewable_journal_entry_ids")).toBe(1);
  });
});

describe("the request-scoped readers keep their meaning", () => {
  it("the company row is shared between 'open' and 'govern'; the membership question is not", async () => {
    // A non-creator: the row read is shared, each access mode asks its own
    // membership question (owner/admin vs every governance role).
    const original = TABLE_ROWS.company_memberships;
    const { getAccessibleCompanyById, getOwnedCompanyById } = await import(
      "@/lib/company/company-setup"
    );
    try {
      TABLE_ROWS.company_memberships = [{ id: "m1" }];
      const spy = vi.spyOn(requestClient.auth, "getUser").mockResolvedValue({
        data: { user: { id: "someone-else", email: null } },
        error: null,
      } as never);
      await getAccessibleCompanyById(CO);
      await getAccessibleCompanyById(CO);
      await getOwnedCompanyById(CO);
      spy.mockRestore();
      expect(rpcCount("read_companies_private_v1")).toBe(1);
      const memberships = log.filter((c) => c.name === "company_memberships");
      expect(memberships).toHaveLength(2);
      expect(new Set(memberships.map(sig)).size).toBe(2);
    } finally {
      TABLE_ROWS.company_memberships = original ?? [];
    }
  });

  it("each caller gets its own copy of the shared capability list", async () => {
    const { readOrganizationCapabilities } = await import("@/lib/organizations/capability-read");
    const a = await readOrganizationCapabilities(ORG);
    const b = await readOrganizationCapabilities(ORG);
    expect(a).toEqual(["workforce_provider", "employer"]);
    expect(a).not.toBe(b);
    expect(fromCount("organization_roles")).toBe(1);
  });

  it("team members are shared per CLIENT: another client (another identity) reads for itself", async () => {
    const { readTeamAssignedPeople } = await import("@/lib/projects/assigned-people");
    const other = makeClient();
    await readTeamAssignedPeople(requestClient as never, [P1]);
    await readTeamAssignedPeople(requestClient as never, [P1]);
    expect(fromCount("team_assignments")).toBe(1);
    await readTeamAssignedPeople(other as never, [P1]);
    expect(fromCount("team_assignments")).toBe(2);
    // A different project set is a different question.
    await readTeamAssignedPeople(requestClient as never, [P1, P2]);
    expect(fromCount("team_assignments")).toBe(3);
  });

  it("an explicit availability caller (bearer / agent transport) is never served the session's read", async () => {
    const { getEmployerWorkerAvailability } = await import("@/lib/planning/employer-availability");
    await getEmployerWorkerAvailability();
    await getEmployerWorkerAvailability();
    expect(fromCount("worker_absence_scheduling")).toBe(1);
    const caller = { supabase: makeClient() as never, userId: USER };
    await getEmployerWorkerAvailability(caller);
    await getEmployerWorkerAvailability(caller);
    expect(fromCount("worker_absence_scheduling")).toBe(3);
  });

  it("a failed reviewable-set read is still UNKNOWN for the count and no queue for the brief", async () => {
    const original = requestClient.rpc;
    requestClient.rpc = ((name: string) => {
      log.push({ kind: "rpc", name, ops: [], single: false });
      return Promise.resolve({ data: null, error: { code: "57014" } });
    }) as typeof requestClient.rpc;
    try {
      const { countReviewablePendingEntries } = await import("@/lib/journal/reviewable-count");
      const { fetchQuickReviewQueue } = await import("@/lib/journal/review-queue");
      expect(await countReviewablePendingEntries()).toBeNull();
      expect(await fetchQuickReviewQueue()).toEqual([]);
      expect(rpcCount("reviewable_journal_entry_ids")).toBe(1);
    } finally {
      requestClient.rpc = original;
    }
  });
});
