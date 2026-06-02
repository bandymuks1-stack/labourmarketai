import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard for the root client error boundary (P0 hotfix).
 *
 * Pins that the locale error boundary exists and behaves concretely:
 *   - it is a client component;
 *   - it auto-reloads ONLY for stale-chunk / failed-dynamic-import errors
 *     (the deploy-race symptom), guarded against reload loops;
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
    const src = read(ERROR_TSX);
    expect(src).toMatch(/ChunkLoadError/);
    expect(src).toMatch(/Loading chunk|dynamically imported module/i);
    expect(src).toMatch(/window\.location\.reload\(\)/);
    // A session flag prevents an infinite reload loop on a genuinely broken chunk.
    expect(src).toMatch(/sessionStorage/);
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
