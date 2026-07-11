import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for Loading / Error-State Coverage v1.
 *
 * Continues the PR #222 direction (form-submit feedback) onto the READ side:
 * every user-visible client component that fetches data over the network to
 * render it must keep the three async states honest and DISTINCT —
 *   1. loading   — a visible "data is loading" signal while the read is pending;
 *   2. error     — a visible "the read failed" signal when the fetch rejects /
 *                  returns a non-ok payload (NOT silently folded into empty);
 *   3. empty     — "no data yet" is its own state, never standing in for a
 *                  failed or pending read.
 *
 * Discovery (not a hardcoded single file): the guard walks the component + app
 * trees, flags every "use client" file that performs a network READ (a GET-shape
 * `fetch()` or a browser-supabase `.from().select()`), and asserts each is
 * classified in READ_SURFACES with its loading + error markers. A NEW client
 * read surface that ships without a loading/error contract turns this red.
 *
 * SSR dashboard pages are async surfaces too, but their loading feedback is the
 * native navigation pending and their failures throw to the framework error
 * boundary — so they are exempt AS LONG AS they stay server components. The guard
 * asserts that invariant (no dashboard page silently flips to a client-async data
 * loader without owing inline loading/error), giving the exemption real teeth.
 *
 * Writes (form submits: method:POST/PUT/PATCH/DELETE, auth sign-in/up, uploads)
 * are NOT reads — they are covered by form-submit-feedback.test.ts.
 *
 * Runs in CI via `pnpm -F web test`. Pure source assertions; invents nothing.
 */

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

function walkTsx(absDir: string, acc: string[] = []): string[] {
  if (!existsSync(absDir)) return acc;
  for (const e of readdirSync(absDir, { withFileTypes: true })) {
    const p = join(absDir, e.name);
    if (e.isDirectory()) walkTsx(p, acc);
    else if (e.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

function rel(abs: string): string {
  return abs.slice(APP_ROOT.length + 1).split("\\").join("/");
}

const IS_CLIENT = /^\s*["']use client["']/m;
const WRITE_METHOD = /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i;
const SUPABASE_SELECT = /\.from\([^)]*\)\s*\.select\(/;

/**
 * A client-side network READ to render data: a GET-shape `fetch()` (a fetch
 * call whose argument list carries no write method, so it defaults to GET) or a
 * browser-supabase `.from().select()`. A write `fetch()` (carrying method:POST…)
 * is deliberately not counted — those are form submits owned by the
 * form-submit-feedback guard.
 */
function hasNetworkRead(src: string): boolean {
  if (SUPABASE_SELECT.test(src)) return true;
  // Inspect each fetch() call's leading window for a write method.
  const parts = src.split("fetch(");
  for (let i = 1; i < parts.length; i++) {
    const callWindow = parts[i].slice(0, 220);
    if (!WRITE_METHOD.test(callWindow)) return true; // GET-shape read
  }
  return false;
}

/**
 * A failed read silently folded into the empty state — `catch(...)` (concise or
 * block-body) whose handler sets the data to `[]` instead of raising a dedicated
 * error state. Matches both `catch(() => setX([]))` and
 * `catch((e) => { …; setX([]); })`.
 */
const ERROR_FOLDED_INTO_EMPTY =
  /catch\s*\([^)]*\)\s*=>\s*\{?[^}]*?set\w+\(\s*\[\s*\]\s*\)/;

type ReadSurface = {
  file: string;
  /** Visible "loading" signal while the read is pending. */
  loading: RegExp;
  /** Visible "the read failed" signal, distinct from empty. */
  error: RegExp;
  /** The dedicated empty state — present and separate from loading + error. */
  empty: RegExp;
};

/**
 * Classified client read surfaces. Discovery (below) asserts this list stays in
 * sync with what's actually in the tree, so it can never silently go no-op.
 */
const READ_SURFACES: ReadSurface[] = [
  {
    file: "components/app/profession-skills-picker.tsx",
    loading: /\bt\(["']loading["']\)/,
    error: /\bt\(["']loadError["']\)/,
    empty: /\bt\(["']empty["']\)/,
  },
  {
    // Universal finder object search (control room PR K): debounced,
    // timeout-bounded GET to /api/dashboard-search. Loading + error are
    // dedicated aria-live states; "noResults" is the separate empty state
    // (shown only when neither registry commands nor objects match).
    file: "components/app/command-finder.tsx",
    loading: /\bt\(["']objectsLoading["']\)/,
    error: /\bt\(["']objectsError["']\)/,
    empty: /\bt\(["']noResults["']\)/,
  },
];

// Discover every client component that reads data over the network.
const discoveredReadSurfaces = [
  ...walkTsx(join(APP_ROOT, "components")),
  ...walkTsx(join(APP_ROOT, "app", "[locale]")),
]
  .filter((abs) => {
    const src = readFileSync(abs, "utf8");
    return IS_CLIENT.test(src) && hasNetworkRead(src);
  })
  .map(rel)
  .sort();

const classifiedFiles = new Set(READ_SURFACES.map((s) => s.file));

describe("Guard: client read surfaces are discovered (no-op floor)", () => {
  it(`discovered at least one client network-read surface: ${discoveredReadSurfaces.length}`, () => {
    expect(discoveredReadSurfaces.length).toBeGreaterThanOrEqual(1);
  });

  it("every classified READ_SURFACES file still exists", () => {
    for (const { file } of READ_SURFACES) {
      expect(existsSync(join(APP_ROOT, file)), `${file} no longer exists — update READ_SURFACES`).toBe(true);
    }
  });

  it("every discovered read surface is classified with a loading+error contract", () => {
    const unclassified = discoveredReadSurfaces.filter((f) => !classifiedFiles.has(f));
    expect(
      unclassified,
      `New client network-read surface(s) ${JSON.stringify(unclassified)} must be added to READ_SURFACES with explicit loading + error states (or refactored to not read client-side).`,
    ).toEqual([]);
  });
});

describe("Guard: every read surface shows distinct loading / error / empty", () => {
  for (const s of READ_SURFACES) {
    it(`${s.file} shows a loading signal`, () => {
      const src = read(s.file);
      expect(s.loading.test(src), `${s.file}: no loading signal (${s.loading}).`).toBe(true);
    });

    it(`${s.file} shows an error signal distinct from empty`, () => {
      const src = read(s.file);
      expect(s.error.test(src), `${s.file}: no error signal (${s.error}).`).toBe(true);
      expect(s.empty.test(src), `${s.file}: no dedicated empty state (${s.empty}).`).toBe(true);
      // The two must be different markers — error must not BE the empty state.
      expect(
        s.error.source,
        `${s.file}: error and empty markers must differ.`,
      ).not.toEqual(s.empty.source);
    });

    it(`${s.file} does not fold a failed read into the empty state`, () => {
      const src = read(s.file);
      expect(
        ERROR_FOLDED_INTO_EMPTY.test(src),
        `${s.file}: a failed read is folded into the empty state (catch → set[]); give it a dedicated error state.`,
      ).toBe(false);
    });
  }
});

// SSR dashboard pages: async surfaces whose loading is native navigation and
// whose errors throw to the framework boundary — exempt only while they remain
// server components. Lock that so none silently becomes a client data loader.
const dashboardPages = walkTsx(join(APP_ROOT, "app", "[locale]", "dashboard"))
  .filter((abs) => abs.endsWith("page.tsx"))
  .map(rel)
  .sort();

describe("Guard: SSR dashboard pages stay server components (native-nav exempt)", () => {
  it(`discovered a non-trivial set of dashboard pages: ${dashboardPages.length}`, () => {
    expect(dashboardPages.length).toBeGreaterThanOrEqual(15);
  });

  for (const f of dashboardPages) {
    it(`${f} is a server component (no client-async read without loading/error)`, () => {
      const src = read(f);
      if (IS_CLIENT.test(src) && hasNetworkRead(src)) {
        expect(
          classifiedFiles.has(f),
          `${f} became a client-async data loader — classify it in READ_SURFACES with loading + error states.`,
        ).toBe(true);
      } else {
        expect(IS_CLIENT.test(src), `${f} flipped to "use client" — confirm it owes no inline loading/error and classify if it reads data.`).toBe(false);
      }
    });
  }
});

// Negative controls: prove the detectors actually bite (removing a marker must
// turn the guard red), so a future no-op refactor can't pass silently.
describe("Guard: detectors are real (negative controls)", () => {
  const surface = READ_SURFACES[0];

  it("the live read surface currently passes loading + error detection", () => {
    const src = read(surface.file);
    expect(surface.loading.test(src)).toBe(true);
    expect(surface.error.test(src)).toBe(true);
  });

  it("stripping the loading marker turns the loading check red", () => {
    const stripped = read(surface.file).replace(surface.loading, 't("pickerTitle")');
    expect(surface.loading.test(stripped)).toBe(false);
  });

  it("stripping the error marker turns the error check red", () => {
    const stripped = read(surface.file).replace(surface.error, 't("empty")');
    expect(surface.error.test(stripped)).toBe(false);
  });

  it("a GET-shape fetch is detected as a network read; a POST is not", () => {
    expect(hasNetworkRead('fetch(`/api/x`).then((r) => r.json())')).toBe(true);
    expect(hasNetworkRead('fetch("/api/x", { method: "POST", body })')).toBe(false);
  });

  it("a failed-read-folded-into-empty shape is detected", () => {
    expect(ERROR_FOLDED_INTO_EMPTY.test("foo.catch(() => setSkills([]))")).toBe(true);
    expect(ERROR_FOLDED_INTO_EMPTY.test("foo.catch((e) => setLoadError(true))")).toBe(false);
  });
});
