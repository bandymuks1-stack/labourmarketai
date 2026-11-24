// Mark each Vitest run's temp directory with its owner and remove the ones
// whose owner is gone.
//
// Vitest 4 keeps every run's module-runner cache in %TEMP%\<21-char id>\ and
// deletes it only on a clean close. An agent command that hits a timeout kills
// vitest first, so the directory stays; on the owner PC that left ~141k of them.
//
// Age alone does not prove a directory is abandoned, so nothing is removed on
// age. A run writes its pid into its own directory (owner.pid) at startup; a
// later run removes a directory only when ALL of these hold:
//   - the name is Vitest's 21-char id and the entry is a real directory,
//     never a junction or symlink;
//   - it contains nothing but owner.pid and Vitest environment caches;
//   - the recorded owner process is no longer running;
//   - it is more than an hour old (no race with a run that is starting);
//   - its resolved path is a direct child of the temp root.
// Directories without our marker (another tool's, or Vitest's from before this
// change) are never touched; those older leftovers need a one-off cleanup.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { Plugin } from "vitest/config";

export const OWNER_FILE = "owner.pid";
const NANOID_NAME = /^[A-Za-z0-9_-]{21}$/;
const VITEST_ENV_DIRS = new Set(["ssr", "client", "web"]);
const MIN_AGE_MS = 60 * 60 * 1000;

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readOwnerPid(dir: string): number | null {
  try {
    const pid = Number.parseInt(readFileSync(join(dir, OWNER_FILE), "utf8").trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** Why a directory must be kept, or null when it is provably abandoned. */
export function keepReason(dir: string, nowMs: number, root: string): string | null {
  const name = basename(dir);
  if (!NANOID_NAME.test(name)) return "not a vitest id";
  let stat;
  try {
    stat = lstatSync(dir);
  } catch {
    return "unreadable";
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) return "not a real directory";
  if (nowMs - stat.mtimeMs < MIN_AGE_MS) return "too new";
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return "unreadable";
  }
  if (!entries.includes(OWNER_FILE)) return "no owner marker";
  if (!entries.every((entry) => entry === OWNER_FILE || VITEST_ENV_DIRS.has(entry))) return "foreign content";
  const pid = readOwnerPid(dir);
  if (pid === null) return "unreadable owner";
  if (isPidAlive(pid)) return "owner alive";
  try {
    if (!isDirectChild(realpathSync(dir), realpathSync(root))) return "outside temp root";
  } catch {
    return "unresolvable";
  }
  return null;
}

export function pruneAbandonedVitestTmpDirs(root = tmpdir(), nowMs = Date.now()): string[] {
  const removed: string[] = [];
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return removed;
  }
  for (const name of names) {
    if (!NANOID_NAME.test(name)) continue;
    const dir = join(root, name);
    if (keepReason(dir, nowMs, root) !== null) continue;
    try {
      // rmSync unlinks links instead of following them.
      rmSync(dir, { recursive: true, force: true, maxRetries: 2 });
      removed.push(dir);
    } catch {
      // Locked: the next run tries again.
    }
  }
  return removed;
}

/** True when `dir` sits directly in `root`, whatever the separators or (on Windows) the case. */
export function isDirectChild(dir: string, root: string): boolean {
  const norm = (p: string) => (process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p));
  return norm(dirname(dir)) === norm(root);
}

export function markOwner(dir: string, pid = process.pid): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, OWNER_FILE), String(pid));
}

/**
 * Vite plugin. Vitest calls `configureVitest` once per project; each project
 * (this config has `guards` and `unit`) writes its module cache to its own
 * public `project.tmpDir`, so every one of them is marked. The prune runs once
 * per Vitest start. `root` exists only so tests can use an isolated temp root.
 */
export function vitestTmpOwnership(options: { root?: string } = {}): Plugin {
  const root = options.root ?? tmpdir();
  let pruned = false;
  return {
    name: "labourmarket:vitest-tmp-ownership",
    configureVitest({ project }) {
      const projectTmpDir: unknown = project?.tmpDir;
      if (typeof projectTmpDir === "string" && isDirectChild(projectTmpDir, root)) {
        try {
          markOwner(projectTmpDir);
        } catch {
          // Unmarked means never pruned; the run itself is unaffected.
        }
      }
      if (pruned) return;
      pruned = true;
      pruneAbandonedVitestTmpDirs(root);
    },
  };
}
