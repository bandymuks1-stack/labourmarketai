import { writeFileSync } from "node:fs";
import { isValidElement, type ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PERF 2026-10-23 — one `/dashboard/company/people` render, counted.
 *
 * Production (Supabase edge logs, prod-qa-walk brigade-formation run
 * 39795574869, 2026-10-22 14:26–14:33 UTC): the walk made ~8,100 PostgREST
 * calls in 6.5 minutes, 99.8 % of them from the Next.js server. About 37 of the
 * walk's ~73 dashboard renders were this page, for an owner with 14–17 active
 * brigades, and its brigade panel asked the capability RPC once per brigade,
 * one after another, plus a nil-uuid readiness probe — on every render.
 *
 * This suite drives the REAL page component and the async server components
 * it renders (a minimal server-component walk, below) against a RECORDING
 * fake Supabase client with a request-scoped stand-in for React `cache()`,
 * then asserts the request count and the sequential waves of one render.
 *
 * `TRACE_OUT=<file>` writes the full call trace for the next perf pass.
 */

const USER = "00000000-0000-4000-8000-000000000001";
const ORG = "00000000-0000-4000-8000-0000000000a1";
const CO = "00000000-0000-4000-8000-0000000000c1";

type Call = { kind: "from" | "rpc"; name: string; ops: string[]; single: boolean };
const log: Call[] = [];

// ── React cache(): one memo per "request", cleared by beginRequest() ────────
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

const tid = (i: number) => `00000000-0000-4000-8000-0000000003${(0x10 + i).toString(16)}`;
const wid = (i: number) => `00000000-0000-4000-8000-0000000001${(0xa0 + i).toString(16)}`;
const wpid = (i: number) => `00000000-0000-4000-8000-0000000002${(0xa0 + i).toString(16)}`;

const TABLE_ROWS: Record<string, unknown[]> = {};
const NIL = "00000000-0000-0000-0000-000000000000";
/** Brigades whose capability read fails (statement timeout). */
const capabilityFailsFor = new Set<string>();
/** The team model's migration is not applied: the nil-uuid probe answers 42883. */
let teamModelMissing = false;
function seed(teams: number, workers = 2): void {
  for (const k of Object.keys(TABLE_ROWS)) delete TABLE_ROWS[k];
  const ws = Array.from({ length: workers }, (_, k) => k + 1);
  Object.assign(TABLE_ROWS, {
    profile_roles: [{ role: "company", profile_id: USER, is_active: true, status: "active" }],
    organizations: Array.from({ length: teams }, (_, k) => ({
      id: tid(k + 1),
      display_name: `Brigade ${k + 1}`,
      legal_name: null,
      created_at: `2026-10-0${(k % 9) + 1}T00:00:00Z`,
      archived_at: null,
      organization_type: "team",
    })),
    engagement_contexts: ws.map((i) => ({
      id: `ec${i}`,
      organization_id: tid(1),
      profile_id: wpid(i),
      relationship_slug: "employee",
      status: "active",
      profiles: { full_name: `Worker ${i}`, email: null },
    })),
    company_workers: ws.map((i) => ({
      worker_id: wid(i),
      company_id: CO,
      status: "active",
      created_at: "2026-10-01T00:00:00Z",
      workers: { id: wid(i), profile_id: wpid(i), display_name: `Worker ${i}`, profiles: { full_name: `Worker ${i}`, email: null } },
    })),
    workers: ws.map((i) => ({ id: wid(i), profile_id: wpid(i), display_name: `Worker ${i}` })),
  });
}

function fixture(c: Call): { data: unknown; error: unknown; count: number } {
  if (c.kind === "rpc" && c.name === "get_team_capability_summary_v1") {
    const orgId = (JSON.parse(c.ops[0] ?? "null") as { p_org_id?: string } | null)?.p_org_id;
    if (orgId === NIL && teamModelMissing) {
      return { data: null, error: { code: "42883", message: "function does not exist" }, count: 0 };
    }
    if (orgId === NIL) return { data: [], error: null, count: 0 };
    if (orgId && capabilityFailsFor.has(orgId)) {
      return { data: null, error: { code: "57014", message: "timeout" }, count: 0 };
    }
    return { data: [{ skill_slug: "masonry", members_declared: 1, members_confirmed: 0 }], error: null, count: 0 };
  }
  const rows = applyFilters(
    c,
    c.kind === "from"
      ? (TABLE_ROWS[c.name] ?? [])
      : c.name === "read_companies_private_v1"
        ? [{ id: CO, profile_id: USER, legal_name: "Org UAB", display_name: "Org", company_type: "construction" }]
        : [],
  );
  if (c.single) return { data: rows[0] ?? null, error: null, count: 0 };
  return { data: rows, error: null, count: rows.length };
}

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

// ── Simulated sequential waves (see company-home-request-dedupe.test.ts) ────
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
      getUser: async () => ({ data: { user: { id: USER, email: null, app_metadata: {} } }, error: null }),
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
const requestClient = makeClient();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => requestClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => requestClient }));
vi.mock("next-intl/server", () => {
  const t = Object.assign((k: string) => k, { has: () => true, rich: (k: string) => k, raw: (k: string) => k, markup: (k: string) => k });
  return {
    getTranslations: async () => t,
    getLocale: async () => "lt",
    getMessages: async () => ({}),
    setRequestLocale: () => undefined,
  };
});
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
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/i18n/navigation", () => ({
  Link: () => null,
  redirect: (to: unknown) => {
    throw new Error(`redirect ${JSON.stringify(to)}`);
  },
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  getPathname: () => "/",
}));
vi.mock("@/lib/auth/require-role",() => ({ requireRoleOrRedirect: async () => undefined }));
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

async function beginRequest(teams: number, workers = 2): Promise<void> {
  seed(teams, workers);
  log.length = 0;
  for (const s of requestStores) s.clear();
  const { clearBadgeCache } = await import("@/lib/perf/badge-ttl-cache");
  clearBadgeCache();
}

/** A minimal server-component walk: call every ASYNC function component in
 *  the returned tree (those are the server components that read), descend
 *  through host elements and through the children/props of every other
 *  element without calling it (client components are never invoked). */
async function renderServerTree(node: unknown, depth = 0): Promise<void> {
  if (depth > 40 || node === null || node === undefined || typeof node !== "object") return;
  if (Array.isArray(node)) {
    await Promise.all(node.map((n) => renderServerTree(n, depth + 1)));
    return;
  }
  if (!isValidElement(node)) return;
  const el = node as { type: unknown; props: Record<string, unknown> };
  if (typeof el.type === "function" && el.type.constructor.name === "AsyncFunction") {
    const out = await (el.type as (p: unknown) => Promise<ReactNode>)(el.props);
    await renderServerTree(out, depth + 1);
    return;
  }
  await Promise.all(
    Object.values(el.props ?? {}).map((v) => (typeof v === "object" ? renderServerTree(v, depth + 1) : undefined)),
  );
}

/** Every read of one `/lt/dashboard/company/people` render: the dashboard
 *  layout's bell, the company layout's doors and the page with its async
 *  server components. */
async function renderPeoplePage(): Promise<void> {
  const { default: Page } = await import("@/app/[locale]/dashboard/company/people/page");
  const { loadOrganizationDoors } = await import("@/lib/company/organization-doors");
  const { getSpineCounts } = await import("@/lib/notifications/spine");
  const layouts = Promise.all([loadOrganizationDoors(), getSpineCounts()]);
  const tree = await Page({ params: Promise.resolve({ locale: "lt" }), searchParams: Promise.resolve({}) });
  await renderServerTree(tree);
  await layouts;
}

const sig = (c: Call) => `${c.kind} ${c.name} ${c.ops.join(".")}`;
const rpcCount = (name: string) => log.filter((c) => c.kind === "rpc" && c.name === name).length;
const fromCount = (name: string, opIncludes?: string) =>
  log.filter(
    (c) => c.kind === "from" && c.name === name && (!opIncludes || c.ops.join(".").includes(opIncludes)),
  ).length;
const probes = () =>
  log.filter(
    (c) => c.kind === "rpc" && c.name === "get_team_capability_summary_v1" && (c.ops[0] ?? "").includes(NIL),
  ).length;

async function resetProbe(): Promise<void> {
  const { resetTeamModelProbeForTests } = await import("@/lib/company/team-brigades");
  resetTeamModelProbeForTests();
}

// The first render imports the whole loader graph; warm it once outside the
// per-test timeout.
beforeAll(async () => {
  await beginRequest(1);
  await renderPeoplePage();
}, 120_000);
beforeEach(async () => {
  capabilityFailsFor.clear();
  teamModelMissing = false;
  await resetProbe();
  await beginRequest(1);
});

describe("one /dashboard/company/people render, 1 vs 15 brigades", () => {
  it("calls and sequential waves stay within the bounds", async () => {
    const measured: Record<number, { calls: number; waves: number }> = {};
    for (const n of [1, 15]) {
      await resetProbe();
      await beginRequest(n);
      await renderPeoplePage();
      const calls = log.length;
      if (process.env.TRACE_OUT) {
        writeFileSync(`${process.env.TRACE_OUT}.${n}.txt`, `${calls} calls\n${log.map(sig).join("\n")}\n`);
      }
      await resetProbe();
      await beginRequest(n);
      const waves = await measureWaves(renderPeoplePage);
      measured[n] = { calls, waves };
    }
    if (process.env.TRACE_OUT) writeFileSync(`${process.env.TRACE_OUT}.render.json`, JSON.stringify(measured));
    // TOTALS and the CRITICAL PATH on this suite's fixture (cold probe), see BOUNDS.
    // The capability read stays one call per brigade (the RPC takes one org;
    // a batch RPC would be a migration) but runs a few at a time: 15 brigades
    // add 14 calls and at most 2 waves, not 14.
    expect(measured[1].calls).toBeLessThanOrEqual(BOUNDS.calls1);
    expect(measured[15].calls).toBeLessThanOrEqual(BOUNDS.calls15);
    expect(measured[15].calls - measured[1].calls).toBe(14);
    expect(measured[15].waves - measured[1].waves).toBeLessThanOrEqual(2);
    expect(measured[15].waves).toBeLessThanOrEqual(BOUNDS.waves15);
  });

  it("each brigade's capability is read once; the readiness probe once per process", async () => {
    await beginRequest(15);
    await renderPeoplePage();
    expect(probes()).toBe(1);
    expect(rpcCount("get_team_capability_summary_v1")).toBe(15 + 1);
    // The next render reads every brigade again (request dedupe, not data
    // caching) — but does not ask the readiness question again.
    await beginRequest(15);
    await renderPeoplePage();
    expect(probes()).toBe(0);
    expect(rpcCount("get_team_capability_summary_v1")).toBe(15);
  });

  it("the shared session facts are read ONCE per render, and again on the next", async () => {
    for (let round = 0; round < 2; round++) {
      await beginRequest(15);
      await renderPeoplePage();
      // Workspace memberships (layout context, employer context, the roster
      // section's evidence context): was 3 x (owned + engagement + governance).
      expect(fromCount("organizations", "companies!organizations_legacy_company_id_fkey")).toBe(1);
      expect(fromCount("company_memberships", "organization_id, role, organizations(")).toBe(1);
      expect(fromCount("engagement_contexts", "organization_id, relationship_slug, organizations(")).toBe(1);
      // The durable workspace pointer and the session's profile row: was 2 each.
      expect(fromCount("profiles", "active_organization_id")).toBe(1);
      expect(fromCount("profiles", "onboarded_at, active_role")).toBe(1);
    }
  });

  it("no read is issued twice with the same arguments in one render", async () => {
    await beginRequest(15);
    await renderPeoplePage();
    const seen = new Map<string, number>();
    for (const c of log) seen.set(sig(c), (seen.get(sig(c)) ?? 0) + 1);
    expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });
});

describe("the brigade panel stays honest", () => {
  it("a failed capability read is UNKNOWN for that brigade only, never empty or zero", async () => {
    await beginRequest(6);
    capabilityFailsFor.add(tid(2)).add(tid(5));
    const { getTeamBrigadesData } = await import("@/lib/company/team-brigades");
    const data = await getTeamBrigadesData();
    if (!data.applied) throw new Error("team model should read as applied");
    expect(data.teams.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6].map(tid));
    expect(data.teams.map((t) => (t.capability === null ? null : t.capability.length))).toEqual([
      1,
      null,
      1,
      1,
      null,
      1,
    ]);
    expect(data.teams[0]!.capability).toEqual([{ slug: "masonry", membersDeclared: 1, membersConfirmed: 0 }]);
  });

  it("'not applied' is never remembered: the next read asks again, then remembers yes", async () => {
    const { getTeamBrigadesData } = await import("@/lib/company/team-brigades");
    teamModelMissing = true;
    await beginRequest(3);
    expect(await getTeamBrigadesData()).toEqual({ applied: false });
    expect(probes()).toBe(1);
    expect(rpcCount("get_team_capability_summary_v1")).toBe(1);
    await beginRequest(3);
    expect(await getTeamBrigadesData()).toEqual({ applied: false });
    expect(probes()).toBe(1);
    // The owner applies the migration: the very next read sees it…
    teamModelMissing = false;
    await beginRequest(3);
    expect((await getTeamBrigadesData()).applied).toBe(true);
    expect(probes()).toBe(1);
    // …and from then on the probe is not asked again.
    await beginRequest(3);
    await getTeamBrigadesData();
    expect(probes()).toBe(0);
  });

  it("at most TEAM_CAPABILITY_READ_CONCURRENCY capability reads are in flight", async () => {
    const { getTeamBrigadesData, TEAM_CAPABILITY_READ_CONCURRENCY } = await import(
      "@/lib/company/team-brigades"
    );
    await beginRequest(15);
    let inFlight = 0;
    let peak = 0;
    const original = requestClient.rpc;
    requestClient.rpc = ((name: string, args?: unknown) => {
      if (name !== "get_team_capability_summary_v1") return original(name, args);
      log.push({ kind: "rpc", name, ops: [JSON.stringify(args ?? null)], single: false });
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      return new Promise((r) =>
        setTimeout(() => {
          inFlight -= 1;
          r({ data: [], error: null });
        }, 2),
      );
    }) as typeof requestClient.rpc;
    try {
      const data = await getTeamBrigadesData();
      expect(data.applied && data.teams.length).toBe(15);
    } finally {
      requestClient.rpc = original;
    }
    expect(peak).toBeLessThanOrEqual(TEAM_CAPABILITY_READ_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });
});

/** Upper bounds for one render on this suite's fixture, cold probe (after this
 *  change). Measured by this suite:
 *    origin/main   1 brigade 87 calls / 18 waves, 15 brigades 101 calls / 32 waves
 *    this change   1 brigade 79 calls / 18 waves, 15 brigades  93 calls / 20 waves */
const BOUNDS = { calls1: 79, calls15: 93, waves15: 20 };

