import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * #1011 — the worker dashboard must COMMIT, not merely respond (regression).
 *
 * WHAT ACTUALLY BROKE. React streams a late route segment (`dashboard/
 * loading.tsx` boundary) as a hidden holder plus a completion instruction
 * ($RC). In this React version $RC only QUEUES the boundary ($RB) and marks
 * its comment `$~`; the actual DOM swap runs in a batched reveal ($RV) that —
 * before the first paint — is scheduled exclusively via requestAnimationFrame.
 * In a tab that never paints a frame (occluded or backgrounded window: exactly
 * how automated browser proofs run), that rAF never fires, the queue never
 * re-schedules, and every late segment stays hidden forever. The WORKER
 * exposed it because `loadPersonalWorkspaceIntro()`'s readiness reads pushed
 * the page's ENTIRE visible surface past the shell flush into that late
 * segment; the employer page finished inside the shell and looked fine.
 *
 * THE PINNED PROPERTY. The conversation surface must be part of the shell /
 * commit without requiring a paint-driven reveal, for EVERY identity — the S2
 * intro payload streams behind its own invisible Suspense boundary instead of
 * holding the page hostage (the layout's SpineStream pattern). These tests
 * load the dashboard with requestAnimationFrame suppressed (the never-painting
 * tab, i.e. the #1011 reproduction) and require the primary surface anyway.
 * On the pre-fix main (714a464c) the worker test fails with the route skeleton
 * retained and `conversation-chat` stuck inside a hidden streaming holder.
 *
 * Runs ONLY against the local stack (`pnpm -C apps/web e2e:local`); sessions
 * are minted through the local Admin API exactly like scripts/e2e-mint-session.
 */

const URL_ = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_STACK = !!URL_ && !!ANON && !!SERVICE;

const WORKER_EMAIL = "dev.worker@local.test";
const EMPLOYER_EMAIL = "dev.company@local.test";

function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  const ok = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(
    host,
  );
  if (!ok)
    throw new Error(`worker-dashboard-suspense refuses non-local stack: ${host}`);
}

/** The never-painting tab (#1011): rAF callbacks queue and never fire. */
const SUPPRESS_RAF = `(() => {
  window.__rafQueue = [];
  window.requestAnimationFrame = (cb) => { window.__rafQueue.push(cb); return window.__rafQueue.length; };
})();`;

/**
 * Mint a real local session and return @supabase/ssr-format cookies — the
 * same formula as scripts/e2e-mint-session.ts (single source of the rules:
 * host-derived ref, `base64-` + base64url payload, 3180-encoded-char chunks).
 */
async function mintSessionCookies(
  email: string,
): Promise<{ name: string; value: string }[]> {
  assertLocal(URL_);
  const admin = createClient(URL_, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !link?.properties?.email_otp) {
    throw new Error(`generateLink ${email}: ${linkErr?.message ?? "no otp"}`);
  }
  const anon = createClient(URL_, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sess, error: vErr } = await anon.auth.verifyOtp({
    email,
    token: link.properties.email_otp,
    type: "magiclink",
  });
  if (vErr || !sess?.session) {
    throw new Error(`verifyOtp ${email}: ${vErr?.message ?? "no session"}`);
  }
  const ref = new URL(URL_).host.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(sess.session))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")}`;
  if (encodeURIComponent(value).length <= 3180) return [{ name, value }];
  const chunks: { name: string; value: string }[] = [];
  let rest = value;
  let i = 0;
  while (rest.length > 0) {
    let take = Math.min(rest.length, 3000);
    while (encodeURIComponent(rest.slice(0, take)).length > 3180) take -= 100;
    chunks.push({ name: `${name}.${i}`, value: rest.slice(0, take) });
    rest = rest.slice(take);
    i += 1;
  }
  return chunks;
}

async function openDashboard(
  browser: Browser,
  email: string,
  { paintless }: { paintless: boolean },
): Promise<Page> {
  const cookies = await mintSessionCookies(email);
  const context = await browser.newContext();
  await context.addCookies(
    cookies.map((c) => ({
      ...c,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
      expires: Math.floor(Date.now() / 1000) + 3600,
    })),
  );
  if (paintless) await context.addInitScript(SUPPRESS_RAF);
  const page = await context.newPage();
  await page.goto("/en/dashboard", { waitUntil: "commit" });
  return page;
}

/** The primary surface, committed: chat visible (a node inside a hidden
 *  streaming holder is NOT visible), no route skeleton, live composer. */
async function expectCommitted(page: Page): Promise<void> {
  await expect(page.getByTestId("conversation-chat")).toBeVisible({
    // Generous: first hit may compile the route in dev.
    timeout: 60_000,
  });
  await expect(page.getByTestId("composer-input")).toBeVisible();
  await expect(page.getByTestId("dashboard-section-loading")).toHaveCount(0);
}

test.describe("#1011 worker dashboard commits without a paint-driven reveal", () => {
  test.skip(
    !HAS_STACK,
    "local Supabase stack env missing — run via `pnpm e2e:local`",
  );

  test("worker /dashboard commits in a never-painting tab (the #1011 repro)", async ({
    browser,
  }) => {
    const page = await openDashboard(browser, WORKER_EMAIL, {
      paintless: true,
    });
    await expectCommitted(page);
    await page.context().close();
  });

  test("employer /dashboard still commits in a never-painting tab (control)", async ({
    browser,
  }) => {
    const page = await openDashboard(browser, EMPLOYER_EMAIL, {
      paintless: true,
    });
    await expectCommitted(page);
    await page.context().close();
  });

  test("worker /dashboard commits normally in a painting tab", async ({
    browser,
  }) => {
    const page = await openDashboard(browser, WORKER_EMAIL, {
      paintless: false,
    });
    await expectCommitted(page);
    // The full late-stream path stays healthy here: every streamed boundary
    // eventually reveals — no boundary is left queued (`$~`) or pending (`$?`).
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = document.createTreeWalker(
              document.documentElement,
              NodeFilter.SHOW_COMMENT,
            );
            let stuck = 0;
            while (w.nextNode()) {
              const d = (w.currentNode as Comment).data;
              if (d === "$~" || d === "$?") stuck += 1;
            }
            return stuck;
          }),
        { timeout: 30_000 },
      )
      .toBe(0);
    await page.context().close();
  });
});
