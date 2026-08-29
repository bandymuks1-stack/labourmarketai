import { test, expect, type Browser } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { assertServerIsThisBuild } from "./build-identity";
import { HAS_LOCAL_STACK } from "./market-map-db-state";
import {
  confirmationsFor,
  ensureDeclaredSkills,
  removeDeclaredSkills,
  newRunMarker,
  removeSeeded,
  restoreWorkerSkillFlags,
  seedTodayEntries,
  workerSkillFlags,
  type WorkerSkillFlag,
} from "./quick-confirm-db-state";

/**
 * S3.5 — One-Tap Confirm + Verified CV export, proven ACROSS TWO ACTORS.
 *
 * ## What replaced the skip
 *
 * This loop sat behind an unconditional `test.skip(true, …)` reading:
 * *"Requires authenticated manager + worker test sessions sharing an org with
 * journal_review_enabled and pending entries. Wire when SUPABASE_TEST_URL is
 * provisioned."*
 *
 * Every clause is now false, and each was checked rather than assumed:
 *
 *   * `SUPABASE_TEST_URL` is provisioned — `scripts/e2e-local.ts` sets it.
 *   * The manager exists: `dev.company@local.test`, an `owner` engagement
 *     satisfying `manages_organization()`.
 *   * The worker exists: `dev.worker@local.test`, an `employee` engagement
 *     with `journal_review_enabled = true`.
 *   * Pending entries exist: `reviewable_journal_entry_ids()` run as the
 *     manager returns 14.
 *   * Two sessions at once are now possible: `E2E_STORAGE_FILE` gives the mint
 *     script a second output file.
 *
 * ## Why it is worth having
 *
 * This is the ONE loop no single-actor spec can express. A worker logs work; a
 * DIFFERENT person decides whether it is true; and only that decision moves a
 * skill from "they said so" to "their manager confirmed it" on the CV an
 * employer reads. Every claim this product makes about verified history rests
 * on that join, and nothing tested it.
 *
 * The negative control is the same property from the other side: a worker must
 * not be able to confirm their own work. A loop that authenticates but does
 * not authorize would pass everything else here and be worthless.
 *
 * ## What the skip was hiding
 *
 * Its step 2 said *"tap quick-confirm-tap-<id>, await quick-confirmed-<id>"*.
 * Measured on the real page, `quick-confirmed-<id>` NEVER renders: the action
 * revalidates the route, a confirmed entry is no longer reviewable, and the
 * card unmounts before the success branch paints. Sampled every 250 ms across
 * a confirm — card present through t+1000 ms, gone by t+1250 ms,
 * `quick-confirmed-` absent at every sample. The same is true of
 * `quick-rejected-<id>`.
 *
 * So that step could never have passed. This spec asserts what the manager
 * actually sees, and the missing outcome message is filed as its own defect
 * rather than silently blessed here — or papered over with a longer timeout.
 *
 * ## State discipline
 *
 * Confirming is destructive twice: a confirmed entry leaves the queue for
 * good, and `worker_skills.verified` flips permanently. So the mutating tests
 * never touch the 18 fixture entries — they seed their own, marked and dated
 * today, and remove them — and the suite snapshots the worker's verified flags
 * up front and restores them at the end. The existing reviewable entries are
 * read only where reading changes nothing.
 *
 * No `waitForTimeout` stands in for a condition here, and nothing is retried.
 */
const STORAGE_WORKER = join(__dirname, ".storage-state.json");
const STORAGE_MANAGER = join(__dirname, ".storage-state-manager.json");
const HAS_BOTH = existsSync(STORAGE_WORKER) && existsSync(STORAGE_MANAGER);

const QUICK = "/lt/dashboard/inbox/quick";
const PHONE = { width: 390, height: 844 };

/** The S3.5 budget: one glance, one tap, on a phone. */
const CONFIRM_BUDGET_MS = 10_000;

test.describe("S3.5 — access control (mobile viewport)", () => {
  test.use({ viewport: PHONE });

  test("anonymous /dashboard/inbox/quick redirects to /auth/login", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard/inbox/quick");
    await expect(page).toHaveURL(/\/lt\/auth\/login/);
  });

  test("anonymous /cv redirects to /auth/login", async ({ page }) => {
    await page.goto("/lt/cv");
    await expect(page).toHaveURL(/\/lt\/auth\/login/);
  });

  test("anonymous /en/cv redirects to /en/auth/login (locale kept)", async ({
    page,
  }) => {
    await page.goto("/en/cv");
    await expect(page).toHaveURL(/\/en\/auth\/login/);
  });
});

test.describe("S3.5 — the confirm loop, across two actors", () => {
  test.skip(
    !HAS_LOCAL_STACK,
    "Local stack env missing (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — run via `pnpm e2e:local`.",
  );
  test.skip(
    !HAS_BOTH,
    "Needs BOTH sessions. Mint them against the local stack:\n" +
      "  E2E_OWNER_EMAIL=dev.worker@local.test pnpm tsx scripts/e2e-mint-session.ts\n" +
      "  E2E_OWNER_EMAIL=dev.company@local.test E2E_STORAGE_FILE=.storage-state-manager.json pnpm tsx scripts/e2e-mint-session.ts",
  );

  // The confirm flow mutates shared fixture state, so these run in order.
  test.describe.configure({ mode: "serial" });

  const marker = newRunMarker();
  const seeded: string[] = [];
  let declaredSkillIds: string[] = [];
  let skillSnapshot: WorkerSkillFlag[] = [];

  const asManager = (browser: Browser) =>
    browser.newContext({ storageState: STORAGE_MANAGER, viewport: PHONE });
  const asWorker = (browser: Browser) =>
    browser.newContext({ storageState: STORAGE_WORKER, viewport: PHONE });

  /** Seed n entries for this run, remembering them for cleanup even if the
   *  test that asked for them fails. */
  async function seed(n: number): Promise<string[]> {
    const ids = await seedTodayEntries(n, marker);
    seeded.push(...ids);
    return ids;
  }

  /**
   * BOTH SESSIONS MUST STILL BE LOGGED IN.
   *
   * `scripts/e2e-mint-session.ts` writes a cookie that expires after ONE HOUR.
   * An expired session does not error — it redirects to `/auth/login`, where
   * every "the queue is empty" assertion passes for the wrong reason. That is
   * precisely how this suite's negative control ("a worker cannot confirm
   * their own work") went green while proving nothing: a login page has no
   * confirm cards either.
   *
   * So expiry is turned into a loud, actionable failure before any test runs.
   */
  async function assertStillSignedIn(
    browser: Browser,
    storageState: string,
    who: string,
  ): Promise<void> {
    const ctx = await browser.newContext({ storageState, viewport: PHONE });
    const page = await ctx.newPage();
    await page.goto(QUICK, { waitUntil: "domcontentloaded" });
    const url = page.url();
    await ctx.close();
    expect(
      url,
      `The ${who} session has expired (redirected to ${url}). Sessions last one hour — re-mint:\n` +
        "  E2E_OWNER_EMAIL=dev.worker@local.test pnpm tsx scripts/e2e-mint-session.ts\n" +
        "  E2E_OWNER_EMAIL=dev.company@local.test E2E_STORAGE_FILE=.storage-state-manager.json pnpm tsx scripts/e2e-mint-session.ts",
    ).not.toContain("/auth/login");
  }

  test.beforeAll(async ({ playwright, baseURL, browser }) => {
    // The suite must not be answered by a server from another worktree or an
    // older commit — the 2026-08-28 failure mode. See build-identity.ts.
    const request = await playwright.request.newContext();
    await assertServerIsThisBuild(request, baseURL ?? "http://127.0.0.1:3000");
    await request.dispose();

    await assertStillSignedIn(browser, STORAGE_MANAGER, "manager");
    await assertStillSignedIn(browser, STORAGE_WORKER, "worker");

    // The worker must have DECLARED, unconfirmed skills, or every assertion
    // about verification passes vacuously. `worker_skills` is not
    // fixture-defined — a freshly reset stack has zero — so the spec pins its
    // own subject rather than depending on what an earlier session left.
    declaredSkillIds = await ensureDeclaredSkills(3);
    skillSnapshot = await workerSkillFlags();
    expect(
      skillSnapshot.filter((s) => !s.verified).length,
      "the worker has unconfirmed skills — without them this loop has no subject",
    ).toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    await restoreWorkerSkillFlags(skillSnapshot);
    await removeDeclaredSkills(declaredSkillIds);
    await removeSeeded(marker, seeded);
  });

  test("the manager's queue names the worker and states the decision, with no checkboxes", async ({
    browser,
  }) => {
    const ctx = await asManager(browser);
    const page = await ctx.newPage();
    await page.goto(QUICK, { waitUntil: "domcontentloaded" });
    await page.locator("h1").first().waitFor();

    const cards = page.locator("[data-testid^='quick-confirm-card-']");
    await expect(cards.first(), "the manager has entries to review").toBeVisible();
    const first = cards.first();

    // WHO. The #1333 property, asserted from the other side of the join: a
    // manager confirming somebody's work must be able to see whose. Before
    // that fix every card read "—" here, on all 14.
    await expect(
      first,
      "the card names the worker — a decision about an unnamed person is not a decision",
    ).not.toHaveText(/^\s*—/);

    // WHAT they are being asked to confirm, stated before any tap.
    await expect(first.locator("[data-testid^='quick-will-confirm-']")).toBeVisible();
    await expect(first.locator("[data-testid^='quick-confirm-tap-']")).toBeVisible();
    await expect(first.locator("[data-testid^='quick-reject-open-']")).toBeVisible();

    // No checkboxes anywhere: every confirmation is an explicit tap, never a
    // pre-ticked default a tired manager submits without reading.
    await expect(
      page.locator("input[type=checkbox]"),
      "no checkboxes — confirmation is an act, not a default",
    ).toHaveCount(0);

    await ctx.close();
  });

  test("one tap confirms inside the budget, and the database records the decision", async ({
    browser,
  }) => {
    const [entryId] = await seed(1);
    const ctx = await asManager(browser);
    const page = await ctx.newPage();
    await page.goto(QUICK, { waitUntil: "domcontentloaded" });

    const card = page.locator(`[data-testid='quick-confirm-card-${entryId}']`);
    const tap = page.locator(`[data-testid='quick-confirm-tap-${entryId}']`);
    await expect(tap, "the seeded entry reached the manager's queue").toBeVisible();

    const started = Date.now();
    await tap.click();

    // Completion is the entry LEAVING THE QUEUE — see the header note on why
    // the success message is not asserted here.
    await expect(card, "the confirmed entry leaves the review queue").toHaveCount(0, {
      timeout: CONFIRM_BUDGET_MS,
    });
    const elapsed = Date.now() - started;
    expect(elapsed, "one tap resolves within the S3.5 budget").toBeLessThan(
      CONFIRM_BUDGET_MS,
    );

    // The screen moved on; the database must agree. A UI-only pass here would
    // be the worst lie this product could tell.
    const rows = await confirmationsFor(entryId);
    expect(rows, "exactly one confirmation row for one tap").toHaveLength(1);
    const scope = rows[0].confirmation_scope as {
      action?: string;
      decision?: string;
      skills_confirmed?: string[];
    };
    expect(scope.action, "recorded as a CONFIRM").toBe("confirm");
    expect(scope.decision, "and as approved").toBe("approved");
    expect(
      (scope.skills_confirmed ?? []).length,
      "the confirmation names the skills it verified",
    ).toBeGreaterThan(0);
    expect(rows[0].confirmer_id, "attributed to the manager who tapped").toBeTruthy();

    // The named skills are now verified — the step that turns "they said so"
    // into "their manager confirmed it".
    const verifiedIds = new Set(
      (await workerSkillFlags()).filter((s) => s.verified).map((s) => s.skill_id),
    );
    for (const id of scope.skills_confirmed ?? []) {
      expect(verifiedIds.has(id), `skill ${id.slice(0, 8)} is now verified`).toBe(true);
    }

    await ctx.close();
  });

  test("the batch summarises every entry, and refuses unacknowledged exceptions", async ({
    browser,
  }) => {
    // Two, because the batch is offered only when today has more than one
    // entry — confirming a single item in bulk is not a batch.
    const ids = await seed(2);
    const ctx = await asManager(browser);
    const page = await ctx.newPage();
    await page.goto(QUICK, { waitUntil: "domcontentloaded" });

    const open = page.locator("[data-testid='quick-batch-open']");
    await expect(open, "'confirm all of today' appears once today has >1 entry").toBeVisible();
    await open.click();

    // THE SUMMARY COMES FIRST — the manager sees every entry it is about to
    // confirm, with worker and date, while they can still decide not to.
    const summary = page.locator("[data-testid='quick-batch-summary']");
    await expect(summary).toBeVisible();
    await expect(
      summary.locator("li"),
      "every batched entry is listed before the confirm",
    ).toHaveCount(ids.length);
    await expect(summary, "and each names its worker").toContainText("Dev Worker");

    const exceptionCount = await page
      .locator("[data-testid='quick-batch-exception']")
      .count();
    const result = page.locator("[data-testid='quick-batch-result']");

    if (exceptionCount > 0) {
      // FIRST: confirm WITHOUT acknowledging. A flagged entry must never be
      // silently swept up by a bulk action — the property the exceptions
      // pyramid exists to protect, pinned rather than worked around.
      await expect(
        page.locator("[data-testid='quick-batch-excluded-note']"),
        "the manager is warned the flagged entries will not be confirmed",
      ).toBeVisible();
      await page.locator("[data-testid='quick-batch-confirm']").click();
      await expect(result).toBeVisible({ timeout: CONFIRM_BUDGET_MS });

      for (const id of ids) {
        expect(
          await confirmationsFor(id),
          `flagged entry ${id.slice(0, 8)} was NOT confirmed while its exception stood`,
        ).toHaveLength(0);
      }
      await expect(
        page.locator("[data-testid='quick-batch-outcomes']"),
        "and is told, per entry, which were refused and why",
      ).toBeVisible();

      // A completed batch leaves the component in its `done` state, so the
      // dialog — and with it the acknowledgements — is gone. Acknowledging is
      // a decision made BEFORE confirming, which is the point: a fresh visit
      // is how a manager who read the refusal comes back to act on it.
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("[data-testid='quick-batch-open']").click();
      await expect(summary).toBeVisible();
    }

    // Acknowledge each flagged entry — a deliberate tap per entry, never a
    // pre-checked box.
    const acks = page.locator("[data-testid='quick-batch-ack']");
    const ackCount = await acks.count();
    for (let i = 0; i < ackCount; i++) await acks.nth(i).click();
    await page.locator("[data-testid='quick-batch-confirm']").click();

    // Asserted in the DATABASE, not on screen, and for a structural reason: a
    // SUCCESSFUL batch confirms every entry today, `todays.length > 1` goes
    // false, and the whole batch component — result banner included —
    // unmounts. The refused result above survives only because nothing
    // changed. Polling a real condition is not a timeout in disguise: it waits
    // for the write, and fails if the write never comes.
    for (const id of ids) {
      await expect
        .poll(async () => (await confirmationsFor(id)).length, {
          message: `entry ${id.slice(0, 8)} is confirmed once its exception is acknowledged`,
          timeout: CONFIRM_BUDGET_MS,
        })
        .toBeGreaterThan(0);
      const scope = (await confirmationsFor(id))[0].confirmation_scope as {
        action?: string;
      };
      expect(scope.action, "and recorded as a confirm").toBe("confirm");
    }

    await ctx.close();
  });

  test("a rejection needs a reason, and verifies nothing", async ({ browser }) => {
    const [entryId] = await seed(1);
    const verifiedBefore = (await workerSkillFlags()).filter((s) => s.verified).length;

    const ctx = await asManager(browser);
    const page = await ctx.newPage();
    await page.goto(QUICK, { waitUntil: "domcontentloaded" });

    const card = page.locator(`[data-testid='quick-confirm-card-${entryId}']`);
    await page.locator(`[data-testid='quick-reject-open-${entryId}']`).click();
    const note = page.locator(`[data-testid='quick-reject-note-${entryId}']`);
    await expect(note).toBeVisible();

    // An empty rejection is refused. A worker cannot act on a bare "no", so a
    // bare "no" is not a decision the form may accept.
    await page.locator(`[data-testid='quick-reject-submit-${entryId}']`).click();
    await expect(note, "the form stays open on an empty reason").toBeVisible();
    await expect(card, "and the entry stays in the queue").toHaveCount(1);
    expect(
      await confirmationsFor(entryId),
      "an empty rejection writes nothing",
    ).toHaveLength(0);

    await note.fill("Trūksta valandų ir objekto pavadinimo.");
    await page.locator(`[data-testid='quick-reject-submit-${entryId}']`).click();
    await expect(card, "the rejected entry leaves the queue").toHaveCount(0, {
      timeout: CONFIRM_BUDGET_MS,
    });

    const rows = await confirmationsFor(entryId);
    expect(rows, "the rejection is recorded").toHaveLength(1);
    const scope = rows[0].confirmation_scope as { action?: string; note?: string | null };
    expect(scope.action, "recorded as a REJECT").toBe("reject");
    expect(scope.note, "carrying the reason the manager gave").toBeTruthy();

    expect(
      (await workerSkillFlags()).filter((s) => s.verified).length,
      "a rejection verifies nothing — the whole integrity claim in one number",
    ).toBe(verifiedBefore);

    await ctx.close();
  });

  test("the worker cannot confirm their own work", async ({ browser }) => {
    const [entryId] = await seed(1);
    const ctx = await asWorker(browser);
    const page = await ctx.newPage();
    await page.goto(QUICK, { waitUntil: "domcontentloaded" });

    // THE WORKER REACHED THE PAGE. Without this line the test is vacuous: an
    // expired session redirects to /auth/login, which also has no confirm
    // cards, and "authorization works" would be indistinguishable from
    // "nobody was logged in". It went green that way once.
    expect(page.url(), "the worker is signed in and on the page").not.toContain(
      "/auth/login",
    );
    await expect(
      page.locator("h1").first(),
      "the worker sees the quick-confirm page itself",
    ).toBeVisible();

    // The worker is fully authenticated and is the SUBJECT of this entry. If
    // authorization were merely authentication, the card would be here — so
    // this is the negative control for every test above.
    await expect(
      page.locator(`[data-testid='quick-confirm-tap-${entryId}']`),
      "a worker is offered no tap to confirm their own entry",
    ).toHaveCount(0);
    await expect(
      page.locator("[data-testid^='quick-confirm-card-']"),
      "a worker's quick queue is empty — they manage nobody",
    ).toHaveCount(0);

    expect(await confirmationsFor(entryId), "and nothing was written").toHaveLength(0);

    await ctx.close();
  });

  test("a manager's confirmation reaches the worker's own CV", async ({
    browser,
  }) => {
    const [entryId] = await seed(1);

    const mgr = await asManager(browser);
    const mgrPage = await mgr.newPage();
    await mgrPage.goto(QUICK, { waitUntil: "domcontentloaded" });
    await mgrPage.locator(`[data-testid='quick-confirm-tap-${entryId}']`).click();
    await expect(
      mgrPage.locator(`[data-testid='quick-confirm-card-${entryId}']`),
    ).toHaveCount(0, { timeout: CONFIRM_BUDGET_MS });
    expect(await confirmationsFor(entryId), "the manager's decision landed").toHaveLength(1);
    await mgr.close();

    // A FRESH context for the worker — the confirmation must live in the data,
    // not in a cache the manager's browser happened to hold. This is the join
    // the product rests on: one person's decision changes another person's CV.
    const wrk = await asWorker(browser);
    const page = await wrk.newPage();
    await page.goto("/lt/cv", { waitUntil: "domcontentloaded" });
    await page.locator("h1").first().waitFor();

    const confirmed = page.locator("[data-testid='cv-tier-confirmed']");
    await expect(
      confirmed,
      "the confirmed tier appears once a manager has confirmed something",
    ).toBeVisible();
    expect(
      (await confirmed.innerText()).trim().length,
      "and carries real skills, not an empty heading",
    ).toBeGreaterThan(0);

    // The proof table states date / project / ROLE — never the confirmer's
    // NAME. Who signed it off is not the worker's to publish to an employer.
    const proof = page.locator("[data-testid='cv-proof']");
    if ((await proof.count()) > 0) {
      await expect(
        proof,
        "the proof table does not name the confirming manager",
      ).not.toContainText("Dev Company");
    }

    await wrk.close();
  });

  test("the worker's CV prints in both locales", async ({ browser }) => {
    const ctx = await asWorker(browser);
    const page = await ctx.newPage();
    for (const route of ["/lt/cv", "/en/cv"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.locator("h1").first().waitFor();
      const pdf = await page.pdf();
      expect(pdf.byteLength, `${route} produces a real PDF`).toBeGreaterThan(1000);
    }
    await ctx.close();
  });
});
