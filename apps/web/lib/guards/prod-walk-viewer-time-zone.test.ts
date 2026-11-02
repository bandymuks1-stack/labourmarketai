import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EVERY PRODUCTION-WALK BROWSER CONTEXT IS A RETURNING BROWSER.
 *
 * `ViewerTimeZone` (app/[locale]/layout.tsx) writes the `lm_tz` cookie on a
 * browser's first page and refreshes that page once. A production walk opens a
 * fresh context per step, so without a preset zone every step paid one extra
 * full server render (brigade walk 2026-10-22: ~19 of ~73 renders). Production
 * load is budgeted, so that waste is not cosmetic.
 *
 * ONE mechanism presets it: `tests/e2e/prod-walk.ts` exports the walk's `test`,
 * whose fixtures give the default `context`/`page` AND every
 * `browser.newContext()` / `browser.newPage()` the zone (`timezoneId`) and the
 * `lm_tz` cookie before the first request (proved locally with a recording
 * HTTP server, 2026-10-23). This guard pins both halves:
 *
 *   1. the mechanism itself (prod-walk.ts) still does all of that;
 *   2. every spec the production walk can run — every `prod-*.spec.ts` and
 *      every spec named in `.github/workflows/prod-qa-walk.yml` — takes `test`
 *      from `./prod-walk`, never a value from a Playwright package (types are
 *      fine), never launches or connects a browser of its own, and never sets
 *      its own `timezoneId` (a zone that disagreed with the cookie would bring
 *      the refresh back); the local helpers those specs import never launch or
 *      connect a browser either.
 *
 * Playwright specs are not run by vitest or CI, so these properties are pinned
 * on the source, with negative controls for the classifier.
 */
const WEB = join(__dirname, "..", "..");
const E2E = join(WEB, "tests", "e2e");
const WORKFLOW = readFileSync(join(WEB, "..", "..", ".github", "workflows", "prod-qa-walk.yml"), "utf8");
const MECHANISM = readFileSync(join(E2E, "prod-walk.ts"), "utf8");

const PLAYWRIGHT_PACKAGE = /^(?:@playwright\/test|playwright|playwright-core|@playwright\/[\w.-]+)$/;
const BROWSER_TYPES = new Set(["chromium", "firefox", "webkit", "_android", "_electron"]);

/** Every spec file the production walk can run (workflow `SPEC=` lines ∪ `prod-*.spec.ts`). */
function productionSpecs(workflow: string, e2eFiles: string[]): string[] {
  const named = [...workflow.matchAll(/\bSPEC=tests\/e2e\/([\w.-]+\.spec\.ts)\b/g)].map((m) => m[1]!);
  const prefixed = e2eFiles.filter((f) => /^prod-[\w.-]+\.spec\.ts$/.test(f));
  return [...new Set([...named, ...prefixed])].sort();
}

/** Source without block comments and whole-line `//` comments (strings stay intact). */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

type Import = { module: string; typeOnly: boolean; values: string[]; namespaceOrDefault: boolean };

function imports(src: string): Import[] {
  const out: Import[] = [];
  for (const m of code(src).matchAll(/\bimport\s+(type\s+)?([^;"']*?)\s+from\s+["']([^"']+)["']/g)) {
    const clause = m[2]!.trim();
    const braces = clause.match(/\{([\s\S]*)\}/);
    const values = braces
      ? braces[1]!
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith("type "))
          .map((s) => s.split(/\s+as\s+/)[0]!.trim())
      : [];
    const outside = braces ? clause.replace(braces[0], "").replace(/,/g, "").trim() : clause;
    out.push({ module: m[3]!, typeOnly: !!m[1], values, namespaceOrDefault: outside.length > 0 });
  }
  return out;
}

/** Ways a source opens a browser on its own (applies to specs AND their helpers). */
function launchesBrowser(src: string): string[] {
  const c = code(src);
  const why: string[] = [];
  for (const i of imports(src)) {
    if (!PLAYWRIGHT_PACKAGE.test(i.module) || i.typeOnly) continue;
    for (const v of i.values) if (BROWSER_TYPES.has(v)) why.push(`imports ${v} from ${i.module}`);
  }
  if (/\b(?:chromium|firefox|webkit)\s*\.\s*(?:launch|connect)/.test(c)) why.push("launches/connects a browser type");
  if (/\.\s*(?:launch|launchPersistentContext|launchServer|connectOverCDP)\s*\(/.test(c)) why.push("launches/connects a browser");
  if (/\brequire\s*\(\s*["'](?:@playwright\/[\w.-]+|playwright(?:-core)?)["']\s*\)/.test(c)) why.push("require()s a Playwright package");
  if (/\bawait\s+import\s*\(\s*["'](?:@playwright\/[\w.-]+|playwright(?:-core)?)["']\s*\)/.test(c)) why.push("dynamically imports a Playwright package");
  return why;
}

/** Ways a production spec bypasses ./prod-walk. Empty = compliant. */
function bypasses(src: string): string[] {
  const why = launchesBrowser(src);
  const all = imports(src);
  const walk = all.filter((i) => i.module === "./prod-walk" && !i.typeOnly);
  if (!walk.some((i) => i.values.includes("test"))) why.push("does not take `test` from ./prod-walk");
  for (const i of all) {
    if (!PLAYWRIGHT_PACKAGE.test(i.module) || i.typeOnly) continue;
    if (i.namespaceOrDefault || i.values.length > 0) why.push(`imports a value from ${i.module} (take it from ./prod-walk)`);
  }
  if (/\btimezoneId\b/.test(code(src))) why.push("sets its own timezoneId (the zone belongs to ./prod-walk)");
  return why;
}

/** Relative modules a spec imports, transitively, inside tests/e2e (the mechanism itself excluded). */
function localHelpers(specFile: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    for (const i of imports(readFileSync(file, "utf8"))) {
      if (!i.module.startsWith("./") && !i.module.startsWith("../")) continue;
      const base = resolve(dirname(file), i.module);
      const target = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(existsSync);
      if (!target || !target.startsWith(E2E) || seen.has(target)) continue;
      if (target === join(E2E, "prod-walk.ts")) continue;
      seen.add(target);
      visit(target);
    }
  };
  visit(specFile);
  return [...seen];
}

const SPECS = productionSpecs(WORKFLOW, readdirSync(E2E));

describe("the mechanism — tests/e2e/prod-walk.ts", () => {
  it("re-exports Playwright and replaces only `test`, built on @playwright/test", () => {
    expect(MECHANISM).toContain('export * from "@playwright/test";');
    expect(MECHANISM).toMatch(/import \{ test as base[^}]*\} from "@playwright\/test";/);
    expect(MECHANISM).toMatch(/export const test = base\.extend\(/);
    expect(MECHANISM).toMatch(/import \{ WALK_TIME_ZONE, seedViewerTimeZone \} from "\.\/viewer-time-zone";/);
  });

  it("the default fixtures get the zone and the cookie before the page exists", () => {
    expect(MECHANISM).toMatch(/\btimezoneId: WALK_TIME_ZONE,/);
    const ctx = MECHANISM.slice(MECHANISM.indexOf("context: async ({ context }, use) => {"));
    expect(ctx.length).toBeLessThan(MECHANISM.length);
    expect(ctx.indexOf("await seedViewerTimeZone(context);")).toBeGreaterThan(0);
    expect(ctx.indexOf("await seedViewerTimeZone(context);")).toBeLessThan(ctx.indexOf("await use(context);"));
  });

  it("every browser.newContext (and so newPage) is wrapped: zone forced, cookie seeded before it is returned", () => {
    const b = MECHANISM.slice(MECHANISM.indexOf("browser: ["));
    expect(b.length).toBeLessThan(MECHANISM.length);
    expect(b).toMatch(/browser\.newContext = async \(options\?: BrowserContextOptions\) => \{/);
    // The zone comes AFTER the caller's options, so no caller can make it disagree with the cookie.
    expect(b).toContain("newContext.call(browser, { ...options, timezoneId: WALK_TIME_ZONE })");
    expect(b.indexOf("await seedViewerTimeZone(ctx);")).toBeGreaterThan(0);
    expect(b.indexOf("await seedViewerTimeZone(ctx);")).toBeLessThan(b.indexOf("return ctx;"));
    // Worker-scoped: walk tests get their own workers; the original is restored afterwards.
    expect(b).toMatch(/\{ scope: "worker" \}/);
    expect(b).toContain("browser.newContext = newContext;");
  });

  it("the cookie and the zone are the one pair from viewer-time-zone.ts", () => {
    const tz = readFileSync(join(E2E, "viewer-time-zone.ts"), "utf8");
    expect(tz).toMatch(/export const WALK_TIME_ZONE = "[A-Za-z]+\/[A-Za-z_]+";/);
    expect(tz).toMatch(/name: "lm_tz", value: encodeURIComponent\(WALK_TIME_ZONE\)/);
    // The cookie name is the product's own constant.
    expect(readFileSync(join(WEB, "lib", "time", "local-day.ts"), "utf8")).toContain('export const VIEWER_TZ_COOKIE = "lm_tz";');
  });
});

describe("every production spec goes through the mechanism", () => {
  it("finds the walk's specs (the workflow list parsed, not empty)", () => {
    expect(SPECS.length).toBeGreaterThanOrEqual(33);
    expect(SPECS).toContain("prod-brigade-formation.spec.ts");
    expect(SPECS).toContain("employee-beta-gate.spec.ts"); // named in the workflow, not prod-*
    for (const s of SPECS) expect(existsSync(join(E2E, s)), `${s} named by the walk exists`).toBe(true);
  });

  it.each(SPECS)("%s takes `test` from ./prod-walk and opens no context around it", (spec) => {
    expect(bypasses(readFileSync(join(E2E, spec), "utf8"))).toEqual([]);
  });

  it("the local helpers those specs import never launch or connect a browser", () => {
    const helpers = [...new Set(SPECS.flatMap((s) => localHelpers(join(E2E, s))))];
    expect(helpers.length).toBeGreaterThan(0);
    for (const h of helpers) expect(launchesBrowser(readFileSync(h, "utf8")), relative(WEB, h)).toEqual([]);
  });
});

describe("negative controls — the classifier catches every bypass", () => {
  const OK = [
    'import { readFileSync } from "node:fs";',
    'import { test, expect, type Browser, type Page } from "./prod-walk";',
    'import type { BrowserContext } from "@playwright/test";',
    "// a comment may say chromium.launch() or timezoneId",
    'const f = async (p: import("@playwright/test").Page) => p.goto("https://labourmarket.ai/lt");',
    'test("x", async ({ browser }) => { const ctx = await browser.newContext({ storageState: "s.json", locale: "lt-LT" }); });',
  ].join("\n");

  it("a compliant spec passes", () => {
    expect(bypasses(OK)).toEqual([]);
  });

  it.each([
    ["plain @playwright/test", 'import { test, expect, type Page } from "@playwright/test";\ntest("x", async ({ browser }) => {});'],
    ["renamed base test", 'import { test } from "./prod-walk";\nimport { test as base } from "@playwright/test";'],
    ["expect from the package", 'import { test } from "./prod-walk";\nimport { expect } from "@playwright/test";'],
    ["default import", 'import { test } from "./prod-walk";\nimport pw from "@playwright/test";'],
    ["own browser", 'import { test } from "./prod-walk";\nimport { chromium } from "playwright";\nconst b = await chromium.launch();'],
    ["persistent context", 'import { test } from "./prod-walk";\ntest("x", async ({ playwright }) => { await playwright.chromium.launchPersistentContext("d"); });'],
    ["CDP", 'import { test } from "./prod-walk";\ntest("x", async ({ playwright }) => { await playwright.chromium.connectOverCDP("ws://x"); });'],
    ["require", 'import { test } from "./prod-walk";\nconst { chromium } = require("@playwright/test");'],
    ["dynamic import", 'import { test } from "./prod-walk";\nconst pw = await import("playwright-core");'],
    ["own zone", 'import { test } from "./prod-walk";\ntest.use({ timezoneId: "UTC" });'],
    ["own zone in newContext", 'import { test } from "./prod-walk";\nawait browser.newContext({ timezoneId: "America/New_York" });'],
    ["only types from ./prod-walk", 'import type { Page } from "./prod-walk";\nimport { test } from "./walk-elsewhere";'],
  ])("flags: %s", (_label, src) => {
    expect(bypasses(src).length).toBeGreaterThan(0);
  });

  it("a helper that launches its own browser is flagged; one that only takes a page is not", () => {
    expect(launchesBrowser('import { chromium } from "@playwright/test";\nexport const open = () => chromium.launch();').length).toBeGreaterThan(0);
    expect(launchesBrowser('import { expect, type Page } from "@playwright/test";\nexport const f = (p: Page) => expect(p).toHaveURL(/x/);')).toEqual([]);
  });

  it("the spec list is the union of the workflow SPEC lines and the prod-* files", () => {
    expect(productionSpecs("", ["prod-a.spec.ts", "other.spec.ts", "prod-qa-api.ts"])).toEqual(["prod-a.spec.ts"]);
    expect(productionSpecs("SPEC=tests/e2e/gate.spec.ts ;;", ["prod-a.spec.ts"])).toEqual(["gate.spec.ts", "prod-a.spec.ts"]);
  });
});
