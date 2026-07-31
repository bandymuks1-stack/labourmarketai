import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * W3 rows 19/14 — RETURN TO THE CANONICAL WORKSPACE, and the stale-door ratchet.
 *
 * The audit found the "return to chat" behavior already exists as ONE
 * primitive: the primary navigation's home entry (`/dashboard`), mounted in
 * the dashboard LAYOUT — every detail route carries it on desktop and mobile.
 * No new return component is owed. What the audit DID find was a stale door:
 * the work-log flow's `no-context` blocked state linked `/dashboard/advanced`.
 *
 * These guards pin the two facts that keep that state from regressing:
 *
 *   1. THE RATCHET — no source file may add a live `"/dashboard/advanced"`
 *      href except the allowlisted survivors: the route's own directory, the
 *      admin-only account-menu escape hatch, and the surface registry entry
 *      (both of which die WITH the route). A new entry here must shrink, not
 *      grow.
 *
 *   2. The work-log `no-context` CTA points at the spaces hub
 *      (`/dashboard/start`), where a work context is actually established.
 */

const ROOT = join(__dirname, "..", "..");

/** Files allowed to carry the QUOTED live literal "/dashboard/advanced".
 *  Everything here is deleted or rewritten in the same commit that deletes
 *  the route — the allowlist is the countdown, not a permission. */
const ADVANCED_HREF_ALLOWLIST = new Set([
  // The route's own segment.
  "app/[locale]/dashboard/advanced/page.tsx",
  // Admin-only escape hatch (owner audit §4.4) — dies with the route.
  "components/app/account-menu.tsx",
  // Product-gate registry entry — "documented module escape hatch".
  "lib/product-gate/surface-registry.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".turbo") continue;
      walk(p, out);
    } else if (
      (p.endsWith(".ts") || p.endsWith(".tsx")) &&
      !p.endsWith(".test.ts")
    ) {
      out.push(p);
    }
  }
  return out;
}

describe("W3 rows 19/14 — return to workspace + the advanced-door ratchet", () => {
  it("no live href to /dashboard/advanced outside the allowlisted survivors", () => {
    const offenders = ["app", "components", "lib"]
      .flatMap((d) => walk(join(ROOT, d)))
      .filter((p) => {
        const src = readFileSync(p, "utf8");
        // The QUOTED literal — comments reference the route in backticks or
        // prose and are not doors.
        return src.includes(`"/dashboard/advanced"`);
      })
      .map((p) => relative(ROOT, p).replaceAll("\\", "/"))
      .filter((p) => !ADVANCED_HREF_ALLOWLIST.has(p))
      .sort();
    expect(offenders).toEqual([]);
  });

  it("the work-log no-context CTA opens the spaces hub, not the dying dashboard", () => {
    const src = readFileSync(
      join(ROOT, "components", "app", "conversation", "worker-worklog-flow.tsx"),
      "utf8",
    );
    expect(src).toContain(`href="/dashboard/start"`);
    expect(src).not.toContain(`"/dashboard/advanced"`);
  });

  it("the canonical return primitive exists: the layout nav's home entry", () => {
    // bottom-nav is the mobile return; dashboard-chrome is the desktop one.
    // Both live in the LAYOUT chain, not on any single route.
    const bottomNav = readFileSync(
      join(ROOT, "components", "app", "bottom-nav.tsx"),
      "utf8",
    );
    expect(bottomNav).toMatch(/"\/dashboard"/);
  });
});
