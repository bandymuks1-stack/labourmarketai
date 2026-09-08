import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Local-run parallelism bounds (CI keeps vitest defaults — do not slow CI).
// The full suite holds ~760 guard files that each readdirSync/readFileSync the
// whole app tree. At vitest's default worker count (= all cores) those scans
// run concurrently and saturate CPU + disk on a dev box (Windows Defender
// scans every open() on top), so a rotating set of guards blows even the 30s
// guards timeout and raw fs calls fail with UNKNOWN. Bounding local workers —
// and capping how many guard files walk the tree at once — removes the
// contention without touching any assertion. Verified locally 2026-08-31:
// every flaked file passes in isolation; only the parallel storm fails.
const isCI = process.env.CI === "true" || process.env.CI === "1";
const cores = os.availableParallelism();
const localMaxWorkers = Math.max(2, Math.floor(cores / 2));
const localGuardWorkers = Math.max(2, Math.floor(cores / 4));

// Unit tests only (pure logic like lib/auth-errors). E2E stays in Playwright.
export default defineConfig({
  // Transform component JSX with the automatic runtime (react/jsx-runtime) so a
  // guard test can render a real client component to static markup for a DOM
  // order proof. vitest 4 transforms with oxc, which otherwise inherits
  // tsconfig `jsx: preserve` (kept for Next) and refuses to emit runnable JS.
  // Production uses Next's own SWC pipeline; this only affects vitest loads.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    // Mirror the tsconfig `@/*` -> `./*` mapping so tests can import route
    // modules and helpers using the same paths as production code.
    // `server-only` / `client-only` are marker packages that throw outside
    // their target environment; alias them to a no-op so server modules with
    // pure logic (e.g. lib/cv/extract) can be unit-tested under Node.
    alias: {
      "@": dir,
      "server-only": path.resolve(dir, "lib/test/server-only-stub.ts"),
      "client-only": path.resolve(dir, "lib/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    ...(isCI ? {} : { maxWorkers: localMaxWorkers }),
    // W19 platform debt: the repo-wide structural guards in `lib/guards/`
    // walk the whole app tree (readdirSync over app/ + components/ + lib/)
    // and re-read dozens of source files per suite. Under CPU contention —
    // CI shared runners, a dev server on the same machine, the full suite's
    // own worker parallelism — a single scan can exceed vitest's 5s default
    // and fail as a TIMEOUT with nothing actually wrong, which reads as a
    // red guard. The timeout is raised for the guards project ONLY; every
    // other unit test keeps the 5s default, so a genuinely hung pure-logic
    // test still fails fast. A larger timeout can only mask slowness, never
    // a failing assertion — real guard failures fail on expect(), not time.
    projects: [
      {
        extends: true,
        test: {
          name: "guards",
          include: ["lib/guards/**/*.test.ts"],
          environment: "node",
          // Local full-suite runs get a higher ceiling than CI: even with the
          // worker caps below, a ~20-minute local run keeps Windows Defender
          // hot and a couple of guard scans can straggle past 30s with nothing
          // wrong. CI keeps the strict 30s ceiling, so a genuine guard
          // slowdown still fails where it counts; assertions are untouched.
          testTimeout: isCI ? 30_000 : 120_000,
          // Cap concurrent guard files locally: each one walks the whole app
          // tree, and N-at-once is what starves the 30s ceiling (see header).
          // vitest requires a distinct sequence.groupOrder when projects have
          // different maxWorkers; running guards as a second group also keeps
          // the tree-walkers from competing with the unit project's workers.
          ...(isCI
            ? {}
            : {
                maxWorkers: localGuardWorkers,
                sequence: { groupOrder: 1 },
              }),
        },
      },
      {
        extends: true,
        test: {
          name: "unit",
          include: ["lib/**/*.test.ts"],
          exclude: ["**/node_modules/**", "lib/guards/**"],
          environment: "node",
        },
      },
    ],
  },
});
