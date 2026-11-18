/**
 * Guard — a host element whose children suspend DURING HYDRATION is replayed
 * against the node it already claimed, not against that node's first child.
 *
 * ## What was measured (local production build, 2026-10-25)
 *
 * `/{locale}/jobs` at 390px threw React #418 ("server rendered HTML didn't
 * match the client") on ~6 of 48 cold loads, in every locale (the UX review of
 * 2026-10-24 caught it in RU/NL/DE only by chance). A fiber probe placed the
 * failed claim at the marketing layout's `<div class="relative min-h-screen">`
 * — server HTML byte-identical, no locale/date/viewport difference anywhere.
 * Production walks meanwhile found a SECOND copy of dashboard content left in
 * Next's hidden streaming holder (`<div hidden id="S:n">`) after load: the
 * footprint of a root that hydration gave up on and client-rendered, so the
 * streamed segment's swap target was gone.
 *
 * ## The cause, in React itself
 *
 * Next 15.5.24 vendors React 19.2.0-canary-0bdb9206. In `beginWork` a
 * HostComponent CLAIMS its server node and moves `nextHydratableInstance` to
 * that node's FIRST CHILD, then reconciles its children. When a child is a
 * Flight row that has not streamed in yet (any async server component, e.g.
 * `SiteNav`, sitting directly under a host element), reconciling throws, the
 * work loop waits for the row, and `replaySuspendedUnitOfWork` runs
 * `beginWork` on the host AGAIN — with the cursor still on the first child.
 * The second claim compares `<div>` against its own child and throws #418.
 * #2246 worked around one instance (DashboardChrome's `SlotBoundary`); the
 * cause is everywhere a server component nests an async child under a tag.
 *
 * `patches/next@15.5.24.patch` rewinds the cursor to the instance the first
 * attempt claimed before the replay (tag 5, hydrating, no alternate), so the
 * replay claims the same node. The webpack cache is keyed on the patch file
 * (see react-render-phase-ping.test.ts), so a cached build cannot keep the old
 * bundle.
 *
 * This guard fails if a Next upgrade (or a lost patch) brings the bare replay
 * back.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);
const NEXT_DIR = dirname(require_.resolve("next/package.json"));
const CJS = join(NEXT_DIR, "dist", "compiled", "react-dom", "cjs");

const BUILDS = [
  "react-dom-client.production.js",
  "react-dom-client.development.js",
  "react-dom-profiling.profiling.js",
  "react-dom-profiling.development.js",
] as const;

/** The HostComponent (tag 5) branch of the replay, up to `default:`. */
function hostReplayBranch(file: string): string {
  const src = readFileSync(join(CJS, file), "utf8");
  const fn = src.indexOf(
    file.includes("development") ? "function replayBeginWork(" : "function replaySuspendedUnitOfWork(",
  );
  expect(fn, `${file}: replay function not found — the scan rotted`).toBeGreaterThan(-1);
  const at = src.indexOf("case 5:", fn);
  expect(at, `${file}: host branch not found`).toBeGreaterThan(fn);
  return src.slice(at, src.indexOf("default:", at)).replace(/\s+/g, " ");
}

describe("vendored React rewinds the hydration cursor before replaying a host (patches/next@*.patch)", () => {
  for (const file of BUILDS) {
    it(`${file}: the host replay re-targets the node it already claimed`, () => {
      const branch = hostReplayBranch(file);
      expect(branch).toMatch(/resetHooksOnUnwind\((next|unitOfWork)\);/);
      expect(branch).toMatch(
        /null === current && isHydrating && null !== (next|unitOfWork)\.stateNode && \(nextHydratableInstance = (next|unitOfWork)\.stateNode\);/,
      );
    });
  }
});
