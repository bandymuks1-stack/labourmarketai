import { expect, test, type Page } from "@playwright/test";

import { chooseDemandCountryIfEmpty } from "./demand-country";
import { BASE, isolatedStack, lit, onboard, signUp, sql, sqlExec, userId } from "./isolated-web-a-helpers";
import { watchNeedSubmit } from "./need-submit-trail";

/**
 * A SAVED NEED IS ALWAYS CONFIRMED (owner order 2026-11-23, after production
 * run 45241051644: the new company's need was saved and matched, yet the page
 * showed neither the confirmation nor the limit within 30 s).
 *
 * The production walk's own path, on a THROWAWAY LOCAL stack: a new account
 * chooses to hire, saves its company, takes the setup's "describe a need" door
 * and sends the need — under a slow network and a slow processor, like a real
 * phone or a far-away browser. Then the same company does it again with an
 * earlier need closed, as the re-used production account does. Each time the
 * need must be STORED once and the confirmation must SHOW within the walk's
 * 30 s; when it does not, the log says what the page did instead.
 *
 * Two answers are then broken on purpose: the need is SAVED but the answer is
 * lost (a 502 in its place) — the page must still confirm it, not invite a
 * duplicate; and the request never reaches the server — the page must say it
 * failed and nothing may be stored.
 */
test.skip(!isolatedStack(), "isolated stack only (SIGNUP_ISOLATED=1 against a local Supabase)");
test.setTimeout(300_000);

const RUN = Date.now().toString(36);

type Answer = "normal" | "lost-after-save" | "never-sent";

async function describeNeed(page: Page, role: string, answer: Answer = "normal"): Promise<void> {
  // The company setup screen, reached the way the walk reaches it.
  await expect(async () => {
    if (!(await page.getByTestId("company-setup-form").isVisible().catch(() => false))) {
      await page.goto(`${BASE}/lt/dashboard/start/company`);
    }
    await expect(page.getByTestId("company-setup-form")).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const legal = page.getByTestId("company-setup-legal-name");
  if (!(await legal.inputValue()).trim()) {
    await legal.fill(`Synthetic Need Confirmation Co ${RUN}`);
    await page.getByTestId("company-setup-country").selectOption("LT");
  }
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-next")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("company-setup-describe-need").click();
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

  const main = page.getByRole("main");
  await main.getByTestId("demand-role").fill(role);
  await main.getByTestId("demand-description").fill("Two bricklayers for a site in Vilnius, from next month.");
  await main.getByTestId("demand-next").click();
  const size = main.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("2");
  await chooseDemandCountryIfEmpty(page);
  await main.getByTestId("demand-next").click();
  if (answer !== "normal") {
    // Only the FIRST request that carries this need's role (the submit); every other request passes.
    await page.route("**/dashboard/company/needs", async (route) => {
      const req = route.request();
      if (req.method() !== "POST" || !(req.postData() ?? "").includes(role)) return route.continue();
      if (answer === "lost-after-save") await route.fetch(); // the server saves it…
      await route.fulfill({ status: 502, contentType: "text/html", body: "<html>bad gateway</html>" }); // …the answer is lost
    }, { times: 1 }); // the submit only: the page's own follow-up question goes through
  }
  const trail = watchNeedSubmit(page);
  await main.getByTestId("demand-create").click();
  if (answer === "never-sent") {
    // Nothing was saved: the honest error, never a confirmation.
    await expect(main.getByTestId("demand-error"), "an unsaved need says so").toBeVisible({ timeout: 30_000 });
    await expect(main.getByTestId("demand-done")).toHaveCount(0);
    trail.stop();
    await page.unroute("**/dashboard/company/needs");
    return;
  }
  await expect(main.getByTestId("demand-done").or(main.getByTestId("demand-open-need-limit")))
    .toBeVisible({ timeout: 30_000 })
    .catch(async (e: unknown) => {
      console.info(`[need-confirmation] not confirmed: ${await trail.report()}`);
      throw e;
    });
  trail.stop();
  await expect(main.getByTestId("demand-open-need-limit"), "a company with no open need was refused").toHaveCount(0);
  await expect(main.getByTestId("demand-done"), "the saved need is confirmed").toBeVisible();
  if (answer !== "normal") await page.unroute("**/dashboard/company/needs");
}

test("a saved need is confirmed: new company, setup door, slow network, then again after an earlier need", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "lt-LT", timezoneId: "UTC" });
  const page = await ctx.newPage();
  const address = `need-confirm-${RUN}@walk.labourmarket.test`;
  await signUp(page, BASE, address);
  await onboard(page, "hire", `Synthetic Need Confirmation ${RUN}`);
  const owner = await userId(address);

  // A slow network and processor from here on (the production walk runs far
  // from the server; the action there takes ~7 s with matching).
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 300,
    downloadThroughput: 1_500_000,
    uploadThroughput: 750_000,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  // The walk arrives on the English dashboard first, then works in Lithuanian.
  await page.goto(`${BASE}/en/dashboard`);

  const rounds: { name: string; answer: Answer; stored: number }[] = [
    { name: "first", answer: "normal", stored: 1 },
    { name: "again", answer: "normal", stored: 1 },
    // The production failure: saved, but the answer never reached the page.
    { name: "answer-lost", answer: "lost-after-save", stored: 1 },
    // A real failure stays a failure (no confirmation without a saved need).
    { name: "never-sent", answer: "never-sent", stored: 0 },
  ];
  for (const round of rounds) {
    const role = `Need confirmation bricklayer ${round.name} ${RUN}`;
    if (round.answer === "never-sent") {
      // Same company, fresh form: the previous round left the confirmation on screen.
      await page.goto(`${BASE}/lt/dashboard/start/company`);
    }
    await describeNeed(page, role, round.answer);
    const stored = sql<{ status: string }>(
      `select status from public.customer_requests where profile_id = ${lit(owner)} and title = ${lit(role)}`,
    );
    expect(stored, `the ${round.name} need is stored ${round.stored === 1 ? "once" : "nowhere"}`).toHaveLength(round.stored);
    if (round.stored === 1) expect(stored[0]!.status, "and open").toBe("submitted");
    // Close it as the production sweep does, so the next round is a company
    // with an earlier, closed need (local stack only).
    sqlExec(`update public.customer_requests set status = 'closed' where profile_id = ${lit(owner)} and status = 'submitted'`);
  }
  await ctx.close();
});
