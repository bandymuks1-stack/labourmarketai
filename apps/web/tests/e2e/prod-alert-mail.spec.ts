import { test, expect, type Browser, type Locator, type Page } from "./prod-walk";
import { bearerOf, qaApi } from "./prod-qa-api";
import { nextUid, waitForMailLink } from "./prod-qa-imap";
import {
  ADDRESS,
  APP_HOST,
  INVITED_WALK_ENABLED,
  RUN,
  SLOT,
  assertSyntheticSession,
  deleteOwnAccount as deleteAccountOnPhone,
  deleteOwnAccountByApi,
  expectNoSidewaysScroll as noSidewaysScroll,
  myEmailConsents,
  myEvents,
  myWorkerId,
  onboardAsWorker,
  openPhone,
  settle,
  switchEmailOn,
} from "./prod-qa-invited";


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
 *        cannot observe it — prod-digest-setup/-check.spec.ts prove it;
 *   A-7  every signed-in page of the walk: no console error, no 401/403;
 *   A-8  clean-up: the saved search is deleted, then the account deletion is
 *        requested and confirmed on the privacy page (as I-6 of
 *        prod-invited-worker.spec.ts); afterAll repeats it on any failure.
 *
 * Only synthetic text (QA-SYNTHETIC). The run log carries counts, kinds,
 * seconds and paths only — never an address, a token or an ad's content.
 */
test.skip(!INVITED_WALK_ENABLED, "production walk: runs only in prod-qa-walk.yml with the owner-created synthetic account and the QA mailbox (owner D-4)");
test.describe.configure({ mode: "serial", timeout: 420_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const TAG = "alert-mail";
const NAME = "QA-SYNTHETIC Įspėjimų darbuotojas";
const PROFESSION = "cleaner";
const COUNTRY = "SE";
const SAVED_LABEL = `QA-SYNTHETIC valytojas SE ${RUN}`.slice(0, 80);
const inMain = (page: Page): Locator => page.getByRole("main");

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

/** Console errors and 401/403 answers seen on the walk's signed-in pages (A-7). */
const problems: string[] = [];
const open = (browser: Browser, signedIn = true) => openPhone(browser, problems, signedIn);
const expectNoSidewaysScroll = (page: Page, where: string) => noSidewaysScroll(page, where, TAG);
const deleteOwnAccount = (browser: Browser) => deleteAccountOnPhone(browser, problems, TAG);


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
    await onboardAsWorker(page, { name: NAME, professionQuery: "Valytoj", professionSlug: PROFESSION }, TAG);
  } finally {
    await ctx.close();
  }
  const workerId = await myWorkerId();
  const p = await qaApi(`/rest/v1/worker_professions?select=professions(slug)&worker_id=eq.${workerId}`, bearerOf(SLOT));
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
    await switchEmailOn(page, kinds, TAG);
  } finally {
    await ctx.close();
  }
  await expect
    .poll(myEmailConsents, { message: "explicit e-mail consent is stored per kind", timeout: 30_000 })
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
      "workers who did not visit that week; a walk that visits cannot observe it — digest-setup + digest-check prove it.",
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
