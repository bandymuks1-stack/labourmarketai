import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");
const LOCALE_ROOT = join(APP_ROOT, "app", "[locale]");

/**
 * THE ARCHITECTURAL INVARIANT THIS GUARD KEEPS.
 *
 *   A server `redirect()` used as a pre-render access or lifecycle gate must
 *   not sit BELOW a response-committing loading/Suspense boundary.
 *
 * `loading.tsx` wraps everything below it in a Suspense boundary. A
 * `redirect()` thrown inside a Suspense boundary can no longer set an HTTP
 * status — Next has already committed a 200 — so the browser performs the
 * redirect itself after painting Next's `__next_error__` shell ("Application
 * error: a client-side exception has occurred"). The gate is still CORRECT;
 * it just announces itself as a crash and ships the refused person the very
 * page they are being refused.
 *
 * Measured twice on the local production build, 2026-09-22 / 2026-09-23:
 *   worker → `/lt/dashboard/company`  : 200, 600 627 B, whole shell (PR #1841)
 *   onboarded → `/lt/onboarding`      : 200,  60 346 B, wizard + skeleton
 * Counter-proof both times: `/lt/live-market-review`, which has no
 * `loading.tsx` above it, answers a real 307 from the same kind of page-level
 * `redirect()`.
 *
 * WHAT THIS GUARD IS NOT. It does not pin a route list — "these four routes
 * redirect" is not the invariant and would rot on the first new page. It
 * derives the boundaries from the tree and the gates from the source, and asks
 * one question per boundary: for every kind of gate that exists BELOW it, does
 * the same kind of gate also exist ABOVE it? The frames above a boundary are
 * the segment's own `layout.tsx` plus its ancestors — the last places that can
 * still answer with a real status.
 *
 * The page-level gates are deliberately NOT removed anywhere; they are the
 * authority on a soft navigation (React reuses a layout, so it does not re-run)
 * and on any request where a middleware header never arrived. This guard checks
 * only that they are not the FIRST place the decision is made.
 */

const read = (abs: string): string => readFileSync(abs, "utf8");

/** Comments out, so a file may EXPLAIN a gate without counting as one. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

const ALL_FILES = walk(LOCALE_ROOT);

/** Every response-committing boundary in the locale tree. */
const BOUNDARY_DIRS = ALL_FILES.filter(
  (f) => f.endsWith(`${sep}loading.tsx`) || f.endsWith(`${sep}template.tsx`),
).map((f) => dirname(f));

/**
 * The kinds of gate a route can perform before it renders.
 *
 * `below` is what the gate looks like in a page (or in a nested layout that is
 * itself inside the boundary). `above` is what the SAME decision looks like in
 * a frame that can still set a status — sometimes literally the same code, and
 * sometimes the form the decision takes once it is hoisted (a role gate becomes
 * a `routeRequirement` table lookup, because a layout is told the path rather
 * than calling the page's own helper).
 */
const GATE_KINDS: readonly {
  id: string;
  what: string;
  below: RegExp;
  above: RegExp;
}[] = [
  {
    id: "unauthenticated",
    what: "bounce an unauthenticated visitor to login",
    below: /if\s*\(!user\)\s*\n?\s*redirect\(|["']not_authenticated["']/,
    above: /if\s*\(!(?:user|session\.user)\)\s*redirect\(/,
  },
  {
    id: "not-onboarded",
    what: "route on whether onboarding is finished",
    below: /onboarded_at/,
    above: /onboarded_at/,
  },
  {
    id: "role",
    what: "refuse a route the held role does not reach",
    below: /requireRoleOrRedirect\(|requireSuperadmin\(/,
    above: /routeRequirement\(/,
  },
] as const;

/** `…/app/[locale]/onboarding` → `/onboarding`. */
function routeOf(dir: string): string {
  const rel = relative(LOCALE_ROOT, dir).split(sep).filter(Boolean);
  const segments = rel.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}

/** Files INSIDE the boundary: the segment's own page and everything nested,
 *  minus the segment's own layout — which is the last frame ABOVE it. */
function filesBelow(dir: string): string[] {
  const ownLayout = join(dir, "layout.tsx");
  return ALL_FILES.filter(
    (f) =>
      f.startsWith(dir + sep) &&
      (f.endsWith(`${sep}page.tsx`) || f.endsWith(`${sep}layout.tsx`)) &&
      f !== ownLayout,
  );
}

/** Frames that can still answer with a real HTTP status: the segment's own
 *  layout, then every ancestor layout up to the app root. */
function filesAbove(dir: string): string[] {
  const out: string[] = [];
  let cur = dir;
  for (;;) {
    const layout = join(cur, "layout.tsx");
    if (existsSync(layout)) out.push(layout);
    if (cur === APP_ROOT) break;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  const appLayout = join(APP_ROOT, "app", "layout.tsx");
  if (existsSync(appLayout) && !out.includes(appLayout)) out.push(appLayout);
  return out;
}

describe("Guard: the scan itself is not vacuous", () => {
  it("finds the boundaries and the files around them", () => {
    // A scan that matched nothing would make every assertion below pass while
    // proving nothing — the failure mode that makes source guards worthless.
    expect(BOUNDARY_DIRS.length).toBeGreaterThanOrEqual(3);
    for (const dir of BOUNDARY_DIRS) {
      expect(filesBelow(dir).length, `${routeOf(dir)}: nothing below`).toBeGreaterThan(0);
      expect(filesAbove(dir).length, `${routeOf(dir)}: nothing above`).toBeGreaterThan(0);
    }
  });

  it("detects at least one real gate below each boundary", () => {
    for (const dir of BOUNDARY_DIRS) {
      const below = filesBelow(dir).map((f) => code(read(f))).join("\n");
      const kinds = GATE_KINDS.filter((k) => k.below.test(below)).map((k) => k.id);
      expect(
        kinds.length,
        `${routeOf(dir)}: the gate patterns matched nothing below the boundary — ` +
          "either the tree moved or a pattern rotted, and the assertions below " +
          "would then be checking nothing",
      ).toBeGreaterThan(0);
    }
  });

  it("the dashboard boundary exercises every gate kind (the known-good case)", () => {
    // PR #1841 put all three above the dashboard boundary. If this stops
    // holding, the patterns have drifted away from the code they describe.
    const dir = BOUNDARY_DIRS.find((d) => routeOf(d) === "/dashboard");
    expect(dir, "the /dashboard boundary disappeared").toBeTruthy();
    const below = filesBelow(dir!).map((f) => code(read(f))).join("\n");
    const above = filesAbove(dir!).map((f) => code(read(f))).join("\n");
    for (const kind of GATE_KINDS) {
      expect(kind.below.test(below), `below /dashboard: ${kind.id}`).toBe(true);
      expect(kind.above.test(above), `above /dashboard: ${kind.id}`).toBe(true);
    }
  });
});

describe("Guard: every pre-render gate is decided ABOVE its Suspense boundary", () => {
  it("no boundary streams a 200 where a gate should have set a status", () => {
    const violations: string[] = [];
    for (const dir of BOUNDARY_DIRS) {
      const route = routeOf(dir);
      const below = filesBelow(dir).map((f) => code(read(f))).join("\n");
      const above = filesAbove(dir).map((f) => code(read(f))).join("\n");
      for (const kind of GATE_KINDS) {
        if (!kind.below.test(below)) continue;
        if (kind.above.test(above)) continue;
        violations.push(
          `${route}: a gate that would ${kind.what} (${kind.id}) runs only ` +
            `BELOW ${route}/loading.tsx. A redirect() there cannot set an HTTP ` +
            `status — it becomes a 200 that streams the page to the person ` +
            `being turned away, then redirects on the client behind Next's ` +
            `"Application error" shell. Decide it in ${route}/layout.tsx (or an ` +
            `ancestor layout), which is the last frame above the boundary. ` +
            `Do not delete ${route}/loading.tsx to satisfy this.`,
        );
      }
    }
    expect(violations, violations.join("\n\n")).toEqual([]);
  });
});
