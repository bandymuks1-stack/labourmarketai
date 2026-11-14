import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard for the root client error boundary (P0 hotfix).
 *
 * Pins that the locale error boundary exists and behaves concretely:
 *   - it is a client component;
 *   - it auto-reloads ONLY for stale-chunk / failed-dynamic-import errors
 *     (the deploy-race symptom), guarded against reload loops — and so does
 *     the global boundary, through the same helper and the same budget;
 *   - it does NOT silently hide other errors — it logs them and shows a retry;
 *   - its copy exists with LT/EN parity.
 */

const APP_ROOT = join(__dirname, "..", "..");
const ERROR_TSX = "app/[locale]/error.tsx";

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

describe("Guard: root client error boundary", () => {
  it("the locale error boundary exists and is a client component", () => {
    expect(existsSync(join(APP_ROOT, ERROR_TSX))).toBe(true);
    const src = read(ERROR_TSX);
    expect(src.trimStart().startsWith('"use client"')).toBe(true);
    // Next.js error files must export a default component taking { error, reset }.
    expect(src).toMatch(/export default function/);
    expect(src).toMatch(/reset/);
  });

  it("auto-reloads only on chunk / dynamic-import errors, loop-guarded", () => {
    // 2026-11-12: the detection and the loop guard moved to ONE helper, so the
    // locale boundary and the global one share a single reload budget.
    const HELPER = "lib/telemetry/chunk-reload.ts";
    const helper = read(HELPER);
    expect(helper).toMatch(/ChunkLoadError/);
    expect(helper).toMatch(/Loading chunk|dynamically imported module/i);
    expect(helper).toMatch(/window\.location\.reload\(\)/);
    // A session mark prevents an infinite reload loop on a genuinely broken chunk.
    expect(helper).toMatch(/sessionStorage/);
    expect(helper).toMatch(/if \(!claimChunkReload\(store, Date\.now\(\)\)\) return false;\s+window\.location\.reload\(\);/);
    for (const boundary of [ERROR_TSX, "app/global-error.tsx"]) {
      const src = read(boundary);
      expect(src, `${boundary} must reload through the shared helper`).toMatch(/reloadOnceForChunkError\(error\)/);
      // No boundary reloads on its own: a second, unguarded reload is a loop.
      expect(src, `${boundary} must not reload by itself`).not.toMatch(/location\.reload/);
    }
  });

  it("does NOT silently hide non-chunk errors (logs + offers retry)", () => {
    const src = read(ERROR_TSX);
    expect(src).toMatch(/console\.error/);
    expect(src).toMatch(/onClick=\{\(\)\s*=>\s*reset\(\)\}/);
    expect(src).toMatch(/error-boundary-retry/);
  });

  it("errorBoundary copy exists with LT/EN parity", () => {
    for (const loc of ["lt", "en"] as const) {
      const ns = JSON.parse(read(`messages/${loc}.json`)).errorBoundary as Record<string, string>;
      expect(ns, `${loc} errorBoundary missing`).toBeTruthy();
      for (const k of ["reloading", "body", "retry"]) {
        expect(typeof ns[k] === "string" && ns[k].trim().length > 0, `${loc} errorBoundary.${k}`).toBe(true);
      }
    }
    const lt = Object.keys(JSON.parse(read("messages/lt.json")).errorBoundary).sort();
    const en = Object.keys(JSON.parse(read("messages/en.json")).errorBoundary).sort();
    expect(lt).toEqual(en);
  });
});
