import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Guard for W12 item D — one calculation, every presentation.
 *
 * W12's strongest property, and the hardest one to retrofit if it is ever lost,
 * is that there is exactly ONE calendar projection: `getPlanning` →
 * `buildAgenda`. The planning page, the chat sentence, the `?result=calendar`
 * panel and the AI workspace all read it; a new source joins once and appears
 * in all of them.
 *
 * Until now that held **by convention**. `calendar-result.ts` states the rule
 * in prose — it "builds NO view of its own, reads NO table of its own, and adds
 * NO second truth store" — and every author has honoured it. But prose does not
 * fail a build. A second agenda builder, or a fifth surface quietly assembling
 * its own day groups from the source tables, would pass every existing check
 * and would only be noticed when two surfaces started disagreeing about the
 * same day — which is exactly the class of bug the W12 timezone slice spent a
 * train chasing in PRESENTATION.
 *
 * This converts the convention into a ratchet. It does not forbid a new reader;
 * it forbids an UNDECLARED one. Adding a surface here is one line, and that line
 * is the moment someone asks "should this read the projection, or is it building
 * a second calendar?"
 */

const WEB_ROOT = join(__dirname, "..", "..");

/** Blank comment CONTENT, preserving newlines so line numbers survive. */
function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + " ".repeat(m.length - p1.length));
}
const MODEL = "lib/planning/planning-model.ts";
const READ = "lib/planning/planning.ts";

function sourceFiles(): { rel: string; src: string; code: string }[] {
  const out: { rel: string; src: string; code: string }[] = [];
  const walk = (dir: string): void => {
    // `withFileTypes` answers "directory?" from the SAME directory read, so
    // there is no stat-then-read gap on the path (CodeQL js/file-system-race)
    // and one syscall per entry instead of two.
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = entry.name;
      if (name === "node_modules" || name === ".next") continue;
      const full = join(dir, name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
      const src = readFileSync(full, "utf8");
      out.push({
        rel: relative(WEB_ROOT, full).split(sep).join("/"),
        src,
        // Comments blanked, newlines preserved. Without this the scan counts
        // prose: `context-intelligence.ts` merely NAMES getPlanning while
        // explaining that it does no IO of its own, and would be flagged as a
        // reader it is not.
        code: blankComments(src),
      });
    }
  };
  for (const d of ["app", "components", "lib"]) walk(join(WEB_ROOT, d));
  return out;
}

const FILES = sourceFiles();
const byRel = (rel: string) => FILES.find((f) => f.rel === rel);

describe("the scan is wired to real files", () => {
  it("walks a non-trivial tree", () => {
    expect(FILES.length).toBeGreaterThan(500);
  });

  it("both planning modules exist where the allowlists name them", () => {
    expect(byRel(MODEL), MODEL).toBeDefined();
    expect(byRel(READ), READ).toBeDefined();
  });
});

describe("the projection has exactly one implementation", () => {
  // If any of these ever gains a second definition, two surfaces can compute a
  // different answer from the same rows — the precise failure this guards.
  const SINGLE = [
    "buildAgenda",
    "detectConflicts",
    "conflictItemIds",
    "isConflictEligible",
    "hiddenConflictSources",
    "visibleConflictPartners",
    "effectiveEndDay",
    "rangesOverlapInclusive",
  ] as const;

  for (const fn of SINGLE) {
    it(`${fn} is defined only in ${MODEL}`, () => {
      const defs = FILES.filter((f) =>
        new RegExp(`function\\s+${fn}\\s*[(<]`).test(f.code),
      ).map((f) => f.rel);
      expect(defs).toEqual([MODEL]);
    });
  }
});

describe("every reader of the projection is declared", () => {
  /**
   * The complete set of modules allowed to read the canonical projection.
   * Adding one is deliberate — see the module doc.
   */
  const GET_PLANNING_READERS = [
    "app/[locale]/dashboard/planning/page.tsx", // the planning page
    "lib/ai-workspace/ai-context.ts", // AI workspace context
    "lib/ai-workspace/workflows.ts", // AI workspace workflows
    "lib/conversation/agenda-summary.ts", // the chat sentence
    "lib/conversation/opening-brief.ts", // the opening brief
    "lib/planning/calendar-result.ts", // the ?result=calendar panel
    "lib/world-state/work-context-server.ts", // the world-state work context
  ].sort();

  /** Only a surface that renders day GROUPS builds an agenda. */
  const BUILD_AGENDA_CALLERS = [
    "app/[locale]/dashboard/planning/page.tsx",
    "lib/conversation/agenda-summary.ts",
    "lib/planning/calendar-result.ts",
  ].sort();

  it("no undeclared module imports getPlanning", () => {
    const actual = FILES.filter(
      (f) => f.rel !== READ && /\bgetPlanning\s*\(/.test(f.code),
    )
      .map((f) => f.rel)
      .sort();
    expect(actual).toEqual(GET_PLANNING_READERS);
  });

  it("no undeclared module builds an agenda", () => {
    const actual = FILES.filter(
      (f) => f.rel !== MODEL && /\bbuildAgenda\s*\(/.test(f.code),
    )
      .map((f) => f.rel)
      .sort();
    expect(actual).toEqual(BUILD_AGENDA_CALLERS);
  });

  it("every declared reader goes through the read module, never the model alone", () => {
    // Importing planning-model without planning.ts would mean assembling items
    // from somewhere else and then running the canonical maths over them.
    for (const rel of GET_PLANNING_READERS) {
      const f = byRel(rel);
      expect(f, `${rel} must exist (rename → update the allowlist)`).toBeDefined();
      expect(f!.src, `${rel} imports the canonical read`).toMatch(
        /from "@\/lib\/planning\/planning"/,
      );
    }
  });
});

describe("the ?result=calendar panel honours the contract it states", () => {
  const src = byRel("lib/planning/calendar-result.ts")!.src;

  it("still states the anti-second-calendar rule in prose", () => {
    expect(src).toMatch(/builds NO view of its own/);
    expect(src).toMatch(/reads NO table of its own/);
  });

  it("and actually reads the canonical projection", () => {
    expect(src).toMatch(/getPlanning/);
    expect(src).toMatch(/buildAgenda/);
  });

  it("does not query a database itself", () => {
    // A second truth store would start with its own client.
    expect(src).not.toMatch(/createClient|createServerClient|\.from\(/);
  });
});

describe("conflict truth stays filter-independent", () => {
  const page = byRel("app/[locale]/dashboard/planning/page.tsx")!.src;

  it("conflicts are derived from the FULL model, never the filtered rows", () => {
    // The 2026 defect: `detectConflicts(visibleItems)` let `?source=booking`
    // delete the absence rows from the INPUT, so the overlap stopped being
    // computed and a physically impossible plan rendered as clean.
    expect(page).toMatch(/detectConflicts\(result\.items\)/);
    expect(page).not.toMatch(/detectConflicts\(\s*visibleItems\s*\)/);
  });

  it("both the hidden and the visible partner notes are wired", () => {
    expect(page).toMatch(/hiddenConflictSources\(/);
    expect(page).toMatch(/visibleConflictPartners\(/);
  });
});
