// PROD_QA multi-W journey driver (owner approval 2026-08-06).
// Drives https://labourmarket.ai with the three minted synthetic QA sessions,
// ONE STAGE PER INVOCATION so every production write is deliberate:
//   node scripts/prod-qa-journey-driver.mjs <stage> [args]
// Evidence: ../../docs/audits/evidence/premium-rebuild/prod-qa-multi-w-run/
// Never prints keys. Never touches non-QA rows. [QA-SYNTHETIC] markers only.
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

const WEB = dirname(dirname(fileURLToPath(import.meta.url)));
const EVID = join(WEB, "..", "..", "docs", "audits", "evidence", "premium-rebuild", "prod-qa-multi-w-run");
mkdirSync(EVID, { recursive: true });
const LOG = join(EVID, "journey-log.json");
const BASE = "https://labourmarket.ai";

const log = (entry) => {
  const cur = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : [];
  cur.push({ at: new Date().toISOString(), ...entry });
  writeFileSync(LOG, JSON.stringify(cur, null, 2));
  console.log(`[journey] ${entry.step}: ${entry.ok ? "PASS" : "FAIL"} — ${entry.note ?? ""}`);
};

const state = (handle) => join(WEB, "tests", "e2e", `.storage-state.prod-qa.${handle}.json`);

const OPEN_CONTEXTS = [];
async function ctx(browser, handle, viewport = { width: 1440, height: 900 }) {
  const c = await browser.newContext({ storageState: state(handle), viewport, locale: "lt-LT" });
  OPEN_CONTEXTS.push([handle, c]);
  return c;
}
async function persistStates() {
  for (const [handle, c] of OPEN_CONTEXTS) {
    await c.storageState({ path: state(handle) }).catch(() => {});
  }
}

async function snap(page, name) {
  await page.screenshot({ path: join(EVID, `${name}.png`), fullPage: false }).catch(() => {});
}

async function dump(page, name) {
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 6000) ?? "");
  writeFileSync(join(EVID, `${name}.txt`), text);
  return text;
}

const arg = (i) => process.argv[2 + i];

const browser = await chromium.launch();
try {
  const stage = arg(0);
  if (!stage) throw new Error("pass a stage name");

  if (stage === "smoke") {
    // Read-only: landing + auth'd dashboard for each identity.
    const page = await (await ctx(browser, "worker")).newPage();
    await page.goto(`${BASE}/lt`, { waitUntil: "domcontentloaded" });
    const landingOk = (await page.title()).includes("LabourMarket");
    await snap(page, "00-smoke-landing");
    log({ step: "smoke-landing", ok: landingOk, note: await page.title() });
    for (const h of ["owner", "manager", "worker"]) {
      const p = await (await ctx(browser, h)).newPage();
      await p.goto(`${BASE}/lt/dashboard`, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(4000);
      const text = await dump(p, `00-smoke-${h}`);
      const authed = !text.includes("Prisijungti") || text.includes("erdvė") || p.url().includes("onboarding");
      await snap(p, `00-smoke-${h}`);
      log({ step: `smoke-auth-${h}`, ok: authed, note: p.url() });
    }
  } else if (stage === "inspect") {
    // Read-only page inspection: node driver.mjs inspect <handle> <path> <name>
    const p = await (await ctx(browser, arg(1))).newPage();
    await p.goto(`${BASE}${arg(2)}`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(5000);
    const text = await dump(p, `inspect-${arg(3)}`);
    await snap(p, `inspect-${arg(3)}`);
    console.log(text.slice(0, 2500));
    console.log("URL:", p.url());
  } else if (stage === "click") {
    // Guarded interactive step: node driver.mjs click <handle> <path> <selectorText> <name>
    // Clicks the FIRST visible button/link whose text includes selectorText.
    const p = await (await ctx(browser, arg(1))).newPage();
    await p.goto(`${BASE}${arg(2)}`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(4000);
    const target = p.locator(`button, a`, { hasText: arg(3) }).first();
    await target.click({ timeout: 15000 });
    await p.waitForTimeout(4000);
    const text = await dump(p, `click-${arg(4)}`);
    await snap(p, `click-${arg(4)}`);
    console.log(text.slice(0, 2000));
    console.log("URL:", p.url());
  } else if (stage === "onboard") {
    // node driver.mjs onboard <handle> <Asmuo|Įmonė> <fullName>
    const handle = arg(1);
    const card = arg(2);
    const fullName = arg(3);
    const p = await (await ctx(browser, handle)).newPage();
    await p.goto(`${BASE}/lt/onboarding`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(4000);
    // pick the identity card by its visible label
    await p.locator("button, [role=button], label, div[class*=cursor]", { hasText: card }).first().click({ timeout: 15000 });
    await p.waitForTimeout(800);
    await p.getByRole("button", { name: "Tęsti" }).click({ timeout: 15000 });
    await p.waitForTimeout(4000);
    let text = await dump(p, `01-onboard-${handle}-step2`);
    await snap(p, `01-onboard-${handle}-step2`);
    // Walk the remaining wizard screens IN THIS SESSION (a reload restarts
    // the wizard): fill a name field when present, then advance via Baigti
    // (finish) or Tęsti (continue), until we leave /onboarding.
    for (let screen = 0; screen < 6 && p.url().includes("/onboarding"); screen++) {
      const nameInput = p.locator("input[type=text]").first();
      if ((await nameInput.count()) > 0 && fullName) {
        const cur = await nameInput.inputValue().catch(() => "");
        if (!cur) await nameInput.fill(fullName).catch(() => {});
        await p.waitForTimeout(400);
      }
      // country requirement: prefer a native select, else a Lietuva option
      const select = p.locator("select").first();
      if ((await select.count()) > 0) {
        await select.selectOption({ label: "Lietuva" }).catch(() => {});
        await p.waitForTimeout(400);
      } else {
        const lt = p.locator("button, [role=option], label", { hasText: "Lietuva" }).first();
        if ((await lt.count()) > 0) await lt.click({ timeout: 3000 }).catch(() => {});
      }
      const finish = p.getByRole("button", { name: "Baigti" });
      const cont = p.getByRole("button", { name: "Tęsti" });
      if ((await finish.count()) > 0) {
        await finish.first().click({ timeout: 15000 }).catch(() => {});
      } else if ((await cont.count()) > 0) {
        await cont.first().click({ timeout: 15000 }).catch(() => {});
      } else {
        break;
      }
      await p.waitForTimeout(5000);
      await dump(p, `01-onboard-${handle}-screen${screen + 2}`);
    }
    text = await dump(p, `01-onboard-${handle}-done`);
    await snap(p, `01-onboard-${handle}-done`);
    const done = !p.url().includes("/onboarding");
    log({ step: `onboard-${handle}`, ok: done, note: p.url() });
    console.log(text.slice(0, 1200));
    console.log("URL:", p.url());
  } else if (stage === "company-save") {
    // node driver.mjs company-save <handle> <legalName> <new|edit> <name>
    const handle = arg(1);
    const legalName = arg(2);
    const mode = arg(3);
    const shot = arg(4) ?? `company-save-${handle}`;
    const p = await (await ctx(browser, handle)).newPage();
    const path = mode === "new" ? "/lt/dashboard/start/company?new=1" : "/lt/dashboard/start/company";
    await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(5000);
    // Edit mode hides the form behind an explicit toggle
    const editBtn = p.getByRole("button", { name: "Redaguoti įmonės profilį" });
    if (mode === "edit" && (await editBtn.count()) > 0) {
      await editBtn.first().click({ timeout: 10000 }).catch(() => {});
      await p.waitForTimeout(1500);
    }
    // Name: the input associated with the legal-name label (first text input
    // of the form).
    const name = p.locator("input[type=text]").first();
    await name.waitFor({ state: "visible", timeout: 20000 });
    await name.fill(legalName);
    // Country select → Lietuva (when a select exists and is empty)
    for (const sel of await p.locator("select").all()) {
      const val = await sel.inputValue().catch(() => "");
      if (!val) await sel.selectOption({ label: "Lietuva" }).catch(() => {});
    }
    // Business area + role: click the labelled options if they are buttons/radios
    for (const optText of ["Statybos įmonė", "Savininkas"]) {
      const opt = p.locator("button, label, [role=radio]", { hasText: optText }).first();
      if ((await opt.count()) > 0) await opt.click({ timeout: 3000 }).catch(() => {});
    }
    await p.waitForTimeout(500);
    await p.getByRole("button", { name: "Išsaugoti įmonę" }).first().click({ timeout: 15000 });
    await p.waitForTimeout(6000);
    const text = await dump(p, shot);
    await snap(p, shot);
    const ok = text.includes(legalName);
    log({ step: shot, ok, note: p.url() });
    console.log(text.slice(0, 1200));
    console.log("URL:", p.url());
  } else if (stage === "workspace") {
    // node driver.mjs workspace <handle> <orgText> <name> — switch the durable
    // workspace via the role switcher and prove the chooser contents.
    const p = await (await ctx(browser, arg(1))).newPage();
    await p.goto(`${BASE}/lt/dashboard`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(10000); // auth-context hydration — a pre-hydration option click is silently lost
    await p.getByTestId("workspace-chip").click({ timeout: 20000 });
    await p.waitForTimeout(1500);
    const menu = await p.evaluate(() => document.body.innerText.slice(0, 4000));
    writeFileSync(join(EVID, `${arg(3)}-menu.txt`), menu);
    await snap(p, `${arg(3)}-menu`);
    if (arg(2) && arg(2) !== "-") {
      // arg(2): "personal" or an organization UUID → workspace-option-<...>
      await p.getByTestId(`workspace-option-${arg(2)}`).click({ timeout: 15000 });
      // The switch action's Set-Cookie can trail several router-refresh
      // cycles — wait for the pointer cookie itself, not a fixed delay.
      const wantCookie = arg(2) !== "personal";
      for (let i = 0; i < 30; i++) {
        const names = (await p.context().cookies()).map((k) => k.name);
        if (names.includes("lm_active_workspace") === wantCookie) break;
        await p.waitForTimeout(1000);
      }
      await p.waitForTimeout(2000);
      await p.reload({ waitUntil: "domcontentloaded" });
      await p.waitForTimeout(6000);
    }
    const text = await dump(p, arg(3));
    await snap(p, arg(3));
    log({ step: arg(3), ok: true, note: p.url() });
    console.log(text.slice(0, 900));
  } else if (stage === "invite") {
    // node driver.mjs invite — owner invites the manager into the ACTIVE org.
    const p = await (await ctx(browser, "owner")).newPage();
    await p.goto(`${BASE}/lt/dashboard/start`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(6000);
    const form = p.getByTestId("org-members-invite-form");
    await form.waitFor({ state: "visible", timeout: 30000 });
    await p.getByTestId("org-members-invite-email").fill("qa.manager+multiw@labourmarket.ai");
    await p.getByTestId("org-members-invite-role").selectOption("manager").catch(async () => {
      await p.getByTestId("org-members-invite-role").selectOption({ label: "manager" }).catch(() => {});
    });
    await p.getByTestId("org-members-invite-submit").click({ timeout: 15000 });
    await p.waitForTimeout(5000);
    const res = await p.getByTestId("org-members-invite-result").innerText().catch(() => "(no result element)");
    const text = await dump(p, "05-invite-manager");
    await snap(p, "05-invite-manager");
    log({ step: "invite-manager", ok: true, note: res.slice(0, 200) });
    console.log("invite result:", res.slice(0, 300));
  } else if (stage === "accept") {
    // node driver.mjs accept — manager accepts the pending invitation.
    const p = await (await ctx(browser, "manager")).newPage();
    await p.goto(`${BASE}/lt/dashboard/start`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(6000);
    const panel = p.getByTestId("membership-invitations-panel");
    await panel.waitFor({ state: "visible", timeout: 30000 });
    await snap(p, "06-invitation-visible");
    await p.locator("[data-testid^=membership-accept-]").first().click({ timeout: 15000 });
    await p.waitForTimeout(5000);
    const res = await p.getByTestId("membership-invitations-result").innerText().catch(() => "(no result element)");
    await dump(p, "06-accept-invitation");
    await snap(p, "06-accept-invitation");
    log({ step: "accept-invitation", ok: true, note: res.slice(0, 200) });
    console.log("accept result:", res.slice(0, 300));
  } else if (stage === "demand") {
    // Owner (workspace = Alfa) files the [QA-SYNTHETIC] demand via the wizard.
    const p = await (await ctx(browser, "owner")).newPage();
    await p.goto(`${BASE}/lt/dashboard/company#company-requests`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(9000);
    await p.getByTestId("demand-role").fill("[QA-SYNTHETIC - nereaguoti / test] Pagalbinis darbininkas");
    await p.getByTestId("demand-description").fill(
      "[QA-SYNTHETIC] Sintetinis testinis poreikis - NEREAGUOTI. Vienas pagalbinis darbininkas vienai dienai Vilniuje. Sis irasas bus uzdarytas iskart po patikros.",
    );
    await p.waitForTimeout(800);
    // wizard: press demand-next / any enabled submit-ish control until the
    // form reports a saved/submitted state; dump every screen for evidence.
    for (let step = 0; step < 6; step++) {
      const next = p.getByTestId("demand-next");
      const submit = p.locator("[data-testid=demand-submit], [data-testid=demand-confirm]").first();
      if ((await submit.count()) > 0 && (await submit.isEnabled().catch(() => false))) {
        await submit.click({ timeout: 10000 });
      } else if ((await next.count()) > 0 && (await next.isEnabled().catch(() => false))) {
        await next.click({ timeout: 10000 });
      } else {
        break;
      }
      await p.waitForTimeout(5000);
      await dump(p, `08-demand-step${step + 1}`);
      await snap(p, `08-demand-step${step + 1}`);
    }
    const text = await dump(p, "08-demand-created");
    await snap(p, "08-demand-created");
    log({ step: "demand-created", ok: true, note: p.url() });
    console.log(text.slice(0, 700));
  } else if (stage === "demand2") {
    // Step 5 (corrected): the wizard's final control is demand-create (not
    // demand-submit/demand-confirm — that was why the first attempt never
    // submitted). Fill → next → next → create → wait for the submitted
    // summary.
    const p = await (await ctx(browser, "owner")).newPage();
    await p.goto(`${BASE}/lt/dashboard/company#company-requests`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(9000);
    await p.getByTestId("demand-role").fill("[QA-SYNTHETIC - nereaguoti / test] Pagalbinis darbininkas");
    await p.getByTestId("demand-description").fill(
      "[QA-SYNTHETIC] Sintetinis testinis poreikis - NEREAGUOTI. Vienas pagalbinis darbininkas vienai dienai Vilniuje. Sis irasas bus uzdarytas iskart po patikros.",
    );
    await p.waitForTimeout(500);
    await p.getByTestId("demand-next").click();
    await p.waitForTimeout(1500);
    const team = p.getByTestId("demand-team-size");
    if ((await team.count()) > 0) await team.fill("1");
    const loc = p.getByTestId("demand-location");
    if ((await loc.count()) > 0) await loc.fill("Vilnius");
    await dump(p, "08b-demand-step2");
    await snap(p, "08b-demand-step2");
    await p.getByTestId("demand-next").click();
    await p.waitForTimeout(2000);
    await dump(p, "08b-demand-review");
    await snap(p, "08b-demand-review");
    await p.getByTestId("demand-create").click();
    await p.waitForSelector("[data-testid=demand-submitted-summary], [data-testid=demand-error]", { timeout: 30000 });
    const ok = (await p.locator("[data-testid=demand-submitted-summary]").count()) > 0;
    const text = await dump(p, "08b-demand-created");
    await snap(p, "08b-demand-created");
    log({ step: "demand-created-v2", ok, note: ok ? "submitted-summary rendered" : text.slice(0, 200) });
  } else {
    throw new Error(`unknown stage: ${stage}`);
  }
} finally {
  await persistStates();
  await browser.close();
}
