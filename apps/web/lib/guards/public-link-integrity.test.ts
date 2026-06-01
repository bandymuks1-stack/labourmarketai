import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, sep } from "node:path";

/**
 * Source-level guard for Public Link Integrity v1.
 *
 * Every internal link a visitor can click in the public marketing surfaces
 * (site nav, site footer, marketing pages + components) must resolve to a real
 * Next.js route. This guard derives the real route set from the filesystem
 * (app/[locale]/**\/page.tsx, route groups stripped) and matches every
 * extracted href against it — so a link to a missing page, a dead `href="#"`,
 * or a locale-prefixed path (which breaks the locale-aware <Link>) all fail.
 *
 * It is filesystem-driven, not an allowlist: adding a route is free; adding a
 * link to a route that does not exist is what breaks the build. Runs in CI via
 * `pnpm -F web test`.
 *
 * External (http...), mailto:, tel:, and real in-page anchors (e.g.
 * #main-content) are out of scope; a BARE `href="#"` / `href=""` is treated as
 * a dead CTA and forbidden.
 */

const APP_ROOT = join(__dirname, "..", "..");
const LOCALE_ROOT = join("app", "[locale]");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

function walk(absDir: string, match: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const e of readdirSync(absDir, { withFileTypes: true })) {
    const p = join(absDir, e.name);
    if (e.isDirectory()) out.push(...walk(p, match));
    else if (match(e.name)) out.push(p);
  }
  return out;
}

// ---- Real route set, derived from the app router filesystem ----
function deriveRoutes(): { staticRoutes: Set<string>; dynamic: string[][] } {
  const absLocale = join(APP_ROOT, LOCALE_ROOT);
  const pageFiles = walk(absLocale, (n) => n === "page.tsx");
  const routes = new Set<string>();
  for (const file of pageFiles) {
    let r = file
      .slice(join(APP_ROOT, LOCALE_ROOT).length)
      .split(sep)
      .join("/")
      .replace(/\/page\.tsx$/, "");
    // Drop route-group segments like (marketing) — they don't appear in the URL.
    r = r
      .split("/")
      .filter((seg) => seg && !/^\(.*\)$/.test(seg))
      .join("/");
    routes.add(r === "" ? "/" : "/" + r.replace(/^\//, ""));
  }
  const staticRoutes = new Set([...routes].filter((r) => !r.includes("[")));
  const dynamic = [...routes]
    .filter((r) => r.includes("["))
    .map((r) => r.split("/"));
  return { staticRoutes, dynamic };
}

const { staticRoutes, dynamic } = deriveRoutes();

function routeExists(href: string): boolean {
  const h = href.replace(/[?#].*$/, "").replace(/(.)\/$/, "$1") || "/";
  if (staticRoutes.has(h)) return true;
  const segs = h.split("/");
  return dynamic.some(
    (d) =>
      d.length === segs.length &&
      d.every((s, i) => /^\[.*\]$/.test(s) || s === segs[i]),
  );
}

// ---- Public surfaces whose links must resolve ----
const PUBLIC_SURFACE_FILES: string[] = [
  "components/layouts/site-nav.tsx",
  "components/layouts/site-footer.tsx",
  ...readdirSync(join(APP_ROOT, "components", "marketing"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `components/marketing/${f}`),
  ...walk(join(APP_ROOT, LOCALE_ROOT, "(marketing)"), (n) => n.endsWith(".tsx"))
    .map((p) => p.slice(APP_ROOT.length + 1).split(sep).join("/")),
].filter((rel) => existsSync(join(APP_ROOT, rel)));

// Matches both JSX `href="/x"` and array-literal `href: "/x"` (incl. template
// literals). Only internal paths (leading "/"); externals/mailto are skipped.
const INTERNAL_HREF = /href[:=]\s*["'`](\/[^"'`{]*)["'`]/g;
const HASH_OR_EMPTY = /href=["'`](#[^"'`]*|)["'`]/g;
const LOCALE_PREFIX = /^\/(lt|en|de|pl|lv|et|nl|no|da|sv)(\/|$)/;

function collectHrefs() {
  const internal = new Set<string>();
  const bareHashOrEmpty: { file: string; raw: string }[] = [];
  for (const rel of PUBLIC_SURFACE_FILES) {
    const src = read(rel);
    let m: RegExpExecArray | null;
    INTERNAL_HREF.lastIndex = 0;
    while ((m = INTERNAL_HREF.exec(src))) internal.add(m[1]);
    HASH_OR_EMPTY.lastIndex = 0;
    while ((m = HASH_OR_EMPTY.exec(src))) {
      const val = m[1];
      // A real in-page anchor (#something) is fine; bare "#" or "" is a dead CTA.
      if (val === "" || val === "#") bareHashOrEmpty.push({ file: rel, raw: val });
    }
  }
  return { internal: [...internal], bareHashOrEmpty };
}

const { internal, bareHashOrEmpty } = collectHrefs();

describe("Guard: public marketing/nav/footer links resolve to real routes", () => {
  it("derived a non-trivial route set + link set (guard is not a no-op)", () => {
    expect(staticRoutes.size).toBeGreaterThan(10);
    expect(internal.length).toBeGreaterThanOrEqual(8);
  });

  for (const href of internal) {
    it(`href "${href}" resolves to a real route`, () => {
      expect(
        routeExists(href),
        `Dead link "${href}" — no app/[locale] route. Add the route or fix the link.`,
      ).toBe(true);
    });
  }

  it("the core footer/nav routes are still linked (no silent disappearance)", () => {
    for (const required of [
      "/",
      "/pricing",
      "/for-workers",
      "/for-companies",
      "/for-agencies",
      "/legal/terms",
      "/legal/privacy",
      "/legal/cookies",
    ]) {
      expect(internal, `public surfaces no longer link to ${required}`).toContain(
        required,
      );
    }
  });
});

describe("Guard: no dead CTAs or locale-drift in public links", () => {
  it('has no bare href="#" or href="" dead CTA', () => {
    expect(
      bareHashOrEmpty,
      `Dead CTA(s): ${bareHashOrEmpty.map((b) => `${b.file} href="${b.raw}"`).join(", ")}`,
    ).toEqual([]);
  });

  it("has no locale-prefixed hrefs (the locale-aware <Link> adds the prefix)", () => {
    const drifted = internal.filter((h) => LOCALE_PREFIX.test(h));
    expect(
      drifted,
      `Locale-prefixed link(s) ${drifted.join(", ")} — use locale-relative paths with @/lib/i18n/navigation Link.`,
    ).toEqual([]);
  });
});
