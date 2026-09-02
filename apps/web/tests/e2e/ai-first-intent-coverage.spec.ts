import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The owner brief's §13 "first real workflows", proven in a real browser
 * against a real session.
 *
 * Three of the six sentences a person is told they can type did not reach
 * their workflow before this change:
 *
 *   "Įrašyti šiandienos darbą"    → find-work  (a JOB SEARCH, for somebody
 *                                   asking to write down today's work)
 *   "Sukurk įmonės profilį"       → profile    (the person's OWN profile form,
 *                                   for somebody asking to create a company)
 *   "Parodyk mano rytojaus planą" → unknown    (nothing in the router read the
 *                                   word TOMORROW)
 *
 * The unit suite pins the routing. This pins the CONSEQUENCE: that the
 * sentence reaches a real surface in the running product, not merely a
 * different string from a classifier.
 *
 * Honest degradation is a pass: what is asserted is that the workspace
 * answered in the right DIRECTION and offered a real door. A fabricated
 * answer — a company form for a profile request — is what fails.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

const LT = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "messages", "lt.json"), "utf8"),
) as { conversation: { chat: Record<string, string> } };

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs the local stack).`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

async function say(page: Page, text: string): Promise<void> {
  await page.getByTestId("composer-input").fill(text);
  await page.getByTestId("composer-send").click();
  await expect(page.getByTestId("msg-user").last()).toBeVisible();
}

async function openChat(page: Page): Promise<void> {
  await page.goto("/lt/dashboard");
  await expect(page.getByTestId("composer-input")).toBeVisible({
    timeout: 30_000,
  });
}

test("«Sukurk įmonės profilį» offers the organization setup, not the personal profile", async ({
  page,
}) => {
  await openChat(page);
  await say(page, "Sukurk įmonės profilį");

  // The canonical setup surface, offered as the one real door.
  const chip = page.getByTestId("chat-chip-link:/dashboard/start/company?new=1");
  await expect(chip).toBeVisible({ timeout: 20_000 });
  await expect(chip).toHaveText(LT.conversation.chat.chipCreateOrganization);

  // The regression this replaces: the PERSONAL profile summary must not be
  // what a request to create a company produces.
  await expect(page.getByTestId("msg-profile-summary")).toHaveCount(0);

  await page.screenshot({
    path: "test-results/ai-first-create-organization.png",
    fullPage: false,
  });

  // The door actually opens the canonical page — no dead chip.
  await chip.click();
  await page.waitForURL(/\/dashboard\/start\/company/, { timeout: 30_000 });
});

/**
 * The LMC ledger, reachable by ASKING rather than only by searching.
 *
 * The command finder already answered the short query ("lmc"), and the unit
 * measurement showed why that was not enough: it is a search matcher, so
 * "Parodyk mano LMC istoriją" and "How much LMC do I have?" both matched
 * nothing while the bare term matched fine. Sentences are what people type at a
 * conversation, and the conversation had no LMC intent at all — so a ledger
 * that was proven correct on production was reachable by search and unreachable
 * by asking.
 *
 * This pins the CONSEQUENCE rather than the classification: the sentence
 * produces a real door, and the door opens the section — not the top of a
 * settings page, which is not an answer to "how much do I have".
 */
test("«Kiek turiu LMC?» offers the credit surface and the door opens it", async ({
  page,
}) => {
  await openChat(page);
  await say(page, "Kiek turiu LMC?");

  const chip = page.getByTestId("chat-chip-link:/dashboard/account#lmc");
  await expect(chip).toBeVisible({ timeout: 20_000 });
  await expect(chip).toHaveText(LT.conversation.chat.chipLmc);

  await chip.click();
  await page.waitForURL(/\/dashboard\/account/, { timeout: 30_000 });
  // The ANCHOR is the point: the balance itself, not a page top.
  await expect(page.getByTestId("lmc-balance-section")).toBeVisible({
    timeout: 30_000,
  });
});

test("«Įrašyti šiandienos darbą» opens the work journal, not a job search", async ({
  page,
}) => {
  await openChat(page);
  await say(page, "Įrašyti šiandienos darbą");

  // The work-log flow — in any of its real states (form, loading, or the
  // honest blocked card). What must NOT appear is the opportunity search.
  const worklog = page
    .getByTestId("worklog-flow")
    .or(page.getByTestId("worklog-loading"))
    .or(page.getByTestId("worklog-blocked"))
    .or(page.getByTestId("msg-worklog"));
  await expect(worklog.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("msg-employer-match")).toHaveCount(0);

  // Let the flow settle past its loading frame so the screenshot shows the
  // real composer rather than a spinner.
  await expect(page.getByTestId("worklog-loading")).toHaveCount(0, {
    timeout: 30_000,
  });

  await page.screenshot({
    path: "test-results/ai-first-log-work.png",
    fullPage: false,
  });
});

test("«Parodyk mano rytojaus planą» reaches the agenda, not the fallback", async ({
  page,
}) => {
  await openChat(page);
  await say(page, "Parodyk mano rytojaus planą");

  // STRONG assertion. A first version of this test only checked that SOME new
  // assistant turn appeared and was not the fallback — and it passed on an
  // unrelated profile nudge that happened to arrive first, while the agenda
  // was still loading. That is a test that cannot fail for the right reason.
  //
  // `startAgenda` ends EVERY path — real summary, empty day, failed read —
  // with `calendarHint`, so that sentence is the signature of the agenda
  // having actually run. An empty day is a legitimate answer; the
  // not-understood fallback is not.
  const hint = LT.conversation.chat.calendarHint;
  await expect
    .poll(
      async () =>
        (await page.getByTestId("msg-assistant").allInnerTexts()).some((t) =>
          t.includes(hint),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);

  const texts = await page.getByTestId("msg-assistant").allInnerTexts();
  expect(texts.some((t) => t.trim() === LT.conversation.chat.fallback)).toBe(
    false,
  );

  await page.screenshot({
    path: "test-results/ai-first-tomorrow-plan.png",
    fullPage: false,
  });
});
