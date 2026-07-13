import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getDashboardModule,
  getModuleRoute,
} from "@/lib/dashboard/dashboard-module-registry";
import { activeLocales } from "@/lib/i18n/config";
import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";
import {
  DASHBOARD_SEARCH_MAX_QUERY_CHARS,
  DASHBOARD_SEARCH_MAX_TOTAL_RESULTS,
  DASHBOARD_SEARCH_MIN_QUERY_CHARS,
  DASHBOARD_SEARCH_PER_SOURCE_LIMIT,
  DASHBOARD_SEARCH_SOURCES,
  boundSearchGroups,
  buildSearchGroup,
  candidateMatches,
  normalizeSearchQuery,
  type DashboardSearchCandidate,
  type DashboardSearchGroup,
} from "@/lib/search/dashboard-search-model";
import { PRIMARY_ROUTES } from "./primary-route-smoke";

/**
 * UNIVERSAL SEARCH + REPORTS HUB guards (control room PR K, capability gap
 * map §11 + §12 — the programme's final slice).
 *
 * What these pins keep true:
 *
 *   SEARCH — PERMISSION-SCOPED, BOUNDED, NO PEOPLE:
 *   - the API route authenticates (401 signed out) and normalizes + bounds
 *     the query before any read;
 *   - the server composition reads ONLY through the existing RLS-scoped
 *     helpers (tasks / finance / bookings / documents / projects) plus the
 *     communication page's own participant-scoped conversations read — no
 *     admin client, no service role, no profiles/workers table, no
 *     scouting/matching import (people search stays the deterministic
 *     scouting flow);
 *   - results are bounded (min/max query chars, per-source limit, total
 *     cap) and every href is a REAL existing destination.
 *
 *   FINDER — REGISTRY-FIRST + ACCESSIBLE:
 *   - registry command results render BEFORE object groups, always;
 *   - the input stays labelled, Ctrl/Cmd+K stays, the fetch is debounced
 *     and timeout-bounded (AbortController);
 *   - recent commands store command IDS only (no query text, no PII).
 *
 *   REPORTS — REAL DATA + BASIS LABELS:
 *   - every hub section renders its calculation-basis label;
 *   - no hardcoded metric number in the page or the copy — figures come
 *     from the view model's own counts;
 *   - the hub composes ONLY existing RLS-scoped reads, read-only;
 *   - export links point ONLY at exports that exist on disk.
 *
 *   WIRING — registered everywhere a module must be (module registry,
 *   command registry, primary-route smoke, route truth map, i18n in every
 *   ACTIVE locale).
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
/** Strip comments so scans pin CODE, not the docstrings that honestly name
 *  the forbidden patterns. */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const SEARCH_MODEL_REL = "lib/search/dashboard-search-model.ts";
const SEARCH_READS_REL = "lib/search/dashboard-search.ts";
const SEARCH_ROUTE_REL = "app/api/dashboard-search/route.ts";
const FINDER_REL = "components/app/command-finder.tsx";
// NOTE (canonical-user-journey v1): the unlinked /dashboard/search router page
// was removed — the ONE CommandFinder is embedded on /dashboard itself.
const DASHBOARD_PAGE_REL = "app/[locale]/dashboard/page.tsx";
const HUB_READS_REL = "lib/reports/reports-hub.ts";
const HUB_PAGE_REL = "app/[locale]/dashboard/reports/page.tsx";

const SEARCH_MODEL = read(SEARCH_MODEL_REL);
const SEARCH_READS = read(SEARCH_READS_REL);
const SEARCH_ROUTE = read(SEARCH_ROUTE_REL);
const FINDER = read(FINDER_REL);
const DASHBOARD_PAGE = read(DASHBOARD_PAGE_REL);
const HUB_READS = read(HUB_READS_REL);
const HUB_PAGE = read(HUB_PAGE_REL);

const SEARCH_LAYER: readonly [string, string][] = [
  [SEARCH_MODEL_REL, SEARCH_MODEL],
  [SEARCH_READS_REL, SEARCH_READS],
  [SEARCH_ROUTE_REL, SEARCH_ROUTE],
];

const resolveKey = (msgs: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>(
    (node, k) =>
      node && typeof node === "object"
        ? (node as Record<string, unknown>)[k]
        : undefined,
    msgs,
  );

function candidate(
  overrides: Partial<DashboardSearchCandidate> & { id: string },
): DashboardSearchCandidate {
  return {
    label: overrides.id,
    href: "/dashboard/tasks",
    haystacks: [overrides.id],
    ...overrides,
  };
}

/* ────────────────────────────────────────────────────────────────────── */
/* 1. Search API — authenticated, bounded, RLS-helpers only               */
/* ────────────────────────────────────────────────────────────────────── */

describe("1. search API authenticates and bounds the query", () => {
  it("the route requires a session and 401s otherwise", () => {
    expect(SEARCH_ROUTE).toMatch(/auth\.getUser\(\)/);
    expect(SEARCH_ROUTE).toMatch(/status:\s*401/);
    expect(SEARCH_ROUTE).toMatch(/"unauthorized"/);
  });

  it("the route normalizes + bounds the query before any read", () => {
    expect(SEARCH_ROUTE).toMatch(/normalizeSearchQuery\(/);
    expect(SEARCH_ROUTE).toMatch(/status:\s*400/);
  });

  it("responses are never cached (per-caller data)", () => {
    expect(SEARCH_ROUTE).toMatch(/no-store/);
    expect(SEARCH_ROUTE).toMatch(/force-dynamic/);
  });

  it("query bounds: too short → null; overlong input is sliced, never rejected into an unbounded scan", () => {
    expect(normalizeSearchQuery("")).toBeNull();
    expect(normalizeSearchQuery("a")).toBeNull();
    expect(normalizeSearchQuery(" a ")).toBeNull();
    expect(normalizeSearchQuery("ab")).toBe("ab");
    const long = "x".repeat(500);
    const bounded = normalizeSearchQuery(long);
    expect(bounded).not.toBeNull();
    expect(bounded!.length).toBeLessThanOrEqual(
      DASHBOARD_SEARCH_MAX_QUERY_CHARS,
    );
    expect(DASHBOARD_SEARCH_MIN_QUERY_CHARS).toBe(2);
  });

  it("matching is diacritics-insensitive like the command registry", () => {
    const c = candidate({ id: "1", haystacks: ["Vilniaus kortelė"] });
    expect(candidateMatches(c, "kortele")).toBe(true);
    expect(candidateMatches(c, "zzz")).toBe(false);
    // null/empty haystacks never match and never throw.
    expect(
      candidateMatches(candidate({ id: "2", haystacks: [null, undefined, ""] }), "ab"),
    ).toBe(false);
  });

  it("per-source limit and total cap are enforced by the model", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      candidate({ id: `t-${i}`, haystacks: ["match me"] }),
    );
    const group = buildSearchGroup("tasks", many, "match");
    expect(group.results.length).toBe(DASHBOARD_SEARCH_PER_SOURCE_LIMIT);

    const full: DashboardSearchGroup[] = DASHBOARD_SEARCH_SOURCES.map(
      (source) => ({
        source,
        results: Array.from(
          { length: DASHBOARD_SEARCH_PER_SOURCE_LIMIT + 3 },
          (_, i) => ({ id: `${source}-${i}`, label: "x", href: "/dashboard" }),
        ),
      }),
    );
    const bounded = boundSearchGroups(full);
    const total = bounded.reduce((n, g) => n + g.results.length, 0);
    expect(total).toBeLessThanOrEqual(DASHBOARD_SEARCH_MAX_TOTAL_RESULTS);
    for (const g of bounded) {
      expect(g.results.length).toBeLessThanOrEqual(
        DASHBOARD_SEARCH_PER_SOURCE_LIMIT,
      );
    }
    // Empty groups are dropped; catalogue order is kept.
    const sparse = boundSearchGroups([
      { source: "bookings", results: [{ id: "b", label: "b", href: "/dashboard/bookings" }] },
      { source: "projects", results: [] },
    ]);
    expect(sparse.map((g) => g.source)).toEqual(["bookings"]);
  });
});

describe("2. search reads are RLS-scoped helpers only — never a privileged path", () => {
  it("no admin client / service role anywhere in the search layer", () => {
    for (const [rel, src] of SEARCH_LAYER) {
      const c = code(src);
      expect(c, rel).not.toMatch(/supabase\/admin|createAdminClient|service_role/);
    }
  });

  it("composition uses the existing caller-scoped read helpers", () => {
    expect(SEARCH_READS).toMatch(/from "@\/lib\/tasks\/tasks"/);
    expect(SEARCH_READS).toMatch(/listMyTasks/);
    expect(SEARCH_READS).toMatch(/from "@\/lib\/finance\/finance"/);
    expect(SEARCH_READS).toMatch(/listMyFinanceRecords/);
    expect(SEARCH_READS).toMatch(/from "@\/lib\/booking\/booking-actions"/);
    expect(SEARCH_READS).toMatch(/listMyBookings/);
    expect(SEARCH_READS).toMatch(/from "@\/lib\/documents\/readiness"/);
    expect(SEARCH_READS).toMatch(/listMyDocuments/);
    expect(SEARCH_READS).toMatch(/from "@\/lib\/projects\/projects"/);
    expect(SEARCH_READS).toMatch(/listManagedProjects/);
  });

  it("the ONLY direct table read is the conversations list (the communication-page read), bounded", () => {
    const c = code(SEARCH_READS);
    const froms = [...c.matchAll(/\.from\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
    expect(froms).toEqual(["conversations"]);
    // Bounded + fields-limited: id + subject only, LIMIT present.
    expect(SEARCH_READS).toMatch(/select\("id, subject"\)/);
    expect(SEARCH_READS).toMatch(/\.limit\(100\)/);
  });

  it("NO people search: no profiles/workers read, no scouting/matching import, no people source", () => {
    for (const [rel, src] of SEARCH_LAYER) {
      const c = code(src);
      expect(c, rel).not.toMatch(/\.from\(\s*"profiles"/);
      expect(c, rel).not.toMatch(/\.from\(\s*"workers"/);
      expect(c, rel).not.toMatch(/match-preview|staffing|scouting/i);
    }
    expect([...DASHBOARD_SEARCH_SOURCES]).toEqual([
      "projects",
      "tasks",
      "finance",
      "conversations",
      "bookings",
      "documents",
    ]);
  });

  it("read-only: no writes, no RPC, no outbound in the search layer", () => {
    for (const [rel, src] of SEARCH_LAYER) {
      const c = code(src);
      expect(c, rel).not.toMatch(/\.insert\(/);
      expect(c, rel).not.toMatch(/\.update\(/);
      expect(c, rel).not.toMatch(/\.delete\(/);
      expect(c, rel).not.toMatch(/\.upsert\(/);
      expect(c, rel).not.toMatch(/\.rpc\(/);
      expect(c, rel).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|telegram)/i,
      );
    }
  });

  it("every result href targets a REAL existing destination", () => {
    // Static hrefs in the composition must be real pages.
    const staticHrefs = [
      "/dashboard/tasks",
      "/dashboard/finance",
      "/dashboard/bookings",
    ];
    for (const href of staticHrefs) {
      expect(SEARCH_READS).toContain(`href: "${href}"`);
      const rel = join("app", "[locale]", ...href.split("/").filter(Boolean));
      expect(existsSync(join(ROOT, rel, "page.tsx")), href).toBe(true);
    }
    // Dynamic hrefs must target the real [param] pages / real filter params.
    expect(SEARCH_READS).toContain("`/dashboard/projects/${p.id}`");
    expect(
      existsSync(
        join(ROOT, "app", "[locale]", "dashboard", "projects", "[id]", "page.tsx"),
      ),
    ).toBe(true);
    expect(SEARCH_READS).toContain("`/dashboard/communication/${c.id}`");
    expect(
      existsSync(
        join(
          ROOT,
          "app",
          "[locale]",
          "dashboard",
          "communication",
          "[conversationId]",
          "page.tsx",
        ),
      ),
    ).toBe(true);
    // Documents deep-link uses the page's OWN existing ?type= filter param.
    expect(SEARCH_READS).toMatch(/\/dashboard\/documents\?type=/);
    const documentsPage = read("app/[locale]/dashboard/documents/page.tsx");
    expect(documentsPage).toMatch(/type\?: string/);
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/* 3. Finder — registry-first, accessible, honest states, ids-only recents */
/* ────────────────────────────────────────────────────────────────────── */

describe("3. CommandFinder stays registry-first and accessible", () => {
  it("registry command results render BEFORE the object groups", () => {
    const registryIdx = FINDER.indexOf('data-testid="command-finder-results"');
    const objectsIdx = FINDER.indexOf('data-testid="command-finder-objects"');
    expect(registryIdx).toBeGreaterThan(-1);
    expect(objectsIdx).toBeGreaterThan(-1);
    expect(registryIdx).toBeLessThan(objectsIdx);
  });

  it("keeps the curated registry as the command source and Ctrl/Cmd+K focus", () => {
    expect(FINDER).toContain('from "@/lib/navigation/command-registry"');
    expect(FINDER).toContain("matchCommands(");
    expect(FINDER).toMatch(/metaKey \|\| e\.ctrlKey/);
    expect(FINDER).toMatch(/key\.toLowerCase\(\) === "k"/);
  });

  it("stays a labelled input + plain link lists (keyboard accessible)", () => {
    expect(FINDER).toMatch(/htmlFor="command-finder-input"/);
    expect(FINDER).toMatch(/aria-label=\{t\("inputLabel"\)\}/);
    expect(FINDER).toMatch(/aria-label=\{t\("resultsLabel"\)\}/);
    expect(FINDER).toMatch(/aria-label=\{t\("objectsLabel"\)\}/);
    expect(FINDER).toMatch(/aria-label=\{t\("recentLabel"\)\}/);
    // No listbox-role reimplementation without key handling — plain links.
    expect(FINDER).not.toMatch(/role="listbox"|role="option"/);
  });

  it("the object fetch is debounced and timeout-bounded (no mobile hang)", () => {
    expect(FINDER).toMatch(/OBJECT_SEARCH_DEBOUNCE_MS/);
    expect(FINDER).toMatch(/AbortController/);
    expect(FINDER).toMatch(/OBJECT_SEARCH_TIMEOUT_MS/);
    expect(FINDER).toMatch(/signal: controller\.signal/);
    // Minimum chars gate mirrors the server model constant (one truth).
    expect(FINDER).toMatch(/DASHBOARD_SEARCH_MIN_QUERY_CHARS/);
  });

  it("loading / error / no-results states are honest and announced", () => {
    expect(FINDER).toMatch(/command-finder-objects-loading/);
    expect(FINDER).toMatch(/command-finder-objects-error/);
    expect(FINDER).toMatch(/command-finder-no-results/);
    expect(FINDER).toMatch(/aria-live="polite"/);
  });

  it("recent commands store command IDS only — never query text or labels", () => {
    expect(FINDER).toMatch(/RECENT_COMMANDS_STORAGE_KEY/);
    // The single write stores the ids array built from entry ids.
    const writes = [...FINDER.matchAll(/localStorage\.setItem\(/g)];
    expect(writes.length).toBe(1);
    expect(FINDER).toMatch(
      /localStorage\.setItem\(\s*RECENT_COMMANDS_STORAGE_KEY,\s*JSON\.stringify\(next\),?\s*\)/,
    );
    expect(FINDER).toMatch(/rememberCommand\(entry\.id\)/);
    // The stored list is built from ids only (strings), bounded.
    expect(FINDER).toMatch(/RECENT_COMMANDS_MAX/);
    expect(FINDER).not.toMatch(/setItem\([^)]*query/);
    expect(FINDER).not.toMatch(/setItem\([^)]*label/);
    // Reads are defensive: non-string entries are discarded.
    expect(FINDER).toMatch(/typeof v === "string"/);
  });

  it("the dashboard embeds the ONE finder (one search truth; no separate search page)", () => {
    expect(DASHBOARD_PAGE).toContain(
      'from "@/components/app/command-finder"',
    );
    expect(DASHBOARD_PAGE).toMatch(/<CommandFinder \/>/);
    // The removed /dashboard/search router page must not come back.
    expect(
      existsSync(join(ROOT, "app", "[locale]", "dashboard", "search", "page.tsx")),
      "the removed /dashboard/search page must not come back",
    ).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/* 4. Reports hub — basis labels, no fabricated numbers, existing reads    */
/* ────────────────────────────────────────────────────────────────────── */

describe("4. reports hub shows basis labels and fabricates nothing", () => {
  const BASIS_KEYS = [
    "workerEvidence",
    "workerActivity",
    "orgDemand",
    "orgProjects",
    "orgTasks",
    "orgDocuments",
    "orgFinance",
  ];

  it("every section renders its calculation-basis label", () => {
    for (const key of BASIS_KEYS) {
      expect(HUB_PAGE, `basis ${key}`).toContain(`basisKey="${key}"`);
    }
    // The BasisNote component renders the reports.basis.* copy + testid.
    expect(HUB_PAGE).toMatch(/t\(`basis\.\$\{basisKey\}`\)/);
    expect(HUB_PAGE).toMatch(/reports-basis-\$\{basisKey\}/);
    expect(HUB_PAGE).toMatch(/t\("basis\.label"\)/);
  });

  it("no hardcoded metric number in the page — every figure is a view-model field", () => {
    // A numeric literal passed as a metric value would be a fabricated figure.
    expect(HUB_PAGE).not.toMatch(/value=\{\s*\d/);
    // Every metric value is a property read from the composed view.
    const values = [...HUB_PAGE.matchAll(/value=\{([^}]+)\}/g)].map((m) =>
      m[1].trim(),
    );
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(v, `metric value "${v}"`).toMatch(
        /^(view|demand|projects|tasks|documents|finance)\./,
      );
    }
  });

  it("report copy carries no fabricated metrics and no real-time claim (every active locale)", () => {
    for (const loc of activeLocales) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as Record<
        string,
        unknown
      >;
      const blob = JSON.stringify(msgs.reports);
      expect(blob, `${loc} reports copy`).toBeTruthy();
      // No percentage / score-like number baked into copy.
      expect(blob, loc).not.toMatch(/\d+\s*%/);
      // No digits at all — every number on the hub comes from real counts.
      expect(blob, loc).not.toMatch(/\d/);
      // No real-time claim; no benchmark-against-others claim (the honest
      // "no benchmarks" disclaimer is allowed — a positive claim is not).
      expect(blob, loc).not.toMatch(/real-?time|realiuoju laiku|Echtzeit|реальном времени/i);
      expect(blob, loc).not.toMatch(
        /benchmarked|industry average|compared (to|with) other|palyginti su kitomis|im Branchenvergleich/i,
      );
    }
  });

  it("the hub composes ONLY existing RLS-scoped reads (no second truth, no admin client)", () => {
    expect(HUB_READS).toMatch(/from "@\/lib\/buyer\/customer-requests"/);
    expect(HUB_READS).toMatch(/listOwnCustomerRequests/);
    expect(HUB_READS).toMatch(/from "@\/lib\/tasks\/tasks"/);
    expect(HUB_READS).toMatch(/listMyTasks/);
    expect(HUB_READS).toMatch(/from "@\/lib\/finance\/finance"/);
    expect(HUB_READS).toMatch(/getFinanceSummary/);
    expect(HUB_READS).toMatch(/from "@\/lib\/documents\/document-centre"/);
    expect(HUB_READS).toMatch(/getOrgDocumentCentre/);
    expect(HUB_READS).toMatch(/getWorkerDocumentCentre/);
    expect(HUB_READS).toMatch(/buildVerifiedCv/);
    expect(HUB_READS).toMatch(/buildEvidenceReport/);
    expect(HUB_READS).toMatch(/callerCompanyId/);
    const c = code(HUB_READS);
    expect(c).not.toMatch(/supabase\/admin|createAdminClient|service_role/);
    // Read-only composition: no writes, no direct RPC here.
    expect(c).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
    expect(c).not.toMatch(/\bfetch\s*\(/);
  });

  it("export links point ONLY at exports that exist on disk", () => {
    expect(HUB_PAGE).toMatch(/\/dashboard\/journal\/export/);
    expect(
      existsSync(
        join(ROOT, "app", "[locale]", "dashboard", "journal", "export", "route.ts"),
      ),
    ).toBe(true);
    expect(HUB_PAGE).toMatch(/\/dashboard\/finance\/export/);
    expect(
      existsSync(
        join(ROOT, "app", "[locale]", "dashboard", "finance", "export", "route.ts"),
      ),
    ).toBe(true);
    expect(HUB_PAGE).toMatch(/"\/dashboard\/reports\/evidence" as "\/dashboard"/);
    expect(
      existsSync(
        join(ROOT, "app", "[locale]", "dashboard", "reports", "evidence", "page.tsx"),
      ),
    ).toBe(true);
    expect(HUB_PAGE).toMatch(/"\/cv" as "\/dashboard"/);
    expect(existsSync(join(ROOT, "app", "[locale]", "cv", "page.tsx"))).toBe(true);
  });

  it("degradation states are explicit — needs-migration and unavailable copy exist", () => {
    expect(HUB_PAGE).toMatch(/state\.needsMigration/);
    expect(HUB_PAGE).toMatch(/state\.unavailable/);
    expect(HUB_READS).toMatch(/"needs-migration"/);
    expect(HUB_READS).toMatch(/"unavailable"/);
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/* 5. Wiring — registered everywhere a module must be                      */
/* ────────────────────────────────────────────────────────────────────── */

describe("5. reports module is registered everywhere a module must be", () => {
  it("module registry: reports → /dashboard/reports, grid+command, ALL roles, chart icon, no badge", () => {
    const m = getDashboardModule("reports");
    expect(getModuleRoute("reports")).toBe("/dashboard/reports");
    expect(m.surfaces).toContain("grid");
    expect(m.surfaces).toContain("command");
    expect(m.surfaces).not.toContain("nav");
    expect([...m.roles].sort()).toEqual([
      "agency",
      "company",
      "customer",
      "worker",
    ]);
    expect(m.iconKey).toBe("chart");
    expect(m.attentionSignalIds).toBeUndefined();
  });

  it("the grid icon map carries the chart icon", () => {
    const grid = read("components/app/dashboard/dashboard-module-grid.tsx");
    expect(grid).toMatch(/chart: BarChart3/);
  });

  it("primary-route smoke inventory carries /dashboard/reports", () => {
    const entry = PRIMARY_ROUTES.find(
      (r) => r.urlPattern === "/dashboard/reports",
    );
    expect(entry).toBeTruthy();
    expect(entry!.sourceFile).toBe(HUB_PAGE_REL);
    expect(entry!.requiresAuth).toBe(true);
    expect(existsSync(join(ROOT, HUB_PAGE_REL))).toBe(true);
  });

  it("route truth map classifies dashboard/reports as REAL_LAUNCH_SURFACE", () => {
    const map = read("lib/guards/route-truth-map.test.ts");
    expect(map).toMatch(/"dashboard\/reports": "REAL_LAUNCH_SURFACE"/);
  });

  it("command registry: the reports entry resolves through getModuleRoute with 5-locale copy", () => {
    const entry = COMMAND_REGISTRY.find((e) => e.id === "reports");
    expect(entry).toBeTruthy();
    expect(entry!.route).toBe(getModuleRoute("reports"));
    expect(entry!.audience).toBe("public");
    for (const loc of activeLocales) {
      expect(entry!.labels[loc]?.trim().length, `label ${loc}`).toBeGreaterThan(0);
      expect(entry!.synonyms[loc]?.length, `synonyms ${loc}`).toBeGreaterThan(0);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────── */
/* 6. i18n — the full new catalogue resolves in every ACTIVE locale        */
/* ────────────────────────────────────────────────────────────────────── */

describe("6. copy resolves in every ACTIVE locale", () => {
  const FINDER_KEYS = [
    "commandFinder.recentLabel",
    "commandFinder.objectsLabel",
    "commandFinder.objectsLoading",
    "commandFinder.objectsError",
    ...DASHBOARD_SEARCH_SOURCES.map((s) => `commandFinder.groups.${s}`),
  ];

  const REPORT_KEYS = [
    "reports.eyebrow",
    "reports.title",
    "reports.intro",
    "reports.honestyNote",
    "reports.state.needsMigration",
    "reports.state.unavailable",
    "reports.basis.label",
    "reports.basis.workerEvidence",
    "reports.basis.workerActivity",
    "reports.basis.orgDemand",
    "reports.basis.orgProjects",
    "reports.basis.orgTasks",
    "reports.basis.orgDocuments",
    "reports.basis.orgFinance",
    "reports.worker.evidence.title",
    "reports.worker.evidence.totalSkills",
    "reports.worker.evidence.workSupported",
    "reports.worker.evidence.confirmed",
    "reports.worker.evidence.journalEntries",
    "reports.worker.evidence.confirmations",
    "reports.worker.evidence.empty",
    "reports.worker.evidence.link",
    "reports.worker.activity.title",
    "reports.worker.activity.entries",
    "reports.worker.activity.photos",
    "reports.worker.activity.unavailable",
    "reports.worker.activity.link",
    "reports.exports.title",
    "reports.exports.note",
    "reports.exports.evidence",
    "reports.exports.cv",
    "reports.exports.journalCsv",
    "reports.exports.financeCsv",
    "reports.org.demand.title",
    "reports.org.demand.open",
    "reports.org.demand.total",
    "reports.org.demand.link",
    "reports.org.projects.title",
    "reports.org.projects.status.draft",
    "reports.org.projects.status.live",
    "reports.org.projects.status.paused",
    "reports.org.projects.total",
    "reports.org.projects.empty",
    "reports.org.projects.link",
    "reports.org.tasks.title",
    "reports.org.tasks.open",
    "reports.org.tasks.status.todo",
    "reports.org.tasks.status.in_progress",
    "reports.org.tasks.status.blocked",
    "reports.org.tasks.link",
    "reports.org.documents.title",
    "reports.org.documents.workers",
    "reports.org.documents.expiring",
    "reports.org.documents.attention",
    "reports.org.documents.empty",
    "reports.org.documents.link",
    "reports.org.finance.title",
    "reports.org.finance.overdue",
    "reports.org.finance.total",
    "reports.org.finance.link",
  ];

  for (const loc of activeLocales) {
    it(`${loc}: full finder + reports catalogue`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      for (const key of [...FINDER_KEYS, ...REPORT_KEYS]) {
        const v = resolveKey(msgs, key);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${loc}: ${key}`,
        ).toBe(true);
      }
    });
  }
});
