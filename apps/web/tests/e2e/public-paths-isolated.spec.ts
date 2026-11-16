import { expect, test, type Locator, type Page } from "@playwright/test";

import { ASSISTANT_GUEST_HREF, PUBLIC_INTENTS, type PublicIntentLink } from "../../lib/navigation/public-intents";
import { INSTITUTION_DOOR_NEXT } from "../../lib/marketing/public-doors";
import { BASE, PASSWORD, isolatedStack, onboard } from "./isolated-web-a-helpers";
import { KNOWN_PUBLIC_PATH_FINDINGS, PUBLIC_PATH_CASES } from "./public-paths-cases";

/**
 * EVERY PUBLIC PATH reaches its last step without an auth page (Lane L), on
 * the THROWAWAY local stack (.github/workflows/signup-isolated.yml).
 *
 * Per path, two things:
 *  1. No auth page (`/auth/login`, `/auth/signup`) appears before the step
 *     that genuinely needs an account. For a signed-in "workspace link" the
 *     auth page reached directly, with a correct `next`, IS that step.
 *  2. Typed input survives sign-in: where the visitor typed something before
 *     an auth step, the case signs up on the local stack and looks for it.
 *
 * Cases come from `public-paths-cases.ts` (the panel links are read from
 * PUBLIC_INTENTS at runtime). A case in KNOWN_PUBLIC_PATH_FINDINGS runs with
 * `test.fail()`: it must still fail, and the job goes red once it passes.
 *
 * Sign-ups here create people ONLY in a database that dies with the CI job;
 * the spec refuses to run anywhere but the local stack.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
// Not serial: the cases share no state, and one failure must not hide the rest.
test.describe.configure({ mode: "default" });
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const address = (key: string) => `public-path.${key}.${RUN}@local.test`;
const KNOWN = new Map(KNOWN_PUBLIC_PATH_FINDINGS.map((f) => [f.id, f]));
const AUTH = /\/auth\/(login|signup)(?:[/?#]|$)/;
/** An inner public page: the header carries the goal bar there. */
const INNER = `${BASE}/en/about`;

console.log(
  `[public-paths] ${PUBLIC_PATH_CASES.length} cases:\n${PUBLIC_PATH_CASES.map((c) => `  ${c.id}`).join("\n")}`,
);

/** Every main-frame address the page has shown, in order. */
function track(page: Page): string[] {
  const seen: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) seen.push(frame.url());
  });
  return seen;
}

function expectNoAuth(seen: readonly string[], step: string): void {
  const hit = seen.find((u) => AUTH.test(new URL(u).pathname));
  expect(hit, `no auth page before ${step} (seen: ${seen.map((u) => new URL(u).pathname).join(" → ")})`).toBeUndefined();
}

/** The `next` of an auth page, locale prefix dropped, as path + query. */
function nextOf(url: string): string {
  const raw = new URL(url).searchParams.get("next") ?? "";
  const n = new URL(raw, BASE);
  return `${n.pathname.replace(/^\/en(?=\/|$)/, "") || "/"}${n.search}`;
}

function sameDestination(next: string, href: string): void {
  const want = new URL(href, BASE);
  expect(next, "the auth page returns the visitor to the link they chose").toBe(`${want.pathname}${want.search}`);
}

/** A click that lands before hydration is a no-op: retry until it took. */
async function openToggle(page: Page, toggle: Locator): Promise<void> {
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click({ timeout: 5_000 });
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

/** The sign-up form the page is on (its `next` kept) → onboarding. */
async function signUpHere(page: Page, key: string): Promise<void> {
  await expect(page).toHaveURL(/\/en\/auth\/signup/);
  await page.locator('input[type="email"]').fill(address(key));
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirm_password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => !AUTH.test(u.pathname), { timeout: 60_000 });
  await page.waitForLoadState("domcontentloaded");
}

/** What the page shows and holds: its text and every field's value. */
async function pageHolds(page: Page): Promise<string> {
  return page.evaluate(() => {
    const values = [...document.querySelectorAll("input, textarea, select")].map(
      (el) => (el as HTMLInputElement).value ?? "",
    );
    return `${document.body.innerText}\n${values.join("\n")}`;
  });
}

async function firstOption(select: Locator): Promise<string> {
  const value = await select
    .locator("option")
    .evaluateAll((opts) => (opts as HTMLOptionElement[]).map((o) => o.value).find((v) => v !== "") ?? "");
  expect(value, "the select offers a real option").not.toBe("");
  return value;
}

/** Fill the open request door's form, send it, see it received. */
async function sendRequestDoor(page: Page, door: string, key: string): Promise<void> {
  const panel = page.getByTestId("request-door-panel");
  await expect(panel, `the ${door} door is open`).toHaveAttribute("data-door", door, { timeout: 30_000 });
  const form = page.getByTestId("request-door-form");
  await expect(form).toBeVisible();
  if (door === "b2b") {
    await form.locator('input[name="work"]').fill("Facade cladding subcontract");
  } else if (door === "partner") {
    await form.locator('textarea[name="proposal"]').fill(`Training partnership for site crews (${RUN}).`);
  } else {
    await form.locator('textarea[name="need"]').fill(`Bathroom renovation, two weeks (${RUN}).`);
  }
  const country = form.locator('select[name="country"]');
  await country.selectOption(await firstOption(country));
  await form.locator('input[name="name"]').fill(`Synthetic Door ${door} ${RUN}`);
  await form.locator('input[name="email"]').fill(address(key));
  // The spam guard refuses a send inside its minimum fill time.
  await page.waitForTimeout(3_500);
  await form.getByTestId("request-door-send").click();
  const problem = page.getByTestId("request-door-problem");
  await expect(page.getByTestId("request-door-received"), "the request is received").toBeVisible({ timeout: 60_000 }).catch(
    async (cause: unknown) => {
      const said = (await problem.innerText({ timeout: 1_000 }).catch(() => "")).trim();
      throw new Error(`request door ${door} not received; problem: ${said || "(none)"}`, { cause });
    },
  );
}

/** The public company-need form, after hydration wrote its fill time. */
async function companyNeedForm(page: Page): Promise<Locator> {
  const form = page.getByTestId("company-need-form");
  await expect(form, "the public form renders without an account").toBeVisible({ timeout: 30_000 });
  await expect(form.locator('input[name="started"]'), "hydration wrote the fill time").not.toHaveValue("", {
    timeout: 60_000,
  });
  return form;
}

async function goal(page: Page, id: string): Promise<void> {
  const seen = track(page);
  await page.goto(`${BASE}/en#goal=${id}`);
  await expect(page.locator(`[data-testid="goal-panel"][data-goal="${id}"]`), "the landing opens the goal's panel").toBeVisible({
    timeout: 30_000,
  });
  await page.goto(INNER);
  await openToggle(page, page.getByTestId(`intent-toggle-${id}`));
  const column = page.getByTestId(`intent-column-${id}`);
  await expect(column).toHaveAttribute("data-active", "true");
  const intent = PUBLIC_INTENTS.find((i) => i.id === id)!;
  for (const link of intent.links) {
    await expect(page.getByTestId(`intent-link-${id}-${link.id}`)).toBeVisible();
  }
  expectNoAuth(seen, `goal ${id}'s links`);
}

async function panelLink(page: Page, intentId: string, link: PublicIntentLink): Promise<void> {
  const seen = track(page);
  await page.goto(INNER);
  await openToggle(page, page.getByTestId(`intent-toggle-${intentId}`));
  const beforeClick = seen.length;
  await page.getByTestId(`intent-link-${intentId}-${link.id}`).click();

  if (link.account) {
    expectNoAuth(seen.slice(0, beforeClick), "the workspace link's click");
    await page.waitForURL(/\/en\/auth\/login/, { timeout: 60_000 });
    sameDestination(nextOf(page.url()), link.href);
    return;
  }

  if (link.href.startsWith("/#request=")) {
    const door = link.href.slice("/#request=".length);
    await expect(page).toHaveURL(new RegExp(`#request=${door}$`), { timeout: 30_000 });
    await sendRequestDoor(page, door, `link-${door}`);
  } else if (link.href === "/company-need") {
    await page.waitForURL(/\/en\/company-need/, { timeout: 60_000 });
    await companyNeedForm(page);
  } else {
    const want = `/en${link.href}`;
    await page.waitForURL((u) => u.pathname === want || AUTH.test(u.pathname), { timeout: 60_000 });
    expectNoAuth(seen, link.href);
    expect(new URL(page.url()).pathname).toBe(want);
    await expect(page.locator("h1").first(), `${link.href} shows its page`).toBeVisible({ timeout: 30_000 });
  }
  expectNoAuth(seen, link.href);
}

async function entry(page: Page, kind: "work" | "hire"): Promise<void> {
  const sentence =
    kind === "work" ? `I am a welder looking for work in Norway ${RUN}` : `I need 5 warehouse workers in Vilnius ${RUN}`;
  const seen = track(page);
  await page.goto(`${BASE}/en`);
  const understanding = page.getByTestId("entry-understanding");
  await expect(async () => {
    if (!(await understanding.isVisible().catch(() => false))) {
      await page.getByTestId("entry-input").fill(sentence);
      await page.getByTestId("entry-submit").click({ timeout: 5_000 });
    }
    await expect(understanding).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await expect(understanding, "the box says it read the sentence").toContainText(sentence);
  if (kind === "work") {
    await expect(page.getByTestId("entry-jobs"), "open jobs are one click away, no account").toBeVisible();
  }
  expectNoAuth(seen, "the box's reading");

  await page.getByTestId("entry-signup").locator("a").click();
  await page.waitForURL(/\/en\/auth\/signup/, { timeout: 60_000 });
  await signUpHere(page, `entry-${kind}`);
  await expect(page.getByTestId("onboarding-said"), "the typed sentence survives sign-up").toContainText(sentence, {
    timeout: 30_000,
  });
}

async function workerSearchDoor(page: Page): Promise<void> {
  const seen = track(page);
  // The worker-search door is the one need form (#3419): its link, old ones
  // included, opens /company-need, which is sent without an account.
  await page.goto(`${BASE}/en#request=worker-search`);
  await page.waitForURL(/\/en\/company-need/, { timeout: 60_000 });
  expect(new URL(page.url()).searchParams.get("from"), "the need form knows it came from the door").toBe(
    "request_worker_search",
  );
  await sendCompanyNeed(page, "door-worker-search");
  expectNoAuth(seen, "the need is sent");
}

async function companyNeed(page: Page): Promise<void> {
  const seen = track(page);
  await page.goto(`${BASE}/en/company-need`);
  await sendCompanyNeed(page, "company-need");
  expectNoAuth(seen, "the need is sent");
}

/** Fill the public company-need form, send it, see the answer. */
async function sendCompanyNeed(page: Page, key: string): Promise<void> {
  const form = await companyNeedForm(page);
  await form.locator('input[name="company_name"]').fill(`Synthetic Path Co ${RUN}`);
  await form.locator('input[name="contact_person"]').fill("Synthetic Contact");
  await form.locator('input[name="contact_email"]').fill(address(key));
  const profession = form.locator('select[name="profession"]');
  await profession.selectOption(await firstOption(profession));
  await form.getByTestId("company-need-country").selectOption("LT");
  await form.locator('input[name="number_of_workers"]').fill("2");
  await form.locator('textarea[name="description"]').fill(`Two workers for a site job (${RUN}).`);
  await page.waitForTimeout(3_500);
  await form.getByTestId("company-need-submit").click();
  await expect(page.getByTestId("company-need-result"), "the form answers the visitor").toBeVisible({ timeout: 60_000 });
}

async function workerIntake(page: Page): Promise<void> {
  const name = `Synthetic Intake ${RUN}`;
  const note = `Intake note ${RUN}`;
  const seen = track(page);
  await page.goto(`${BASE}/en/worker-intake`);
  const form = page.getByTestId("worker-intake-form");
  await expect(form).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await form.locator('input[name="full_name"]').fill(name);
  const profession = form.locator('select[name="profession"]');
  await profession.selectOption(await firstOption(profession));
  await form.locator('textarea[name="comment"]').fill(note);
  await form.getByTestId("worker-intake-submit").click();
  await expect(page.getByTestId("worker-intake-result"), "the intake answers the visitor").toBeVisible({ timeout: 60_000 });
  expectNoAuth(seen, "the intake's answer");

  await page.getByTestId("intake-bridge").locator("a").first().click();
  await page.waitForURL(/\/en\/auth\/signup/, { timeout: 60_000 });
  await signUpHere(page, "intake");
  // A new account onboards first, then lands in the profile builder, where the
  // typed intake waits in the composer for the person to send (#3415). The
  // onboarding name differs from the intake's, so only the carry can show it.
  await page.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });
  await onboard(page, "work", "Synthetic Path Worker");
  await page.waitForURL(/\/en\/dashboard\/profile/, { timeout: 60_000 });
  await expect
    .poll(async () => {
      const held = await pageHolds(page);
      return held.includes(name) && held.includes(note);
    }, { message: "the typed intake survives sign-up into the profile builder", timeout: 30_000 })
    .toBe(true);
}

async function calculator(page: Page): Promise<void> {
  const seen = track(page);
  await page.goto(`${BASE}/en/calculators/project-cost`);
  await expect(page.getByTestId("project-cost-calculator")).toBeVisible({ timeout: 30_000 });
  const workers = page.getByTestId("pcc-workerCount");
  await expect(async () => {
    if (!(await workers.isVisible().catch(() => false))) await page.getByTestId("pcc-next").click({ timeout: 5_000 });
    await expect(workers).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await workers.fill("4");
  await page.getByTestId("pcc-hoursPerWorker").fill("40");
  await page.getByTestId("pcc-next").click();
  await page.getByTestId("pcc-rate").fill("25");
  await page.getByTestId("pcc-next").click();
  await expect(page.getByTestId("pcc-bridge"), "the result offers its next step").toBeVisible({ timeout: 30_000 });
  expectNoAuth(seen, "the estimate");

  await page.getByTestId("pcc-cta-company-need").click();
  await page.waitForURL(/\/en\/company-need/, { timeout: 60_000 });
  const form = await companyNeedForm(page);
  await expect(form.locator('input[name="number_of_workers"]'), "the typed worker count is carried").toHaveValue("4", {
    timeout: 30_000,
  });
  expectNoAuth(seen, "the need form");
}

async function assistant(page: Page): Promise<void> {
  const seen = track(page);
  await page.goto(INNER);
  const link = page.getByTestId("intent-bar-assistant");
  await expect(link).toBeVisible({ timeout: 30_000 });
  expectNoAuth(seen, "the assistant link's click");
  // Signed out, the assistant link is the landing's public find box (#3409).
  await link.click();
  await page.waitForURL((u) => /^\/en\/?$/.test(u.pathname) && u.hash === ASSISTANT_GUEST_HREF.slice(1), { timeout: 60_000 });
  expectNoAuth(seen, "the find box");
}

async function education(page: Page): Promise<void> {
  const seen = track(page);
  await page.goto(INNER);
  await openToggle(page, page.getByTestId("intent-toggle-more"));
  const beforeClick = seen.length;
  await page.getByTestId("intent-more-link-education").click();
  // An institution needs an account for its workspace: the link is its own
  // sign-up door, and sign-up returns it to the institution setup.
  expectNoAuth(seen.slice(0, beforeClick), "the education link's click");
  await page.waitForURL(/\/en\/auth\/signup/, { timeout: 60_000 });
  sameDestination(nextOf(page.url()), INSTITUTION_DOOR_NEXT);
}

const RUNNERS = new Map<string, (page: Page) => Promise<void>>([
  ...PUBLIC_INTENTS.map((i) => [`goal:${i.id}`, (p: Page) => goal(p, i.id)] as const),
  ...PUBLIC_INTENTS.flatMap((i) =>
    i.links.map((l) => [`link:${i.id}.${l.id}`, (p: Page) => panelLink(p, i.id, l)] as const),
  ),
  ["entry:work", (p) => entry(p, "work")],
  ["entry:hire", (p) => entry(p, "hire")],
  ["door:worker-search", workerSearchDoor],
  ["door:company-need", companyNeed],
  ["intake:worker", workerIntake],
  ["calculator:project-cost", calculator],
  ["header:assistant", assistant],
  ["header:education", education],
]);

PUBLIC_PATH_CASES.forEach((c, index) => {
  test(`${c.id} — ${c.title}`, async ({ page }) => {
    // One client address per case. The public intake's per-IP brake (3 sends per
    // 15 min, lib/security/public-form-guard.ts) would otherwise count every
    // isolated spec in this job as one visitor; the brake itself is unit-tested.
    await page.setExtraHTTPHeaders({ "x-real-ip": `198.51.100.${index + 1}` });
    const known = KNOWN.get(c.id);
    test.fail(known !== undefined, known ? `known finding (${known.owner}): ${known.reason}` : "");
    const run = RUNNERS.get(c.id);
    expect(run, `a runner for ${c.id}`).toBeDefined();
    await run!(page);
  });
});
