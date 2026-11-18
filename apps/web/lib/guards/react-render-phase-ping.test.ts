/**
 * Guard — React keeps a ping that arrives DURING the render phase.
 *
 * Measured 2026-10-10/11 on the local production build: same-page soft
 * navigations on the Work Journal (`?compose=full`, `?date=`, `?month=`)
 * committed 0–2 of 10 times. Root cause, traced in React itself: the
 * transition reuses an already-visible Suspense boundary, so React renders in
 * "suspend with delay" mode (exit status 4). The router's `InnerLayoutRouter`
 * then suspends on a Flight chunk in status `resolved_model`; React's
 * `attachPingListener` calls `chunk.then(ping)`, which initialises the chunk
 * and calls `ping` SYNCHRONOUSLY — inside the render. Next 15.5.24's vendored
 * React (19.2.0-canary-0bdb9206) handles that case with
 *
 *     ? 0 === (executionContext & 2) && prepareFreshStack(root, 0)
 *     : (workInProgressRootPingedLanes |= pingedLanes)
 *
 * i.e. in the render phase it does nothing at all; `markRootSuspended` then
 * clears `root.pingedLanes` and the lane is parked forever (main thread idle,
 * no pending promise). Upstream React records the ping in that case instead;
 * `patches/next@15.5.24.patch` backports exactly that. With only that change,
 * on the same build, `?compose=full` went from 1/10 to 10/10.
 *
 * This guard fails if a Next upgrade (or a lost patch) brings the old branch
 * back, and if the webpack cache stops being keyed on the patch (with
 * `node-linker=hoisted` a restored `.next/cache` would otherwise keep bundling
 * the unpatched React).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);
const NEXT_DIR = dirname(require_.resolve("next/package.json"));
const CJS = join(NEXT_DIR, "dist", "compiled", "react-dom", "cjs");
const APP_ROOT = join(__dirname, "..", "..");

const BUILDS = [
  "react-dom-client.production.js",
  "react-dom-client.development.js",
  "react-dom-profiling.profiling.js",
  "react-dom-profiling.development.js",
] as const;

/** The body of `pingSuspendedRoot`, up to the next function. */
function pingBody(file: string): string {
  const src = readFileSync(join(CJS, file), "utf8");
  const start = src.indexOf("function pingSuspendedRoot(");
  expect(start, `${file}: pingSuspendedRoot not found — the scan rotted`).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf("function retryTimedOutBoundary(", start));
}

describe("vendored React records a render-phase ping (patches/next@*.patch)", () => {
  for (const file of BUILDS) {
    it(`${file}: the restart branch also records the ping when inside a render`, () => {
      const body = pingBody(file).replace(/\s+/g, " ");
      // The broken form: restart only outside a render, otherwise nothing.
      expect(body).not.toMatch(/&& prepareFreshStack\(root, 0\) :/);
      // The fixed form: outside a render restart, inside a render record it.
      expect(body).toMatch(
        /\? prepareFreshStack\(root, 0\) : \(workInProgressRootPingedLanes \|= pingedLanes\) : \(workInProgressRootPingedLanes \|= pingedLanes\)/,
      );
    });
  }

  it("the webpack cache is keyed on the pnpm patches", () => {
    const config = readFileSync(join(APP_ROOT, "next.config.ts"), "utf8");
    expect(config).toMatch(/buildDependencies/);
    expect(config).toMatch(/\.patch/);
  });
});
