import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Route-link integrity. Every internal link must point at a real route. The
 * real rooms live under `/dashboard/*` — a top-level `/account`, `/profile`,
 * `/buyer`, … would 404. Also bans dead `href="#"`. This catches drift where a
 * link is written without the `/dashboard` prefix or to a route that was never
 * created.
 */

const webRoot = join(__dirname, "..", "..");
const appRoot = join(webRoot, "app", "[locale]");

/** Recursively collect every .tsx under a dir. */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) tsxFiles(p, out);
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const SOURCE_FILES = [
  ...tsxFiles(join(webRoot, "app")),
  ...tsxFiles(join(webRoot, "components")),
];

/** Static internal hrefs (string literals only — template literals are dynamic). */
function staticHrefs(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/href="(\/[^"]*)"/g)) out.push(m[1]);
  return out;
}

/** Does a concrete /dashboard/... path resolve to a real page.tsx? */
function dashboardRouteExists(path: string): boolean {
  const clean = path.split("?")[0].split("#")[0].replace(/\/$/, "");
  return existsSync(join(appRoot, clean, "page.tsx"));
}

// Top-level paths that look like rooms but are NOT real top-level routes —
// they must be addressed under /dashboard/*.
const ROOM_SEGMENTS = [
  "account",
  "profile",
  "buyer",
  "company",
  "agency",
  "journal",
  "inbox",
];

describe("no dead links anywhere", () => {
  it("no empty href=\"#\" in any source file (in-page anchors like #main-content are fine)", () => {
    // Only the truly-empty anchor is a dead link; href="#section" is valid.
    const DEAD = /href=(["'])#\1|href=\{\s*["']#["']\s*\}/;
    const offenders: string[] = [];
    for (const f of SOURCE_FILES) {
      if (DEAD.test(readFileSync(f, "utf8"))) offenders.push(f);
    }
    expect(offenders, `dead href="#" in: ${offenders.join(", ")}`).toHaveLength(0);
  });
});

describe("rooms are linked under /dashboard, never as a bare top-level path", () => {
  it("no internal link targets a bare /account, /profile, /buyer, … room path", () => {
    const offenders: string[] = [];
    for (const f of SOURCE_FILES) {
      for (const href of staticHrefs(readFileSync(f, "utf8"))) {
        const seg = href.split("/")[1];
        if (ROOM_SEGMENTS.includes(seg)) offenders.push(`${href} (${f})`);
      }
    }
    expect(offenders, `bare room links: ${offenders.join(", ")}`).toHaveLength(0);
  });
});

describe("every /dashboard/* link resolves to a real route", () => {
  it("no internal /dashboard link points at a nonexistent page", () => {
    const broken: string[] = [];
    for (const f of SOURCE_FILES) {
      for (const href of staticHrefs(readFileSync(f, "utf8"))) {
        if (!href.startsWith("/dashboard")) continue;
        if (!dashboardRouteExists(href)) broken.push(`${href} (${f})`);
      }
    }
    expect(broken, `broken /dashboard links: ${broken.join(", ")}`).toHaveLength(0);
  });
});
