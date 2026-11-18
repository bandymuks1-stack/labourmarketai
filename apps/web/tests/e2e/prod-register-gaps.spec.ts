import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";
import { isSyntheticFixtureLabel } from "../../lib/qa/synthetic-fixture";

/**
 * REGISTER GAPS — production proof for function-register rows that had no
 * walk of their own (2026-11-01 reconciliation). Dispatch only; one run is
 * a few small checks, each named by its register row:
 *
 *   G-1 (6.18)  the waitlist takes a REAL submit and keeps it: one synthetic
 *               address is sent from the plan card, then sent again — the
 *               second answer is "already on the list", which only a stored
 *               row can produce (the table's unique e-mail constraint). Anon
 *               only, no mail is sent by this path. Skipped honestly when the
 *               plan cards offer the account instead (billing on).
 *   G-2 (9.18)  the public JSON APIs answer as designed: /api/health and the
 *               public claims contract are open JSON; the signed-in search API
 *               refuses an anonymous caller and answers JSON to a signed-in one.
 *   G-3 (2.36)  the profession journal templates: when the worker's FULL
 *               composer (?compose=full), with its "more options" disclosure opened, shows the template picker, picking one prefills the entry
 *               (nothing is saved). When no template is active for that worker
 *               the run records that fact — the seeds ship inactive and are
 *               activated by the owner — and the row stays unproven.
 *   G-4 (3.34)  the project forecast: the organization owner opens one of
 *               its own projects and the forecast panel beside the course is
 *               READ (ok / too little evidence / nothing open — never
 *               "unavailable") and labelled a forecast, not a fact. Read only.
 *
 *   J-2 (2.37)  a LINKED person contests an imported record and takes the
 *               contest back. Signed in as the QA worker ONLY, on their own
 *               profile (`#organization-history`, the selectors of the CI
 *               walk EX-6 in experience-integration-isolated.spec.ts): the ONE
 *               organization record that carries a synthetic-fixture label
 *               (`lib/qa/synthetic-fixture.ts`) is pinned, contested through
 *               the dispute form, shown as contested after a fresh load,
 *               withdrawn, and shown with the withdrawn history line after a
 *               fresh load. Writes exactly two append-only events on that one
 *               record (`disputed`, `dispute_withdrawn`, both by the worker);
 *               the record itself is never edited. Proof is UI only: a walk
 *               has no database access, and both markers are server renders
 *               of the stored events (re-read after `reload()`). When no such
 *               record is linked to the QA worker the step SKIPS with that
 *               reason and writes nothing — seeding is the owner's or the
 *               coordinator's step (below). A standing contest left by an
 *               interrupted earlier run is withdrawn first, so a rerun starts
 *               from the same state. Who has NO account is owner decision
 *               ARCH-5 and is not walked.
 *
 * Synthetic data only: the waitlist address is a reserved example.com
 * address tagged with this run id; no person's data is read or written.
 *
 * ── J-2 SEEDING (owner / coordinator, once; NOT done by this walk or by agents)
 *
 * J-2 needs ONE organization record about a roster person of a QA-SYNTHETIC
 * organization, linked to the QA worker (slot `worker`, the Alfa employee of
 * `lib/testing/prod-qa-guard.ts`) by the worker's OWN confirmation. Made
 * through the product's own doors, as EX-0 does in CI (there the records are
 * written with the local service key only because the import UI is not what
 * that walk is about; in production use the import door):
 *
 *   1. As the QA owner, workspace "QA-SYNTHETIC Alfa (testinis subjektas)"
 *      (header workspace chip), open /lt/dashboard/company/history and import
 *      a one-row file through the import door (upload → preview → commit),
 *      for example `qa-synthetic-2-37.csv`:
 *
 *          vardas,data,valandos,darbai
 *          QA-SYNTHETIC Ginčo Asmuo,2025-03-10,6,[QA-SYNTHETIC] 2.37 contest fixture: tinkavimo darbai
 *
 *      Let the commit plan create the person (relationship "employee"). Use a
 *      DEDICATED roster name: "QA-SYNTHETIC Istorijos Asmuo" belongs to
 *      prod-company-talent-history (H-*), whose cleanup withdraws its link
 *      every run, and "QA-SYNTHETIC Importuotas Asmuo" to prod-org-roster.
 *   2. Still as the owner in Alfa, /lt/dashboard/company/people#people-import-section:
 *      on that roster row pick the QA worker in `roster-link-worker-<person id>`
 *      and send the offer (`roster-link-offer-<person id>`).
 *   3. As the QA worker, /lt/dashboard/profile: the offer waits at the top
 *      (`roster-link-offer`) — Accept. The link is now `linked` /
 *      `worker_confirmed`, and the record is on the worker's
 *      `#organization-history`.
 *
 * Never withdraw that link afterwards (it would make J-2 skip again). No SQL
 * is needed or proposed: every step above is an existing product action of
 * the QA cast.
 *
 * Kept out of statistics: the organization's name carries `QA-SYNTHETIC` and
 * the record text `[QA-SYNTHETIC]`, the markers of `isSyntheticFixtureLabel`
 * (and its SQL twin `is_synthetic_fixture_label_v1`). The shared
 * cross-organization readers drop fixture-labelled rows for real viewers
 * (demand board, supply discovery, matching via `match-subject.ts`), and the
 * operator metrics (`ops_product_metrics`) classify the organization and the
 * QA accounts as TEST; those metrics count no evidence records or evidence
 * events at all. What still COUNTS it, by design: the QA worker's own
 * professional-experience total and Living CV (decision 0025: their own
 * history, every hour once), Alfa's own history / business-history reads
 * (Alfa is itself synthetic), and the competency suggestions shown only to
 * the worker. No public or cross-organization statistic reads these records.
 */

const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(browser: Browser, slot: string | null, locale: "lt-LT" | "en-GB" = "lt-LT"): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...(slot ? { storageState: state(slot) } : {}), locale });
  return { ctx, page: await ctx.newPage() };
}

test("G-1 (6.18). the waitlist keeps a real submit: the same address the second time is already on the list", async ({ browser }) => {
  const { ctx, page } = await as(browser, null, "en-GB");
  await page.goto("/en/pricing");
  const card = page.getByTestId("pricing-plan-business");
  await expect(card, "the business plan card renders").toBeVisible({ timeout: 30_000 });
  const billingOn = (await page.getByTestId("pricing-cta-business").count()) > 0;
  test.skip(billingOn, "billing is on: the plan card offers the account, not the waitlist");

  // Unique per workflow ATTEMPT: a re-run keeps GITHUB_RUN_ID, and an address
  // an earlier attempt stored would answer "duplicate" on the first submit.
  const email = `qa.synthetic.waitlist+${RUN}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}@example.com`;
  const submit = async (): Promise<string> => {
    await card.getByRole("button").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog, "the waitlist dialog opens").toBeVisible();
    await dialog.locator('input[type="email"]').fill(email);
    const answer = page.waitForResponse((r) => r.url().endsWith("/api/waitlist") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Notify me" }).click();
    const res = await answer;
    expect(res.status(), "the waitlist answered").toBe(200);
    const body = (await res.json()) as { ok?: boolean; duplicate?: boolean };
    expect(body.ok, "the waitlist accepted the address").toBe(true);
    const title = body.duplicate ? "You're already on the list" : "Thanks!";
    await expect(dialog.getByText(title), "the dialog says what happened").toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).first().click();
    await expect(dialog).toBeHidden();
    return body.duplicate ? "duplicate" : "stored";
  };

  expect(await submit(), "a new address is stored").toBe("stored");
  expect(await submit(), "the same address again is already there — the row persisted").toBe("duplicate");
  console.log(`[waitlist] run ${RUN}: stored, then duplicate`);
  await ctx.close();
});

test("G-2 (9.18). the public JSON APIs answer as designed, anonymous and signed in", async ({ browser, playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  const health = await anon.get("/api/health");
  expect(health.status(), "/api/health is public").toBe(200);
  expect(health.headers()["content-type"] ?? "").toMatch(/application\/json/);

  const claims = await anon.get("/api/public/claims/v1");
  expect(claims.status(), "the public claims contract is public").toBe(200);
  expect(claims.headers()["content-type"] ?? "").toMatch(/application\/json/);
  expect(typeof (await claims.json()), "it is a JSON document").toBe("object");

  const anonSearch = await anon.get("/api/dashboard-search?q=plyt");
  expect(anonSearch.status(), "the signed-in search API refuses an anonymous caller").toBe(401);
  await anon.dispose();

  const { ctx } = await as(browser, "worker");
  const search = await ctx.request.get("/api/dashboard-search?q=plyt");
  expect(search.status(), "the signed-in search API answers a signed-in worker").toBe(200);
  expect(search.headers()["content-type"] ?? "").toMatch(/application\/json/);
  console.log(`[api] health 200, claims 200, search anon ${anonSearch.status()} / worker ${search.status()}`);
  await ctx.close();
});

test("G-3 (2.36). a profession journal template prefills the entry when one is active for the worker", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  // Templates belong to the FULL composer (the "detaliau" door); the default
  // journal page is the compact quick record and never shows them.
  await page.goto("/lt/dashboard/journal?compose=full");
  await expect(page.getByRole("main"), "the journal renders").toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("journal-compose-full"), "the full composer is open").toBeVisible({ timeout: 30_000 });
  // The picker lives inside the composer's closed "more options" disclosure.
  // It is server data, so its presence in the DOM is the answer; the
  // disclosure is opened so a template can be clicked. (isVisible() would not
  // wait — it returns at once whatever its timeout says.)
  const more = page.getByTestId("journal-more-options");
  await expect(more, "the composer's more-options disclosure renders").toBeAttached({ timeout: 30_000 });
  // Direct child only: a nested examples disclosure has its own summary.
  await more.locator(":scope > summary").click();
  await expect(more, "the disclosure opened").toHaveAttribute("open", "");
  const picker = more.getByTestId("journal-template-picker");
  const shown = (await picker.count()) > 0;
  if (!shown) {
    console.log("[templates] no active journal template for this worker — 2.36 stays unproven (seeds ship inactive)");
    test.info().annotations.push({ type: "unproven", description: "no active journal template in production for the QA worker" });
    await ctx.close();
    return;
  }
  const first = picker.locator('[data-testid^="journal-template-"]').first();
  const slug = (await first.getAttribute("data-testid"))?.replace("journal-template-", "") ?? "?";
  const text = page.locator("textarea").first();
  const before = (await text.inputValue()).length;
  await first.click();
  await expect.poll(async () => (await text.inputValue()).length, { message: "the template prefilled the entry" }).toBeGreaterThan(before);
  console.log(`[templates] template ${slug} prefilled the entry (not saved)`);
  await ctx.close();
});

test("G-4 (3.34). the owner reads a project forecast beside the course, labelled a forecast", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await page.goto("/lt/dashboard/projects");
  await expect(page.getByTestId("company-ops-projects"), "the organization's projects render").toBeVisible({ timeout: 30_000 });
  // Any link to one of the organization's projects (its page or its board).
  const hrefs = await page
    .getByRole("main")
    .locator("a[href*=\"/dashboard/projects/\"]")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  const id = hrefs.map((h) => /\/dashboard\/projects\/([0-9a-f-]{36})(?:\/operations)?(?:[?#].*)?$/.exec(h)?.[1]).find(Boolean);
  expect(id, "at least one of the owner's own projects is linked").toBeTruthy();
  const res = await page.goto(`/lt/dashboard/projects/${id}`);
  expect(res?.status() ?? 0, "the project page answered").toBeLessThan(500);
  const panel = page.getByRole("main").getByTestId("project-forecast");
  await expect(panel, "the forecast panel renders for the project's manager").toBeVisible({ timeout: 30_000 });
  const state = await panel.getAttribute("data-state");
  console.log(`[forecast] owner project forecast state: ${state}`);
  expect(["ok", "insufficient_data", "not_applicable"], `the forecast was read in production (got ${state})`).toContain(state);
  await expect(panel.getByTestId("project-forecast-note"), "labelled a forecast, not a fact").toBeVisible();
  await ctx.close();
});

test("J-2 (2.37). the QA worker contests the QA-SYNTHETIC record linked to them, sees it contested, and takes the contest back", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker", "en-GB");
  try {
    const open = async (): Promise<Locator> => {
      await page.goto("/en/dashboard/profile#organization-history");
      const main = page.getByRole("main");
      // The profile rendered (this bar is unconditional); the history bar below
      // renders only when the worker has linked organization history.
      await expect(main.getByTestId("profile-edit-disclosure"), "the worker's profile renders").toBeAttached({ timeout: 60_000 });
      return main;
    };
    let main = await open();
    const list = main.getByTestId("organization-evidence-records");
    const noRecord = "no QA-SYNTHETIC record linked to the QA account; seeding is the owner's/coordinator's step (spec header, J-2 SEEDING)";
    if ((await main.getByTestId("organization-history-disclosure").count()) === 0 || (await list.count()) === 0) {
      test.skip(true, noRecord);
      return;
    }
    await expect(list, "the linked history opens from the hash").toBeVisible({ timeout: 60_000 });

    // Only a record that carries a synthetic-fixture label, read from what the
    // card shows: the recording organization and the source's own words.
    const items = list.locator(":scope > li");
    const labelled = await items.evaluateAll((els) =>
      els.map((el) => ({
        origin: el.querySelector('[data-testid="organization-evidence-record-origin"]')?.textContent ?? "",
        text: el.querySelector('[data-testid="organization-evidence-record-text"]')?.textContent ?? "",
        mine: el.querySelector('[data-testid="evidence-dispute-withdraw"]') !== null,
        offers: el.querySelector('[data-testid="evidence-dispute-open"]') !== null,
      })),
    );
    const qa = labelled
      .map((r, i) => ({ ...r, i, fixture: isSyntheticFixtureLabel(r.origin, r.text) }))
      .filter((r) => r.fixture && (r.offers || r.mine));
    if (qa.length === 0) {
      test.skip(true, noRecord);
      return;
    }
    // The dedicated seed (its text names 2.37) first, else the first labelled one.
    const pick = qa.find((r) => /\b2\.37\b/.test(r.text)) ?? qa[0]!;
    console.log(`[contest] ${qa.length} QA-labelled record(s) linked to the QA worker; using one (standing contest from an earlier run: ${pick.mine})`);
    let record = items.nth(pick.i);
    const recordText = (await record.getByTestId("organization-evidence-record-text").innerText()).trim();
    expect(isSyntheticFixtureLabel(pick.origin, recordText), "the pinned record is the QA fixture").toBe(true);

    // The record's own id, from the form the product renders for it.
    const recordIdIn = async (r: Locator): Promise<string> => {
      const id = await r.locator('input[name="record_id"]').first().inputValue();
      expect(id, "the record's form names it").toMatch(/^[0-9a-f-]{36}$/);
      return id;
    };
    const byId = (id: string): Locator =>
      page.getByRole("main").getByTestId("organization-evidence-records").locator(":scope > li").filter({
        has: page.locator(`input[name="record_id"][value="${id}"]`),
      });

    // Withdraw the worker's standing contest on one record: the withdraw form
    // (which names the record) leaves once the action has stored the event and
    // the profile re-rendered; a refusal keeps the form and says so.
    const withdraw = async (rid: string): Promise<void> => {
      const r = byId(rid);
      await r.getByTestId("evidence-dispute-withdraw").click();
      await expect
        .poll(async () => ((await r.getByTestId("evidence-dispute-withdraw-error").count()) > 0 ? "refused" : await r.count()), {
          message: "the withdrawal is answered",
          timeout: 30_000,
        })
        .toBe(0);
    };

    if (pick.mine) {
      // An interrupted earlier run left its contest standing: take it back first.
      await withdraw(await recordIdIn(record));
      main = await open();
      record = main
        .getByTestId("organization-evidence-records")
        .locator(":scope > li")
        .filter({ hasText: recordText })
        .filter({ has: page.getByTestId("evidence-dispute-open") })
        .first();
    }

    // 1. Contest it.
    await record.getByTestId("evidence-dispute-open").click();
    const id = await recordIdIn(record);
    await record.getByTestId("evidence-dispute-note").fill(`QA-SYNTHETIC contest ${RUN}: production walk J-2, withdrawn in the same run`);
    await record.getByTestId("evidence-dispute-submit").click();
    const refused = page.getByTestId("evidence-dispute-error");
    // The action revalidates the profile: the record re-renders as contested by
    // the worker (its withdraw form names the record) or the form says it refused.
    await expect(byId(id).getByTestId("evidence-dispute-withdraw").or(refused).first()).toBeVisible({ timeout: 30_000 });
    expect(await refused.count(), "the contest was accepted").toBe(0);

    // 2. After a fresh load the stored contest is on the record.
    await open();
    const contested = byId(id);
    await expect(contested, "the contested record is on the profile").toHaveCount(1, { timeout: 60_000 });
    await expect(contested.getByTestId("evidence-record-disputed"), "the record shows the worker's contest").toBeVisible();
    await expect(contested.getByTestId("organization-evidence-record-text"), "the record itself is unchanged").toHaveText(recordText);

    // 3. Take it back.
    await withdraw(id);

    // 4. After a fresh load: no standing contest by the worker on that record,
    //    and the history line says the contest existed and was withdrawn.
    main = await open();
    const after = main
      .getByTestId("organization-evidence-records")
      .locator(":scope > li")
      .filter({ hasText: recordText })
      .filter({ has: page.getByTestId("evidence-dispute-withdrawn-history") });
    await expect(after.first(), "the contest is not erased, only withdrawn").toBeVisible({ timeout: 60_000 });
    // Read once the list has rendered: no withdraw form names the record, so
    // the worker's contest no longer stands.
    await expect(byId(id), "no standing contest by the worker on the record").toHaveCount(0);
    await expect(after.first().getByTestId("evidence-dispute-open"), "a fresh contest is offered again").toBeVisible();
    console.log("[contest] contested, shown contested after reload, withdrawn, withdrawn history shown after reload");
  } finally {
    await ctx.close();
  }
});
