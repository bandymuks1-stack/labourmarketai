import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type BrowserContext, type Page } from "./prod-walk";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * ACCOUNT-DELETION SELF-CANCEL (owner P0 2026-11-09; owner decision: "Deletion
 * waiting period: 30 days."). Migration 20261109120000 applied, app #3174, legal
 * copy #3175. The walk files an account-deletion request on the synthetic worker,
 * confirms it when it honestly can, reads the status and the scheduled date, cancels
 * it through the button, and reads the public privacy policy and data-deletion page.
 *
 * SYNTHETIC ACCOUNT ONLY: slot `worker2` (qa.worker+goal3), never owner / manager /
 * worker, which other walks use, and never a real account.
 *
 * FRESH SIGN-IN (D-3). `privacy_confirm_account_deletion_v1` accepts the confirmation
 * only when `auth.users.last_sign_in_at` is within the last 15 minutes. The mint signs
 * the synthetic worker in through the ordinary magic-link verification a few minutes
 * before the walk starts, so the confirmation can be accepted on its own merits. The
 * walk reads the sign-in age from the Auth API first (an age, never the identity), then
 * presses the confirm button. When the database answers "sign in again", D-3 is a
 * SKIP with that reason: the walk does NOT press "sign in again" (it would end the
 * minted session, and a minted session cannot sign in again), and D-4 then checks the
 * unconfirmed request (pending, no scheduled date). Nothing is faked.
 *
 * SAFETY. Confirmed or not, nothing can be erased before 30 days have passed
 * (`privacy_erasure_due_v1` waits for confirmed_at + the grace). D-5 cancels through
 * the UI, and `afterAll` ALWAYS reads the status and cancels any open request through
 * the RPC with the worker's own session; it fails loudly when it cannot. Each run
 * leaves one withdrawn request row on the synthetic worker, and nothing else.
 *
 * READS. The page's own rendering first; the two RPCs only through `qaApi` (the one
 * vetted place a walk sends a synthetic session's token, with the publishable anon key
 * every browser already receives). The tests run one after another (one worker in the
 * walk) but are NOT `mode: "serial"`: a soft failure in the main walk must not skip
 * D-9, and `afterAll` runs either way.
 *
 * Logs carry states, dates, ages, counts and request ids only.
 */
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const SLOT = "worker2";
const state = resolve(__dirname, `.storage-state.prod-qa.${SLOT}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && SUPA !== "" && ANON !== "" && existsSync(state);
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with the minted worker2 session");
test.describe.configure({ timeout: 300_000, retries: 0 });
test.use({ actionTimeout: 30_000, channel: "chrome" });

const LOCALE = "en";
const PRIVACY = `/${LOCALE}/dashboard/privacy`;
const DAY_MS = 86_400_000;
const GRACE_DAYS = 30;
const UI_WAIT = 60_000;

function record(label: string, pass: boolean, detail: string): void {
  console.info(`[result] ${label}: ${pass ? "PASS" : "FAIL"} ${detail}`);
  expect.soft(pass, `${label}: ${detail}`).toBe(true);
}
function skip(label: string, reason: string): void {
  console.info(`[result] ${label}: SKIP ${reason}`);
  test.info().annotations.push({ type: "skip-step", description: `${label}: ${reason}` });
}
const short = (e: unknown) => (e as Error).message.split("\n")[0].slice(0, 160);

// ── the copy, read from the repository at test time ───────────────────────────
type Messages = Record<string, unknown>;
const messages = (locale: string): Messages =>
  JSON.parse(readFileSync(resolve(__dirname, `../../messages/${locale}.json`), "utf8")) as Messages;
function at(obj: unknown, path: (string | number)[]): string {
  let cur: unknown = obj;
  for (const k of path) cur = (cur as Record<string | number, unknown> | undefined)?.[k];
  if (typeof cur !== "string") throw new Error(`message ${path.join(".")} is not a string`);
  return cur;
}
const EN = messages(LOCALE);
const copy = (path: string) => at(EN, ["privacySelfService", "deletion", ...path.split(".")]);
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

// ── the deletion status, read with the worker's own session ───────────────────
interface Status {
  status: "none" | "pending" | "withdrawn" | "in_progress" | "done";
  request_id?: string;
  submitted_at?: string | null;
  deletion_confirmed_at?: string | null;
  scheduled_erasure_at?: string | null;
  cancellable?: boolean;
}
async function rpc<T>(name: string, token: string | null): Promise<{ http: number; body: T | null }> {
  const res = await qaApi(`/rest/v1/rpc/${name}`, token, { method: "POST", body: {} });
  const text = await res.text();
  let body: T | null = null;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = null;
  }
  return { http: res.status, body };
}
async function readStatus(): Promise<Status> {
  const { http, body } = await rpc<Status>("privacy_account_deletion_status_v1", bearerOf(SLOT));
  if (http !== 200 || !body || typeof body.status !== "string") {
    throw new Error(`status RPC answered http=${http}`);
  }
  return body;
}
async function cancelRpc(token: string | null) {
  return rpc<{ status?: string; request_id?: string; code?: string }>("privacy_cancel_account_deletion_v1", token);
}
const statusLine = (s: Status) =>
  `status=${s.status} request_id=${s.request_id ?? "-"} submitted_at=${s.submitted_at ?? "-"} ` +
  `confirmed_at=${s.deletion_confirmed_at ?? "-"} scheduled_at=${s.scheduled_erasure_at ?? "-"} cancellable=${s.cancellable ?? "-"}`;

/** The date part the page prints (it formats in UTC, `lib/time/display.ts`). */
const dayLabel = (iso: string | number) =>
  new Intl.DateTimeFormat(LOCALE, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(iso),
  );

async function openPrivacy(page: Page): Promise<void> {
  await page.goto(PRIVACY, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("privacy-deletion")).toBeVisible({ timeout: UI_WAIT });
}

let ctx: BrowserContext | null = null;
let page: Page;
let filedRequestId: string | null = null;

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 800 }, locale: "en-GB" });
  page = await ctx.newPage();
});

test("D-0…D-8. file, confirm when the sign-in is fresh, read, cancel, at 390 px (synthetic worker2)", async ({ browser }) => {
  await test.step("D-0 health", async () => {
    const res = await page.request.get("/api/health", { timeout: 30_000 });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; build?: string | null } | null;
    record("D-0 /api/health", res.status() === 200 && body?.ok === true, `http=${res.status()} ok=${body?.ok} build=${body?.build ?? "-"}`);
  });

  await test.step("D-1 known start state", async () => {
    const before = await readStatus();
    if (before.status === "in_progress" || before.status === "done") {
      record("D-1 start state", false, `${statusLine(before)} — an erasure has started on the synthetic worker; stopping`);
      throw new Error("D-1: the synthetic worker's deletion is not cancellable; the walk stops");
    }
    if (before.status === "pending") {
      const c = await cancelRpc(bearerOf(SLOT));
      const after = await readStatus();
      record(
        "D-1 start state",
        c.http === 200 && c.body?.status === "ok" && after.status === "withdrawn",
        `found ${statusLine(before)}; cancelled first: http=${c.http} cancel=${c.body?.status ?? "-"}; now ${statusLine(after)}`,
      );
    } else {
      record("D-1 start state", true, `${statusLine(before)} (no open request; nothing to cancel)`);
    }
  });

  await test.step("D-2 file a request through the UI", async () => {
    await openPrivacy(page);
    const box = page.getByTestId("privacy-deletion-confirm");
    await expect(box).toBeVisible({ timeout: UI_WAIT });
    await box.check();
    await page.getByTestId("privacy-deletion-submit").click();
    // The success note shows, then the page refreshes into the confirm step — either proves the filing.
    const filed = page.getByTestId("privacy-deletion-submitted").or(page.getByTestId("privacy-deletion-confirm-step"));
    const seen = await filed.first().waitFor({ state: "visible", timeout: UI_WAIT }).then(() => true, () => false);
    const alert = await page.getByTestId("privacy-deletion").getByRole("alert").count();
    const s = await readStatus();
    filedRequestId = s.status === "pending" ? (s.request_id ?? null) : null;
    record(
      "D-2 file deletion request",
      seen && s.status === "pending" && !s.deletion_confirmed_at && filedRequestId !== null,
      `ui_ack=${seen} alerts=${alert} ${statusLine(s)}`,
    );
    if (!filedRequestId) throw new Error("D-2: no pending request was filed; the walk stops");
  });

  let confirmed = false;
  await test.step("D-3 confirm through the UI (fresh sign-in)", async () => {
    // The age of the last sign-in the database will judge (auth.users.last_sign_in_at).
    const me = await qaApi("/auth/v1/user", bearerOf(SLOT));
    const user = (await me.json().catch(() => null)) as { last_sign_in_at?: string | null } | null;
    const ageS = user?.last_sign_in_at ? Math.round((Date.now() - Date.parse(user.last_sign_in_at)) / 1000) : null;
    await openPrivacy(page);
    const step = page.getByTestId("privacy-deletion-confirm-step");
    await expect(step).toBeVisible({ timeout: UI_WAIT });
    await page.getByTestId("privacy-deletion-confirm-final").click();
    const done = page.getByTestId("privacy-deletion-confirmed");
    const reauth = page.getByTestId("privacy-deletion-reauth");
    const failed = step.getByRole("alert");
    // The success note can be replaced by the refreshed status at once, so the database decides.
    const uiSeen = await done.or(reauth).or(failed).first().waitFor({ state: "visible", timeout: UI_WAIT }).then(() => true, () => false);
    const s = await readStatus();
    if (s.status === "pending" && s.deletion_confirmed_at) {
      confirmed = true;
      record("D-3 confirm deletion", uiSeen, `sign_in_age_s=${ageS ?? "?"} ui_ack=${uiSeen} ${statusLine(s)}`);
    } else if (await reauth.isVisible()) {
      // Honest: the database wants a sign-in within 15 min; the walk will not fake one.
      skip(
        "D-3 confirm deletion",
        `reauth_required (sign_in_age_s=${ageS ?? "?"}, limit 900): the minted session's sign-in is not fresh; ` +
          `"sign in again" is not pressed; continuing with the unconfirmed request`,
      );
    } else {
      record("D-3 confirm deletion", false, `sign_in_age_s=${ageS ?? "?"} ui_ack=${uiSeen} ui=error-or-none ${statusLine(s)}`);
    }
  });

  await test.step("D-4 status, submitted date, scheduled date", async () => {
    await openPrivacy(page);
    const box = page.getByTestId("privacy-deletion-status");
    await expect(box).toBeVisible({ timeout: UI_WAIT });
    const s = await readStatus();
    const dataStatus = await box.getAttribute("data-status");
    const text = norm(await box.innerText());
    const submittedOk = !!s.submitted_at && text.includes(dayLabel(s.submitted_at));
    const scheduled = page.getByTestId("privacy-deletion-scheduled");
    if (confirmed && s.deletion_confirmed_at && s.scheduled_erasure_at) {
      const gapMs = Date.parse(s.scheduled_erasure_at) - Date.parse(s.deletion_confirmed_at);
      const expectDay = dayLabel(Date.parse(s.deletion_confirmed_at) + GRACE_DAYS * DAY_MS);
      const shown = (await scheduled.count()) > 0 ? norm(await scheduled.innerText()) : "";
      record(
        "D-4 status pending + confirmed + scheduled = confirmed + 30 d",
        dataStatus === "pending" &&
          text.includes(norm(copy("status.pendingConfirmed"))) &&
          submittedOk &&
          gapMs === GRACE_DAYS * DAY_MS &&
          shown.includes(expectDay) &&
          dayLabel(s.scheduled_erasure_at) === expectDay &&
          s.cancellable === true,
        `data_status=${dataStatus} submitted_shown=${submittedOk} gap_days=${gapMs / DAY_MS} ` +
          `expected_day="${expectDay}" scheduled_shown=${shown.includes(expectDay)} ${statusLine(s)}`,
      );
    } else {
      record(
        "D-4 status pending (unconfirmed, no scheduled date)",
        dataStatus === "pending" &&
          text.includes(norm(copy("status.pending"))) &&
          submittedOk &&
          (await scheduled.count()) === 0 &&
          !s.scheduled_erasure_at &&
          s.cancellable === true,
        `data_status=${dataStatus} submitted_shown=${submittedOk} scheduled_rows=${await scheduled.count()} ${statusLine(s)}`,
      );
    }
  });

  await test.step("D-5 cancel through the button", async () => {
    const button = page.getByTestId("privacy-deletion-cancel-button");
    await expect(button).toBeVisible({ timeout: UI_WAIT });
    await button.click();
    // InlineConfirm's armed step: the confirm button, by its role and the i18n label.
    await page
      .getByTestId("privacy-deletion-status")
      .getByRole("button", { name: copy("cancel.confirm"), exact: true })
      .click();
    // The component shows the message, then the page refreshes into the withdrawn status
    // (whose label is the same sentence) — both are the confirmation a person reads.
    const message = page.getByTestId("privacy-deletion-cancelled");
    const withdrawnBox = page.locator('[data-testid="privacy-deletion-status"][data-status="withdrawn"]');
    await expect(message.or(withdrawnBox).first()).toBeVisible({ timeout: UI_WAIT });
    const messageSeen = await message.isVisible();
    const errorShown = await page.getByTestId("privacy-deletion-cancel-error").count();
    await expect(withdrawnBox).toBeVisible({ timeout: UI_WAIT });
    const shown = norm(await withdrawnBox.innerText());
    const s = await readStatus();
    record(
      "D-5 cancel → withdrawn",
      errorShown === 0 &&
        shown.includes(norm(copy("cancel.cancelled"))) &&
        s.status === "withdrawn" &&
        s.request_id === filedRequestId &&
        s.cancellable === false,
      `message_component_seen=${messageSeen} error_rows=${errorShown} withdrawn_label_shown=${shown.includes(norm(copy("status.withdrawn")))} ${statusLine(s)}`,
    );
    const res = await page.goto(`/${LOCALE}/dashboard`, { waitUntil: "domcontentloaded" });
    const url = new URL(page.url());
    await expect(page.locator("main").first()).toBeVisible({ timeout: UI_WAIT });
    record(
      "D-5 dashboard still loads (account active)",
      (res?.status() ?? 0) < 400 && !/\/auth\//.test(url.pathname),
      `http=${res?.status() ?? "?"} path=${url.pathname}`,
    );
  });

  await test.step("D-6 cancel again → ok_already", async () => {
    await openPrivacy(page);
    const buttons = await page.getByTestId("privacy-deletion-cancel-button").count();
    const box = page.getByTestId("privacy-deletion-status");
    const dataStatus = (await box.count()) > 0 ? await box.getAttribute("data-status") : null;
    const c = await cancelRpc(bearerOf(SLOT));
    const s = await readStatus();
    record(
      "D-6 repeat cancel",
      buttons === 0 &&
        dataStatus === "withdrawn" &&
        c.http === 200 &&
        c.body?.status === "ok_already" &&
        c.body?.request_id === filedRequestId &&
        s.status === "withdrawn",
      `cancel_buttons=${buttons} data_status=${dataStatus} rpc_http=${c.http} rpc=${c.body?.status ?? "-"} ${statusLine(s)}`,
    );
  });

  await test.step("D-7 signed out cannot cancel", async () => {
    const anonCtx = await browser.newContext({ locale: "en-GB" });
    try {
      const p = await anonCtx.newPage();
      await p.goto(PRIVACY, { waitUntil: "domcontentloaded" });
      await p.waitForURL(/\/auth\/login/, { timeout: UI_WAIT }).catch(() => undefined);
      const path = new URL(p.url()).pathname;
      const c = await cancelRpc(null);
      const refused = c.http === 401 || c.http === 403 || (c.http === 200 && c.body?.status === "not_signed_in");
      const s = await readStatus();
      record(
        "D-7 signed out",
        /\/auth\/login/.test(path) && refused && s.status === "withdrawn",
        `privacy_path=${path} anon_rpc_http=${c.http} anon_rpc=${c.body?.status ?? c.body?.code ?? "-"} worker_${statusLine(s)}`,
      );
    } finally {
      await anonCtx.close();
    }
  });

  await test.step("D-8 the withdrawn state at 390 px", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPrivacy(page);
    const section = page.getByTestId("privacy-deletion");
    await section.scrollIntoViewIfNeeded();
    const withdrawn = page.locator('[data-testid="privacy-deletion-status"][data-status="withdrawn"]');
    await expect(withdrawn).toBeVisible({ timeout: UI_WAIT });
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    // Every visible control in the section; a checkbox is tapped through its <label>.
    const sizes = await section.locator("button, a, textarea, input, select").evaluateAll((els) =>
      els
        .map((el) => {
          const target = el instanceof HTMLInputElement && el.type === "checkbox" ? (el.closest("label") ?? el) : el;
          const r = target.getBoundingClientRect();
          return { kind: `${el.tagName.toLowerCase()}${el instanceof HTMLInputElement ? `:${el.type}` : ""}`, w: r.width, h: r.height };
        })
        .filter((b) => b.w > 0 && b.h > 0),
    );
    const small = sizes.filter((b) => b.h < 44);
    record(
      "D-8 390 px withdrawn",
      !sideways && sizes.length > 0 && small.length === 0,
      `sideways=${sideways} controls=${sizes.length} under_44px=${small.length}` +
        (small.length ? ` [${small.map((b) => `${b.kind}:${Math.round(b.h)}`).join(",")}]` : ""),
    );
    await page.setViewportSize({ width: 1280, height: 800 });
  });
});

/** The sentence that holds `needle` (from the previous ". " to the next ". "). */
function sentenceWith(text: string, needle: RegExp): string {
  const m = needle.exec(text);
  if (!m) throw new Error(`no sentence matches ${needle}`);
  const startDot = text.lastIndexOf(". ", m.index);
  const endDot = text.indexOf(". ", m.index);
  return norm(text.slice(startDot < 0 ? 0 : startDot + 2, endDot < 0 ? text.length : endDot + 1));
}
/** The 30-day clause: from "30" to the closing parenthesis of "(until then … cancel …)". */
function thirtyDayClause(text: string): string {
  const i = text.search(/\b30\b/);
  const close = text.indexOf(")", i);
  if (i < 0 || close < 0) throw new Error("no 30-day clause");
  return norm(text.slice(i, close + 1));
}

test("D-9. privacy policy and data-deletion page name the 30-day wait and the 7-day backups (signed out, read-only)", async ({ browser }) => {
  const anonCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const p = await anonCtx.newPage();
    for (const locale of ["lt", "en"] as const) {
      const m = messages(locale);
      const pages = [
        { route: `/${locale}/legal/privacy`, testId: "legal-privacy", source: at(m, ["legal", "privacy", "sections", 7, "items", 1]) },
        { route: `/${locale}/legal/data-deletion`, testId: "legal-data-deletion", source: at(m, ["legal", "dataDeletion", "intro"]) },
      ];
      for (const { route, testId, source } of pages) {
        const thirty = thirtyDayClause(source);
        const backup = sentenceWith(source, /\b7\b/);
        const res = await p.goto(route, { waitUntil: "domcontentloaded" });
        const article = p.getByTestId(testId);
        await expect(article).toBeVisible({ timeout: UI_WAIT });
        const text = norm(await article.innerText());
        record(
          `D-9 ${route}`,
          (res?.status() ?? 0) === 200 && text.includes(thirty) && text.includes(backup),
          `http=${res?.status() ?? "?"} thirty_day=${text.includes(thirty)} (len ${thirty.length}) backup_7_day=${text.includes(backup)} (len ${backup.length})`,
        );
      }
    }
  } finally {
    await anonCtx.close();
  }
});

test.afterAll(async () => {
  // ALWAYS: never leave an open deletion request on the synthetic worker.
  let final: Status | null = null;
  let note = "";
  try {
    final = await readStatus();
    if (final.status === "pending") {
      const c = await cancelRpc(bearerOf(SLOT));
      note = ` cleanup_cancel_http=${c.http} cleanup_cancel=${c.body?.status ?? "-"}`;
      final = await readStatus();
    }
  } catch (e) {
    note = ` cleanup_error=${short(e)}`;
  } finally {
    await ctx?.close().catch(() => undefined);
  }
  const ok = final !== null && final.status !== "pending" && final.status !== "in_progress";
  console.info(`[result] FINAL synthetic worker2 deletion state: ${ok ? "PASS" : "FAIL"} ${final ? statusLine(final) : "unread"}${note}`);
  if (!ok) {
    throw new Error(
      `afterAll: the synthetic worker2 may still have an open account-deletion request (${final?.status ?? "unread"}); cancel it on its Privacy page`,
    );
  }
});
