import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * No live browser profile or session artifact may be TRACKED — audit M-06.
 *
 * WHY AN IGNORE RULE IS NOT ENOUGH
 * --------------------------------
 * `runtime/auth/` holds real Chrome profiles containing the owner's logged-in
 * session — cookies, tokens, `Local State`. `/runtime/` is already gitignored,
 * so on paper this is covered.
 *
 * It is not, because of a working convention in this repo: `runtime/audits/*.md`
 * IS tracked despite the blanket `/runtime/` ignore, which means those files were
 * added with `git add -f`. And `git add -f` bypasses EVERY ignore rule. So the
 * habitual command for this directory is exactly the command that defeats the
 * protection. One `git add -f runtime/` publishes live owner sessions — to a
 * PUBLIC repository.
 *
 * This guard is therefore keyed on what git ACTUALLY TRACKS, not on what
 * `.gitignore` says. `git ls-files` is the only source of truth for that: a
 * filesystem scan cannot tell tracked from ignored, and re-reading `.gitignore`
 * would assert the very thing `-f` overrides.
 *
 * Deterministic and offline: one `git ls-files` call, no network, no clock.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean);
}

const TRACKED = trackedFiles();

/** Directory names that only ever exist as a real browser profile. */
const PROFILE_DIRS = [
  "chrome-debug",
  "owner-chrome-profile",
  ".playwright-ia-proof-profile",
  "runtime/auth",
] as const;

/**
 * Filenames that carry credentials or session state. Anchored to a path segment
 * so ordinary source files cannot match by coincidence.
 */
const SESSION_ARTIFACTS: ReadonlyArray<RegExp> = [
  /(^|\/)Local State$/,
  /(^|\/)Secure Preferences$/,
  /(^|\/)Cookies(-journal)?$/,
  /(^|\/)Login Data(-journal)?$/,
  /(^|\/)Web Data(-journal)?$/,
  /(^|\/)\.storage-state\.json$/,
  /(^|\/)shared_proto_db\//,
];

describe("no tracked browser profiles or session artifacts (audit M-06)", () => {
  it("reads a real tracked-file list", () => {
    // Without this a broken git call would make every assertion below pass
    // vacuously — green while checking nothing.
    expect(TRACKED.length).toBeGreaterThan(500);
    expect(TRACKED).toContain("apps/web/package.json");
  });

  it("tracks no file inside a browser-profile directory", () => {
    const offenders = TRACKED.filter((f) =>
      PROFILE_DIRS.some((d) => f === d || f.startsWith(`${d}/`) || f.includes(`/${d}/`)),
    );
    expect(
      offenders,
      "these tracked files live inside a LIVE browser profile. This repo is PUBLIC — " +
        "committing them publishes the owner's session. Remove them from the index " +
        `(git rm --cached) and rotate the exposed session:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("tracks no browser session/credential artifact anywhere", () => {
    const offenders = TRACKED.filter((f) => SESSION_ARTIFACTS.some((re) => re.test(f)));
    expect(
      offenders,
      `tracked session/credential artifacts found:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * The `runtime/` exception is narrow ON PURPOSE: only human-readable audit and
   * planning markdown. If anything else appears there, the `git add -f` habit has
   * started sweeping in more than intended — which is the mechanism this whole
   * finding is about.
   */
  it("tracks only markdown under runtime/", () => {
    const offenders = TRACKED.filter((f) => f.startsWith("runtime/") && !f.endsWith(".md"));
    expect(
      offenders,
      "only markdown may be force-added under runtime/. Non-markdown here means " +
        `\`git add -f runtime/\` pulled in more than intended:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps the env files untracked", () => {
    const offenders = TRACKED.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".example"));
    expect(offenders, `tracked env files: ${offenders.join(", ")}`).toEqual([]);
  });
});
