import { test, expect, type Browser, type Page } from "@playwright/test";

import {
  BASE,
  isolatedStack,
  lit,
  onboard,
  publishNeed,
  setUpCompany,
  signUp,
  sql,
  stackMailLink,
  verifyCompanyAsLocalAdmin,
} from "./isolated-web-a-helpers";

/**
 * COMPANY OFFER TO WORK (owner decision 2026-11-22, item 2) — the whole path,
 * on the throwaway local stack (every migration replayed, synthetic data):
 *   need -> company offer (found under "What we offer") -> the client's
 *   preliminary yes -> terms with the place -> the contractor names its crew
 *   -> BOTH sides confirm the same version -> the client creates the project
 *   -> the CREW (never the whole company) is put on it -> both sides see that
 *   the work started. Screens at 1280 and 390 px; no sideways scroll.
 */

const B = BASE;
const RUN = Date.now().toString(36);
const CO = `cotw-co-${RUN}@example.test`, SUB = `cotw-sub-${RUN}@example.test`, W = `cotw-w-${RUN}@example.test`, ADM = `cotw-adm-${RUN}@example.test`;
const CO_ORG = `Chain Client Builders ${RUN}`, SUB_ORG = `Chain Tiling Contractor ${RUN}`, CREW = `Tiling crew ${RUN}`;
const ROLE = `Tiler ${RUN}`;
const s: Record<string, string> = {};
let co: Page, sub: Page, w: Page;
const txt = async (p: Page, sel = "main") => (await p.locator(sel).first().innerText()).replace(/\n+/g, " | ");

/** Both widths the owner named: no sideways scroll on this screen. */
async function shot(p: Page, name: string) {
  for (const [wd, h] of [[1280, 900], [390, 844]] as const) {
    await p.setViewportSize({ width: wd, height: h });
    await p.waitForTimeout(300);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    expect(sw, `${name} @${wd}: no sideways scroll`).toBeLessThanOrEqual(wd + 1);
  }
  await p.setViewportSize({ width: 1280, height: 900 });
}
async function fresh(browser: Browser): Promise<Page> {
  return (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
}
async function verifyEmail(page: Page, address: string) {
  await page.goto(`${B}/en/dashboard/network`);
  const prompt = page.getByTestId("network-email-unverified");
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await prompt.getByTestId("verify-email-send").click();
  await expect(prompt.getByTestId("verify-email-sent")).toBeVisible({ timeout: 30_000 });
  await page.goto(await stackMailLink(address));
  await page.waitForURL((u) => !u.pathname.includes("/auth/callback"), { timeout: 60_000 });
}
async function openOfferForm(p: Page) {
  await p.goto(`${B}/en/dashboard/services`); await p.waitForLoadState("networkidle").catch(() => {});
  const sec = p.locator('[data-testid^="team-demand-offer-section-"]').first();
  await expect(sec).toBeVisible({ timeout: 30_000 });
  if (!(await sec.getAttribute("open").then((v) => v !== null))) await sec.locator("summary").click();
  await expect(p.locator('[data-testid^="team-offer-demand-"]').first()).toBeVisible({ timeout: 30_000 });
  return sec;
}

test.describe.configure({ mode: "serial" });
test.skip(!isolatedStack(), "isolated local stack only");

test("0. client posts a need; contractor and its worker register", async ({ browser }) => {
  co = await fresh(browser);
  await signUp(co, B, CO); await onboard(co, "hire", "Chain Client Owner"); await setUpCompany(co, CO_ORG);
  await verifyEmail(co, CO);
  await publishNeed(co, B, ROLE, "LT");
  await verifyCompanyAsLocalAdmin(CO, ADM);
  s.need = sql<{ id: string }>(`select id from public.customer_requests where role_or_work_type=${lit(ROLE)} or title=${lit(ROLE)} limit 1`)[0]!.id;
  sub = await fresh(browser);
  await signUp(sub, B, SUB); await onboard(sub, "hire", "Chain Contractor Owner"); await setUpCompany(sub, SUB_ORG);
  await verifyEmail(sub, SUB);
  w = await fresh(browser);
  await signUp(w, B, W); await onboard(w, "work", "Chain Crew Member");
  await w.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  await verifyEmail(w, W);
});

test("1. the contractor puts its worker on its roster and forms a crew", async () => {
  await sub.goto(`${B}/en/dashboard/company/people#company-team`);
  await sub.getByTestId("company-workers-invite-email").fill(W);
  await sub.getByTestId("company-workers-invite-submit").click();
  await expect(sub.getByTestId("company-workers-invite-result")).toBeVisible({ timeout: 30_000 });
  await w.goto(`${B}/en/dashboard`);
  const acc = w.locator('[data-testid^="worker-invitation-accept-company-"]').filter({ visible: true }).first();
  await expect(acc).toBeVisible({ timeout: 30_000 });
  await acc.click();
  await w.waitForTimeout(2500);
  await sub.goto(`${B}/en/dashboard/company/people`);
  await expect(sub.getByTestId("team-brigades-panel")).toBeVisible({ timeout: 30_000 });
  await sub.getByTestId("team-create-name").fill(CREW);
  await sub.getByTestId("team-create-submit").click();
  const card = sub.locator('[data-testid^="team-brigade-"]', { hasText: CREW }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const tid = (await card.getAttribute("data-testid"))!.replace("team-brigade-", "");
  s.team = tid;
  const select = sub.locator(`[id="team-add-${tid}"]`);
  await select.waitFor({ state: "attached", timeout: 30_000 });
  const opts = await select.locator("option").allInnerTexts();
  const pick = opts.find((o) => /Chain Crew Member/.test(o));
  expect(pick, opts.join(" | ")).toBeTruthy();
  await select.selectOption({ label: pick! });
  await sub.getByTestId(`team-invite-member-${tid}`).click();
  const typed = sub.getByTestId(`team-invite-email-${tid}`);
  const asked = await Promise.race([
    typed.waitFor({ state: "visible", timeout: 20_000 }).then(() => true),
    sub.getByTestId("team-invite-link").waitFor({ state: "visible", timeout: 20_000 }).then(() => false),
  ]).catch(() => false);
  if (asked) { await typed.fill(W); await sub.getByTestId(`team-invite-member-${tid}`).click(); }
  const url = (await sub.getByTestId("team-invite-link").locator("code").innerText()).trim();
  const local = url.replace(/^https?:\/\/[^/]+/, B);
  await w.goto(local);
  await w.getByTestId("invite-accept").click();
  await w.waitForURL((u) => !u.pathname.includes("/invite/"), { timeout: 30_000 });
  const n = sql<{ n: number }>(`select count(*)::int as n from public.engagement_contexts where organization_id = ${lit(tid)} and relationship_slug='employee' and status='active'`)[0]!.n;
  expect(n, "the crew has its member").toBe(1);
});

test("2. the contractor finds the open need under What we offer and offers its company with terms", async () => {
  const sec = await openOfferForm(sub);
  await sub.locator('[data-testid^="team-offer-demand-"]').first().selectOption(s.need);
  await sub.locator('[data-testid^="team-offer-note-"]').first().fill("Our crew can start next week.");
  await shot(sub, "c2-sub-offer-form");
  await sub.locator('[data-testid^="team-offer-submit-"]').first().click();
  await expect(sub.locator('[data-testid^="team-offer-sent-"]').first()).toBeVisible({ timeout: 30_000 });
  s.offer = sql<{ id: string }>(`select id from public.team_demand_offers where request_id = ${lit(s.need)} order by offered_at desc limit 1`)[0]!.id;
});

test("3. the client says a preliminary yes", async () => {
  await co.goto(`${B}/en/dashboard/company/scouting?request=${s.need}`); await co.waitForLoadState("networkidle").catch(() => {});
  await co.getByTestId(`team-offer-accept-${s.offer}`).click();
  await expect(co.getByTestId(`offer-progress-${s.offer}`)).toBeVisible({ timeout: 30_000 });
  await co.getByTestId(`team-offer-received-${s.offer}`).scrollIntoViewIfNeeded();
  await shot(co, "c3-client-after-yes");
});

test("4. the contractor proposes the terms with the place, names its crew and confirms", async () => {
  await openOfferForm(sub);
  const panel = sub.getByTestId(`offer-progress-${s.offer}`);
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await sub.getByTestId(`offer-progress-crew-select-${s.offer}`).selectOption(s.team);
  await sub.getByTestId(`offer-progress-crew-submit-${s.offer}`).click();
  await expect(sub.getByTestId(`offer-progress-crew-${s.offer}`)).toContainText(CREW, { timeout: 30_000 });
  const terms = sub.getByTestId(`team-offer-terms-${s.offer}`);
  await terms.locator("summary").click();
  const form = sub.getByTestId(`team-offer-terms-form-${s.offer}`);
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.locator('input[type="number"]').fill("2");
  await form.locator('input[type="text"]').first().fill("1450 € fixed price");
  await form.locator("input[maxlength='300']").fill("Vilnius, the client's site");
  await form.locator("textarea").first().fill("Tile two bathrooms, materials by the client.");
  await sub.getByTestId(`team-offer-terms-propose-${s.offer}`).click();
  await expect(sub.getByTestId(`team-offer-terms-confirm-submit-${s.offer}`)).toBeVisible({ timeout: 30_000 });
  await sub.getByTestId(`team-offer-terms-confirm-submit-${s.offer}`).click();
  await expect(sub.getByTestId(`team-offer-terms-confirm-${s.offer}`)).toContainText(/You confirmed version/, { timeout: 30_000 });
  await terms.scrollIntoViewIfNeeded();
  await shot(sub, "c4-sub-terms-confirmed");
});

test("5. the client confirms the same version, creates the project and the work starts", async () => {
  await co.goto(`${B}/en/dashboard/company/scouting?request=${s.need}`); await co.waitForLoadState("networkidle").catch(() => {});
  const blocked = co.getByTestId(`offer-progress-blocked-${s.offer}`);
  await expect(blocked, "no start before both confirm").toBeVisible({ timeout: 30_000 });
  const terms = co.getByTestId(`team-offer-terms-${s.offer}`);
  await terms.locator("summary").click();
  await expect(co.getByTestId(`team-offer-terms-confirm-submit-${s.offer}`)).toBeVisible({ timeout: 30_000 });
  await co.getByTestId(`team-offer-terms-confirm-submit-${s.offer}`).click();
  await expect(co.getByTestId(`team-offer-terms-confirm-${s.offer}`)).toContainText(/Agreed by both sides/, { timeout: 30_000 });
  await co.reload(); await co.waitForLoadState("networkidle").catch(() => {});
  await expect(co.getByTestId(`offer-progress-start-${s.offer}`)).toBeVisible({ timeout: 30_000 });
  await co.getByTestId(`offer-progress-${s.offer}`).scrollIntoViewIfNeeded();
  await shot(co, "c5-client-ready-to-start");
  await co.getByTestId(`offer-progress-start-submit-${s.offer}`).click();
  await co.waitForURL(/\/dashboard\/projects\/[0-9a-f-]{36}/, { timeout: 60_000 });
  s.project = co.url().match(/projects\/([0-9a-f-]{36})/)![1]!;
  await co.waitForLoadState("networkidle").catch(() => {});
  await shot(co, "c5-client-project");
  const a = sql<{ team_org_id: string }>(`select team_org_id from public.team_assignments where project_id = ${lit(s.project)} and ended_at is null`);
  expect(a.map((r) => r.team_org_id), "the CREW is on the project, not the company").toEqual([s.team]);
  const st = sql<{ status: string }>(`select status from public.team_demand_offers where id = ${lit(s.offer)}`)[0]!.status;
  expect(st).toBe("assigned");
});

test("6. both sides see that the work started; the crew member has the project", async () => {
  await openOfferForm(sub);
  await expect(sub.getByTestId(`offer-progress-started-${s.offer}`)).toBeVisible({ timeout: 30_000 });
  await sub.getByTestId(`offer-progress-${s.offer}`).scrollIntoViewIfNeeded();
  await shot(sub, "c6-sub-started");
  await w.goto(`${B}/en/dashboard/journal`); await w.waitForLoadState("networkidle").catch(() => {});
  await shot(w, "c6-worker-journal");
  const n = sql<{ n: number }>(`select count(*)::int as n from public.team_assignments ta join public.engagement_contexts ec on ec.organization_id = ta.team_org_id and ec.status='active' join public.profiles p on p.id = ec.profile_id join auth.users u on u.id = p.id where ta.project_id = ${lit(s.project)} and u.email = ${lit(W)}`)[0]!.n;
  expect(n, "the crew member is attached to the project through the crew").toBe(1);
});
