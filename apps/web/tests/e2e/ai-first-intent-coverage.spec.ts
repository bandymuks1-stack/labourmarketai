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

test("«Įrašyti šiandienos darbą» opens the work journal, not a job search", async ({
  page,
}) => {
  await openChat(page);
  await say(page, "Įrašyti šiandienos darbą");

  // The work-log flow — in any of its real states (form, loading, or the
  // honest blocked card). What must NOT appear is the opportunity search.
  const worklog = page
    .getByTestId("worklog-form")
    .or(page.getByTestId("worklog-loading"))
    .or(page.getByTestId("worklog-blocked"))
    .or(page.getByTestId("msg-worklog"));
  await expect(worklog.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("msg-match")).toHaveCount(0);

  await page.screenshot({
    path: "test-results/ai-first-log-work.png",
    fullPage: false,
  });
});

test("«Parodyk mano rytojaus planą» is answered instead of not understood", async ({
  page,
}) => {
  await openChat(page);
  const before = await page.getByTestId("msg-assistant").count();
  await say(page, "Parodyk mano rytojaus planą");

  // A NEW assistant turn that is not the not-understood fallback. The agenda
  // may legitimately be empty — an empty day is an answer; "I did not
  // understand you" is not.
  await expect
    .poll(async () => page.getByTestId("msg-assistant").count(), {
      timeout: 30_000,
    })
    .toBeGreaterThan(before);
  const last = page.getByTestId("msg-assistant").last();
  await expect(last).not.toHaveText(LT.conversation.chat.fallback);

  await page.screenshot({
    path: "test-results/ai-first-tomorrow-plan.png",
    fullPage: false,
  });
});
