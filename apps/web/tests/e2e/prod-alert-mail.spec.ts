import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";
import { bearerOf, qaApi } from "./prod-qa-api";
import { assertSyntheticAddress, imapConfigured, nextUid, waitForMailLink } from "./prod-qa-imap";

/**
 * PRODUCTION — A NEW MATCHING JOB REACHES THE PERSON BY E-MAIL, AND THE MAILED
 * LINK OPENS THE JOB WITHOUT SIGNING IN (journey J-15; register rows 4.9 saved
 * searches + alerts, 5.7 e-mail notifications, 5.9 weekly digest).
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=alert-mail), signed
 * in to `qa.invited@labourmarket.ai` (the one synthetic address whose mail
 * lands in the owner's read-only QA mailbox, `prod-qa-imap.ts`). The account
 * is created by the owner (`prod-qa-invited-provision.yml`, confirmed,
 * passwordless, no role); the walk never creates one.
 *
 * THE TRIGGER IS THE PRODUCT'S OWN, AND IT WRITES NO DEMAND. A job alert
 * (`job_alert`, lib/notifications/event-emitters.ts) is computed from the
 * person's stated work type + preferred countries over the canonical public
 * vacancy read (live, not expired, published in the last 3 days, newest 3).
 * It fires read-time on the person's own dashboard render (and daily from the
 * VPS cron). The live Swedish ingestion publishes new `cleaner` ads every day,
 * so a synthetic cleaner who wants to work in Sweden is matched by real,
 * already-public ads — nothing is published, nobody else is contacted. The
 * e-mail goes out only because the person opted in to it, through the one
 * notification dispatcher, and its link is the ad's public page.
 *
 *   A-0  API: no job alert yet; an anonymous caller reads no notifications;
 *   A-1  390 px: onboarding as a cleaner (work type `cleaner`);
 *   A-2  390 px: e-mail switched on for job alerts, saved-search alerts and
 *        the weekly digest — the consent rows are stored per kind;
 *   A-3  390 px: the work card says "Sweden"; the save (or the next visit) writes
 *        the job alert(s) and the alert e-mail (5.7: a non-invitation kind)
 *        arrives in the QA mailbox;
 *   A-4  390 px, SIGNED OUT: the mailed link opens that very job's public page
 *        — no sign-in wall, no sideways scroll;
 *   A-5  390 px: a saved search (cleaner, Sweden) is stored with alerts on and
 *        reopens from the board; whether the board's own cards produce a
 *        saved-search alert is reported, not assumed;
 *   A-6  digest: what one walk CAN prove — the e-mail consent (A-2) and this
 *        week's in-app digest row. The digest e-mail is the Monday 07:00 UTC
 *        sweep, for workers who did NOT visit that week; a walk that visits
 *        cannot observe it, and says so;
 *   A-7  every signed-in page of the walk: no console error, no 401/403;
 *   A-8  clean-up: the saved search is deleted, then the account deletion is
 *        requested and confirmed on the privacy page (as I-6 of
 *        prod-invited-worker.spec.ts); afterAll repeats it on any failure.
 *
 * Only synthetic text (QA-SYNTHETIC). The run log carries counts, kinds,
 * seconds and paths only — never an address, a token or an ad's content.
 */
const ADDRESS = "qa.invited@labourmarket.ai";
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SLOT = "invited";
const state = resolve(__dirname, `.storage-state.prod-qa.${SLOT}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state) && imapConfigured();
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with the owner-created synthetic account and the QA mailbox (owner D-4)");
test.describe.configure({ mode: "serial", timeout: 420_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { width: 390, height: 844 };
const NAME = "QA-SYNTHETIC Įspėjimų darbuotojas";
const PROFESSION = "cleaner";
const COUNTRY = "SE";
const SAVED_LABEL = `QA-SYNTHETIC valytojas SE ${RUN}`.slice(0, 80);
const inMain = (page: Page): Locator => page.getByRole("main");

const APP_HOST = new URL(process.env.E2E_BASE_URL ?? "https://labourmarket.ai").host;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** Only an HTTPS link to this site's own public job page is ever followed. */
const JOB_LINK = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.host === APP_HOST && new RegExp(`^/[a-z]{2}/jobs/${UUID}$`, "i").test(url.pathname);
  } catch {
    return false;
  }
};

function claims(): { sub: string; email?: string } {
  const token = bearerOf(SLOT);
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { sub: string; email?: string };
}
const subOf = (): string => claims().sub;

/** Every write and every clean-up acts only on the synthetic person's own session. */
function assertSyntheticSession(): void {
  assertSyntheticAddress(ADDRESS);
  if ((claims().email ?? "").toLowerCase() !== ADDRESS) throw new Error("refused: the walk session is not the synthetic QA mailbox account");
}

type EventRow = { event_type: string; metadata: Record<string, unknown> | null; created_at: string };
async function myEvents(type: string): Promise<EventRow[]> {
  const r = await qaApi(
    `/rest/v1/notification_events?select=event_type,metadata,created_at&recipient_profile_id=eq.${encodeURIComponent(subOf())}&event_type=eq.${type}`,
    bearerOf(SLOT),
  );
  expect(r.status, `my ${type} notifications answered`).toBe(200);
  return (await r.json()) as EventRow[];
}

/** Console errors and 401/403 answers seen on the walk's signed-in pages (A-7). */
const problems: string[] = [];

async function open(browser: Browser, signedIn = true): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    ...(signedIn ? { storageState: state } : {}),
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

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
}

async function expectNoSidewaysScroll(page: Page, where: string): Promise<void> {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  console.info(`[alert-mail] ${where}: scrollWidth=${scroll} innerWidth=${inner}`);
  expect(scroll, `${where} is wider than the viewport`).toBeLessThanOrEqual(inner + 1);
}

const shared: { since?: number; alertIds: string[]; jobPath?: string; searchId?: string } = { alertIds: [] };

test("A-0. API: no job alert yet, and an anonymous caller reads no notifications", async () => {
  assertSyntheticSession();
  const before = await myEvents("job_alert");
  console.info(`[alert-mail] job alerts before the walk: ${before.length}`);
  expect(before, "a fresh synthetic account starts without job alerts").toHaveLength(0);
  const anon = await qaApi("/rest/v1/notification_events?select=id&limit=1", null);
  const rows = anon.status === 200 ? ((await anon.json()) as unknown[]).length : 0;
  console.info(`[alert-mail] anonymous read answered ${anon.status}, rows=${rows}`);
  expect(rows, "an anonymous caller sees no notification").toBe(0);
});

test("A-1. 390 px: onboarding as a cleaner", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  try {
    await page.goto("/lt/dashboard");
    await settle(page);
    if (/\/onboarding$/.test(new URL(page.url()).pathname)) {
      if (await page.getByTestId("onboarding-intent-work").isVisible().catch(() => false)) {
        await page.getByTestId("onboarding-intent-work").click();
        await page.getByTestId("onboarding-intents-continue").click();
      }
      await expect(page.getByTestId("onboarding-display-name")).toBeVisible();
      await page.getByTestId("onboarding-display-name").fill(NAME);
      await page.getByTestId("onboarding-country").click();
      await page.getByTestId("onboarding-country-field").locator('input:not([type="hidden"])').first().fill("Liet");
      await page.getByRole("option", { name: /^Lietuva$/ }).first().click();
      await page.getByTestId("onboarding-profession-input").fill("Valytoj");
      await page.getByTestId(`onboarding-profession-suggestion-${PROFESSION}`).click();
      await expectNoSidewaysScroll(page, "onboarding (390)");
      await page.getByTestId("onboarding-submit").click();
      await page.waitForURL((u) => !/\/onboarding/.test(u.pathname), { timeout: 60_000 });
      await settle(page);
    }
  } finally {
    await ctx.close();
  }
  const token = bearerOf(SLOT);
  const w = await qaApi(`/rest/v1/workers?select=id&profile_id=eq.${encodeURIComponent(subOf())}`, token);
  expect(w.status).toBe(200);
  const [worker] = (await w.json()) as { id: string }[];
  expect(worker, "onboarding created the worker").toBeTruthy();
  const p = await qaApi(`/rest/v1/worker_professions?select=professions(slug)&worker_id=eq.${worker.id}`, token);
  expect(p.status).toBe(200);
  const slugs = ((await p.json()) as { professions: { slug: string } | null }[]).map((r) => r.professions?.slug);
  console.info(`[alert-mail] declared work types: ${slugs.join(",")}`);
  expect(slugs, "the person's work type is the catalogue's cleaner").toContain(PROFESSION);
});

test("A-2. 390 px: e-mail on for job alerts, saved-search alerts and the digest; consent stored per kind", async ({ browser }) => {
  assertSyntheticSession();
  const kinds = ["job_alert", "saved_search_match", "weekly_digest"];
  const { ctx, page } = await open(browser);
  try {
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
    await expectNoSidewaysScroll(page, "account, notification settings (390)");
  } finally {
    await ctx.close();
  }
  await expect
    .poll(
      async () => {
        const r = await qaApi(
          `/rest/v1/notification_preferences?select=notification_type&profile_id=eq.${encodeURIComponent(subOf())}&channel=eq.email&enabled=is.true`,
          bearerOf(SLOT),
        );
        return r.status === 200 ? ((await r.json()) as { notification_type: string }[]).map((x) => x.notification_type).sort() : [];
      },
      { message: "explicit e-mail consent is stored per kind", timeout: 30_000 },
    )
    .toEqual([...kinds].sort());
});

test("A-3. 390 px: the work card says Sweden; the next visit writes the job alert and its e-mail arrives", async ({ browser }) => {
  assertSyntheticSession();
  const { ctx, page } = await open(browser);
  try {
    // The work card lives in the profile's folded "details" disclosure
    // (#cv-details). The person reaches it the way the hub's readiness step
    // links to it: `#cv-availability`, which DetailsHashOpener opens on
    // arrival. Run 41469193732 went to the bare page and waited on a toggle
    // inside the still-closed disclosure. Tapping the bar is the fallback.
    await page.goto("/lt/dashboard/profile#cv-availability");
    await settle(page);
    const card = inMain(page).getByTestId("profile-work-card-editor");
    if (!(await card.isVisible().catch(() => false))) {
      await inMain(page).locator("details#cv-details > summary").click();
    }
    await expect(card, "the work card is reachable on a phone").toBeVisible({ timeout: 30_000 });
    const toggle = card.getByTestId("work-card-editor-toggle");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    const editor = card.getByTestId("work-card-editor");
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.locator('input[name="preferred_countries"]').fill(COUNTRY);
    await expectNoSidewaysScroll(page, "profile, work card (390)");
    // Read the mailbox position BEFORE the save: the save clears the alert
    // throttle and revalidates the layout, whose re-render can already write
    // the alert and send its mail — the dashboard visit below would then send
    // nothing new (dedupe). Only mail that arrives after this point counts.
    shared.since = await nextUid();
    const t0 = Date.now();
    await editor.getByTestId("work-card-save").click();
    await expect(editor.getByTestId("work-card-saved").or(editor.getByTestId("work-card-error"))).toBeVisible({ timeout: 30_000 });
    expect(await editor.getByTestId("work-card-error").isVisible(), "the work card was refused").toBe(false);

    await page.goto("/lt/dashboard");
    await settle(page);
    await expectNoSidewaysScroll(page, "worker home (390)");
    await expect
      .poll(async () => (await myEvents("job_alert")).length, {
        message: "the save or the next dashboard visit writes the job alert (live Swedish cleaner ads from the last 3 days)",
        timeout: 90_000,
        intervals: [5_000],
      })
      .toBeGreaterThan(0);
    const alerts = await myEvents("job_alert");
    shared.alertIds = alerts.map((a) => String(a.metadata?.vacancyId ?? "")).filter(Boolean);
    console.info(`[alert-mail] job alerts written=${alerts.length} after ~${Math.round((Date.now() - t0) / 1000)} s`);
    expect(shared.alertIds.length, "each alert names its ad").toBe(alerts.length);
  } finally {
    await ctx.close();
  }
  const mail = await waitForMailLink(ADDRESS, shared.since!, JOB_LINK);
  shared.jobPath = new URL(mail.link).pathname;
  const id = shared.jobPath.split("/").pop() ?? "";
  console.info(`[alert-mail] alert e-mail arrived after ~${mail.seconds} s; links to an alerted ad=${shared.alertIds.includes(id)}`);
  expect(shared.alertIds, "the mailed link is one of the ads the alert named").toContain(id);
});

test("A-4. 390 px, signed out: the mailed link opens that job's public page", async ({ browser }) => {
  expect(shared.jobPath, "A-3 received the alert e-mail").toBeTruthy();
  const { ctx, page } = await open(browser, false);
  try {
    const res = await page.goto(shared.jobPath!);
    await settle(page);
    const landed = new URL(page.url()).pathname;
    console.info(`[alert-mail] signed out: status=${res?.status()} landed on the job page=${landed === shared.jobPath}`);
    expect(res?.status(), "the public job page answers").toBe(200);
    expect(landed, "no sign-in wall in front of the job").toBe(shared.jobPath);
    expect(await page.locator('input[type="password"]').count(), "no sign-in form").toBe(0);
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page, "public job page, signed out (390)");
  } finally {
    await ctx.close();
  }
});

test("A-5. 390 px: a saved search is stored with alerts on and reopens from the board", async ({ browser }) => {
  assertSyntheticSession();
  const { ctx, page } = await open(browser);
  try {
    await page.goto(`/lt/dashboard/opportunities?view=all&country=${COUNTRY}&profession=${PROFESSION}`);
    await settle(page);
    const strip = page.getByTestId("saved-searches").filter({ visible: true }).first();
    await expect(strip, "the saved-search strip is offered on a filtered board").toBeVisible({ timeout: 30_000 });
    if ((await strip.getAttribute("open")) === null) await strip.locator("summary").click();
    await strip.getByTestId("saved-search-label").fill(SAVED_LABEL);
    await strip.getByTestId("saved-search-save").click();
    await expectNoSidewaysScroll(page, "opportunities, saved search (390)");
    await expect
      .poll(
        async () => {
          const r = await qaApi(`/rest/v1/worker_saved_searches?select=id,label,notify,criteria`, bearerOf(SLOT));
          const rows = r.status === 200 ? ((await r.json()) as { id: string; label: string; notify: boolean; criteria: Record<string, string> }[]) : [];
          const mine = rows.find((x) => x.label === SAVED_LABEL);
          if (mine) shared.searchId = mine.id;
          return mine ? `${mine.notify}:${mine.criteria.country}:${mine.criteria.profession}` : "";
        },
        { message: "the saved search is stored, alerts on, with its question", timeout: 30_000 },
      )
      .toBe(`true:${COUNTRY}:${PROFESSION}`);

    await page.goto("/lt/dashboard/opportunities?view=all");
    await settle(page);
    const row = page.getByTestId(`saved-search-${shared.searchId}`).filter({ visible: true }).first();
    await expect(row, "the saved search is listed").toBeVisible({ timeout: 30_000 });
    await row.getByTestId("saved-search-open").click();
    await page.waitForURL(new RegExp(`country=${COUNTRY}`), { timeout: 30_000 });
    await settle(page);
  } finally {
    await ctx.close();
  }
  // The saved-search alert counts the board's own cards (organization needs);
  // whether any fits right now is the market's fact, not the walk's — reported.
  const searchAlerts = await myEvents("saved_search_match");
  console.info(`[alert-mail] saved-search alerts written=${searchAlerts.length} (depends on live organization needs that fit)`);
});

test("A-6. digest: the e-mail consent is stored (A-2); this week's in-app digest is reported", async () => {
  const digests = await myEvents("weekly_digest");
  console.info(
    `[alert-mail] this week's in-app digest rows=${digests.length}. The digest E-MAIL is the Monday 07:00 UTC sweep for ` +
      "workers who did not visit that week; a walk that visits cannot observe it (by design).",
  );
  expect(digests.length, "at most one digest a week").toBeLessThanOrEqual(1);
});

test("A-7. no console error and no 401/403 on the walk's signed-in pages", async () => {
  console.info(`[alert-mail] problems seen=${problems.length}${problems.length ? `: ${[...new Set(problems)].join("; ")}` : ""}`);
  expect(problems, "signed-in pages are free of console errors and auth refusals").toEqual([]);
});

/** Deletes the walk's saved search on the board (no-op when there is none). */
async function deleteSavedSearch(browser: Browser): Promise<void> {
  if (!shared.searchId) return;
  assertSyntheticSession();
  const { ctx, page } = await open(browser);
  try {
    await page.goto("/lt/dashboard/opportunities?view=all");
    await settle(page);
    const row = page.getByTestId(`saved-search-${shared.searchId}`).filter({ visible: true }).first();
    if (await row.isVisible().catch(() => false)) {
      await row.getByTestId("saved-search-delete").click();
      await expect(row).toHaveCount(0, { timeout: 30_000 });
    }
  } finally {
    await ctx.close();
  }
  const r = await qaApi(`/rest/v1/worker_saved_searches?select=id&id=eq.${shared.searchId}`, bearerOf(SLOT));
  const left = r.status === 200 ? ((await r.json()) as unknown[]).length : -1;
  console.info(`[alert-mail] saved search left after delete=${left}`);
  expect(left, "the saved search is removed").toBe(0);
}

/** Requests and confirms the synthetic person's account deletion on a phone
 *  (the same path as I-6 of prod-invited-worker.spec.ts). False when the
 *  15-minute sign-in window has passed. */
async function deleteOwnAccount(browser: Browser): Promise<boolean> {
  assertSyntheticSession();
  const { ctx, page } = await open(browser);
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
    await expectNoSidewaysScroll(page, "privacy deletion (390)");
    return true;
  } finally {
    await ctx.close();
  }
}

/** The same deletion through the two functions the privacy page calls, for an
 *  account the page cannot reach (no role: it is sent to onboarding). */
async function deleteOwnAccountByApi(): Promise<"confirmed" | "reauth_required" | "failed"> {
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

let deletionConfirmed = false;

test("A-8. clean-up: the saved search is deleted, then the account is deleted through the privacy page", async ({ browser }) => {
  await deleteSavedSearch(browser);
  deletionConfirmed = await deleteOwnAccount(browser);
  expect(deletionConfirmed, "the walk's sign-in is older than the confirmation window").toBe(true);
  console.info("[alert-mail] A-8 account deletion requested and confirmed; the erasure runner removes the account");
});

// A serial suite skips A-8 after any earlier failure — exactly the runs that
// most need the clean-up — so it is also done here, always. Erasure removes
// the saved search with the account even when the board delete failed.
test.afterAll(async ({ browser }) => {
  if (deletionConfirmed) return;
  test.setTimeout(180_000);
  await deleteSavedSearch(browser).catch(() => console.info("[alert-mail] clean-up: the saved search delete failed; erasure removes it"));
  try {
    deletionConfirmed = await deleteOwnAccount(browser);
  } catch {
    deletionConfirmed = false;
  }
  if (deletionConfirmed) {
    console.info("[alert-mail] clean-up: account deletion confirmed on the privacy page");
    return;
  }
  try {
    const outcome = await deleteOwnAccountByApi();
    deletionConfirmed = outcome === "confirmed";
    console.info(`[alert-mail] clean-up through the privacy functions: ${outcome}`);
  } catch {
    console.info("[alert-mail] clean-up: the account deletion could not be requested; the owner confirms it by hand");
  }
});
