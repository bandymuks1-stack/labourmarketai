import { test, expect, type Page, type Browser } from "@playwright/test";

/**
 * W7 SLICE 2 — MOBILE PHOTO EVIDENCE, AUTHENTICATED BROWSER PROOF.
 *
 * The path a real worker takes: chat → work-log → an 8+ MB phone photo →
 * client-side compression → preview → save → REAL upload against the entry
 * that was just written → honest outcome.
 *
 * Runs against the LOCAL Supabase stack only (never cloud): the seeded worker
 * comes from supabase/dev-fixtures.sql and the env from `pnpm e2e:local`.
 * Without SUPABASE_TEST_URL the suite skips cleanly.
 *
 * THE PHOTO IS GENERATED IN THE BROWSER, not committed as a fixture: a real
 * 8–15 MB JPEG cannot be checked into the repo, and a small stand-in would
 * prove nothing about the 5 MB wall this slice exists to remove. The canvas
 * is filled with per-pixel noise on purpose — a flat gradient re-encodes to a
 * few hundred KB and would never exceed the ceiling.
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;

const WORKER = { email: "dev.worker@local.test", password: "password" };

async function loginAsWorker(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(WORKER.email);
  await page.locator('input[type="password"]').fill(WORKER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 120_000, waitUntil: "domcontentloaded" });
  return page;
}

/**
 * Build a big JPEG in the page and hand it to a file input as a real File —
 * the same object a camera pick produces, so the component's own
 * `onChange` runs unmodified.
 */
async function attachGeneratedPhoto(
  page: Page,
  selector: string,
  opts: { edge: number; type?: string; name?: string },
): Promise<number> {
  return page.evaluate(
    async ({ selector, edge, type, name }) => {
      const canvas = document.createElement("canvas");
      canvas.width = edge;
      canvas.height = Math.round(edge * 0.75);
      const ctx = canvas.getContext("2d")!;
      // Per-pixel noise — incompressible, so the encoder cannot cheat the size.
      const img = ctx.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = (Math.random() * 255) | 0;
        img.data[i + 1] = (Math.random() * 255) | 0;
        img.data[i + 2] = (Math.random() * 255) | 0;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const blob: Blob = await new Promise((res) =>
        canvas.toBlob((b) => res(b!), type ?? "image/jpeg", 1.0),
      );
      const file = new File([blob], name ?? "phone-photo.jpg", {
        type: type ?? "image/jpeg",
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector(selector) as HTMLInputElement;
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return file.size;
    },
    { selector, edge: opts.edge, type: opts.type, name: opts.name },
  );
}

/**
 * Send a chat message, waiting for REACT to be live rather than for the DOM.
 *
 * The composer's own source documents a pre-hydration race: the textarea
 * accepts typing before handlers attach, so a keypress can land on a dead
 * element. The send button is `disabled` until React state holds a non-empty
 * value — so "the button became enabled" is proof that hydration finished AND
 * that React received this exact text. Clicking it is then deterministic,
 * where `press("Enter")` silently no-ops if it wins the race.
 */
async function sendChatMessage(page: Page, text: string): Promise<void> {
  const composer = page.getByTestId("composer-input");
  await composer.waitFor({ state: "visible", timeout: 120_000 });
  const send = page.getByTestId("composer-send").first();
  await expect(async () => {
    await composer.fill(text);
    await expect(send).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 120_000 });
  await send.click();
}

/** Open the work-log flow from the chat by typing a real work sentence. */
async function openWorkLogFromChat(page: Page): Promise<void> {
  await sendChatMessage(page, "šiandien dirbau nuo 8 iki 17, montavau langus");
  // EITHER outcome is a real product state; only one of them is the flow.
  // Waiting for both means a missing engagement context is reported as the
  // precondition it is, instead of an unexplained timeout.
  const flow = page.getByTestId("worklog-flow");
  const blocked = page.getByTestId("worklog-blocked");
  await expect(flow.or(blocked)).toBeVisible({ timeout: 120_000 });
  await expect(
    blocked,
    "worker fixture has no writable engagement context — seed one before this proof",
  ).toHaveCount(0);
  await expect(flow).toBeVisible();
}

test.describe("W7 slice 2 — photo evidence in the conversation", () => {
  test.skip(!HAS_TEST_SUPABASE, "local Supabase stack not configured");
  // Dev-mode route compiles plus generating and JPEG-encoding a 4200px noise
  // canvas are both slow; the 30s default expires before the flow is even on
  // screen. Generous, because a timeout here must mean a real defect.
  test.describe.configure({ timeout: 300_000 });

  test("an 8+ MB phone photo is compressed, previewed and really uploaded", async ({
    browser,
  }) => {
    const page = await loginAsWorker(browser);
    await openWorkLogFromChat(page);

    const field = page.getByTestId("worklog-photo-field");
    await expect(field).toBeVisible();

    // 4200px edge of pure noise at q1.0 — comfortably past the 5 MB ceiling
    // that used to be a flat refusal.
    const originalBytes = await attachGeneratedPhoto(page, '[data-testid="worklog-photo-input"]', {
      edge: 4200,
    });
    expect(originalBytes, "the test photo must exceed the 5 MB upload ceiling").toBeGreaterThan(
      5 * 1024 * 1024,
    );

    // The person is TOLD the photo is being prepared, then sees it accepted.
    await expect(page.getByTestId("worklog-photo-preview")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("worklog-photo-error")).toHaveCount(0);

    // Save → confirm → the REAL server round-trip.
    await page.getByTestId("worklog-save").click();
    await page.getByTestId("worklog-confirm").click();

    const done = page.getByTestId("worklog-done");
    await done.waitFor({ state: "visible", timeout: 120_000 });

    // THE PROOF: a real upload outcome, and it is the success one.
    const outcome = page.getByTestId("worklog-photo-outcome");
    await expect(outcome).toBeVisible();
    await expect(outcome).toHaveAttribute("data-photo-outcome", "uploaded");

    await page.close();
  });

  test("the picked photo can be removed before anything is written", async ({ browser }) => {
    const page = await loginAsWorker(browser);
    await openWorkLogFromChat(page);

    await attachGeneratedPhoto(page, '[data-testid="worklog-photo-input"]', { edge: 1200 });
    await expect(page.getByTestId("worklog-photo-preview")).toBeVisible({ timeout: 60_000 });

    await page.getByTestId("worklog-photo-remove").click();
    await expect(page.getByTestId("worklog-photo-preview")).toHaveCount(0);
    // The field itself stays — removing a photo is not leaving the flow.
    await expect(page.getByTestId("worklog-photo-field")).toBeVisible();

    await page.close();
  });

  test("an unsupported format is refused honestly and attaches nothing", async ({ browser }) => {
    const page = await loginAsWorker(browser);
    await openWorkLogFromChat(page);

    // A GIF is a real image the pipeline cannot re-encode — the honest refusal
    // path, not a crash and not a silent drop.
    await page.evaluate(() => {
      const file = new File([new Uint8Array([71, 73, 70, 56, 57, 97])], "clip.gif", {
        type: "image/gif",
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector(
        '[data-testid="worklog-photo-input"]',
      ) as HTMLInputElement;
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const err = page.getByTestId("worklog-photo-error");
    await expect(err).toBeVisible({ timeout: 30_000 });
    await expect(err).not.toBeEmpty();
    // Nothing was accepted, so there is nothing to preview or upload.
    await expect(page.getByTestId("worklog-photo-preview")).toHaveCount(0);

    await page.close();
  });

  test("the paperclip routes by context, and asks when it does not know", async ({ browser }) => {
    const page = await loginAsWorker(browser);
    // Same hydration gate as sendChatMessage: the attach button is inert
    // until React attaches, so prove interactivity before clicking it.
    const composer = page.getByTestId("composer-input");
    await composer.waitFor({ state: "visible", timeout: 120_000 });
    const send = page.getByTestId("composer-send").first();
    await expect(async () => {
      await composer.fill("x");
      await expect(send).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 120_000 });
    await composer.fill("");

    // UNKNOWN context → it ASKS rather than guessing.
    await page.getByTestId("composer-attach").first().click();
    const photoChip = page.getByRole("button", { name: /Darbo nuotrauka/i });
    await expect(photoChip).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /^CV$/i }).first()).toBeVisible();

    // Choosing "work photo" opens the photo-led work log — not the CV importer.
    await photoChip.click();
    await expect(page.getByTestId("worklog-photo-field")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("conversation-cv-flow")).toHaveCount(0);

    // Now the context IS known: the paperclip goes straight to the photo path.
    await page.getByTestId("composer-attach").first().click();
    await expect(page.getByTestId("worklog-photo-field").first()).toBeVisible({ timeout: 60_000 });

    await page.close();
  });

  test("mobile 375px: the photo field fits without horizontal overflow", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.goto("/lt/auth/login");
    await page.locator('input[type="email"]').fill(WORKER.email);
    await page.locator('input[type="password"]').fill(WORKER.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/dashboard/, { timeout: 120_000, waitUntil: "domcontentloaded" });

    await openWorkLogFromChat(page);
    await attachGeneratedPhoto(page, '[data-testid="worklog-photo-input"]', { edge: 1600 });
    await expect(page.getByTestId("worklog-photo-preview")).toBeVisible({ timeout: 60_000 });

    // The page must not scroll sideways — the standing mobile rule.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal overflow at 375px").toBeLessThanOrEqual(0);

    // The remove control keeps a real touch target.
    const box = await page.getByTestId("worklog-photo-remove").boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(40);

    // Evidence must SHOW the thing it is evidence of: the field sits below the
    // fold on a 375px screen, so a viewport shot of the top of the thread
    // proves nothing about the photo path.
    await page.getByTestId("worklog-photo-field").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "../../docs/audits/evidence/w7-photo-evidence/worklog-photo-375.png",
      fullPage: false,
    });
    await page.close();
  });

  test("regression: the journal composer photo path still works", async ({ browser }) => {
    const page = await loginAsWorker(browser);
    /**
     * THE COMPOSER LIVES BEHIND `?editing=` — BY DESIGN.
     *
     * W5 made this page the history/evidence PROJECTION of the journal, not a
     * second intake form: a fresh record starts in the chat, and the composer
     * renders only when correcting an existing one (see journal/page.tsx —
     * "CHAT-FIRST INTAKE (owner audit §6.1)"). A bare visit therefore has no
     * photo field, and asserting otherwise tests a product that does not exist.
     *
     * That is also exactly why this slice matters: before it, the photo field
     * was reachable only while EDITING an old entry — a brand-new work record
     * had no photo path at all.
     */
    const SEEDED_ENTRY = "1e111111-0000-0000-0000-000000000001";
    // A 1200-line route: the FIRST dev-mode compile is slow, and that is a
    // harness cost, not a product signal.
    await page.goto(`/lt/dashboard/journal?editing=${SEEDED_ENTRY}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    /**
     * ATTACHED, not visible — deliberately.
     *
     * In edit mode the field renders inside a section this page keeps
     * collapsed, which is that surface's own pre-existing presentation rule
     * and none of this slice's business. The regression question here is
     * "does the journal photo path still exist and still compress", and
     * asserting a collapse state we did not author would make this test fail
     * for reasons that say nothing about the change. The composer's wiring is
     * additionally pinned statically by
     * lib/guards/image-compress-before-upload.test.ts.
     */
    const field = page.getByTestId("journal-photo-field");
    await field.waitFor({ state: "attached", timeout: 180_000 });

    // The real pick → compress path still runs on the older surface: a
    // `change` event reaches the handler whether or not the box is on screen.
    await attachGeneratedPhoto(page, '[data-testid="journal-photo-input"]', { edge: 4200 });
    await expect(page.getByTestId("journal-photo-prepared")).toBeAttached({ timeout: 60_000 });
    // …and it did NOT take the "still too large" branch.
    await expect(page.getByTestId("journal-photo-field")).not.toContainText(/per didel/i);

    await page.close();
  });
});
