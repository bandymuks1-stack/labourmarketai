import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDirectChild, keepReason, markOwner, OWNER_FILE, pruneAbandonedVitestTmpDirs, vitestTmpOwnership } from "./vitest-tmp-ownership";

const HOUR = 60 * 60 * 1000;
// A pid far above any real one stands in for a run that has exited.
const DEAD_PID = 2147483646;
let root: string;

function runDir(name: string, opts: { owner?: number; children?: string[]; ageMs?: number } = {}): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const child of opts.children ?? ["ssr"]) mkdirSync(join(dir, child), { recursive: true });
  if (opts.owner !== undefined) writeFileSync(join(dir, OWNER_FILE), String(opts.owner));
  const when = new Date(Date.now() - (opts.ageMs ?? 2 * HOUR));
  utimesSync(dir, when, when);
  return dir;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "vitest-tmp-ownership-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("pruneAbandonedVitestTmpDirs", () => {
  it("removes a run directory whose owner process has exited", () => {
    const abandoned = runDir("7F9564ibSh7Hua0My-QTH", { owner: DEAD_PID });
    expect(pruneAbandonedVitestTmpDirs(root)).toEqual([abandoned]);
    expect(existsSync(abandoned)).toBe(false);
  });

  it("keeps a run directory whose owner is still running, however old", () => {
    const live = runDir("3TnOc9peg8LzN4UbHbaZp", { owner: process.pid, ageMs: 30 * 24 * HOUR });
    expect(pruneAbandonedVitestTmpDirs(root)).toEqual([]);
    expect(keepReason(live, Date.now(), root)).toBe("owner alive");
  });

  it("never removes a directory without our owner marker, however old", () => {
    const legacy = runDir("66GxGKwCo6GsWmO27x6VE", { ageMs: 30 * 24 * HOUR });
    expect(pruneAbandonedVitestTmpDirs(root)).toEqual([]);
    expect(keepReason(legacy, Date.now(), root)).toBe("no owner marker");
  });

  it("never removes a directory holding anything besides Vitest caches", () => {
    const mixed = runDir("71wSSR7_kik4YtHtot1mw", { owner: DEAD_PID, children: ["ssr", "approvals"] });
    expect(pruneAbandonedVitestTmpDirs(root)).toEqual([]);
    expect(keepReason(mixed, Date.now(), root)).toBe("foreign content");
  });

  it("keeps a directory that is too new to judge", () => {
    const fresh = runDir("3udvz2Rn59A_SVGD7pZXB", { owner: DEAD_PID, ageMs: 60 * 1000 });
    expect(pruneAbandonedVitestTmpDirs(root)).toEqual([]);
    expect(keepReason(fresh, Date.now(), root)).toBe("too new");
  });

  it("never follows or removes a junction, and leaves its target intact", () => {
    const target = join(root, "elsewhere");
    mkdirSync(join(target, "ssr"), { recursive: true });
    writeFileSync(join(target, OWNER_FILE), String(DEAD_PID));
    writeFileSync(join(target, "ssr", "precious"), "keep");
    const link = join(root, "9tz_l8QXD2qf5psZ3q90C");
    symlinkSync(target, link, "junction");

    expect(pruneAbandonedVitestTmpDirs(root)).toEqual([]);
    expect(keepReason(link, Date.now() + 2 * HOUR, root)).toBe("not a real directory");
    expect(readFileSync(join(target, "ssr", "precious"), "utf8")).toBe("keep");
  });

  it("ignores names that are not Vitest ids", () => {
    runDir("playwright-profile-1", { owner: DEAD_PID });
    expect(pruneAbandonedVitestTmpDirs(root)).toEqual([]);
  });

  it("is a no-op when the temp root is missing", () => {
    expect(pruneAbandonedVitestTmpDirs(join(root, "missing"))).toEqual([]);
  });
});

describe("isDirectChild", () => {
  it("matches Vitest's forward-slash run dir against the OS temp root", () => {
    const forward = join(root, "NoH04ZAo8Uth33FgNyRGf").split("\\").join("/");
    expect(isDirectChild(forward, root)).toBe(true);
    expect(isDirectChild(join(root, "a", "NoH04ZAo8Uth33FgNyRGf"), root)).toBe(false);
  });
});

describe("vitestTmpOwnership plugin", () => {
  type Hook = (ctx: { project: { tmpDir: string }; vitest: object }) => void;

  it("marks every project's own temp dir and prunes abandoned runs once", () => {
    const abandoned = runDir("7F9564ibSh7Hua0My-QTH", { owner: DEAD_PID });
    const plugin = vitestTmpOwnership({ root });
    const hook = plugin.configureVitest as unknown as Hook;
    const guards = join(root, "guardsProjectTmpDir01");
    const unit = join(root, "unitProjectTmpDir0001");

    hook({ project: { tmpDir: guards }, vitest: {} });
    hook({ project: { tmpDir: unit }, vitest: {} });

    expect(readFileSync(join(guards, OWNER_FILE), "utf8")).toBe(String(process.pid));
    expect(readFileSync(join(unit, OWNER_FILE), "utf8")).toBe(String(process.pid));
    expect(existsSync(abandoned)).toBe(false);
  });

  it("never marks a project dir outside the temp root", () => {
    const hook = vitestTmpOwnership({ root }).configureVitest as unknown as Hook;
    const nested = join(root, "nested", "aaaaaaaaaaaaaaaaaaaaa");
    hook({ project: { tmpDir: nested }, vitest: {} });
    expect(existsSync(nested)).toBe(false);
  });
});

describe("markOwner", () => {
  it("creates the run directory if needed and records the pid", () => {
    const dir = join(root, "aaaaaaaaaaaaaaaaaaaaa");
    markOwner(dir, 4242);
    expect(readFileSync(join(dir, OWNER_FILE), "utf8")).toBe("4242");
  });
});
