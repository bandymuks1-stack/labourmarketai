import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type Browser, type BrowserContext, type Page } from "./prod-walk";
import { bearerOf, qaApi } from "./prod-qa-api";
import { assertSyntheticAddress, imapConfigured } from "./prod-qa-imap";

/**
 * The owner-created synthetic QA mailbox account (`qa.invited@`, created by
 * `prod-qa-invited-provision.yml`, minted by prod-qa-walk.yml into the
 * `invited` storage slot) — what the mail walks signed in to it share:
 * prod-alert-mail.spec.ts (J-15 job alert) and the two halves of the weekly
 * digest walk (prod-digest-setup.spec.ts / prod-digest-check.spec.ts).
 *
 * Every write and every clean-up here acts only on that synthetic person's own
 * session (`assertSyntheticSession`). The run log carries counts, kinds and
 * paths only — never an address or a token.
 */
export const ADDRESS = "qa.invited@labourmarket.ai";
export const SLOT = "invited";
export const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
export const STATE = resolve(__dirname, `.storage-state.prod-qa.${SLOT}.json`);
export const PHONE = { width: 390, height: 844 };
export const APP_HOST = new URL(process.env.E2E_BASE_URL ?? "https://labourmarket.ai").host;

/** The walk runs only in prod-qa-walk.yml with the minted account and the QA mailbox. */
export const INVITED_WALK_ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(STATE) && imapConfigured();

function claims(): { sub: string; email?: string } {
  const token = bearerOf(SLOT);
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { sub: string; email?: string };
}
export const subOf = (): string => claims().sub;

/** Every write and every clean-up acts only on the synthetic person's own session. */
export function assertSyntheticSession(): void {
  assertSyntheticAddress(ADDRESS);
  if ((claims().email ?? "").toLowerCase() !== ADDRESS) throw new Error("refused: the walk session is not the synthetic QA mailbox account");
}

export type EventRow = { event_type: string; metadata: Record<string, unknown> | null; created_at: string };

/** The person's own notification rows of one kind, under their own session. */
export async function myEvents(type: string): Promise<EventRow[]> {
  const r = await qaApi(
    `/rest/v1/notification_events?select=event_type,metadata,created_at&recipient_profile_id=eq.${encodeURIComponent(subOf())}&event_type=eq.${type}`,
    bearerOf(SLOT),
  );
  expect(r.status, `my ${type} notifications answered`).toBe(200);
  return (await r.json()) as EventRow[];
}

/** The kinds the person has explicitly switched e-mail on for. */
export async function myEmailConsents(): Promise<string[]> {
  const r = await qaApi(
    `/rest/v1/notification_preferences?select=notification_type&profile_id=eq.${encodeURIComponent(subOf())}&channel=eq.email&enabled=is.true`,
    bearerOf(SLOT),
  );
  return r.status === 200 ? ((await r.json()) as { notification_type: string }[]).map((x) => x.notification_type).sort() : [];
}

/**
 * A 390 px phone context; signed in, it records console errors and 401/403
 * answers into `problems` (each walk asserts that list stays empty).
 */
export async function openPhone(browser: Browser, problems: string[], signedIn = true): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    ...(signedIn ? { storageState: STATE } : {}),
    locale: "lt-LT",
    viewport: PHONE,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  if (signedIn) {
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`console error on ${new URL(page.url()).pathname}`);
    });
    page.on("response", (r) => {
      if (r.status() === 401 || r.status() === 403) problems.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
  }
  return { ctx, page };
}

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
}

export async function expectNoSidewaysScroll(page: Page, where: string, tag: string): Promise<void> {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  console.info(`[${tag}] ${where}: scrollWidth=${scroll} innerWidth=${inner}`);
  expect(scroll, `${where} is wider than the viewport`).toBeLessThanOrEqual(inner + 1);
}

/** Onboarding on a phone, as a person who wants work (no-op once onboarded). */
export async function onboardAsWorker(
  page: Page,
  input: { readonly name: string; readonly professionQuery: string; readonly professionSlug: string },
  tag: string,
): Promise<void> {
  await page.goto("/lt/dashboard");
  await settle(page);
  if (!/\/onboarding$/.test(new URL(page.url()).pathname)) return;
  if (await page.getByTestId("onboarding-intent-work").isVisible().catch(() => false)) {
    await page.getByTestId("onboarding-intent-work").click();
    await page.getByTestId("onboarding-intents-continue").click();
  }
  await expect(page.getByTestId("onboarding-display-name")).toBeVisible();
  await page.getByTestId("onboarding-display-name").fill(input.name);
  await page.getByTestId("onboarding-country").click();
  await page.getByTestId("onboarding-country-field").locator('input:not([type="hidden"])').first().fill("Liet");
  await page.getByRole("option", { name: /^Lietuva$/ }).first().click();
  await page.getByTestId("onboarding-profession-input").fill(input.professionQuery);
  await page.getByTestId(`onboarding-profession-suggestion-${input.professionSlug}`).click();
  await expectNoSidewaysScroll(page, "onboarding (390)", tag);
  await page.getByTestId("onboarding-submit").click();
  await page.waitForURL((u) => !/\/onboarding/.test(u.pathname), { timeout: 60_000 });
  await settle(page);
}

/** The person's worker id (onboarding created it). */
export async function myWorkerId(): Promise<string> {
  const w = await qaApi(`/rest/v1/workers?select=id&profile_id=eq.${encodeURIComponent(subOf())}`, bearerOf(SLOT));
  expect(w.status).toBe(200);
  const [worker] = (await w.json()) as { id: string }[];
  expect(worker, "onboarding created the worker").toBeTruthy();
  return worker.id;
}

/** Switches e-mail on for each kind in the account's notification settings (real UI). */
export async function switchEmailOn(page: Page, kinds: readonly string[], tag: string): Promise<void> {
  await page.goto("/lt/dashboard/account");
  await settle(page);
  const section = page.getByTestId("account-notification-preferences");
  await expect(section).toBeVisible({ timeout: 30_000 });
  if ((await section.getAttribute("open")) === null) await section.locator("summary").first().click();
  await expect(page.getByTestId("notification-prefs-email-inactive"), "production has a configured mailbox").toHaveCount(0);
  for (const kind of kinds) {
    const box = page.getByTestId(`notification-pref-${kind}-email`);
    await expect(box, `the ${kind} e-mail switch is offered`).toBeVisible({ timeout: 30_000 });
    if (!(await box.isChecked())) await box.click();
    await expect(box).toBeChecked();
    await expect(page.getByTestId("notification-prefs-notice")).toHaveAttribute("data-state", "saved", { timeout: 30_000 });
  }
  await expectNoSidewaysScroll(page, "account, notification settings (390)", tag);
}

/** Requests and confirms the synthetic person's account deletion on a phone
 *  (the same path as I-6 of prod-invited-worker.spec.ts). False when the
 *  15-minute sign-in window has passed. */
export async function deleteOwnAccount(browser: Browser, problems: string[], tag: string): Promise<boolean> {
  assertSyntheticSession();
  const { ctx, page } = await openPhone(browser, problems);
  try {
    await page.goto("/lt/dashboard/privacy#privacy-deletion");
    await settle(page);
    const section = page.getByTestId("privacy-deletion");
    await expect(section, "the deletion section is on the privacy page").toBeVisible({ timeout: 30_000 });
    if (await section.getByTestId("privacy-deletion-confirmed").isVisible().catch(() => false)) return true;
    if (await section.getByTestId("privacy-deletion-submit").isVisible().catch(() => false)) {
      await section.getByTestId("privacy-deletion-confirm").check();
      await section.getByTestId("privacy-deletion-submit").click();
      await expect(
        section.getByTestId("privacy-deletion-submitted").or(section.getByTestId("privacy-deletion-confirm-step")),
      ).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await settle(page);
    }
    const final = section.getByTestId("privacy-deletion-confirm-final");
    const reauth = section.getByTestId("privacy-deletion-reauth");
    await expect(final.or(reauth), "the confirmation step is shown").toBeVisible({ timeout: 30_000 });
    if (await reauth.isVisible()) return false;
    await final.click();
    await expect(section.getByTestId("privacy-deletion-confirmed")).toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page, "privacy deletion (390)", tag);
    return true;
  } finally {
    await ctx.close();
  }
}

/** The same deletion through the two functions the privacy page calls, for an
 *  account the page cannot reach (no role: it is sent to onboarding). */
export async function deleteOwnAccountByApi(): Promise<"confirmed" | "reauth_required" | "failed"> {
  assertSyntheticSession();
  const token = bearerOf(SLOT);
  const submitted = await qaApi("/rest/v1/rpc/submit_privacy_request_v1", token, {
    method: "POST",
    body: { p_request_type: "account_deletion", p_note: `QA-SYNTHETIC walk clean-up (${RUN})` },
  });
  if (submitted.status !== 200 && !/too_many_open/.test(await submitted.text())) return "failed";
  const confirmed = await qaApi("/rest/v1/rpc/privacy_confirm_account_deletion_v1", token, { method: "POST", body: {} });
  if (confirmed.status !== 200) return "failed";
  const body = (await confirmed.json()) as { ok?: boolean; error?: string };
  return body.ok ? "confirmed" : body.error === "reauth_required" ? "reauth_required" : "failed";
}
