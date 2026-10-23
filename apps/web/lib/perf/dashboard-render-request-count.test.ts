import { appendFileSync, writeFileSync } from "node:fs";
import { isValidElement, type ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PERF 2026-10-23 — the shared dashboard layout and the heaviest dashboard
 * pages, counted per server render.
 *
 * Production (owner order 2026-10-23): every dashboard render runs the
 * layout's reads (session, roles, workspace, and the streamed bell) PLUS the
 * page's own, and the 0.5-CPU production container serves every user from the
 * same Node process — so the request count and the sequential waves of ONE
 * render bound the concurrency for everyone.
 *
 * This suite renders the REAL `app/[locale]/dashboard/layout.tsx` and the REAL
 * page modules, walks the async server components they return (a minimal
 * server-component walk, below; client components are never invoked), against
 * a RECORDING fake Supabase client with a request-scoped stand-in for React
 * `cache()`. It pins the calls and the sequential waves of one render, for the
 * layout alone and for layout + page in one request.
 *
 * The persona is an organization OWNER standing in their organization (the
 * heaviest everyday shell: company role, a governance membership, the
 * employer-side bell readers). Reads issued AFTER the response (detached
 * background emitters) are not part of a render and are not counted.
 *
 * `TRACE_OUT=<file>` writes every render's full call trace.
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

const ORG_EMBED = {
  display_name: "Org",
  legal_name: "Org UAB",
  organization_type: "company",
  legacy_company_id: CO,
  companies: { id: CO, profile_id: USER, company_type: "construction" },
};
const TABLE_ROWS: Record<string, unknown[]> = {
  profile_roles: [{ role: "company", profile_id: USER, is_active: true, status: "active" }],
  profiles: [
    {
      id: USER,
      full_name: "Owner",
      email: null,
      locale: "lt",
      country: "LT",
      onboarded: true,
      onboarded_at: "2026-09-01T00:00:00Z",
      active_role: "company",
      active_organization_id: ORG,
    },
  ],
  organizations: [
    {
      id: ORG,
      owner_profile_id: USER,
      display_name: "Org",
      legal_name: "Org UAB",
      organization_type: "company",
      legacy_company_id: CO,
      archived_at: null,
      created_at: "2026-09-01T00:00:00Z",
      companies: { id: CO, profile_id: USER, company_type: "construction" },
    },
  ],
  company_memberships: [
    { organization_id: ORG, profile_id: USER, role: "owner", status: "active", organizations: ORG_EMBED },
  ],
  companies: [{ id: CO, profile_id: USER, legal_name: "Org UAB", display_name: "Org", company_type: "construction" }],
};

function fixture(c: Call): { data: unknown; error: unknown; count: number } {
  const rows = applyFilters(
    c,
    c.kind === "from"
      ? (TABLE_ROWS[c.name] ?? [])
      : c.name === "read_companies_private_v1"
        ? (TABLE_ROWS.companies ?? [])
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
const waiting: { call: Call; answer: () => void }[] = [];
/** The calls each simulated wave answered, for the TRACE_OUT wave listing. */
let waveTrace: Call[][] = [];
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
  waveTrace = [];
  try {
    for (let guard = 0; !done && guard < 500; guard++) {
      await idle();
      if (waiting.length === 0) continue;
      waves += 1;
      const batch = waiting.splice(0);
      waveTrace.push(batch.map((w) => w.call));
      for (const w of batch) w.answer();
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
            ? new Promise((r) => waiting.push({ call: c, answer: () => r(fixture(c)) }))
            : Promise.resolve(fixture(c))
          ).then(res, rej);
      }
      return (...args: unknown[]) => {
        if (prop === "maybeSingle" || prop === "single") c.single = true;
        c.ops.push(`${String(prop)}(${JSON.stringify(args)})`);
        // DEBUG_STACK="<sig part>||<sig part>" (+ DEBUG_STACK_OUT=<file>): where a read comes from.
        const wanted = process.env.DEBUG_STACK?.split("||") ?? [];
        if (wanted.some((x) => sig(c).includes(x))) {
          const frames = (new Error().stack ?? "").split("\n").slice(2, 14).join("\n");
          appendFileSync(process.env.DEBUG_STACK_OUT ?? "stack.txt", `STACK ${sig(c).slice(0, 120)}\n${frames}\n`);
        }
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
  const t = Object.assign((k: string) => k, {
    has: () => true,
    rich: (k: string) => k,
    raw: (k: string) => k,
    markup: (k: string) => k,
  });
  return {
    getTranslations: async () => t,
    getLocale: async () => "lt",
    getMessages: async () => ({}),
    getFormatter: async () => ({
      dateTime: () => "",
      number: (n: number) => String(n),
      relativeTime: () => "",
      list: (l: string[]) => l.join(", "),
    }),
    getNow: async () => new Date("2026-10-23T08:00:00Z"),
    getTimeZone: async () => "Europe/Vilnius",
    setRequestLocale: () => undefined,
  };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined, has: () => false }),
  draftMode: async () => ({ isEnabled: false }),
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
  permanentRedirect: (to: string) => {
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
// Detached, post-response notification writers: not part of a render.
vi.mock("@/lib/notifications/event-emitters", async (orig) => ({
  ...(await orig<typeof import("@/lib/notifications/event-emitters")>()),
  maybeEmitWeeklyDigestInBackground: () => undefined,
  maybeEmitJobAlertsInBackground: () => undefined,
}));

async function beginRequest(): Promise<void> {
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
  if (depth > 60 || node === null || node === undefined || typeof node !== "object") return;
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

const params = () => Promise.resolve({ locale: "lt" });
const searchParams = () => Promise.resolve({});

type PageModule = { default: (p: unknown) => Promise<ReactNode> };
type LayoutModule = { default: (p: unknown) => Promise<ReactNode> };

async function renderLayout(): Promise<void> {
  const { default: Layout } = (await import("@/app/[locale]/dashboard/layout")) as LayoutModule;
  await renderServerTree(await Layout({ children: null, params: params() }));
}

const PAGES = {
  "/dashboard": async () => (await import("@/app/[locale]/dashboard/page")) as PageModule,
  "/dashboard/journal": async () => (await import("@/app/[locale]/dashboard/journal/page")) as PageModule,
  "/dashboard/communication": async () =>
    (await import("@/app/[locale]/dashboard/communication/page")) as PageModule,
  "/dashboard/company": async () => (await import("@/app/[locale]/dashboard/company/page")) as PageModule,
  "/dashboard/company/people": async () =>
    (await import("@/app/[locale]/dashboard/company/people/page")) as PageModule,
} as const;
type PagePath = keyof typeof PAGES;

/** Nested layouts below the dashboard layout, per page. */
async function renderNestedLayouts(path: PagePath): Promise<void> {
  if (path.startsWith("/dashboard/company")) {
    const { default: CompanyLayout } = (await import("@/app/[locale]/dashboard/company/layout")) as LayoutModule;
    await renderServerTree(await CompanyLayout({ children: null, params: params() }));
  }
}

async function renderPageOnly(path: PagePath): Promise<void> {
  const { default: Page } = await PAGES[path]();
  await renderServerTree(await Page({ params: params(), searchParams: searchParams() }));
}

/** ONE request: the dashboard layout, the nested layouts and the page render
 *  concurrently (Next renders the segments of one request in parallel). */
async function renderRequest(path: PagePath): Promise<void> {
  await Promise.all([renderLayout(), renderNestedLayouts(path), renderPageOnly(path)]);
}

const sig = (c: Call) => `${c.kind} ${c.name} ${c.ops.join(".")}`;

async function measure(run: () => Promise<void>, label: string): Promise<{ calls: number; waves: number }> {
  await beginRequest();
  await run();
  const calls = log.length;
  if (process.env.TRACE_OUT) {
    writeFileSync(
      `${process.env.TRACE_OUT}.${label.replace(/[^a-z0-9]+/gi, "_")}.txt`,
      `${calls} calls\n${log.map(sig).join("\n")}\n`,
    );
  }
  await beginRequest();
  const waves = await measureWaves(run);
  if (process.env.TRACE_OUT) {
    writeFileSync(
      `${process.env.TRACE_OUT}.${label.replace(/[^a-z0-9]+/gi, "_")}.waves.txt`,
      waveTrace
        .map((w, i) => [`wave ${i + 1}`, ...w.map((c) => `  ${sig(c).slice(0, 160)}`)].join("\n"))
        .join("\n") + "\n",
    );
  }
  return { calls, waves };
}

const duplicates = (): string[] => {
  const seen = new Map<string, number>();
  for (const c of log) seen.set(sig(c), (seen.get(sig(c)) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${n}x ${k}`);
};

const measured: Record<string, { calls: number; waves: number }> = {};

// The first render imports the whole loader graph; warm it once outside the
// per-test timeout.
beforeAll(async () => {
  await beginRequest();
  await renderLayout();
  for (const path of Object.keys(PAGES) as PagePath[]) {
    await beginRequest();
    await renderRequest(path);
  }
}, 240_000);
beforeEach(async () => {
  await beginRequest();
});

describe("the shared dashboard layout, one render", () => {
  it("calls and sequential waves", async () => {
    measured.layout = await measure(renderLayout, "layout");
    if (process.env.TRACE_OUT) writeFileSync(`${process.env.TRACE_OUT}.render.json`, JSON.stringify(measured));
    expect(measured.layout).toEqual(BOUNDS.layout);
  });

  it("no read is issued twice with the same arguments", async () => {
    await renderLayout();
    expect(duplicates()).toEqual([]);
  });
});

describe("the session facts every dashboard request shares are ONE read each", () => {
  const count = (table: string, opIncludes?: string) =>
    log.filter((c) => c.name === table && (!opIncludes || c.ops.join(".").includes(opIncludes))).length;

  it.each(Object.keys(PAGES) as PagePath[])("%s", async (path) => {
    await renderRequest(path);
    // The role rows: the shell and the page gate share one read.
    expect(count("profile_roles")).toBe(1);
    // The caller's own profile row — the durable workspace pointer rides it,
    // and the bell's absence-review role check reads it from the session.
    expect(count("profiles")).toBe(1);
    // The archive state rides the membership reads; no separate id-in read.
    expect(count("organizations", '"archived_at","is",null')).toBe(0);
    // The employer chain reads its bound company inside the org row read.
    expect(count("companies")).toBe(0);
    // The own worker id is the session workers row, not an id-only query.
    // (The availability read's own-ids `limit(5)` read is a different question.)
    expect(
      log.filter((c) => c.name === "workers" && c.single && c.ops[0] === 'select(["id"])').length,
    ).toBe(0);
  });
});

describe.each(Object.keys(PAGES) as PagePath[])("one %s request (layout + page)", (path) => {
  it("calls and sequential waves", async () => {
    measured[path] = await measure(() => renderRequest(path), path);
    if (process.env.TRACE_OUT) writeFileSync(`${process.env.TRACE_OUT}.render.json`, JSON.stringify(measured));
    expect(measured[path]).toEqual(BOUNDS[path]);
  });

  it("no read is issued twice with the same arguments", async () => {
    await renderRequest(path);
    expect(duplicates()).toEqual([]);
  });
});

/** Measured on this suite's fixture. Lower is a win: update the number. */
//
// Before -> after the 2026-10-23 pass, same fixture (`calls / waves`):
//   layout alone                28 / 9  ->  23 / 6   (the shell's own reads: 8 / 3 -> 5 / 2)
//   /dashboard                  36 / 11 ->  29 / 6
//   /dashboard/journal          32 / 9  ->  25 / 5
//   /dashboard/communication    30 / 9  ->  25 / 6
//   /dashboard/company          59 / 14 ->  50 / 7
//   /dashboard/company/people   55 / 18 ->  47 / 7
const BOUNDS: Record<"layout" | PagePath, { calls: number; waves: number }> = {
  layout: { calls: 23, waves: 6 },
  "/dashboard": { calls: 29, waves: 6 },
  "/dashboard/journal": { calls: 25, waves: 5 },
  "/dashboard/communication": { calls: 25, waves: 6 },
  "/dashboard/company": { calls: 50, waves: 7 },
  "/dashboard/company/people": { calls: 47, waves: 7 },
};
