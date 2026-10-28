import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";
import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION — THE INVITED WORKER WHO REGISTERS WITHOUT THE LINK (owner
 * decision 2026-10-28; the path the first real referred person took).
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=invited-worker),
 * signed in to `qa.invited+act1@labourmarket.ai`. The owner's
 * `prod-qa-invited-provision.yml` stored ONE synthetic partner referral
 * addressed to it (`QA-SYNTHETIC-invited-act1`) and created the account
 * (confirmed, passwordless, no role). The walk never creates either, and it
 * arrives at the site WITHOUT `?next=/invite/<token>` — the token was discarded
 * at provisioning, exactly like a person who opened the mail elsewhere.
 *
 *   I-0  API: the person's own pending invitations hold exactly one
 *        join_platform (what onboarding will find);
 *   I-1  390 px phone: onboarding from the place a new person lands; records
 *        whether the role question was asked and how long it took;
 *   I-2  API: the invitation is no longer pending and the role is worker;
 *   I-3  1280 desktop: the first Work Journal entry reaches the Living CV with
 *        the exact hours the person's own journal holds;
 *   I-4  768 tablet + 390 phone: home and Living CV never scroll sideways.
 *
 * Only synthetic text (QA-SYNTHETIC). Afterwards the owner revokes and purges
 * the account (prod-qa-invited-provision revoke-invited +
 * docs/qa/invited-worker-purge.sql); the walk's sessions are revoked at its end.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SLOT = "invited";
const state = resolve(__dirname, `.storage-state.prod-qa.${SLOT}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state);
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with the owner-created invited worker");
test.describe.configure({ mode: "serial", timeout: 300_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };
const NAME = "QA-SYNTHETIC Pakviestas darbuotojas";
const ENTRY = `[QA-SYNTHETIC] Šiandien sumūrijau 6 m² sienos, 7 val. (${RUN})`;
const inMain = (page: Page): Locator => page.getByRole("main");

type Invitation = { id: string; invitation_type: string };

function subOf(): string {
  const token = bearerOf(SLOT);
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
}

async function myPendingInvitations(): Promise<Invitation[]> {
  const r = await qaApi("/rest/v1/rpc/list_invitations_for_me_v1", bearerOf(SLOT), { method: "POST", body: {} });
  expect(r.status, "my invitations answered").toBe(200);
  const body = (await r.json()) as { items?: Invitation[]; email_unverified?: boolean };
  expect(body.email_unverified ?? false, "the synthetic address is verified").toBe(false);
  return body.items ?? [];
}

async function ownJournalHours(): Promise<{ entries: number; hours: number }> {
  const token = bearerOf(SLOT);
  const w = await qaApi(`/rest/v1/workers?select=id&profile_id=eq.${encodeURIComponent(subOf())}`, token);
  expect(w.status).toBe(200);
  const [worker] = (await w.json()) as { id: string }[];
  expect(worker, "the person has a worker row").toBeTruthy();
  const r = await qaApi(
    `/rest/v1/journal_entries?select=id,journal_entry_metrics(metric_slug,value_numeric,unit_slug)&worker_id=eq.${worker.id}`,
    token,
  );
  expect(r.status).toBe(200);
  const rows = (await r.json()) as { journal_entry_metrics: { metric_slug: string; value_numeric: number | null; unit_slug: string | null }[] }[];
  let hours = 0;
  for (const e of rows) {
    for (const m of e.journal_entry_metrics ?? []) {
      if (m.metric_slug === "fragment_time" && m.unit_slug === "hours") hours += Number(m.value_numeric ?? 0);
    }
  }
  return { entries: rows.length, hours };
}

async function open(browser: Browser, viewport: { width: number; height: number }, mobile: boolean): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: state,
    locale: "lt-LT",
    viewport,
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
}

async function expectNoSidewaysScroll(page: Page, where: string): Promise<void> {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  console.info(`[invited] ${where}: scrollWidth=${scroll} innerWidth=${inner}`);
  expect(scroll, `${where} is wider than the viewport`).toBeLessThanOrEqual(inner + 1);
}

test("I-0. API: exactly one pending join_platform invitation is addressed to the person", async () => {
  const pending = await myPendingInvitations();
  const joinPlatform = pending.filter((i) => i.invitation_type === "join_platform");
  console.info(`[invited] pending invitations=${pending.length} join_platform=${joinPlatform.length}`);
  expect(joinPlatform, "the owner's synthetic referral is waiting").toHaveLength(1);
});

test("I-1. 390 px: onboarding WITHOUT the link, from where a new person lands", async ({ browser }) => {
  const { ctx, page } = await open(browser, PHONE, true);
  try {
    await page.goto("/en/dashboard");
    await settle(page);
    const url = new URL(page.url());
    console.info(`[invited] landed on ${url.pathname}${url.search}`);
    expect(url.pathname, "a new account lands on onboarding").toMatch(/\/onboarding$/);
    expect(url.searchParams.get("next") ?? "", "the walk carries no invitation link").not.toMatch(/\/invite\//);
    const t0 = Date.now();
    const roleAsked = await page.getByTestId("onboarding-intent-work").isVisible().catch(() => false);
    console.info(`[invited] role question asked=${roleAsked}`);
    if (roleAsked) {
      await page.getByTestId("onboarding-intent-work").click();
      await page.getByTestId("onboarding-intents-continue").click();
    }
    await expect(page.getByTestId("onboarding-display-name")).toBeVisible();
    await page.getByTestId("onboarding-display-name").fill(NAME);
    await page.getByTestId("onboarding-country").click();
    await page.getByTestId("onboarding-country-field").locator('input:not([type="hidden"])').first().fill("Liet");
    await page.getByRole("option", { name: /^Lietuva$/ }).first().click();
    const profession = page.getByTestId("onboarding-profession-input");
    if (await profession.isVisible().catch(() => false)) {
      await profession.fill("Mūrinink");
      const suggestion = page.getByTestId("onboarding-profession-suggestions").getByRole("button").first();
      if (await suggestion.isVisible().catch(() => false)) await suggestion.click();
      else await page.getByTestId("onboarding-profession-add").click();
    }
    await expectNoSidewaysScroll(page, "onboarding (390)");
    await page.getByTestId("onboarding-submit").click();
    await page.waitForURL((u) => !/\/onboarding/.test(u.pathname), { timeout: 60_000 });
    await settle(page);
    console.info(`[invited] onboarding done in ${Math.round((Date.now() - t0) / 1000)} s → ${new URL(page.url()).pathname}`);
  } finally {
    await ctx.close();
  }
});

test("I-2. API: the invitation was accepted and the role is worker", async () => {
  const pending = await myPendingInvitations();
  const stillPending = pending.filter((i) => i.invitation_type === "join_platform").length;
  console.info(`[invited] join_platform still pending after onboarding=${stillPending}`);
  expect(stillPending, "onboarding did not accept the addressed invitation").toBe(0);
  const p = await qaApi(`/rest/v1/profiles?select=active_role,onboarded_at&id=eq.${encodeURIComponent(subOf())}`, bearerOf(SLOT));
  expect(p.status).toBe(200);
  const [profile] = (await p.json()) as { active_role: string | null; onboarded_at: string | null }[];
  console.info(`[invited] profile active_role=${profile?.active_role} onboarded=${Boolean(profile?.onboarded_at)}`);
  expect(profile?.active_role).toBe("worker");
  expect(profile?.onboarded_at).toBeTruthy();
});

test("I-3. 1280: the first Work Journal entry reaches the Living CV with the person's exact hours", async ({ browser }) => {
  const { ctx, page } = await open(browser, DESKTOP, false);
  try {
    await page.goto("/lt/dashboard/journal");
    await settle(page);
    await inMain(page).getByTestId("journal-quick-record-text").fill(ENTRY);
    await inMain(page).getByTestId("journal-quick-record-understand").click();
    await expect(inMain(page).getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
    const done = inMain(page).getByTestId("worklog-done");
    const failed = inMain(page).getByTestId("worklog-error").or(inMain(page).getByTestId("worklog-blocked"));
    for (const id of ["worklog-save", "worklog-confirm"]) {
      if (await done.isVisible().catch(() => false)) break;
      const button = inMain(page).getByTestId(id);
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        await expect(done.or(failed).or(inMain(page).getByTestId("worklog-confirm"))).toBeVisible({ timeout: 30_000 });
      }
    }
    await expect(done.or(failed)).toBeVisible({ timeout: 30_000 });
    expect(await failed.isVisible(), "the journal entry was refused").toBe(false);
    const db = await ownJournalHours();
    await done.getByTestId("worklog-living-cv-link").click();
    await page.waitForURL(/\/cv/, { timeout: 30_000 });
    await settle(page);
    const recorded = (await page.getByTestId("cv-recorded-hours").filter({ visible: true }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
    const m = /Užfiksuota darbo: ([\d.,]+) val\..*patvirtinta ([\d.,]+) val/.exec(recorded);
    console.info(`[invited] DB: entries=${db.entries} hours=${db.hours} | CV: recorded=${m?.[1] ?? "?"} confirmed=${m?.[2] ?? "?"}`);
    expect(m, "the Living CV states recorded and confirmed hours").not.toBeNull();
    expect(Number(m![1].replace(",", "."))).toBe(db.hours);
    expect(Number(m![2].replace(",", "."))).toBe(0);
  } finally {
    await ctx.close();
  }
});

test("I-4. 768 tablet and 390 phone: home and Living CV never scroll sideways", async ({ browser }) => {
  for (const [label, viewport, mobile] of [["768", TABLET, true], ["390", PHONE, true]] as const) {
    const { ctx, page } = await open(browser, viewport, mobile);
    try {
      await page.goto("/lt/dashboard");
      await settle(page);
      await expectNoSidewaysScroll(page, `worker home (${label})`);
      await page.goto("/lt/cv");
      await settle(page);
      await expectNoSidewaysScroll(page, `Living CV (${label})`);
    } finally {
      await ctx.close();
    }
  }
});
