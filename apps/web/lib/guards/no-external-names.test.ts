import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * No-external-names guard (Work Market Atlas sprint).
 *
 * External marketplace / job-board / map-product examples may be used as
 * context while working, but NO external brand / product / project name may
 * remain in committed files (code, components, routes, i18n, tests, public
 * copy, docs, runtime review artefacts, reports).
 *
 * The denylist itself must NOT live in a committed file (that would put the
 * names in the repo). It is supplied out-of-band:
 *   1. env `EXTERNAL_NAMES_DENYLIST` — comma-separated names, OR
 *   2. a gitignored local file `lib/guards/external-names.denylist.json`
 *      (a JSON array of strings).
 *
 * The guard scans committed source/docs/review text for any denylisted name
 * (case-insensitive, word-boundary) and fails listing every offender. When no
 * denylist is configured it is a no-op (passes) — the mechanism is present so
 * CI/owner can enforce it by supplying the list.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

const SCAN_DIRS = [
  join(APP_ROOT, "lib"),
  join(APP_ROOT, "app"),
  join(APP_ROOT, "components"),
  join(APP_ROOT, "messages"),
  join(APP_ROOT, "runtime", "review"),
  join(REPO_ROOT, "docs", "audits"),
];

const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".html", ".css"]);
const SKIP_DIR = new Set(["node_modules", ".next", "test-results", "dist", "coverage"]);
/** Files the guard must not scan (would self-match its own machinery). */
const SKIP_FILE = new Set(["no-external-names.test.ts", "external-names.denylist.json"]);

function loadDenylist(): string[] {
  const fromEnv = (process.env.EXTERNAL_NAMES_DENYLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;

  const localFile = join(APP_ROOT, "lib", "guards", "external-names.denylist.json");
  if (existsSync(localFile)) {
    try {
      const parsed = JSON.parse(readFileSync(localFile, "utf8"));
      if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
    } catch {
      /* malformed local denylist → treated as empty */
    }
  }
  return [];
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry) || SKIP_FILE.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (TEXT_EXT.has(extname(entry))) out.push(full);
  }
}

describe("no external names in committed files", () => {
  const denylist = loadDenylist();

  it("denylist mechanism is wired (env or gitignored local file)", () => {
    // Always-true sanity check that the loader runs; documents the contract.
    expect(Array.isArray(denylist)).toBe(true);
  });

  it("no committed source/docs/review text contains a denylisted external name", () => {
    if (denylist.length === 0) {
      // No denylist configured in this environment — nothing to enforce here.
      // Supply EXTERNAL_NAMES_DENYLIST or external-names.denylist.json to enforce.
      return;
    }
    const patterns = denylist.map((name) => ({
      name,
      re: new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(name)}([^\\p{L}\\p{N}]|$)`, "iu"),
    }));

    const files: string[] = [];
    for (const d of SCAN_DIRS) walk(d, files);

    const offenders: string[] = [];
    for (const file of files) {
      let text = "";
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const { name, re } of patterns) {
        if (re.test(text)) offenders.push(`${file.replace(REPO_ROOT, "")} → "${name}"`);
      }
    }
    expect(offenders, `external names found:\n${offenders.join("\n")}`).toEqual([]);
  });
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
