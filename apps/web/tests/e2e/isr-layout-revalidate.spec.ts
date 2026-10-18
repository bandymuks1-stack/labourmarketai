import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * P0 (2026-10-17) — A LAYOUT-WIDE REVALIDATION MUST NEVER TURN PUBLIC PAGES INTO 404.
 *
 * Observed on `next start` (the same server the self-hosted standalone build
 * runs): after ONE server action called `revalidatePath("/", "layout")`, every
 * ISR page under app/[locale] (/en, /lt, /de/auth/login, /lt/about, ...)
 * answered 404 for every visitor, and the 404 was written to the on-disk ISR
 * cache, so it survived a restart.
 *
 * Root cause, in Next 15.5.24 itself (build/templates/app-page.js): a tag
 * invalidation makes the file-system cache return NO entry (not a stale one).
 * With `dynamicParams = false` (app/[locale]/layout.tsx, P2-1) the route's
 * fallback mode is NOT_FOUND, and the handler only re-renders a NOT_FOUND
 * route when it still has a previous cache entry. With none, it throws
 * NoFallbackError, the request falls through to app/[locale]/[...rest]
 * (notFound), and that 404 is cached under the real page's key.
 * `patches/next@15.5.24.patch` regenerates a path that was PRERENDERED at
 * build time instead; an unknown path still gets the no-fallback 404.
 *
 * This spec drives the real trigger: a signed-in fixture user calls the real
 * `switchActiveRole` server action (lib/auth/actions.ts), which calls
 * `revalidatePath("/", "layout")`. Pages it never touched must stay 200.
 * It also re-proves P2-1: an unknown dotted apex path is 404, never 500.
 *
 * Needs a PRODUCTION server (`next build && next start`; `next dev` never
 * caches, so it cannot show the defect) and the local fixture stack:
 *   E2E_NO_SERVER=1 E2E_BASE_URL=http://127.0.0.1:<port> SUPABASE_TEST_URL=1 \
 *     pnpm exec playwright test isr-layout-revalidate
 * Skips cleanly without them.
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;
const WORKER = { email: "dev.worker@local.test", password: "password" };
const MANIFEST = resolve(__dirname, "../../.next/server/server-reference-manifest.json");

/** ISR pages under app/[locale] that the action itself never renders. */
const PUBLIC_PAGES = ["/de/auth/login", "/en/auth/login", "/lt/auth/login", "/lt", "/en", "/en/about", "/lt/about"];
/** P2-1: dotted apex paths skip the i18n middleware and must 404, not 500. */
const UNKNOWN_DOTTED = ["/foo.xml", "/old-file.json"];

/** The server-action id of `switchActiveRole` in lib/auth/actions.ts. */
function switchActiveRoleActionId(): string {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
    node: Record<string, { exportedName?: string; filename?: string }>;
  };
  const hit = Object.entries(manifest.node).find(
    ([, e]) => e.exportedName === "switchActiveRole" && /lib[\\/]auth[\\/]actions\.ts$/.test(e.filename ?? ""),
  );
  expect(hit, "switchActiveRole not in the server-reference manifest — the lookup rotted").toBeTruthy();
  return hit![0];
}

async function status(request: APIRequestContext, path: string): Promise<number> {
  const res = await request.get(path, { maxRedirects: 0 });
  return res.status();
}

async function loginAsWorker(page: Page): Promise<void> {
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(WORKER.email);
  await page.locator('input[type="password"]').fill(WORKER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

test.describe("ISR survives a layout-wide revalidatePath", () => {
  test.skip(!HAS_TEST_SUPABASE, "local fixture stack not configured");
  test.skip(!existsSync(MANIFEST), "no production build (.next) — run next build && next start");

  test("public pages stay 200 after revalidatePath('/', 'layout'); unknown dotted paths stay 404", async ({
    page,
    request,
  }) => {
    for (const path of PUBLIC_PAGES) {
      expect(await status(request, path), `before: ${path}`).toBe(200);
    }

    await loginAsWorker(page);
    const actionId = switchActiveRoleActionId();
    const actionStatus = await page.evaluate(async (id) => {
      const res = await fetch(window.location.pathname, {
        method: "POST",
        headers: {
          "Next-Action": id,
          Accept: "text/x-component",
          "Content-Type": "text/plain;charset=UTF-8",
        },
        body: JSON.stringify(["worker"]),
      });
      return res.status;
    }, actionId);
    expect(actionStatus, "switchActiveRole server action").toBe(200);

    // Twice: the first request after the invalidation regenerates, the second
    // reads what that regeneration cached. Both must be the real page.
    for (const round of ["regenerated", "cached"]) {
      for (const path of PUBLIC_PAGES) {
        expect(await status(request, path), `after (${round}): ${path}`).toBe(200);
      }
    }

    for (const path of UNKNOWN_DOTTED) {
      expect(await status(request, path), `P2-1: ${path}`).toBe(404);
    }
  });
});
