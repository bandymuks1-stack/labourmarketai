/**
 * Guard — a PRERENDERED `fallback: false` path regenerates after a tag invalidation.
 *
 * Measured 2026-10-16/17 on `next start` (the server the self-hosted standalone
 * build runs): one server action calling `revalidatePath("/", "layout")` turned
 * every ISR page under app/[locale] (/en, /lt, /de/auth/login, /lt/about, ...)
 * into a cached 404 that survived a restart.
 *
 * Root cause, in Next 15.5.24's app-page handler: a tag invalidation makes the
 * file-system cache return NO entry (it returns null, not a stale entry).
 * app/[locale]/layout.tsx sets `dynamicParams = false` (P2-1), so the route's
 * fallback mode is NOT_FOUND, and the handler only switches a NOT_FOUND route
 * to a blocking render when `previousCacheEntry` exists. With none it throws
 * NoFallbackError: the request falls through to app/[locale]/[...rest]
 * (notFound) and that 404 is cached under the real page's key.
 *
 * `patches/next@15.5.24.patch` adds one branch: when the requested path is in
 * the prerender manifest (`isPrerendered`), a NOT_FOUND fallback becomes a
 * blocking render. An unknown path is not in the manifest, so it still gets the
 * no-fallback 404 — the P2-1 guarantee (an unknown dotted apex path is 404,
 * never a 500) is untouched. End-to-end proof:
 * tests/e2e/isr-layout-revalidate.spec.ts.
 *
 * This guard fails if a Next upgrade (or a lost patch) drops the branch while
 * `dynamicParams = false` is still in the layout. Remove both together once
 * upstream regenerates prerendered fallback: false paths on its own.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);
const NEXT_DIR = dirname(require_.resolve("next/package.json"));
const APP_ROOT = join(__dirname, "..", "..");

/** Both copies: the build bundles the ESM template (load-entrypoint.js); the CJS twin is patched to match. */
const TEMPLATES = [
  ["esm", join(NEXT_DIR, "dist", "esm", "build", "templates", "app-page.js"), "FallbackMode"],
  ["cjs", join(NEXT_DIR, "dist", "build", "templates", "app-page.js"), "_fallback.FallbackMode"],
] as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("Next app-page regenerates a prerendered fallback: false path (patches/next@*.patch)", () => {
  it("app/[locale]/layout.tsx still sets dynamicParams = false (the reason for the patch)", () => {
    const layout = readFileSync(join(APP_ROOT, "app", "[locale]", "layout.tsx"), "utf8");
    expect(layout).toMatch(/export const dynamicParams = false;/);
  });

  for (const [kind, file, mode] of TEMPLATES) {
    it(`${kind} template: NOT_FOUND + isPrerendered becomes a blocking render, before the NoFallbackError check`, () => {
      const src = readFileSync(file, "utf8").replace(/\s+/g, " ");
      const branch = new RegExp(
        `if \\(fallbackMode === ${escape(mode)}\\.NOT_FOUND && isPrerendered\\) \\{ fallbackMode = ${escape(mode)}\\.BLOCKING_STATIC_RENDER; \\}`,
      );
      const at = src.search(branch);
      expect(at, `${kind}: the prerendered-path branch is missing — patch lost or Next upgraded`).toBeGreaterThan(-1);
      const thrown = src.indexOf("NoFallbackError()", at);
      expect(thrown, `${kind}: the branch must run before NoFallbackError is thrown`).toBeGreaterThan(at);
      // isPrerendered is the exact-path manifest lookup, not the route pattern.
      expect(src).toMatch(/const isPrerendered = !!prerenderManifest\.routes\[resolvedPathname\];/);
    });
  }
});
