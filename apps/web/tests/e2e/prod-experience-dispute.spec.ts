import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { contextPanel } from "./prod-context-panel";
import { test, expect, type Browser, type Locator, type Page } from "./prod-walk";

const STAGE = process.env.PROD_QA_EXPERIENCE_STAGE;
const PREPARE = "experience-dispute-prepare";
const VERIFY = "experience-dispute-verify";
const ROUTE = "/en/dashboard?result=experiences";
const PREFIX = /^\[?QA-SYNTHETIC(?:\]|[\s:—-]|$)/;
const REASON = "QA-SYNTHETIC #3301: request independent review of this synthetic experience.";
const WAIT = { timeout: 45_000 };

test.skip(process.env.PROD_QA_WALK !== "1" || (STAGE !== PREPARE && STAGE !== VERIFY), "dedicated manual dispatch only");
test.describe.configure({ retries: 0 });
test.use({ trace: "off", video: "off", screenshot: "off" });

async function asParticipant(browser: Browser, slot: "worker" | "owner") {
  const ctx = await browser.newContext({
    storageState: resolve(__dirname, `.storage-state.prod-qa.${slot}.json`),
    locale: "en-US",
  });
  const page = await ctx.newPage();
  // Use the product's existing non-operator gate before touching either person's record.
  await page.goto("/en/dashboard/admin", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(url => url.origin === "https://labourmarket.ai" &&
    url.pathname === "/en/dashboard" && url.searchParams.get("notice") === "needs_operator_access", WAIT);
  return page;
}

async function readCard(page: Page, side: "about-me" | "mine", recordId?: string) {
  await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
  await contextPanel(page, "open");
  const list = page.getByRole("main").getByTestId(`experiences-${side}`).filter({ visible: true });
  await expect(list).toBeVisible(WAIT);
  // Only the first direct paragraph is the original. A nested reply, decision or form may also have a QA marker.
  const body = page.locator("xpath=./p[1]");
  const cards = list.getByTestId(`experience-${side}-item`).filter({ has: body.filter({ hasText: PREFIX }) });
  const card = recordId === undefined ? cards : cards.and(list.locator(`[data-experience-id="${recordId}"]`));
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute("data-moderation", "published");
  await expect(card.getByTestId("experience-subject-type")).toContainText("About a worker");
  await expect(card.getByTestId("experience-response-unknown")).toHaveCount(0);
  return card;
}

const originalBody = (card: Locator) => card.locator("xpath=./p[1]").evaluate(p => p.textContent ?? "");
const replyOn = (card: Locator) => card.locator('[data-testid="experience-response"][data-response-moderation]');

async function expectReply(card: Locator, reply: string, moderation: string | RegExp) {
  const response = replyOn(card);
  await expect(response).toHaveAttribute("data-response-moderation", moderation);
  await expect(response.locator(":scope > p").first()).toHaveText(reply);
}

test("2.24. the two participants see the selected stage on the same synthetic experience", async ({ browser }) => {
  test.setTimeout(300_000);
  expect(process.env.E2E_BASE_URL).toBe("https://labourmarket.ai");
  const subject = await asParticipant(browser, "worker");
  const author = await asParticipant(browser, "owner");
  let about = await readCard(subject, "about-me");
  const recordId = await about.getAttribute("data-experience-id");
  if (!recordId || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(recordId)) {
    throw new Error("The subject's record has no valid identifier.");
  }
  const original = await originalBody(about);
  const mine = await readCard(author, "mine", recordId);
  expect(await originalBody(mine)).toBe(original);

  // Across separate dispatches the reply also binds the original text, which must survive the decision.
  const fingerprint = createHash("sha256").update(recordId).update("\0").update(original).digest("hex").slice(0, 16);
  const reply = `QA-SYNTHETIC #3301: subject reply for this synthetic experience (${fingerprint}).`;
  const dispute = await about.getAttribute("data-dispute");
  if (!dispute) throw new Error("Missing dispute state on the subject's record.");
  await expect(mine).toHaveAttribute("data-dispute", dispute);

  if (STAGE === VERIFY) {
    let reason: string | undefined;
    for (const card of [about, mine]) {
      await expect(card).toHaveAttribute("data-dispute", "resolved_upheld");
      await expect(card.getByTestId("experience-dispute-marker")).toBeVisible();
      const decision = card.getByTestId("experience-dispute-decision").locator("p");
      await expect(decision).toBeVisible();
      const shown = (await decision.innerText()).trim();
      expect(shown.length).toBeGreaterThan(0);
      if (reason !== undefined) expect(shown).toBe(reason);
      reason = shown;
      await expectReply(card, reply, "published");
      await expect(card.getByTestId("experience-response-not-public")).toHaveCount(0);
    }
    return;
  }

  expect(["none", "opened"]).toContain(dispute);
  await expect(replyOn(mine)).toHaveCount(0);
  const pending = /^(submitted|in_moderation)$/;
  if (await replyOn(about).count() === 0) {
    // The opening reason is only visible to the moderator. A pre-existing unmarked dispute is ambiguous.
    expect(dispute).toBe("none");
    const form = about.locator('details[data-testid="experience-response"]');
    await expect(form.locator('input[name="experience_id"]')).toHaveValue(recordId);
    await form.locator("summary").click();
    await form.getByTestId("experience-response-body").fill(reply);
    await form.getByTestId("experience-response-submit").click();
    await expect(about.getByTestId("experience-response-submitted")).toBeVisible(WAIT);
    about = await readCard(subject, "about-me", recordId);
  }
  await expectReply(about, reply, pending);
  if (await about.getAttribute("data-dispute") === "none") {
    const form = about.getByTestId("experience-dispute");
    await expect(form.locator('input[name="experience_id"]')).toHaveValue(recordId);
    await form.locator("summary").click();
    await form.getByTestId("experience-dispute-reason").fill(REASON);
    await form.getByTestId("experience-dispute-submit").click();
    await expect(about.getByTestId("experience-dispute-opened")).toBeVisible(WAIT);
  }

  about = await readCard(subject, "about-me", recordId);
  await expect(about).toHaveAttribute("data-dispute", "opened");
  await expect(about.getByTestId("experience-dispute-marker")).toBeVisible();
  await expectReply(about, reply, pending);
  await expect(about.getByTestId("experience-response-not-public")).toBeVisible();
  const authored = await readCard(author, "mine", recordId);
  await expect(authored).toHaveAttribute("data-dispute", "opened");
  await expect(authored.getByTestId("experience-dispute-marker")).toBeVisible();
  await expect(replyOn(authored)).toHaveCount(0);
  await expect(authored.getByText(reply, { exact: true })).toHaveCount(0);
});
