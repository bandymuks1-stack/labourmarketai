import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * NO ORIGIN FROM THE REQUEST URL (2026-10-18 production incident).
 *
 * Behind the VPS proxy `request.url` carries the BIND host
 * (`http://0.0.0.0:3000`). The e-mail-confirmation / Google sign-in callback
 * and the logout route built their redirects from it, so a person who had just
 * registered — a referred candidate included — was sent to an unreachable
 * address, and the invitation they came from was lost on the way.
 *
 * The one rule: an origin that leaves the server (a redirect, a link, an
 * OAuth document) comes from `requestPublicOrigin` (lib/mcp/public-origin.ts),
 * which accepts the forwarded host only when it is ours. Reading the path or
 * the query of `request.url` stays fine; its origin never is.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "lib", "middleware.ts"] as const;
/** The one module allowed to read the request URL's host: it is the rule. */
const ALLOW = new Set(["lib/mcp/public-origin.ts"]);

function walk(path: string, out: string[]): void {
  const st = statSync(path);
  if (st.isFile()) {
    if (/\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path)) out.push(path);
    return;
  }
  for (const name of readdirSync(path)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    walk(join(path, name), out);
  }
}

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const d of SCAN_DIRS) walk(join(WEB_ROOT, d), out);
  return out;
}

/** Comments may name the old shape (to explain why it is gone); only code counts. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Every origin read off the request URL, by name. */
function requestUrlOriginReads(raw: string): string[] {
  const src = withoutComments(raw);
  const hits: string[] = [];
  if (/new URL\(\s*(?:request|req)\.url\s*\)\s*\.origin/.test(src)) hits.push("new URL(request.url).origin");
  if (/\b(?:request|req)\.nextUrl\.origin\b/.test(src)) hits.push("request.nextUrl.origin");
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*new URL\(\s*(?:request|req)\.url\s*\)/g)) {
    const name = m[1];
    if (new RegExp(`\\b${name}\\.(?:origin|host)\\b`).test(src)) hits.push(`${name}.origin`);
  }
  return hits;
}

describe("redirect-public-origin guard", () => {
  it("recognises the incident shapes", () => {
    expect(requestUrlOriginReads("const url = new URL(request.url);\nNextResponse.redirect(new URL('/x', url.origin))")).toEqual(["url.origin"]);
    expect(requestUrlOriginReads("const o = new URL(req.url).origin;")).toEqual(["new URL(request.url).origin"]);
    expect(requestUrlOriginReads("const q = new URL(request.url).searchParams.get('q');")).toEqual([]);
    expect(requestUrlOriginReads("/* this was `new URL(req.url).origin` */ const origin = CANONICAL_ORIGIN;")).toEqual([]);
  });

  it("no route handler or library builds an origin from the request URL", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const rel = relative(WEB_ROOT, file).split(sep).join("/");
      if (ALLOW.has(rel)) continue;
      const hits = requestUrlOriginReads(readFileSync(file, "utf8"));
      if (hits.length) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(offenders, "use requestPublicOrigin(request) from lib/mcp/public-origin.ts").toEqual([]);
  });

  it("the auth callback and logout routes use the public origin", () => {
    for (const rel of ["app/[locale]/auth/callback/route.ts", "app/[locale]/auth/logout/route.ts"]) {
      expect(readFileSync(join(WEB_ROOT, rel), "utf8"), rel).toContain("requestPublicOrigin(request)");
    }
  });
});
