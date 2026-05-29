import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PRIMARY_ROUTES,
  blockingFindings,
  scanPrimaryRouteSmoke,
  type Finding,
} from "./primary-route-smoke";

/**
 * Primary route smoke / dead-UI QA guard.
 *
 * Locks in the PR #121 / #125 product-honesty wins. Fails `pnpm -F web test`
 * if any of these regressions return to a primary route:
 *   - a dead link / dead CTA (`href="#"`, empty `href=""`)
 *   - a user-visible placeholder leak (lorem ipsum, untranslated `[XX]` tag)
 *   - a renamed/deleted primary route page
 *
 * The same scan powers the owner-facing report via
 * `pnpm -F web check:primary-route-smoke`.
 */

// lib/guards -> apps/web
const webRoot = resolve(__dirname, "..", "..");
const report = scanPrimaryRouteSmoke(webRoot);

function format(findings: readonly Finding[]): string {
  if (findings.length === 0) return "(none)";
  return findings
    .map((f) => `  [${f.category}] ${f.file}:${f.line} — ${f.evidence} :: ${f.why}`)
    .join("\n");
}

describe("primary route inventory", () => {
  it("is non-empty and has unique ids", () => {
    expect(PRIMARY_ROUTES.length).toBeGreaterThan(0);
    const ids = PRIMARY_ROUTES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const route of PRIMARY_ROUTES) {
    it(`route "${route.id}" (${route.urlPattern}) source exists`, () => {
      expect(existsSync(resolve(webRoot, route.sourceFile))).toBe(true);
    });
  }
});

describe("dead-link / dead-CTA guard", () => {
  it("has no bare `#` or empty href in the UI source tree", () => {
    const dead = report.findings.filter((f) => f.category === "dead-link");
    expect(dead, `\nDead links found:\n${format(dead)}`).toEqual([]);
  });
});

describe("user-visible copy leak guard", () => {
  it("has no lorem-ipsum / untranslated locale-tag leak in primary-locale copy", () => {
    const leaks = report.findings.filter((f) => f.category === "copy-leak");
    expect(leaks, `\nCopy leaks found:\n${format(leaks)}`).toEqual([]);
  });
});

describe("primary route smoke — overall gate", () => {
  it("produces zero blocking findings at the current baseline", () => {
    const blocking = blockingFindings(report);
    expect(blocking, `\nBlocking findings:\n${format(blocking)}`).toEqual([]);
  });
});
