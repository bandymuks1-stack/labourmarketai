import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Next.js SECURITY VERSION FLOOR guard — security audit finding H-01 / P1-1.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The 2026-07-27 read-only security audit found the single HIGH finding:
 * `next@15.5.18` shipped with 8 known advisories, patched in `15.5.21`. The most
 * directly applicable one is CVE-2026-64643 — "unauthenticated disclosure of
 * internal Server Function endpoints" — which matters here because this app has
 * ~105 server-action files. Also in that set: CVE-2026-64641 (DoS via Server
 * Actions), CVE-2026-64645 / CVE-2026-64649 (SSRF), CVE-2026-64646 (unbounded
 * Server Action payload on Edge), CVE-2026-64647 / CVE-2026-64648 (cache
 * confusion), CVE-2026-64644 (DoS via image-optimization SVG).
 *
 * A version bump is not a control. Without a gate, the next `pnpm install`,
 * lockfile conflict resolution, or a well-meaning "pin it back for
 * reproducibility" silently reintroduces the whole advisory set. This guard is
 * the control.
 *
 * WHY IT READS THE LOCKFILE AND NOT ONLY package.json
 * ---------------------------------------------------
 * `package.json` states an INTENT; the lockfile states what is actually
 * installed. Those can disagree, and only the second one ships. A guard that
 * trusted `package.json` alone could be satisfied by a one-line edit while the
 * resolved tree stayed on a vulnerable version — so both are asserted, and the
 * lockfile assertion covers EVERY resolved `next@x.y.z` identifier it finds,
 * not just the first.
 *
 * DETERMINISTIC + OFFLINE. It reads two files from the repo and compares
 * integers. No network, no registry call, no clock, no environment dependence —
 * so it behaves identically on a developer machine and on a CI runner.
 *
 * RAISING THE FLOOR IS A DELIBERATE ACT. When a future advisory lands, bump
 * MIN_NEXT_VERSION here in the same commit as the dependency bump.
 */

/** Minimum patched Next.js version. Audit H-01: advisories fixed in 15.5.21. */
const MIN_NEXT_VERSION = "15.5.21";

const WEB_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(WEB_ROOT, "..", "..");

const webPackageJson = JSON.parse(
  readFileSync(join(WEB_ROOT, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const lockfile = readFileSync(join(REPO_ROOT, "pnpm-lock.yaml"), "utf8");

type Semver = readonly [number, number, number];

/** Parse a bare `x.y.z`. Returns null for anything else (ranges, tags, canaries). */
function parseExact(version: string): Semver | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])] as const;
}

/** -1 | 0 | 1 — numeric compare, so 15.5.9 < 15.5.21 (a string compare gets this wrong). */
function compare(a: Semver, b: Semver): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

const FLOOR = parseExact(MIN_NEXT_VERSION)!;

function isBelowFloor(version: Semver): boolean {
  return compare(version, FLOOR) < 0;
}

function explain(what: string, found: string): string {
  return [
    `${what} resolves to Next.js ${found}, which is BELOW the security floor ${MIN_NEXT_VERSION}.`,
    `  detected:        ${found}`,
    `  minimum allowed: ${MIN_NEXT_VERSION}`,
    "",
    "This is security audit finding H-01 / P1-1. Next.js < 15.5.21 carries 8 known",
    "advisories, including CVE-2026-64643 (unauthenticated disclosure of internal",
    "Server Function endpoints) — directly relevant to this app's server actions.",
    "",
    "Fix: set `next` (and `eslint-config-next`) to >= 15.5.21 in apps/web/package.json,",
    "then run `pnpm install` so pnpm-lock.yaml is regenerated. Do NOT pin back.",
  ].join("\n");
}

/**
 * Every resolved `next@x.y.z` identifier in the lockfile.
 *
 * The lookbehind is load-bearing: without `(?<![\w-])`, the substring `next@…`
 * inside `eslint-config-next@15.5.22` would be collected as if it were the
 * `next` package itself, and a stale `eslint-config-next` pin would be reported
 * as a vulnerable framework. `@next/env@…` is naturally excluded (it reads
 * `next/env@`, not `next@`).
 */
function resolvedNextVersionsInLock(): string[] {
  const found = new Set<string>();
  for (const m of lockfile.matchAll(/(?<![\w-])next@(\d+\.\d+\.\d+)/g)) {
    found.add(m[1]);
  }
  return [...found].sort();
}

describe("Next.js security version floor (audit H-01 / P1-1)", () => {
  it("declares `next` as an exact version at or above the floor", () => {
    const declared = webPackageJson.dependencies?.next;
    expect(declared, "apps/web/package.json must declare a `next` dependency").toBeTruthy();

    const parsed = parseExact(declared!);
    expect(
      parsed,
      `\`next\` must be pinned to an exact x.y.z version (found "${declared}"). ` +
        "A range would let an install drift below the security floor.",
    ).not.toBeNull();

    expect(isBelowFloor(parsed!), explain("apps/web/package.json `next`", declared!)).toBe(
      false,
    );
  });

  it("declares `eslint-config-next` at or above the floor, in lockstep with `next`", () => {
    const declared = webPackageJson.devDependencies?.["eslint-config-next"];
    expect(declared, "apps/web/package.json must declare `eslint-config-next`").toBeTruthy();

    const parsed = parseExact(declared!);
    expect(
      parsed,
      `\`eslint-config-next\` must be pinned to an exact x.y.z version (found "${declared}").`,
    ).not.toBeNull();

    expect(
      isBelowFloor(parsed!),
      explain("apps/web/package.json `eslint-config-next`", declared!),
    ).toBe(false);

    // Lockstep: these two ship as a matched pair upstream. Drift between them is
    // how a "partial" bump leaves the lint rules describing a different Next.
    expect(
      declared,
      `\`eslint-config-next\` (${declared}) must match \`next\` ` +
        `(${webPackageJson.dependencies?.next}).`,
    ).toBe(webPackageJson.dependencies?.next);
  });

  /**
   * The bypass-proof half. package.json is intent; the lockfile is what installs.
   * This fails even if package.json was edited to look compliant.
   */
  it("resolves EVERY `next` entry in pnpm-lock.yaml at or above the floor", () => {
    const resolved = resolvedNextVersionsInLock();
    expect(
      resolved.length,
      "no resolved `next@x.y.z` identifier found in pnpm-lock.yaml — " +
        "the lockfile shape changed and this guard can no longer see the real version",
    ).toBeGreaterThan(0);

    const offenders = resolved.filter((v) => isBelowFloor(parseExact(v)!));
    expect(
      offenders,
      explain(`pnpm-lock.yaml (resolved: ${resolved.join(", ")})`, offenders.join(", ")),
    ).toEqual([]);
  });

  it("keeps the declared `next` and the locked `next` in agreement", () => {
    const declared = webPackageJson.dependencies?.next;
    const resolved = resolvedNextVersionsInLock();
    expect(
      resolved,
      `apps/web/package.json declares next@${declared} but pnpm-lock.yaml resolves ` +
        `[${resolved.join(", ")}]. Run \`pnpm install\` so the lockfile matches, ` +
        "otherwise the audited version is not the shipped version.",
    ).toEqual([declared]);
  });
});
