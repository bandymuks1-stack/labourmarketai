/**
 * Guard — W1 ROUTE RETIREMENT.
 *
 * W1 removed 11 routes. This guard holds the properties that the individual
 * per-route guards used to hold, so that deleting a route file did not delete
 * the protection with it:
 *
 *   1. every RETIRED route still resolves — the redirect moved from a
 *      `page.tsx` to `next.config.ts`, so old links never start 404-ing;
 *   2. every retired/deleted route file is really gone (no silent revival, no
 *      competing twin of a canonical surface);
 *   3. no product code links to a removed route any more — internal links go
 *      straight to the canonical surface instead of taking a redirect hop.
 *
 * This guard is STRENGTHENED, never disabled.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalRedirects,
  isCanonicallyRedirected,
  redirectFor,
  W1_RETIRED_ROUTES,
  W1_DELETED_ROUTES,
} from "./canonical-redirects";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");

const EXPECTED: Record<string, string> = {
  "/dashboard/assistant": "/dashboard",
  "/dashboard/marketplace": "/dashboard/market-map",
  "/dashboard/player-card": "/dashboard/journal",
  "/dashboard/agency": "/dashboard/company",
  "/dashboard/agency/pool": "/dashboard/company",
  "/dashboard/start/agency": "/dashboard/start/company",
};

describe("W1 — retired routes still resolve", () => {
  it("every retired route has a canonical redirect in next.config", () => {
    for (const route of W1_RETIRED_ROUTES) {
      expect(
        isCanonicallyRedirected(route, EXPECTED[route]),
        `${route} would 404 — it must redirect to ${EXPECTED[route]}`,
      ).toBe(true);
    }
  });

  it("the redirects are permanent, and keep the locale segment", () => {
    const rs = canonicalRedirects();
    expect(rs.length).toBe(W1_RETIRED_ROUTES.length);
    for (const r of rs) {
      expect(r.permanent, `${r.source} must be a permanent (308) move`).toBe(true);
      expect(r.source.startsWith("/:locale/"), `${r.source} drops the locale`).toBe(true);
      expect(r.destination.startsWith("/:locale/"), `${r.destination} drops the locale`).toBe(true);
    }
  });

  it("destinations exist as real routes", () => {
    for (const route of W1_RETIRED_ROUTES) {
      const dest = (redirectFor(route) ?? "").split("#")[0];
      const p = join(webRoot, "app", "[locale]", ...dest.split("/").filter(Boolean), "page.tsx");
      expect(existsSync(p), `${route} redirects to ${dest}, which does not exist`).toBe(true);
    }
  });
});

describe("W1 — removed routes stay removed", () => {
  it("no retired or deleted route file exists", () => {
    for (const route of [...W1_RETIRED_ROUTES, ...W1_DELETED_ROUTES]) {
      const p = join(webRoot, "app", "[locale]", ...route.split("/").filter(Boolean), "page.tsx");
      expect(existsSync(p), `${route}/page.tsx came back`).toBe(false);
    }
  });

  it("the dev design galleries cannot render, because they no longer exist", () => {
    // Replaces the old placeholder-marker-prod assertion, which proved the same
    // property by reading the files and checking their production gate.
    expect(existsSync(join(webRoot, "app", "[locale]", "design"))).toBe(false);
  });
});

describe("W1 — nothing links to a removed route", () => {
  function walk(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
    }
    return out;
  }

  it("no product component or lib links to a retired route", () => {
    const files = [
      ...walk(join(webRoot, "components")),
      ...walk(join(webRoot, "app")),
      ...walk(join(webRoot, "lib")),
    ].filter((f) => !f.includes(join("lib", "guards")));

    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const route of W1_RETIRED_ROUTES) {
        // A link, not a comment or a redirect table entry.
        const re = new RegExp(`href=["'\`]${route}["'\`]|push\\(["'\`]${route}["'\`]`);
        if (re.test(src)) offenders.push(`${f.replace(webRoot, "")} → ${route}`);
      }
    }
    expect(
      offenders,
      `internal links must point at the canonical surface, not take a redirect hop:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
