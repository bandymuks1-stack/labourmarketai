import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "./prod-walk";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION SEARCH, SUPPORT AND PRIVACY — owner areas 9 / 10 / 16 (search
 * and matching, support and inbox, privacy). The processes of those areas
 * that had no production walk, driven as the synthetic cast in a browser:
 *
 *   P   privacy  — legal pages in lt/en/ru (9.12), the own-data export
 *                  (9.5), the deletion form opened and LEFT without filing
 *                  (9.4), a preferred-location visibility changed, persisted
 *                  and put back (9.13), an unrelated organization sees no
 *                  name on a person page (4.21), the first-party supply
 *                  declaration (4.28) and the employer-visibility consent
 *                  turned off, persisted and turned back on (2.35 / 4.17);
 *   S   support  — a support conversation opened by the person, found in
 *                  their own inbox (5.17), found again by the global
 *                  dashboard search (5.18), a synthetic organization found
 *                  in the network directory (9.15), the weekly-digest
 *                  channel control (5.9, partial), the review inbox report
 *                  (5.19) and the map rendering markers with no external
 *                  geocoding call (10.27);
 *   M   matching — the worker's match explanation on a synthetic need (4.5),
 *                  the organization's supply discovery (4.10), the
 *                  auto-match receipt (4.13), a contact-details ask left
 *                  pending and withdrawn (4.19) and a candidate draft created,
 *                  seen and deleted (4.14).
 *
 * Not walked, with the reason in the log: 4.25 (the admin matching workbench
 * is superadmin-only and the QA cast has no superadmin) and 9.10 (no safe
 * user-visible rate limit exists — see the skipped step).
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   worker   qa.worker+multiw — raises a hand on Gama's need, reads the map
 *   worker2  qa.worker+goal3  — every privacy setting, the support thread
 *   owner    owns "QA-SYNTHETIC Alfa" — candidate drafts, the review report
 *   manager  runs "QA-SYNTHETIC Gama" — supply discovery, auto-match, contact ask
 *   agency   runs "QA-SYNTHETIC Agentūra" — a candidate "unrelated organization"
 *
 * SAFETY. Every step is what a person does in the browser. The API calls read
 * each synthetic person's OWN row (and the working-relationship predicate)
 * with their own token; they write nothing. Every free-text write carries the
 * run id. RECORD AND RESTORE, NEVER ASSUME PRISTINE: each write first records
 * the state it found; a pre-existing contact ask or supply consent is read back
 * and never overwritten or withdrawn; `afterAll` puts back exactly what was
 * found — the hand, the contact ask, the draft, the supply consent, the
 * location row's visibility and active flag, the employer-visibility state —
 * even after a red step. The deletion step blocks every POST while it is on
 * the page and never presses submit; no erasure is ever filed. The export is
 * downloaded to a temporary file, measured and deleted, never read. The
 * support thread is one per run and cannot be closed from the UI (logged).
 * Failure messages and logs carry counts and states only — never a name, an
 * id or real customers' text (the log is a public artefact).
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const ALFA = "QA-SYNTHETIC Alfa";
const GAMA = "QA-SYNTHETIC Gama";
const TAG = `QA-SYNTHETIC ${RUN}`;
const DRAFT = `${TAG} kandidatas`;
const SUPPORT_SUBJECT = `${TAG} walk check, no reply needed`;
const SUPPORT_BODY = `${TAG}: automated synthetic walk, please ignore, no reply needed.`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  SUPA !== "" &&
  ANON !== "" &&
  ["worker", "worker2", "owner", "manager", "agency"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(browser: Browser, slot: string | null, locale = "lt-LT"): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...(slot ? { storageState: state(slot) } : {}), locale });
  return { ctx, page: await ctx.newPage() };
}

/** Make `orgName` the active workspace through the real header chip. */
async function useWorkspace(page: Page, orgName: string): Promise<void> {
  await page.goto("/lt/dashboard/company/people");
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  const menu = page.getByTestId("workspace-chip-menu");
  await menu.locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

/** The caller's OWN worker row, read with the caller's own token. */
async function ownWorker(slot: string): Promise<{ id: string; displayName: string }> {
  const token = bearerOf(slot);
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
  const res = await qaApi(`/rest/v1/workers?select=id,display_name&profile_id=eq.${encodeURIComponent(sub)}`, token);
  expect(res.status, `${slot}: own worker row answered`).toBe(200);
  const rows = (await res.json()) as { id: string; display_name: string | null }[];
  expect(rows.length, `${slot}: exactly one own worker row`).toBe(1);
  return { id: rows[0].id, displayName: (rows[0].display_name ?? "").trim() };
}

/** The anonymous name the person page renders on /lt (`people.anonymousName`, messages/lt.json). */
function anonymousLabel(workerId: string): string {
  const token = workerId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  return `Kandidatas ${token}`;
}

const firstLine = (e: unknown) => ((e as Error).message ?? String(e)).split("\n")[0].slice(0, 160);

// RECORD AND RESTORE, NEVER ASSUME PRISTINE. Each write records the state it
// found first; `afterAll` puts back exactly that state (or, where the product
// keeps an append-only ledger, the equivalent visible state) — and a state the
// walk did not create is never withdrawn or overwritten.
let workerId = "";
let worker2Id = "";
let worker2Name = "";
let requestId = "";
let handRaisedHere = false;
let contactAskCreatedHere = false;
let draftCreated = false;
let supplyGrantedHere = false;
let locationRow: { created: boolean; activeBefore: boolean; visibilityBefore: string } | null = null;
let visibilityInitial: "granted" | "withdrawn" | "choice" | "" = "";
let visibilityTouched = false;

test("A-0. the synthetic workers' own ids (own rows, own tokens)", async () => {
  const w = await ownWorker("worker");
  workerId = w.id;
  const w2 = await ownWorker("worker2");
  worker2Id = w2.id;
  worker2Name = w2.displayName;
  expect(workerId).toMatch(/^[0-9a-f-]{36}$/);
  expect(worker2Id).toMatch(/^[0-9a-f-]{36}$/);
});

// ───────────────────────────────────────────────────────────── privacy (P)

test("P-1 (9.12). the legal pages render in lt, en and ru, each in its own language", async ({ browser }) => {
  const headings: Record<string, Record<string, string>> = {};
  for (const [l, bcp] of [
    ["lt", "lt-LT"],
    ["en", "en-GB"],
    ["ru", "ru-RU"],
  ] as const) {
    const { ctx, page } = await as(browser, null, bcp);
    headings[l] = {};
    for (const doc of ["privacy", "terms", "cookies"]) {
      const res = await page.goto(`/${l}/legal/${doc}`);
      expect(res?.status() ?? 0, `${l}/${doc} answered`).toBeLessThan(400);
      const article = page.getByTestId(`legal-${doc}`);
      await expect(article, `${l}/${doc} article`).toBeVisible({ timeout: 30_000 });
      const h1 = (await article.getByRole("heading", { level: 1 }).first().innerText()).trim();
      expect(h1.length, `${l}/${doc} has a title`).toBeGreaterThan(0);
      headings[l][doc] = h1;
    }
    await ctx.close();
  }
  for (const doc of ["privacy", "terms", "cookies"]) {
    expect(headings.lt[doc], `${doc}: lt and en titles differ (translated)`).not.toBe(headings.en[doc]);
    expect(headings.ru[doc], `${doc}: ru and en titles differ (translated)`).not.toBe(headings.en[doc]);
  }
});

test("P-2 (9.5). the worker downloads their own data bundle (measured, never read, deleted)", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/privacy#rights");
  await expect(page.getByTestId("privacy-export")).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByTestId("privacy-export-download").click(),
  ]);
  try {
    expect(await download.failure(), "the bundle downloaded").toBeNull();
    expect(download.suggestedFilename()).toMatch(/^labourmarket-ai-my-data-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await download.path();
    expect(statSync(path).size, "the bundle is not empty").toBeGreaterThan(2);
  } finally {
    await download.delete();
    await ctx.close();
  }
});

test("P-3 (9.4). the deletion form opens and is left WITHOUT filing anything", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/privacy#privacy-deletion");
  const section = page.getByTestId("privacy-deletion");
  await expect(section).toBeVisible({ timeout: 60_000 });
  // Belt and braces: while this step is on the page NOTHING can be posted, so
  // not even a mis-click could file a request.
  let blocked = 0;
  await page.route("**/*", (route) => {
    if (route.request().method() === "POST") {
      blocked += 1;
      return route.abort();
    }
    return route.continue();
  });
  const existing = section
    .getByTestId("privacy-deletion-confirm-step")
    .or(section.getByTestId("privacy-deletion-in-review"));
  if (await existing.first().isVisible().catch(() => false)) {
    console.info("P-3: an open deletion request already exists — nothing touched");
    await page.unroute("**/*");
    await ctx.close();
    return;
  }
  const submit = section.getByTestId("privacy-deletion-submit");
  const confirm = section.getByTestId("privacy-deletion-confirm");
  await expect(submit, "submit is closed until the person confirms").toBeDisabled();
  await confirm.check();
  await expect(submit, "confirming opens submit").toBeEnabled();
  await confirm.uncheck();
  await expect(submit, "un-confirming closes it again (cancel)").toBeDisabled();
  await page.unroute("**/*");
  expect(blocked, "no POST was attempted while the form was open").toBe(0);
  // Nothing was filed: a fresh load shows the same untouched form.
  await page.reload();
  await expect(section.getByTestId("privacy-deletion-submit")).toBeDisabled({ timeout: 60_000 });
  await expect(section.getByTestId("privacy-deletion-submitted")).toHaveCount(0);
  await expect(section.getByTestId("privacy-deletion-confirm-step")).toHaveCount(0);
  await ctx.close();
});

/** Expand the map page's collapsed "advanced" block, where the capture controls live. */
async function openCapture(page: Page): Promise<void> {
  await page.goto("/lt/dashboard/market-map");
  const adv = page.getByTestId("market-map-advanced");
  await expect(adv).toBeAttached({ timeout: 60_000 });
  if ((await adv.getAttribute("open")) === null) await adv.locator("summary").first().click();
  await expect(page.getByTestId("capture-preferred")).toBeVisible({ timeout: 30_000 });
}

const taggedLocationRow = (page: Page) =>
  page.getByTestId("capture-preferred-row").filter({ hasText: "QA-SYNTHETIC" }).first();

/** Change the tagged row's visibility through its own select, then prove it on fresh loads. */
async function setLocationVisibility(page: Page, value: string): Promise<void> {
  const select = taggedLocationRow(page).getByTestId("capture-preferred-visibility");
  await select.selectOption(value);
  await expect(select).toBeEnabled({ timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect
    .poll(
      async () => {
        await openCapture(page);
        return taggedLocationRow(page).getByTestId("capture-preferred-visibility").inputValue();
      },
      { timeout: 90_000, intervals: [2_000, 5_000, 10_000] },
    )
    .toBe(value);
}

test("P-4 (9.13). a preferred location's visibility changes, persists and is put back", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await openCapture(page);
  let row = taggedLocationRow(page);
  let created = false;
  if ((await row.count()) === 0) {
    // One synthetic row, reused by every later run (no delete exists; it is disabled after).
    await page.getByTestId("capture-preferred-country").selectOption("LT");
    await page.getByTestId("capture-preferred-note").fill(TAG);
    await page.getByTestId("capture-preferred-add").click();
    await expect(page.getByTestId("capture-status")).toBeVisible({ timeout: 30_000 });
    row = taggedLocationRow(page);
    await expect(row).toBeVisible({ timeout: 30_000 });
    created = true;
  }
  // Record what was there; only the visibility is changed (the active flag is left alone).
  const before = await row.getByTestId("capture-preferred-visibility").inputValue();
  locationRow = { created, activeBefore: (await row.getAttribute("data-active")) === "true", visibilityBefore: before };
  const target = before === "region_visible" ? "self_only" : "region_visible";
  await setLocationVisibility(page, target);
  // Put it back, and prove that persisted too.
  await setLocationVisibility(page, before);
  await ctx.close();
});

test("P-5 (4.21). an unrelated organization opens the worker's page and sees no name", async ({ browser }) => {
  // Pick an employer identity with NO working relationship to worker2, by the
  // same predicate the page uses — asked with each identity's own token.
  let viewer = "";
  for (const slot of ["agency", "manager", "owner"]) {
    const res = await qaApi("/rest/v1/rpc/caller_has_worker_relation_v1", bearerOf(slot), {
      method: "POST",
      body: { p_worker_id: worker2Id },
    });
    expect(res.status, `${slot}: relationship predicate answered`).toBe(200);
    if ((await res.json()) === false) {
      viewer = slot;
      break;
    }
  }
  test.skip(viewer === "", "every synthetic organization works with worker2 — no unrelated viewer in the cast");
  console.info(`P-5: unrelated viewer = ${viewer}`);
  const { ctx, page } = await as(browser, viewer);
  await page.goto(`/lt/dashboard/people/${worker2Id}`);
  const restricted = page.getByTestId("person-restricted");
  const person = page.getByTestId("person-page");
  await expect(restricted.or(person).first()).toBeVisible({ timeout: 60_000 });
  if (await person.isVisible().catch(() => false)) {
    await expect(page.getByTestId("person-name"), "the heading is the anonymous label").toHaveText(
      anonymousLabel(worker2Id),
    );
  } else {
    console.info("P-5: the page is restricted for this viewer (no name either way)");
  }
  if (worker2Name.length >= 3) {
    const body = await page.locator("body").innerText();
    expect(body.includes(worker2Name), "the worker's name appears nowhere on the page").toBe(false);
  }
  await ctx.close();
});

test("P-6 (4.28). the worker declares their own supply, sees it persist, and withdraws it", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/privacy#partner-supply");
  const choice = page.getByTestId("partner-supply-choice");
  const managed = page.getByTestId("partner-supply-managed");
  await expect(choice.or(managed).first()).toBeVisible({ timeout: 60_000 });
  if (await managed.isVisible().catch(() => false)) {
    // A representation consent (and maybe a declaration) already exists: it is
    // not this walk's to overwrite or withdraw. Read it back, write nothing.
    await expect(page.getByTestId("partner-supply-status")).toBeVisible();
    await expect(page.getByTestId("partner-supply-no-worker")).toHaveCount(0);
    const current = page.getByTestId("partner-supply-current");
    if (await current.isVisible().catch(() => false)) {
      expect((await page.getByTestId("partner-supply-current-intent").innerText()).trim().length).toBeGreaterThan(0);
    }
    console.info("P-6: a pre-existing representation consent — read back, nothing written");
    await ctx.close();
    return;
  }
  // No consent before this run: grant it, declare, and leave it exactly as found (no consent).
  await page.getByTestId("partner-supply-open").click();
  await page.getByTestId("partner-supply-grant").click();
  supplyGrantedHere = true;
  await expect(managed).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("partner-supply-no-worker")).toHaveCount(0);
  if (!(await page.getByTestId("partner-supply-form").isVisible().catch(() => false))) {
    await page.getByTestId("partner-supply-edit").click();
  }
  // Minimal declaration: open to offers, Lithuania only, NO authority beyond matching.
  await page.getByTestId("partner-supply-intent-OPEN_TO_OFFERS").check();
  await page.getByTestId("partner-supply-work-countries").fill("LT");
  await page.getByTestId("partner-supply-markets").fill("LT");
  for (const id of [
    "partner-supply-contact-authority",
    "partner-supply-publication-authority",
    "partner-supply-identity-authority",
  ]) {
    await page.getByTestId(id).uncheck();
  }
  await page.getByTestId("partner-supply-valid-days").selectOption("30");
  await page.getByTestId("partner-supply-save").click();
  await expect(page.getByTestId("partner-supply-saved")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("partner-supply-error")).toHaveCount(0);
  // Persistence: a fresh load reads the declaration back.
  await page.reload();
  await expect(page.getByTestId("partner-supply-current-intent")).toContainText("OPEN_TO_OFFERS", { timeout: 60_000 });
  await expect(page.getByTestId("partner-supply-current-markets")).toContainText("LT");
  // Withdraw it again — the declaration, then the permission.
  await page.getByTestId("partner-supply-withdraw-declaration").click();
  await expect(page.getByTestId("partner-supply-current")).toHaveCount(0, { timeout: 30_000 });
  await page.getByTestId("partner-supply-withdraw-consent").click();
  await expect(choice).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(choice, "the withdrawal persisted").toBeVisible({ timeout: 60_000 });
  supplyGrantedHere = false;
  await ctx.close();
});

// ───────────────────────────────────────────────────────────── support (S)

let supportId = "";

test("S-1 (5.17). the worker opens a support conversation and finds it in their own inbox", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/communication");
  // Ping staff at most once per run: a rerun of the same run id reuses its thread.
  const mine = page.locator('[data-testid^="conversation-row-"]', { hasText: TAG }).first();
  const launcher = page.getByTestId("support-launcher-open");
  await expect(launcher.or(mine).first()).toBeVisible({ timeout: 60_000 });
  if (await mine.isVisible().catch(() => false)) {
    supportId = ((await mine.getAttribute("data-testid")) ?? "").replace(/^conversation-row-/, "");
    console.info("S-1: this run's support thread already exists — reused, not re-sent");
  } else {
    await launcher.click();
    const form = page.getByTestId("support-launcher-form");
    await expect(form).toBeVisible({ timeout: 30_000 });
    await form.locator('input[type="text"]').fill(SUPPORT_SUBJECT);
    await form.locator("textarea").fill(SUPPORT_BODY);
    await form.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
    supportId = page.url().match(/communication\/([0-9a-f-]{36})/)?.[1] ?? "";
    await expect(
      page.locator('[data-testid^="message-text-"]', { hasText: SUPPORT_BODY }),
      "the first message is in the thread",
    ).toHaveCount(1, { timeout: 30_000 });
  }
  expect(supportId).toMatch(/^[0-9a-f-]{36}$/);
  await page.goto("/lt/dashboard/communication");
  await expect(page.getByTestId(`conversation-row-${supportId}`), "the thread is in the own inbox").toBeVisible({
    timeout: 60_000,
  });
  console.info("S-1: the support thread stays (the UI offers no close); one per run, labelled");
  await ctx.close();
});

test("S-2 (5.18). the global dashboard search finds that conversation and opens it", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/communication");
  const trigger = page.getByTestId("header-search-button").or(page.getByTestId("chat-command-search")).first();
  await expect(trigger).toBeVisible({ timeout: 60_000 });
  await trigger.click();
  const dialog = page.getByTestId("header-search-dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByTestId("command-finder-input").fill(TAG);
  const hit = dialog.getByTestId(`command-finder-object-conversations-${supportId}`);
  await expect(hit, "the run's thread is a search result").toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByTestId("command-finder-objects-error")).toHaveCount(0);
  await hit.click();
  await page.waitForURL(new RegExp(`/dashboard/communication/${supportId}`), { timeout: 60_000 });
  await ctx.close();
});

test("S-3 (9.15). a synthetic organization is findable in the network directory", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await page.goto(`/lt/dashboard/network?q=${encodeURIComponent(GAMA)}`);
  await expect(page.getByTestId("network-search-results")).toBeVisible({ timeout: 60_000 });
  const companies = page.locator('[data-testid^="network-company-"]', { hasText: "Gama" });
  await expect.poll(() => companies.count(), { timeout: 30_000 }).toBeGreaterThan(0);
  await ctx.close();
});

test("S-4 (5.9, partial). the weekly digest's in-app channel control exists (no email preview UI)", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/account");
  await expect(page.getByTestId("account-notification-preferences")).toBeAttached({ timeout: 60_000 });
  await expect(page.getByTestId("notification-pref-weekly_digest-in_app")).toBeAttached({ timeout: 30_000 });
  await ctx.close();
});

test("S-5 (5.19). the company opens the review inbox and its printable report", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/inbox");
  const link = page.getByTestId("inbox-report-link");
  await expect(
    link.or(page.getByTestId("inbox-summary")).or(page.getByTestId("inbox-empty-state")).first(),
  ).toBeVisible({ timeout: 60_000 });
  if (await link.isVisible().catch(() => false)) {
    await link.click();
    await page.waitForURL(/\/dashboard\/inbox\/report/, { timeout: 60_000 });
  } else {
    console.info("S-5: the inbox offers no report link in this state — opening the report directly");
    await page.goto("/lt/dashboard/inbox/report");
  }
  await expect(page.getByTestId("review-report-totals")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("print-button")).toBeVisible();
  await expect(page.getByTestId("review-report-load-failed"), "the report's read answered").toHaveCount(0);
  await ctx.close();
});

test("S-6 (10.27). the map renders markers, with no external geocoding call", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  const geocoding: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (/nominatim|geocod|api\.mapbox\.com|maps\.googleapis\.com|photon\.komoot|opencagedata|locationiq/i.test(u)) {
      geocoding.push(new URL(u).hostname);
    }
  });
  await page.goto("/lt/dashboard/market-map");
  await expect(page.getByTestId("market-map")).toBeVisible({ timeout: 60_000 });
  const markers = page.locator("path[data-anchor-id]");
  const shown = await expect
    .poll(() => markers.count(), { timeout: 60_000 })
    .toBeGreaterThan(0)
    .then(() => true)
    .catch(() => false);
  if (!shown) {
    const layer = await page.getByTestId("market-map-world").getAttribute("data-world-layer").catch(() => null);
    console.info(`S-6 diagnostics: markers=0 layer=${layer ?? "?"}`);
  }
  expect(await markers.count(), "the map draws markers").toBeGreaterThan(0);
  expect(geocoding, "no request went to a geocoding service").toEqual([]);
  await ctx.close();
});

// ──────────────────────────────────────────────────────────── matching (M)

// This walk's OWN need. M-1 used to borrow whichever Gama need another walk
// left open, and prod-mcp-agents closes every QA-SYNTHETIC need — the same
// cause that turned company-chain red on 2026-10-22 (run 39792445120: 0 Gama
// needs on the board). A trade is named so scouting structures the need and
// can list candidates, supply and the auto-match receipt. Closed in afterAll.
const NEED_ROLE = `QA-SYNTHETIC atitikimas mūrininkai ${RUN}`;
let needCreatedHere = false;

async function submitNeed(page: Page): Promise<"done" | "limit"> {
  await page.goto("/lt/dashboard/company/needs?audience=need#demand-intake");
  await page.getByTestId("demand-role").fill(NEED_ROLE);
  await page.getByTestId("demand-description").fill(`${TAG}: synthetic need for the production matching walk, 1 mūrininkas.`);
  await page.getByTestId("demand-next").click();
  const size = page.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("1");
  await page.getByTestId("demand-next").click();
  await page.getByTestId("demand-create").click();
  const done = page.getByTestId("demand-done");
  const limit = page.getByTestId("demand-open-need-limit");
  await expect(done.or(limit)).toBeVisible({ timeout: 30_000 });
  return (await limit.isVisible()) ? "limit" : "done";
}

/**
 * Gama is on the free plan (one open need). A walk that stopped before its
 * cleanup leaves a QA-SYNTHETIC need open and this intake is refused — the
 * limit working (company-chain 39960149411 left one). Close the synthetic
 * leftovers through the scouting page's own controls, never this run's need.
 */
async function closeSyntheticLeftovers(page: Page): Promise<number> {
  await page.goto("/lt/dashboard/company/scouting");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const ids = new Set<string>();
  for (const a of await page.locator('a[href*="/dashboard/company/scouting?request="]', { hasText: "QA-SYNTHETIC" }).all()) {
    if ((await a.innerText().catch(() => "")).includes(RUN)) continue;
    const id = /request=([0-9a-f-]{36})/.exec((await a.getAttribute("href")) ?? "")?.[1];
    if (id) ids.add(id);
  }
  let closed = 0;
  // Fails loudly: a leftover that cannot be closed is the reason this run's
  // need is refused, and the error names it.
  for (const id of [...ids].slice(0, 5)) {
    if ((await closeNeed(page, id)) === "closed") closed += 1;
  }
  console.info(`[M-0] synthetic leftovers seen=${ids.size} closed=${closed}`);
  return closed;
}

/** Close one of Gama's needs through the product's own controls (Gama is the active workspace). */
async function closeNeed(page: Page, id: string): Promise<"closed" | "already-closed"> {
  await page.goto(`/lt/dashboard/company/scouting?request=${id}`);
  const controls = page.getByTestId("demand-lifecycle-controls").first();
  const unstructured = page.getByTestId("scouting-not-structured").first();
  await expect(controls.or(unstructured).first()).toBeVisible({ timeout: 30_000 });
  if (await controls.isVisible()) {
    if ((await controls.getAttribute("data-demand-status")) === "closed") return "already-closed";
    await controls.getByTestId("demand-close").click();
    await expect(controls).toHaveAttribute("data-demand-status", "closed", { timeout: 30_000 });
    return "closed";
  }
  // A need that names no trade: the scouting page draws its lifecycle controls
  // only for a structured need, so it is closed where the product offers that
  // for every submitted need — the chat workspace's candidates result
  // (`?result=candidates&demand=`, `company.close-demand`).
  await page.goto(`/lt/dashboard?result=candidates&demand=${id}`);
  const close = page.getByTestId("candidates-close-demand").filter({ visible: true }).first();
  const reopen = page.getByTestId("candidates-reopen-demand").filter({ visible: true }).first();
  await expect(close.or(reopen).first(), "the need's own close/reopen action").toBeVisible({ timeout: 60_000 });
  if (await reopen.isVisible()) return "already-closed";
  await close.click();
  const error = page.getByTestId("candidates-close-demand-error").first();
  await expect(reopen.or(error).first()).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) throw new Error(`close refused: ${(await error.innerText()).slice(0, 120)}`);
  return "closed";
}

test("M-0. Gama posts this run's need through the demand intake", async ({ browser }) => {
  test.setTimeout(480_000); // room for the leftover cleanup
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  let outcome = await submitNeed(page);
  if (outcome === "limit" && (await closeSyntheticLeftovers(page)) > 0) outcome = await submitNeed(page);
  expect(outcome, "the open-need limit refused this run's need").toBe("done");
  await page.goto("/lt/dashboard/company/scouting");
  const link = page.locator('a[href*="/dashboard/company/scouting?request="]', { hasText: RUN }).first();
  await expect(link, "this run's need is listed among Gama's needs").toBeVisible({ timeout: 30_000 });
  requestId = /request=([0-9a-f-]{36})/.exec((await link.getAttribute("href")) ?? "")?.[1] ?? "";
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  needCreatedHere = true;
  await ctx.close();
});

test("M-1 (4.5). the worker sees why Gama's need fits them", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/dashboard/opportunities?view=all");
  await expect(page.getByTestId("opportunities-list")).toBeVisible({ timeout: 60_000 });
  const cards = page
    .locator(`li[id="opp-${requestId}"]`)
    .filter({ has: page.getByTestId("opportunity-company").filter({ hasText: GAMA }) })
    .filter({ has: page.locator('[data-testid^="interest-"]') });
  await expect.poll(() => cards.count(), { timeout: 60_000 }).toBeGreaterThan(0);
  const card = cards.first();

  const why = card.getByTestId("opportunity-why");
  await expect(why).toBeVisible();
  expect((await why.innerText()).trim().length, "the why-line says something").toBeGreaterThan(3);
  const details = card.getByTestId("opportunity-details");
  await details.getByRole("button").first().click();
  await expect(details.getByRole("button").first()).toHaveAttribute("aria-expanded", "true");
  await expect(card.getByTestId("opportunity-match-breakdown"), "the full explanation opens").toBeVisible();

  // The hand on the need is what puts this worker on Gama's candidate list (M-2..M-4).
  const express = card.getByTestId("interest-express");
  if (await express.isVisible().catch(() => false)) {
    await express.click();
    await expect(card.getByTestId("interest-sent")).toBeVisible({ timeout: 30_000 });
    handRaisedHere = true;
  }
  await ctx.close();
});

test("M-2 (4.10). Gama discovers supply for its need: candidates and available workforce", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  await expect(page.getByTestId("scouting-pool-note")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId(`scout-candidate-${workerId}`), "the synthetic worker is discovered").toBeVisible({
    timeout: 60_000,
  });
  const supply = page.getByTestId("available-supply-section");
  await expect(supply, "the available-workforce half of discovery renders").toBeVisible();
  await expect(
    supply
      .getByTestId("available-supply-rows")
      .or(supply.getByTestId("available-supply-empty"))
      .or(supply.getByTestId("available-supply-not-enabled"))
      .first(),
  ).toBeVisible();
  await expect(supply.getByTestId("available-supply-error")).toHaveCount(0);
  await ctx.close();
});

test("M-3 (4.13). the need carries its automatic-matching receipt", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  await expect(page.getByTestId("scouting-pool-note")).toBeVisible({ timeout: 60_000 });
  const receipt = page.getByTestId("scouting-auto-match-receipt");
  if (!(await receipt.isVisible().catch(() => false))) {
    // The product's own trigger for an existing need: confirming its requirement set.
    const confirm = page.getByTestId("demand-confirm-need");
    if (await confirm.isVisible().catch(() => false)) {
      console.info("M-3: no receipt yet — confirming the need's requirements (the auto-match trigger)");
      await confirm.click();
      await expect(page.getByTestId("demand-need-confirmed")).toBeVisible({ timeout: 30_000 });
      await page.reload();
    } else {
      const status = await page.getByTestId("demand-lifecycle-controls").getAttribute("data-demand-status").catch(() => null);
      console.info(`M-3 diagnostics: no receipt, no confirm door, need status=${status ?? "?"}`);
    }
  }
  await expect(receipt, "the auto-match receipt is shown on the need").toBeVisible({ timeout: 60_000 });
  expect((await receipt.innerText()).trim().length).toBeGreaterThan(3);
  await ctx.close();
});

test("M-4 (4.19). Gama asks for the worker's contact details: the ask is pending, then withdrawn", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  const candidate = page.getByTestId(`scout-candidate-${workerId}`);
  await expect(candidate).toBeVisible({ timeout: 60_000 });
  const canContact = await page.getByTestId(`scout-comms-${workerId}`).getAttribute("data-can-contact").catch(() => null);
  expect(canContact, "the contact door is offered for this candidate").toBe("true");
  const status = page.getByTestId(`contact-request-status-${workerId}`);
  const ask = page.getByTestId(`contact-request-open-${workerId}`);
  await expect(status.or(ask).first()).toBeVisible({ timeout: 30_000 });
  // Record what was there. An ask this walk did not make — open or answered —
  // is read back and left exactly as it is.
  const found = (await ask.isVisible().catch(() => false)) ? null : await status.getAttribute("data-status").catch(() => null);
  if (found === "created" || found === "accepted") {
    await page.reload();
    await expect(status, "the existing ask reads back unchanged").toHaveAttribute("data-status", found, {
      timeout: 60_000,
    });
    console.info(`M-4: a pre-existing ask (${found}) — read back, nothing written`);
    await ctx.close();
    return;
  }
  await ask.click();
  contactAskCreatedHere = true;
  await expect(
    status.or(page.getByTestId(`contact-request-limit-${workerId}`)).or(page.getByTestId(`contact-request-error-${workerId}`)).first(),
  ).toBeVisible({ timeout: 30_000 });
  expect(await page.getByTestId(`contact-request-limit-${workerId}`).count(), "not rate-limited").toBe(0);
  expect(await page.getByTestId(`contact-request-error-${workerId}`).count(), "no error").toBe(0);
  // Persistence: a fresh load shows the ask pending (and gives the withdraw control its row id).
  await page.reload();
  await expect(status).toHaveAttribute("data-status", "created", { timeout: 60_000 });
  // Restore: the ask this run made is taken back.
  await page.getByTestId(`contact-request-withdraw-${workerId}`).click();
  await expect(status).toHaveAttribute("data-status", "withdrawn", { timeout: 30_000 });
  contactAskCreatedHere = false;
  await ctx.close();
});

test("M-5 (4.14). a candidate draft is created, seen after a reload, and deleted", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await page.goto("/lt/dashboard/candidates");
  await expect(page.getByTestId("candidate-drafts-manager")).toBeVisible({ timeout: 60_000 });
  // Record the owner's existing drafts: this run adds one, uniquely named, and
  // removes only that one — the others must be exactly as found.
  const draftsBefore = await page.getByTestId("candidate-draft-card").count();
  const create = page.getByTestId("candidate-draft-create");
  await create.getByTestId("draft-name-input").fill(DRAFT);
  await create.getByTestId("draft-create-submit").click();
  draftCreated = true;
  const card = page.getByTestId("candidate-draft-card").filter({ hasText: DRAFT });
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await page.reload();
  await expect(card, "the draft persisted").toHaveCount(1, { timeout: 60_000 });
  await card.getByTestId("draft-delete").click();
  await expect(card).toHaveCount(0, { timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId("candidate-drafts-manager")).toBeVisible({ timeout: 60_000 });
  await expect(card, "the deletion persisted").toHaveCount(0);
  await expect(page.getByTestId("candidate-draft-card"), "every other draft is untouched").toHaveCount(draftsBefore);
  draftCreated = false;
  await ctx.close();
});

test("M-6 (4.25). admin matching workbench — not walked", async () => {
  test.skip(true, "superadmin-only (/dashboard/admin/matching); the synthetic QA cast has no superadmin identity");
});

test("P-7 (9.10). rate limiting — not walked", async () => {
  test.skip(
    true,
    "no safe user-visible limit: the search API's 429 shows only the generic error, is per server instance, and the dedicated limit notes sit on write actions",
  );
});

/** Employer visibility: grant from the choice screen or from a reopened withdrawal, and prove it on a fresh load. */
async function grantVisibility(page: Page): Promise<void> {
  const withdrawn = page.getByTestId("discoverability-withdrawn");
  if (await withdrawn.isVisible().catch(() => false)) {
    await page.getByTestId("discoverability-reopen").click();
  } else {
    await page.getByTestId("discoverability-open").click();
  }
  await expect(page.getByTestId("discoverability-grant"), "the screen offers the grant").toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("discoverability-grant").click();
  await expect(page.getByTestId("discoverability-granted")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId("discoverability-granted"), "the grant persisted").toBeVisible({ timeout: 60_000 });
}

/** Employer visibility: withdraw from the granted screen, and prove it on a fresh load. */
async function withdrawVisibility(page: Page): Promise<void> {
  await page.getByTestId("discoverability-manage").click();
  await page.getByTestId("discoverability-withdraw").click();
  await expect(page.getByTestId("discoverability-withdrawn")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId("discoverability-withdrawn"), "the withdrawal persisted").toBeVisible({
    timeout: 60_000,
  });
}

// Every path proves off → persists → on, and ENDS where it started: visible
// stays visible, hidden ends hidden (a never-decided consent ends "withdrawn",
// the same hidden state — the consent ledger is append-only by design).
test("P-8 (2.35 / 4.17). the worker turns employer visibility off, it persists, and turns it back on", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/privacy#visibility");
  const granted = page.getByTestId("discoverability-granted");
  const withdrawn = page.getByTestId("discoverability-withdrawn");
  const choice = page.getByTestId("discoverability-choice");
  await expect(granted.or(withdrawn).or(choice).first()).toBeVisible({ timeout: 60_000 });
  visibilityInitial = (await granted.isVisible()) ? "granted" : (await withdrawn.isVisible()) ? "withdrawn" : "choice";
  console.info(`P-8: starting state = ${visibilityInitial}`);
  visibilityTouched = true;

  if (visibilityInitial === "granted") {
    await withdrawVisibility(page);
    await grantVisibility(page); // restored: visible
  } else if (visibilityInitial === "withdrawn") {
    await grantVisibility(page);
    await withdrawVisibility(page); // restored: hidden
  } else {
    await grantVisibility(page);
    await withdrawVisibility(page);
    await grantVisibility(page); // the way back from a withdrawal
    await withdrawVisibility(page); // restored: hidden
  }
  visibilityTouched = false;
  await ctx.close();
});

// `afterAll`, not a last test: a serial walk stops at its first red step, and
// a run that failed half-way must still undo what it did. Each item is undone
// on its own and a failure is logged, never thrown over the result.
test.afterAll(async ({ browser }) => {
  // Own budget: the default hook timeout is 30 s, less than one job below
  // (company-chain run 39960149411 lost its cleanup to it and left its need open).
  test.setTimeout(600_000);
  const jobs: { what: string; slot: string; org: string | null; when: () => boolean; run: (p: Page) => Promise<void> }[] = [
    {
      what: "contact ask",
      slot: "manager",
      org: GAMA,
      // Only an ask THIS run made; a pre-existing one is never withdrawn.
      when: () => contactAskCreatedHere && requestId !== "",
      run: async (page) => {
        await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
        const status = page.getByTestId(`contact-request-status-${workerId}`);
        await expect(page.getByTestId(`scout-candidate-${workerId}`)).toBeVisible({ timeout: 60_000 });
        if ((await status.getAttribute("data-status").catch(() => null)) === "created") {
          await page.getByTestId(`contact-request-withdraw-${workerId}`).click();
          await expect(status).toHaveAttribute("data-status", "withdrawn", { timeout: 30_000 });
        }
      },
    },
    {
      what: "raised hand",
      slot: "worker",
      org: null,
      when: () => handRaisedHere && requestId !== "",
      run: async (page) => {
        await page.goto("/lt/dashboard/opportunities?view=all");
        const card = page.locator(`li[id="opp-${requestId}"]`);
        const withdraw = card.getByTestId("interest-withdraw");
        await expect(withdraw).toBeVisible({ timeout: 60_000 });
        await withdraw.click();
        await expect(card.getByTestId("interest-express")).toBeVisible({ timeout: 30_000 });
      },
    },
    {
      what: "candidate draft",
      slot: "owner",
      org: null,
      when: () => draftCreated,
      run: async (page) => {
        await page.goto("/lt/dashboard/candidates");
        await expect(page.getByTestId("candidate-drafts-manager")).toBeVisible({ timeout: 60_000 });
        const cards = page.getByTestId("candidate-draft-card").filter({ hasText: TAG });
        while ((await cards.count()) > 0) {
          const n = await cards.count();
          await cards.first().getByTestId("draft-delete").click();
          await expect(cards).toHaveCount(n - 1, { timeout: 30_000 });
        }
      },
    },
    {
      what: "supply consent (back to none, as found)",
      slot: "worker2",
      org: null,
      // Only a consent THIS run granted; a pre-existing one is never withdrawn.
      when: () => supplyGrantedHere,
      run: async (page) => {
        await page.goto("/lt/dashboard/privacy#partner-supply");
        const withdrawConsent = page.getByTestId("partner-supply-withdraw-consent");
        await expect(withdrawConsent.or(page.getByTestId("partner-supply-choice")).first()).toBeVisible({
          timeout: 60_000,
        });
        if (await withdrawConsent.isVisible().catch(() => false)) {
          await withdrawConsent.click();
          await expect(page.getByTestId("partner-supply-choice")).toBeVisible({ timeout: 30_000 });
        }
      },
    },
    {
      what: "location row (visibility as found; a row made here is disabled)",
      slot: "worker2",
      org: null,
      when: () => locationRow !== null,
      run: async (page) => {
        const rec = locationRow;
        if (!rec) return;
        await openCapture(page);
        const row = taggedLocationRow(page);
        await expect(row).toBeVisible({ timeout: 30_000 });
        const select = row.getByTestId("capture-preferred-visibility");
        if ((await select.inputValue()) !== rec.visibilityBefore) await setLocationVisibility(page, rec.visibilityBefore);
        // A reused row keeps the active flag it had; a row this run made ends disabled.
        const wantActive = rec.created ? false : rec.activeBefore;
        const active = (await taggedLocationRow(page).getAttribute("data-active")) === "true";
        if (active !== wantActive) {
          await taggedLocationRow(page).getByTestId("capture-preferred-toggle").click();
          await expect(taggedLocationRow(page)).toHaveAttribute("data-active", String(wantActive), { timeout: 30_000 });
        }
      },
    },
    {
      what: "employer visibility (as found)",
      slot: "worker2",
      org: null,
      when: () => visibilityTouched && visibilityInitial !== "",
      run: async (page) => {
        await page.goto("/lt/dashboard/privacy#visibility");
        const granted = page.getByTestId("discoverability-granted");
        const hidden = page.getByTestId("discoverability-withdrawn").or(page.getByTestId("discoverability-choice"));
        await expect(granted.or(hidden).first()).toBeVisible({ timeout: 60_000 });
        const isGranted = await granted.isVisible();
        if (visibilityInitial === "granted" && !isGranted) await grantVisibility(page);
        if (visibilityInitial !== "granted" && isGranted) await withdrawVisibility(page);
      },
    },
    {
      // Last: the hand and the contact ask above are undone on the open need first.
      what: "this run's need (closed; interest and asks stay as history)",
      slot: "manager",
      org: GAMA,
      when: () => needCreatedHere && requestId !== "",
      run: async (page) => {
        await closeNeed(page, requestId);
      },
    },
  ];
  for (const job of jobs) {
    if (!job.when()) continue;
    const { ctx, page } = await as(browser, job.slot);
    try {
      if (job.org) await useWorkspace(page, job.org);
      await job.run(page);
      console.info(`[cleanup] ${job.what}: undone`);
    } catch (e) {
      console.info(`[cleanup] ${job.what}: NOT undone (${firstLine(e)})`);
    } finally {
      await ctx.close();
    }
  }
});
