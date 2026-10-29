import { expect, test, type Page } from "@playwright/test";

import {
  BASE,
  PASSWORD,
  isolatedStack,
  lit,
  mailsTo,
  notificationSubjects,
  onboard,
  publishNeed,
  recordJournal,
  setUpCompany,
  signIn,
  signUp,
  sql,
  sqlExec,
  userId,
} from "./isolated-web-a-helpers";

/**
 * E-MAIL NOTIFICATIONS (5.7), WEEKLY DIGEST (5.9) and SAVED SEARCHES + ALERTS
 * (4.9) on the THROWAWAY local stack (.github/workflows/signup-isolated.yml).
 *
 * The job runs a SECOND instance of the same build (MAIL_APP_BASE, port 3001)
 * whose only difference is a configured outbound mailbox: the product's own
 * SMTP transport (lib/email/smtp.ts, implicit TLS on 465) pointed at a CI-only
 * mail catcher on 127.0.0.1 (APP_MAIL_API). Nothing can leave the runner:
 * production hosts are blackholed and the catcher accepts every message
 * without relaying it. The proof is the stored notification row AND the mail
 * the catcher received — never the page saying "sent".
 */

const APP = process.env.MAIL_APP_BASE ?? "";
const APP_MAIL = process.env.APP_MAIL_API ?? "";
const CRON = process.env.CRON_SECRET ?? "";

test.skip(
  !isolatedStack() || !/^http:\/\/127\.0\.0\.1:\d+$/.test(APP) || APP_MAIL !== "http://127.0.0.1:54334" || !CRON,
  "local stack with the CI mail catcher only (MAIL_APP_BASE, APP_MAIL_API, CRON_SECRET)",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const RUN = Date.now().toString(36);
const WORKER = `notify.worker.${RUN}@local.test`;
const INVITEE = `notify.invitee.${RUN}@local.test`;
const COMPANY = `notify.company.${RUN}@local.test`;

const state: { workerId?: string; searchId?: string } = {};

type EventRow = { event_type: string; entity_type: string; created_at: string };
function events(recipient: string, type: string): EventRow[] {
  return sql<EventRow>(
    `select event_type, entity_type, created_at from public.notification_events
      where recipient_profile_id = ${lit(recipient)} and event_type = ${lit(type)}`,
  );
}

/** Poll the CI catcher until a mail to `address` carries one of `subjects`. */
async function mailWithSubject(address: string, subjects: Set<string>, what: string) {
  expect(subjects.size, `the product has copy for ${what}`).toBeGreaterThan(0);
  let seen: string[] = [];
  for (let i = 0; i < 45; i += 1) {
    const mails = await mailsTo(APP_MAIL, address);
    seen = mails.map((m) => m.subject);
    const hit = mails.find((m) => subjects.has(m.subject));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no ${what} mail reached the CI catcher (subjects seen: ${seen.length})`);
}

async function emailToggle(page: Page, type: string): Promise<void> {
  const box = page.getByTestId(`notification-pref-${type}-email`);
  await expect(box, `the ${type} e-mail switch is offered`).toBeVisible({ timeout: 30_000 });
  if (!(await box.isChecked())) await box.click();
  await expect(box).toBeChecked();
  await expect(page.getByTestId("notification-prefs-notice")).toHaveAttribute("data-state", "saved", {
    timeout: 30_000,
  });
}

test("M-1. a worker opts in to e-mail for three notification kinds; the consent rows are stored", async ({ page }) => {
  await signUp(page, APP, WORKER);
  await onboard(page, "work", "Synthetic Notify Worker");
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  state.workerId = await userId(WORKER);

  await page.goto(`${APP}/en/dashboard/account`);
  const section = page.getByTestId("account-notification-preferences");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await section.locator("summary").click();
  await expect(
    page.getByTestId("notification-prefs-email-inactive"),
    "this instance has a configured mailbox, so e-mail is not shown as inactive",
  ).toHaveCount(0);
  for (const type of ["weekly_digest", "invitation_accepted", "saved_search_match"]) {
    await emailToggle(page, type);
  }
  await expect
    .poll(
      () =>
        sql<{ notification_type: string }>(
          `select notification_type from public.notification_preferences
            where profile_id = ${lit(state.workerId!)} and channel = 'email' and enabled
            order by notification_type`,
        ).map((r) => r.notification_type),
      { message: "explicit e-mail consent is stored per kind", timeout: 30_000 },
    )
    .toEqual(["invitation_accepted", "saved_search_match", "weekly_digest"]);
});

test("M-2. the weekly digest: the cron writes this week's digest and its e-mail reaches the catcher", async ({ page }) => {
  expect(state.workerId, "M-1 created the worker").toBeTruthy();
  // A digest candidate is a worker who recorded work in the last seven days.
  await signIn(page, APP, WORKER);
  await recordJournal(page, APP, `Laid 40 m2 of floor tiles, 8 hours (${RUN})`);
  await page.close();

  // BY DESIGN a dashboard visit writes this week's digest IN-APP only
  // (maybeEmitWeeklyDigestInBackground — the person is present), and the
  // cron's exactly-once key then skips them: the e-mail is for workers the
  // bell cannot reach. This walk's worker just visited, so the read-time row
  // (written before any sweep) is removed from the THROWAWAY database to make
  // the Monday sweep — the e-mail path under test — the writer.
  await new Promise((res) => setTimeout(res, 5_000)); // let the detached read-time insert land
  sqlExec(
    `delete from public.notification_events
      where recipient_profile_id = ${lit(state.workerId!)} and event_type = 'weekly_digest'`,
  );

  const r = await fetch(`${APP}/api/cron/weekly-digest`, { headers: { Authorization: `Bearer ${CRON}` } });
  expect(r.status, "the digest cron runs").toBe(200);
  const body = (await r.json()) as { ok?: boolean; candidates?: number };
  expect(body.ok).toBe(true);
  expect(body.candidates ?? 0, "the worker is a digest candidate").toBeGreaterThan(0);

  await expect
    .poll(() => events(state.workerId!, "weekly_digest").length, {
      message: "this week's digest notification is stored",
      timeout: 30_000,
    })
    .toBe(1);
  // Exactly once per recipient per week: a second sweep writes nothing new.
  const again = await fetch(`${APP}/api/cron/weekly-digest`, { headers: { Authorization: `Bearer ${CRON}` } });
  expect(again.status).toBe(200);
  expect(events(state.workerId!, "weekly_digest").length, "the digest is exactly-once per week").toBe(1);

  const [digest] = sql<{ metadata: Record<string, unknown> | null }>(
    `select metadata from public.notification_events
      where recipient_profile_id = ${lit(state.workerId!)} and event_type = 'weekly_digest'`,
  );
  expect(digest?.metadata?.focus, "the sweep's digest speaks of the journal it can see").toBe("journal");
  const mail = await mailWithSubject(WORKER, notificationSubjects("weekly_digest"), "weekly digest");
  expect(mail.text, "the digest links back into the product").toMatch(/\/dashboard\//);
});

test("M-3. a notification e-mail: the invited person registers and the inviter is e-mailed", async ({ browser }) => {
  expect(state.workerId, "M-1 created the worker").toBeTruthy();
  const a = await browser.newContext();
  const inviter = await a.newPage();
  await signIn(inviter, APP, WORKER);
  await inviter.goto(`${APP}/en/dashboard/network`);
  const panel = inviter.getByTestId("invite-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const open = panel.getByTestId("invite-panel-open");
  if (await open.isVisible().catch(() => false)) await open.click();
  const linkMode = panel.getByTestId("invite-mode-link");
  if (await linkMode.isVisible().catch(() => false)) {
    await linkMode.click();
    await panel.getByTestId("invite-name").fill("Synthetic Notify Invitee");
  } else {
    await panel.getByTestId("invite-emails").fill(INVITEE);
  }
  await panel.getByTestId("invite-submit").click();
  const copy = panel.getByTestId("invite-copy-link").first();
  await expect(copy, "the invitation link is handed over").toBeVisible({ timeout: 30_000 });
  const raw = await copy.getAttribute("data-invite-link");
  expect(raw, "an invitation link").toBeTruthy();
  const u = new URL(raw!);
  const link = `${APP}${u.pathname}${u.search}`;
  await a.close();

  const b = await browser.newContext();
  const page = await b.newPage();
  await page.goto(link);
  await page.getByTestId("invite-register").click();
  await page.waitForURL(/\/en\/auth\/signup/, { timeout: 30_000 });
  const addressed = page.locator('input[aria-describedby="invited-email-note"]');
  if (!(await addressed.isVisible().catch(() => false))) await page.locator('input[type="email"]').fill(INVITEE);
  await page.locator('input[name="password"]').fill(PASSWORD);
  const confirm = page.locator('input[name="confirm_password"]');
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/(onboarding|invite|dashboard)/, { timeout: 60_000 });
  if (/\/onboarding/.test(page.url())) await onboard(page, "work", "Synthetic Notify Invitee");
  await page.waitForURL(/\/en\/(dashboard|invite)/, { timeout: 60_000 });
  if (/\/invite\//.test(page.url())) {
    const accept = page.getByTestId("invite-accept");
    if (await accept.isVisible().catch(() => false)) await accept.click();
  }
  await b.close();

  await expect
    .poll(() => events(state.workerId!, "invitation_accepted").length, {
      message: "the inviter's invitation_accepted notification is stored",
      timeout: 30_000,
    })
    .toBe(1);
  await mailWithSubject(WORKER, notificationSubjects("invitation_accepted"), "invitation accepted");
});

test("M-4. a saved search is stored and reopens from the board", async ({ page }) => {
  expect(state.workerId, "M-1 created the worker").toBeTruthy();
  await signIn(page, APP, WORKER);
  await page.goto(`${APP}/en/dashboard/opportunities?view=all&country=LT`);
  const strip = page.getByTestId("saved-searches");
  await expect(strip, "the saved-search strip is offered on a filtered board").toBeVisible({ timeout: 30_000 });
  // A closed disclosure while nothing is saved yet (phone-first): open it.
  if ((await strip.getAttribute("open")) === null) await strip.locator("summary").click();
  await strip.getByTestId("saved-search-label").fill(`Lithuania ${RUN}`);
  await strip.getByTestId("saved-search-save").click();
  await expect
    .poll(
      () =>
        sql<{ id: string; label: string; notify: boolean; criteria: Record<string, unknown> }>(
          `select s.id, s.label, s.notify, s.criteria from public.worker_saved_searches s
             join public.workers w on w.id = s.worker_id
            where w.profile_id = ${lit(state.workerId!)}`,
        ),
      { message: "the saved search is stored for this worker", timeout: 30_000 },
    )
    .toHaveLength(1);
  const [row] = sql<{ id: string; label: string; notify: boolean; criteria: Record<string, unknown> }>(
    `select s.id, s.label, s.notify, s.criteria from public.worker_saved_searches s
       join public.workers w on w.id = s.worker_id where w.profile_id = ${lit(state.workerId!)}`,
  );
  expect(row.label).toBe(`Lithuania ${RUN}`);
  expect(row.notify, "alerts are on by default").toBe(true);
  expect(JSON.stringify(row.criteria)).toContain("LT");
  state.searchId = row.id;

  await page.goto(`${APP}/en/dashboard/opportunities?view=all`);
  const reopen = page.getByTestId(`saved-search-${row.id}`).getByTestId("saved-search-open");
  await expect(reopen, "the saved search is listed").toBeVisible({ timeout: 30_000 });
  await expect(reopen).toHaveAttribute("href", /country=LT/);
});

test("M-5. a saved-search alert: a new matching need appears and the worker is notified and e-mailed", async ({ browser }) => {
  expect(state.searchId, "M-4 saved the search").toBeTruthy();
  // A company publishes a new need AFTER the search was saved.
  const c = await browser.newContext();
  const company = await c.newPage();
  await signUp(company, BASE, COMPANY);
  await onboard(company, "hire", "Synthetic Notify Company Owner");
  await setUpCompany(company, `Synthetic Notify Co ${RUN}`);
  await publishNeed(company, BASE, `Notify tiler ${RUN}`);
  await c.close();

  // The worker's own board render counts the new match and records the alert.
  const w = await browser.newContext();
  const page = await w.newPage();
  await signIn(page, APP, WORKER);
  await page.goto(`${APP}/en/dashboard/opportunities?view=all&country=LT`);
  await expect(page.getByTestId(`saved-search-${state.searchId}`)).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () => {
        await page.reload();
        return events(state.workerId!, "saved_search_match").length;
      },
      { message: "the saved-search alert is stored", timeout: 60_000, intervals: [3_000] },
    )
    .toBe(1);
  await mailWithSubject(WORKER, notificationSubjects("saved_search_match"), "saved-search alert");
  await w.close();
});
