import { randomUUID } from "node:crypto";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { BASE, isolatedStack, lit, onboard, signIn, signUp, sql, sqlExec, userId } from "./isolated-web-a-helpers";

/**
 * Register 2.24: a dispute is opened, reviewed and decided, and a reply is
 * published, end to end in a real browser on the THROWAWAY local stack of
 * .github/workflows/signup-isolated.yml (the CI-run version of
 * w6-experience-dispute-flow.spec.ts, which needs hand-made dev sessions).
 * Synthetic people only, in a database that dies with the job:
 *
 *   S  the SUBJECT: a worker who opens the dispute and writes the reply;
 *   A  the AUTHOR of the experience, independent of the administrator;
 *   M  the platform ADMINISTRATOR (the one seeded step: a profile_roles row,
 *      as in verifyCompanyAsLocalAdmin).
 *
 * Owner rules of 2026-11-13, walked:
 *   D-1 S disputes a published record; it stays visible and marked; S replies,
 *       the reply waits for moderation;
 *   D-2 A sees the dispute, not the unpublished reply;
 *   D-3 on a record M WROTE, M gets no control at all (conflict of interest);
 *   D-4 M sees the reason, date and age, takes it into review, is offered only
 *       "upheld" and "removed", decides with a reason; the decision rewrites
 *       nothing, and the audit trail holds every step with its actor;
 *   D-5 M publishes S's reply from the reply queue;
 *   D-6 S and A both read the decision and its reason; A reads the reply.
 * The records themselves are seeded (an experience is written after a real
 * booking, which this walk does not repeat); every step after that is the
 * product's own UI.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const S = `dispute-subject-${RUN}@example.test`;
const A = `dispute-author-${RUN}@example.test`;
const M = `dispute-admin-${RUN}@example.test`;

const EXPERIENCES = `${BASE}/en/dashboard?result=experiences`;
const ADMIN = `${BASE}/en/dashboard/admin`;
const MARK = `E2E-2.24-${RUN}:`;
const INDEPENDENT = `${MARK} independent author's record.`;
const REASON = `${MARK} it was not like that, the work was accepted without remarks.`;
const DECISION = `${MARK} checked, the record is unfounded.`;
const REPLY = `${MARK} my explanation.`;

const s = { subject: "", author: "", admin: "", independentId: "", ownId: "" };
const contexts = new Map<string, BrowserContext>();

async function as(browser: Browser, address: string): Promise<Page> {
  let ctx = contexts.get(address);
  if (!ctx) {
    ctx = await browser.newContext();
    contexts.set(address, ctx);
    const page = await ctx.newPage();
    await signIn(page, BASE, address);
    await page.close();
  }
  return ctx.newPage();
}

/** Below `lg` the workspace result sits in a collapsed sheet; open it. */
async function openPanelFold(page: Page): Promise<void> {
  const toggle = page.getByTestId("context-panel-toggle");
  await toggle.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await toggle.count()) === 0) return;
    if ((await toggle.getAttribute("aria-expanded")) !== "false") return;
    await toggle.click();
    await page.waitForTimeout(500);
  }
}

function record(id: string): Record<string, string | null> {
  return (
    sql<Record<string, string | null>>(
      `select dispute_status, dispute_resolution_reason, moderation_status, body
         from public.experience_records where id = ${lit(id)}`,
    )[0] ?? {}
  );
}

test.afterAll(async () => {
  for (const ctx of contexts.values()) await ctx.close();
});

test("D-0. three people sign up through the product; two published records about S are seeded", async ({ browser }) => {
  for (const [address, name] of [
    [S, "Synthetic Dispute Subject"],
    [A, "Synthetic Dispute Author"],
    [M, "Synthetic Dispute Admin"],
  ] as const) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signUp(page, BASE, address);
    await onboard(page, "work", name);
    await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
    await ctx.close();
  }
  s.subject = await userId(S);
  s.author = await userId(A);
  s.admin = await userId(M);
  sqlExec(`insert into public.profile_roles (profile_id, role) values (${lit(s.admin)}, 'admin')`);

  const seed = (author: string, body: string, dispute: "none" | "opened", reason: string | null) => {
    const id = randomUUID();
    sqlExec(
      `insert into public.experience_records
         (id, subject_type, subject_profile_id, author_profile_id, interaction_kind, interaction_id,
          sentiment, body, moderation_status, published_at, moderation_reason, dispute_status, dispute_reason)
       values (${lit(id)}, 'worker', ${lit(s.subject)}, ${lit(author)}, 'accepted_booking', ${lit(randomUUID())},
          'negative', ${lit(body)}, 'published', now(), 'isolated seed', ${lit(dispute)},
          ${reason === null ? "null" : lit(reason)})`,
    );
    return id;
  };
  s.independentId = seed(s.author, INDEPENDENT, "none", null);
  // Written by the account that acts as administrator: a party to it.
  s.ownId = seed(s.admin, `${MARK} the administrator's own record.`, "opened", `${MARK} dispute about the administrator's record.`);
  expect(record(s.independentId).dispute_status).toBe("none");
});

test("D-1. S disputes with a reason; the record stays visible and marked; S's reply waits", async ({ browser }) => {
  const page = await as(browser, S);
  await page.goto(EXPERIENCES);
  await openPanelFold(page);
  const card = page.locator('[data-testid="experience-about-me-item"]').filter({ hasText: INDEPENDENT });
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(card).toHaveAttribute("data-dispute", "none");
  await card.getByTestId("experience-dispute").locator("summary").click();
  await card.getByTestId("experience-dispute-reason").fill(REASON);
  await card.getByTestId("experience-dispute-submit").click();
  await expect(page.getByTestId("experience-dispute-opened")).toBeVisible({ timeout: 60_000 });

  await page.goto(EXPERIENCES);
  await openPanelFold(page);
  const after = page.locator('[data-testid="experience-about-me-item"]').filter({ hasText: INDEPENDENT });
  await expect(after).toBeVisible({ timeout: 90_000 });
  await expect(after).toHaveAttribute("data-dispute", "opened");
  await expect(after).toHaveAttribute("data-moderation", "published");
  await expect(after.getByTestId("experience-dispute-marker")).toBeVisible();

  await after.locator('details[data-testid="experience-response"] summary').click();
  await after.getByTestId("experience-response-body").fill(REPLY);
  await after.getByTestId("experience-response-submit").click();
  await expect(page.getByTestId("experience-response-submitted")).toBeVisible({ timeout: 60_000 });
  const reply = sql<{ moderation_status: string }>(
    `select moderation_status from public.experience_responses where experience_record_id = ${lit(s.independentId)}`,
  );
  expect(reply[0]?.moderation_status, "the reply waits for moderation").not.toBe("published");
  await page.close();
});

test("D-2. A sees the dispute marker, not the unpublished reply", async ({ browser }) => {
  const page = await as(browser, A);
  await page.goto(EXPERIENCES);
  await openPanelFold(page);
  const mine = page.getByTestId("experiences-mine");
  await expect(mine).toBeVisible({ timeout: 90_000 });
  const card = mine.locator('[data-dispute="opened"]').filter({ hasText: INDEPENDENT });
  await expect(card).toBeVisible();
  await expect(card.getByText(REPLY)).toHaveCount(0);
  await page.close();
});

test("D-3. on a record the administrator wrote, the administrator gets no control", async ({ browser }) => {
  const page = await as(browser, M);
  await page.goto(ADMIN);
  const own = page.locator(`[data-testid="experience-dispute-item"][data-experience-id="${s.ownId}"]`);
  await expect(own).toBeVisible({ timeout: 90_000 });
  await expect(own.getByTestId("experience-dispute-conflict")).toBeVisible();
  await expect(own.getByTestId("experience-dispute-start-review")).toHaveCount(0);
  await expect(own.locator('[data-testid^="experience-dispute-resolve-"]')).toHaveCount(0);
  await page.close();
});

test("D-4. the administrator sees reason and age, reviews, and decides with a reason; nothing is rewritten; every step is audited", async ({ browser }) => {
  const page = await as(browser, M);
  await page.goto(ADMIN);
  const item = page.locator(`[data-testid="experience-dispute-item"][data-experience-id="${s.independentId}"]`);
  await expect(item).toBeVisible({ timeout: 90_000 });
  await expect(item).toHaveAttribute("data-dispute", "opened");
  await expect(item.getByTestId("experience-dispute-reason")).toContainText(REASON);
  await expect(item.getByTestId("experience-dispute-age").locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  await expect(item.locator('[data-testid^="experience-dispute-resolve-"]'), "no decision before review").toHaveCount(0);

  await item.getByTestId("experience-dispute-start-review").click();
  await expect(item).toHaveAttribute("data-dispute", "under_review", { timeout: 60_000 });
  await expect(item.getByTestId("experience-dispute-resolve-upheld")).toBeVisible();
  await expect(item.getByTestId("experience-dispute-resolve-removed")).toBeVisible();
  await expect(item.getByTestId("experience-dispute-resolve-changed"), "\"changed\" is not offered").toHaveCount(0);

  await item.getByTestId("experience-dispute-resolve-reason").fill(DECISION);
  await item.getByTestId("experience-dispute-resolve-removed").click();
  await expect.poll(() => record(s.independentId).dispute_status, { timeout: 60_000 }).toBe("resolved_removed");
  const row = record(s.independentId);
  expect(row.dispute_resolution_reason).toBe(DECISION);
  expect(row.moderation_status, "the decision rewrote nothing").toBe("published");
  expect(row.body).toBe(INDEPENDENT);

  await page.goto(ADMIN);
  await expect(page.getByTestId("experience-dispute-queue")).toBeVisible({ timeout: 90_000 });
  await expect(item, "a decided dispute leaves the queue").toHaveCount(0);

  const audit = sql<{ action: string; actor_id: string }>(
    `select action, actor_id from public.audit_logs where entity_id = ${lit(s.independentId)} order by occurred_at asc`,
  );
  expect(audit.map((r) => r.action)).toEqual(["dispute_opened", "dispute_review_started", "dispute_resolved"]);
  expect(audit.map((r) => r.actor_id)).toEqual([s.subject, s.admin, s.admin]);
  await page.close();
});

test("D-5. the administrator publishes S's reply from the reply queue", async ({ browser }) => {
  const page = await as(browser, M);
  await page.goto(ADMIN);
  const queue = page.getByTestId("experience-response-queue");
  await expect(queue).toBeVisible({ timeout: 90_000 });
  const item = queue.getByTestId("experience-response-moderation-item").filter({ hasText: REPLY });
  await expect(item).toBeVisible();
  await item.getByTestId("experience-response-moderation-reason").fill(`${MARK} within the rules.`);
  await item.getByTestId("experience-response-moderation-publish").click();
  await expect
    .poll(
      () =>
        sql<{ moderation_status: string }>(
          `select moderation_status from public.experience_responses where experience_record_id = ${lit(s.independentId)}`,
        )[0]?.moderation_status,
      { timeout: 60_000 },
    )
    .toBe("published");
  await page.close();
});

test("D-6. both parties read the decision and its reason; the author reads the published reply", async ({ browser }) => {
  const subject = await as(browser, S);
  await subject.goto(EXPERIENCES);
  await openPanelFold(subject);
  const card = subject.locator('[data-testid="experience-about-me-item"]').filter({ hasText: INDEPENDENT });
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(card).toHaveAttribute("data-dispute", "resolved_removed");
  await expect(card.getByTestId("experience-dispute-decision")).toContainText(DECISION);
  await subject.close();

  const author = await as(browser, A);
  await author.goto(EXPERIENCES);
  await openPanelFold(author);
  const mine = author.getByTestId("experiences-mine");
  await expect(mine).toBeVisible({ timeout: 90_000 });
  const theirs = mine.locator('[data-dispute="resolved_removed"]').filter({ hasText: INDEPENDENT });
  await expect(theirs).toBeVisible();
  await expect(theirs.getByTestId("experience-dispute-decision")).toContainText(DECISION);
  await expect(theirs.getByText(REPLY)).toBeVisible();
  await author.close();
});
