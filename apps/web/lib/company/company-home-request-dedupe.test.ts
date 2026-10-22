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
async function beginRequest(projects = 2): Promise<void> {
  seedOrganization(projects);
  log.length = 0;
  for (const s of requestStores) s.clear();
  // The bell's slow badges sit behind a process-level TTL memo; every
  // simulated render here is the worst case (the TTL has expired), so the
  // bell's bridge and team-offer reads run too.
  const { clearBadgeCache } = await import("@/lib/perf/badge-ttl-cache");
  clearBadgeCache();
}

// ── The recording fake client ───────────────────────────────────────────────
const pid = (i: number) => `00000000-0000-4000-8000-0000000000${(0xe0 + i).toString(16)}`;
const wid = (i: number) => `00000000-0000-4000-8000-0000000001${(0xa0 + i).toString(16)}`;
const wpid = (i: number) => `00000000-0000-4000-8000-0000000002${(0xa0 + i).toString(16)}`;
const P1 = pid(1);
const P2 = pid(2);

function projectRow(id: string, i: number) {
  return {
    id,
    title: `Project ${i}`,
    status: "live",
    city: null,
    country: null,
    start_date: null,
    end_date: null,
    organization_id: ORG,
    company_id: CO,
    record_state: null,
    organizations: { display_name: "Org", legal_name: "Org UAB" },
  };
}
const workerEmbed = (i: number) => ({
  id: wid(i),
  profile_id: wpid(i),
  display_name: `Worker ${i}`,
  profiles: { full_name: `Worker ${i}`, email: null },
});

// An organization that acts as an agency by a declared role (not by type) with
// N live projects, one open need, and per project a different situation so the
// risk rows are worth comparing: worker i on project i (the last project has
// nobody), a missing document on project 2, a checked one on project 3, an
// overdue task on project 1, a done task on project 4, a blocked stage on
// project 5 and a planned stage on project 3.
const TABLE_ROWS: Record<string, unknown[]> = {};
function seedOrganization(projects: number): void {
  const ps = Array.from({ length: projects }, (_, k) => k + 1);
  const staffed = ps.filter((i) => i < projects || projects === 1);
  Object.assign(TABLE_ROWS, {
    projects: ps.map((i) => projectRow(pid(i), i)),
    organization_roles: [{ role_slug: "workforce_provider" }, { role_slug: "employer" }],
    company_workers: staffed.map((i) => ({
      worker_id: wid(i),
      company_id: CO,
      status: "active",
      created_at: "2026-10-01T00:00:00Z",
      workers: { ...workerEmbed(i), availability_status: "available" },
    })),
    project_worker_assignments: staffed.map((i) => ({
      id: `a${i}`,
      worker_id: wid(i),
      project_id: pid(i),
      status: "active",
      assigned_at: `2026-10-0${i}T00:00:00Z`,
      worker: workerEmbed(i),
      workers: workerEmbed(i),
    })),
    workers: staffed.map((i) => ({ ...workerEmbed(i), availability_status: "available" })),
    project_worker_readiness_items: [
      ...(projects >= 2
        ? [{ project_id: pid(2), worker_id: wid(2), item_key: "a1", label: "A1", status: "missing", note: null }]
        : []),
      ...(projects >= 3
        ? [{ project_id: pid(3), worker_id: wid(3), item_key: "id", label: "ID", status: "checked", note: null }]
        : []),
    ],
    work_tasks: [
      {
        id: "t1",
        project_id: pid(1),
        title: "Overdue",
        description: null,
        status: "todo",
        priority: "normal",
        assignee_profile_id: null,
        created_by: USER,
        due_at: "2026-01-01T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        resolved_at: null,
      },
      ...(projects >= 4
        ? [
            {
              id: "t4",
              project_id: pid(4),
              title: "Done",
              description: null,
              status: "done",
              priority: "low",
              assignee_profile_id: null,
              created_by: USER,
              due_at: null,
              created_at: "2026-01-01T00:00:00Z",
              resolved_at: "2026-02-01T00:00:00Z",
            },
          ]
        : []),
    ],
    project_stages: [
      ...(projects >= 3 ? [stageRow("s3", pid(3), "planned")] : []),
      ...(projects >= 5 ? [stageRow("s5", pid(5), "blocked")] : []),
    ],
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
  });
}
function stageRow(id: string, projectId: string, status: string) {
  return {
    id,
    project_id: projectId,
    name: `Stage ${id}`,
    stage_order: 1,
    status,
    planned_start: null,
    planned_end: null,
    actual_start: null,
    actual_end: null,
    blocked_reason: status === "blocked" ? "Waiting" : null,
    completion_criteria: null,
    created_at: "2026-01-01T00:00:00Z",
    responsible_engagement_id: null,
  };
}

/** Honour the simple column filters a reader applies (eq / neq / is / in on a
 *  column the fixture row carries); anything else (or / embedded columns)
 *  is not filtered — the fixture rows already belong to the organization. */
function applyFilters(c: Call, rows: unknown[]): unknown[] {
  let out = rows as Record<string, unknown>[];
  for (const op of c.ops) {
    const m = /^(eq|neq|is|in)\(([\s\S]*)\)$/.exec(op);
    if (!m) continue;
    const [col, val] = JSON.parse(m[2]) as [string, unknown];
    if (typeof col !== "string" || col.includes(".")) continue;
    out = out.filter((r) => {
      if (!(col in r)) return true;
      const v = r[col];
      if (m[1] === "eq") return v === val;
      if (m[1] === "neq") return v !== val;
      if (m[1] === "is") return (v ?? null) === val;
      return Array.isArray(val) && val.includes(v);
    });
  }
  return out;
}

function fixture(c: Call): { data: unknown; error: null; count: number } {
  if (c.kind === "rpc" && c.name === "can_manage_project") return { data: true, error: null, count: 0 };
  const rows: unknown[] = applyFilters(
    c,
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
        : [],
  );
  if (c.single) return { data: rows[0] ?? null, error: null, count: 0 };
  return { data: rows, error: null, count: rows.length };
}

// ── Simulated sequential waves ───────────────────────────────────────────────
// When `measureWaves` drives a run, no fake request answers on its own: the
// driver lets the code run until every in-flight request is waiting, then
// answers them ALL at once — one "wave". The number of waves is the length of
// the critical path in round trips, deterministically (no timers).
let wavesMode = false;
const waiting: (() => void)[] = [];
async function idle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
}
async function measureWaves(run: () => Promise<unknown>): Promise<number> {
  wavesMode = true;
  let done = false;
  let failure: unknown = null;
  const p = run().then(
    () => {
      done = true;
    },
    (e) => {
      failure = e;
      done = true;
    },
  );
  let waves = 0;
  try {
    for (let guard = 0; !done && guard < 500; guard++) {
      await idle();
      if (waiting.length === 0) continue;
      waves += 1;
      for (const answer of waiting.splice(0)) answer();
    }
    await p;
  } finally {
    wavesMode = false;
  }
  if (failure) throw failure;
  return waves;
}

function builder(c: Call): unknown {
  const p: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          (wavesMode
            ? new Promise((r) => waiting.push(() => r(fixture(c))))
            : Promise.resolve(fixture(c))
          ).then(res, rej);
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
    // The gated reviewable set: decisions count + brief queue (+ every
    // project's readiness pulse on the panel path) (was 4).
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

  it("the project panel's detail read: header row, roster and teams once, not twice", async () => {
    const { loadProjectDetailForResult } = await import("@/lib/projects/project-workspace");
    const detail = await loadProjectDetailForResult(P1);
    expect(detail.kind).toBe("project");
    // detail read + its operations pulse (was 2 each).
    expect(fromCount("projects", `"id","${P1}"`)).toBe(1);
    expect(fromCount("project_worker_assignments", `"project_id","${P1}"`)).toBe(1);
    expect(fromCount("team_assignments", `["${P1}"]`)).toBe(1);
  });

  it("the company home reads no project source per project — one batched read each", async () => {
    await renderCompanyHomeReads();
    for (const id of [P1, P2]) {
      for (const table of [
        "project_worker_assignments",
        "project_worker_readiness_items",
        "work_tasks",
        "project_stages",
        "journal_entries",
        "conversation_messages",
      ]) {
        expect(fromCount(table, `eq(["project_id","${id}"]`), `${table} ${id}`).toBe(0);
      }
      expect(fromCount("projects", `eq(["id","${id}"]`), `header ${id}`).toBe(0);
      expect(rpcCount("can_manage_project")).toBe(0);
    }
    const batched = (table: string, select = "") =>
      count(
        (c) =>
          c.kind === "from" &&
          c.name === table &&
          c.ops.join(".").includes(`in(["project_id",["${P1}","${P2}"]]`) &&
          c.ops.join(".").includes(select),
      );
    // (The workforce read behind the conflicts count reads its own, different
    // assignment columns for every project; that is not the scan's roster.)
    expect(batched("project_worker_assignments", "project_id, assigned_at, worker:workers")).toBe(1);
    expect(batched("project_worker_readiness_items")).toBe(1);
    expect(batched("work_tasks")).toBe(1);
    expect(batched("project_stages")).toBe(1);
    expect(fromCount("team_assignments", `["${P1}","${P2}"]`)).toBe(1);
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

describe("the company home's project scan is batched, not one detail read per project", () => {
  it("answers exactly what the per-project panel reads answer (6 projects)", async () => {
    await beginRequest(6);
    const { loadProjectRiskForChat, loadProjectRiskForHome } = await import(
      "@/lib/conversation/project-risk"
    );
    const perProject = await loadProjectRiskForChat();
    await beginRequest(6);
    const batched = await loadProjectRiskForHome();
    expect(batched).toEqual(perProject);
    // …and the fixture's situations are really in the answer.
    if (batched.kind !== "ok") throw new Error(`scan: ${batched.kind}`);
    const row = (i: number) => batched.rows.find((r) => r.projectId === pid(i))!;
    expect(batched.rows).toHaveLength(6);
    expect(row(1)).toMatchObject({ tasksOpen: 1, tasksOverdue: 1, people: 1, peopleNames: ["Worker 1"] });
    expect(row(2)).toMatchObject({ workersWithMissingDocs: 1, readinessChecked: 0, readinessTotal: 1 });
    expect(row(3)).toMatchObject({ readinessChecked: 1, readinessTotal: 1, stagesBlocked: 0, stageTotal: 1 });
    expect(row(4)).toMatchObject({ tasksOpen: 0, tasksOverdue: 0 });
    expect(row(5)).toMatchObject({ stagesBlocked: 1 });
    expect(row(6)).toMatchObject({ people: 0, nobodyOnLiveProject: true });
  });

  it("an unknown source stays unknown per project — never a zero", async () => {
    await beginRequest(6);
    const original = requestClient.from;
    requestClient.from = ((name: string) => {
      if (name !== "work_tasks") return original(name);
      log.push({ kind: "from", name, ops: [], single: false });
      const failed = Promise.resolve({ data: null, error: { code: "57014", message: "timeout" }, count: null });
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "in", "eq", "order", "limit"]) chain[m] = () => chain;
      chain.then = failed.then.bind(failed);
      return chain;
    }) as typeof requestClient.from;
    try {
      const { loadProjectRiskForChat, loadProjectRiskForHome } = await import(
        "@/lib/conversation/project-risk"
      );
      const batched = await loadProjectRiskForHome();
      await beginRequest(6);
      const perProject = await loadProjectRiskForChat();
      expect(batched).toEqual(perProject);
    } finally {
      requestClient.from = original;
    }
  });

  it("the scan's reads do not grow with the number of projects", async () => {
    const { loadProjectRiskForChat, loadProjectRiskForHome } = await import(
      "@/lib/conversation/project-risk"
    );
    const scanCalls: Record<number, number> = {};
    const panelCalls: Record<number, number> = {};
    for (const n of [1, 6]) {
      await beginRequest(n);
      await loadProjectRiskForHome();
      scanCalls[n] = log.length;
      await beginRequest(n);
      await loadProjectRiskForChat();
      panelCalls[n] = log.length;
    }
    // One list read + one batched read per source, whatever the count —
    // except the team read, which stays per project (in the same wave) so
    // each project keeps the team reader's own bounds (Codex review #2671).
    expect(scanCalls[6]).toBe(scanCalls[1] + 5);
    // The per-project panel path still grows by a dozen reads per project —
    // the fan-out the company home no longer pays.
    expect(panelCalls[6] - panelCalls[1]).toBeGreaterThanOrEqual(5 * 10);
  });

  it("a whole /dashboard/company render: calls and sequential waves, 1 vs 6 projects", async () => {
    const measured: Record<number, { calls: number; waves: number }> = {};
    for (const n of [1, 6]) {
      await beginRequest(n);
      await renderCompanyHomeReads();
      const calls = log.length;
      await beginRequest(n);
      const waves = await measureWaves(renderCompanyHomeReads);
      measured[n] = { calls, waves };
    }
    if (process.env.TRACE_OUT) {
      writeFileSync(`${process.env.TRACE_OUT}.render.json`, JSON.stringify(measured));
    }
    // SCALING: 6 projects must not cost ~6x one project. On origin/main a render
    // paid ~18 reads per extra project (1 → 6 projects: 125 → 215 calls), after
    // the request dedupe ~14 (97 → 169); the batched scan reads every project
    // in one read per source (87 → 87).
    expect(measured[6].calls).toBeLessThan(measured[1].calls * 1.25);
    // TOTALS and the CRITICAL PATH, same fixture, measured by this suite:
    //   origin/main      1 project 125 calls / 19 waves, 6 projects 215 / 19
    //   request dedupe   1 project  97 calls / 15 waves, 6 projects 169 / 15
    //   batched scan     1 project  87 calls / 10 waves, 6 projects  87 / 10
    expect(measured[1].calls).toBeLessThanOrEqual(BOUNDS.calls1);
    expect(measured[6].calls).toBeLessThanOrEqual(BOUNDS.calls6);
    expect(measured[1].waves).toBeLessThanOrEqual(BOUNDS.waves1);
    expect(measured[6].waves).toBeLessThanOrEqual(BOUNDS.waves6);
  });
});

describe("the commitments read runs its independent reads together", () => {
  it("two sequential waves instead of seven, the same answer", async () => {
    await beginRequest(6);
    const { getEmployerWorkerCommitments } = await import("@/lib/planning/employer-committed-work");
    const ids = [1, 2, 3, 4, 5].map(wid);
    const plain = await getEmployerWorkerCommitments(ids);
    await beginRequest(6);
    let measuredResult: unknown = null;
    const waves = await measureWaves(async () => {
      measuredResult = await getEmployerWorkerCommitments(ids);
    });
    // bookings · assignments · teams · identities · plans → trips · projects
    // (a team member read joins the second wave when teams exist). On
    // origin/main each of the seven reads waited for the one before.
    expect(waves).toBe(2);
    expect(measuredResult).toEqual(plain);
    // The fixture's projects carry no dates: each assignment is an undated
    // commitment — reported, never invented into a band.
    expect(plain).toMatchObject({ status: "ok" });
    if (plain.status === "ok") expect(plain.undatedProjects).toHaveLength(5);
  });
});

/** Upper bounds for one render on this suite's fixture (after this change). */
// calls6 = calls1 + 5: the team read stays per project (same wave), so
// 6 projects cost 5 calls more than 1 — and still the same 10 waves.
const BOUNDS = { calls1: 88, calls6: 93, waves1: 10, waves6: 10 };
