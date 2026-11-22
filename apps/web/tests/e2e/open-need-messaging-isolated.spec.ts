import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  accessToken,
  BASE,
  SB_ANON,
  SB_URL,
  isolatedStack,
  lit,
  onboard,
  publishNeed,
  setUpCompany,
  signUp,
  sql,
  userId,
  verifyCompanyAsLocalAdmin,
} from "./isolated-web-a-helpers";

/**
 * MESSAGING ABOUT AN OPEN NEED (owner decision A, 2026-11-22; decision 0033) on a THROWAWAY LOCAL
 * Supabase stack. A provider organization writes to a client about an open need it may see on its
 * board, without the client being named; the client answers in the same thread and decides when
 * to show its name. At 1280 and at 390 px.
 *
 *   O-0 a verified client posts a need; a provider organization and a stranger organization exist;
 *   O-1 the provider's board lists the need WITHOUT the client's name; "Write about this need"
 *       opens one thread; the provider writes; the client is shown only as "Client XXXXXX";
 *   O-2 the client reads it under the need, sees the provider's person, is told its name is
 *       hidden, and answers; the provider reads the answer, still without the client's name;
 *   O-3 the client shows its name; from then on the provider sees it; both messages survive a
 *       reload;
 *   O-4 the stranger opens the thread URL: its own page renders, and it reads nothing — in the
 *       page and in the database under its own session.
 */
const RUN = `${Date.now().toString(36)}`;
const email = (who: string) => `need-${who}-${RUN}@walk.labourmarket.test`;

type Width = { name: string; viewport: { width: number; height: number }; mobile: boolean };
const WIDTHS: Width[] = [
  { name: "1280", viewport: { width: 1280, height: 800 }, mobile: false },
  { name: "390", viewport: { width: 390, height: 844 }, mobile: true },
];

test.skip(!isolatedStack(), "isolated stack only (SIGNUP_ISOLATED=1 against a local Supabase)");
test.setTimeout(240_000);

const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function open(browser: Browser, w: Width, who?: string): Promise<{ page: Page; done: () => Promise<void> }> {
  const ctx = await browser.newContext({
    viewport: w.viewport,
    isMobile: w.mobile,
    hasTouch: w.mobile,
    timezoneId: "UTC",
    storageState: who ? sessions.get(who) : undefined,
  });
  const page = await ctx.newPage();
  return {
    page,
    done: async () => {
      if (who) sessions.set(who, await ctx.storageState());
      await ctx.close();
    },
  };
}

/** A read under RLS with the person's OWN session; an error is a failure, never "zero". */
async function rowsAs(address: string, path: string): Promise<unknown[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${await accessToken(address)}` },
  });
  if (!r.ok) throw new Error(`read as ${address.split("@")[0]} → ${r.status}`);
  return (await r.json()) as unknown[];
}

async function fits(page: Page, what: string): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `${what}: no sideways scroll`).toBeLessThanOrEqual(1);
}

const message = (page: Page, text: string) => page.locator('[data-testid^="message-text-"]', { hasText: text }).first();

for (const w of WIDTHS) {
  const CLIENT = email(`client${w.name}`);
  const PROVIDER = email(`provider${w.name}`);
  const STRANGER = email(`stranger${w.name}`);
  const CLIENT_ORG = `Synthetic Need Client ${w.name} ${RUN}`;
  const CLIENT_PERSON = `Synthetic Owner ${CLIENT_ORG}`;
  const PROVIDER_ORG = `Synthetic Need Provider ${w.name} ${RUN}`;
  const PROVIDER_PERSON = `Synthetic Owner ${PROVIDER_ORG}`;
  const STRANGER_ORG = `Synthetic Need Stranger ${w.name} ${RUN}`;
  const ROLE = `Open need welder ${w.name} ${RUN}`;
  const ASK = `Question about the need ${w.name} ${RUN}`;
  const ANSWER = `The client answers ${w.name} ${RUN}`;
  const s = { needId: "", role: "", providerOrgId: "", conversationId: "", label: "" };

  test.describe(`open-need messaging at ${w.viewport.width} px`, () => {
    test.describe.configure({ mode: "serial" });

    test(`O-0 (${w.name}). a verified client posts a need; a provider and a stranger exist`, async ({ browser }) => {
      for (const [addr, org, role] of [
        [CLIENT, CLIENT_ORG, ROLE],
        [PROVIDER, PROVIDER_ORG, null],
        [STRANGER, STRANGER_ORG, null],
      ] as const) {
        const { page, done } = await open(browser, WIDTHS[0]!);
        await signUp(page, BASE, addr);
        await onboard(page, "hire", `Synthetic Owner ${org}`);
        await setUpCompany(page, org);
        if (role) await publishNeed(page, BASE, role, "LT");
        sessions.set(addr, await page.context().storageState());
        await done();
      }
      await verifyCompanyAsLocalAdmin(CLIENT, email(`admin${w.name}`));
      const owner = await userId(CLIENT);
      const needs = sql<{ id: string; role: string }>(
        `select id, coalesce(nullif(btrim(role_or_work_type), ''), title) as role from public.customer_requests
          where (title = ${lit(ROLE)} or role_or_work_type = ${lit(ROLE)}) and profile_id = ${lit(owner)}`,
      );
      expect(needs, "the need is stored once").toHaveLength(1);
      s.needId = needs[0]!.id;
      // The board and the thread show the need's stored role (the intake may normalize the typed text).
      s.role = needs[0]!.role;
      s.label = `Client ${s.needId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
      const orgs = sql<{ id: string }>(
        `select organization_id::text as id from public.company_memberships where profile_id = ${lit(await userId(PROVIDER))} and role = 'owner' and status = 'active'`,
      );
      expect(orgs, "the provider organization exists").toHaveLength(1);
      s.providerOrgId = orgs[0]!.id;
    });

    test(`O-1 (${w.name}). the board lists the need without the client; the provider writes`, async ({ browser }) => {
      const { page, done } = await open(browser, w, PROVIDER);
      await page.goto(`${BASE}/en/dashboard/company/people`);
      const section = page.getByTestId(`team-demand-offer-section-${s.providerOrgId}`);
      await expect(section).toBeVisible({ timeout: 60_000 });
      if ((await section.getAttribute("open")) === null) await section.locator("summary").click();
      const select = section.getByTestId(`team-offer-demand-${s.providerOrgId}`);
      await expect(select).toBeVisible({ timeout: 60_000 });
      const option = select.locator(`option[value="${s.needId}"]`);
      await expect(option, "the need is on the board").toHaveCount(1);
      const optionText = (await option.textContent()) ?? "";
      expect(optionText, "the board names the role").toContain(s.role);
      expect(optionText, "the board does not name the client").not.toContain(CLIENT_ORG);
      await expect(section.getByText(CLIENT_ORG), "nowhere in the section").toHaveCount(0);
      await select.selectOption(s.needId);
      await fits(page, "the provider board");
      await section.getByTestId(`open-need-write-${s.providerOrgId}`).click();
      await page.waitForURL(/\/en\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
      s.conversationId = /\/communication\/([0-9a-f-]{36})/.exec(page.url())![1]!;
      await expect(page.getByTestId("thread-counterparty"), "the client is a pseudonym").toContainText(s.label, {
        timeout: 60_000,
      });
      await expect(page.getByTestId("thread-source")).toContainText(s.role);
      for (const secret of [CLIENT_ORG, CLIENT_PERSON]) {
        await expect(page.getByText(secret), `the provider never reads "${secret}"`).toHaveCount(0);
      }
      await page.getByTestId("communication-composer-input").fill(ASK);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(message(page, ASK)).toBeVisible({ timeout: 30_000 });
      await fits(page, "the provider thread");
      await done();
      const rows = sql<{ source_type: string; n: string }>(
        `select c.source_type, (select count(*) from public.conversation_participants p where p.conversation_id = c.id)::text as n
           from public.conversations c where c.id = ${lit(s.conversationId)}`,
      );
      expect(rows[0], "one direct thread of two, stamped open_need").toEqual({ source_type: "open_need", n: "2" });
    });

    test(`O-2 (${w.name}). the client reads it, is told it is hidden, and answers`, async ({ browser }) => {
      const cl = await open(browser, w, CLIENT);
      await cl.page.goto(`${BASE}/en/dashboard/communication/${s.conversationId}`);
      await expect(message(cl.page, ASK), "the client reads the question").toBeVisible({ timeout: 60_000 });
      await expect(cl.page.getByTestId("thread-counterparty")).toContainText(PROVIDER_PERSON);
      await expect(cl.page.getByTestId("thread-source")).toContainText(s.role);
      await expect(cl.page.getByTestId("open-need-identity-hidden")).toBeVisible();
      await cl.page.getByTestId("communication-composer-input").fill(ANSWER);
      await cl.page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(message(cl.page, ANSWER)).toBeVisible({ timeout: 30_000 });
      await fits(cl.page, "the client thread");
      await cl.done();

      const pr = await open(browser, w, PROVIDER);
      await pr.page.goto(`${BASE}/en/dashboard/communication/${s.conversationId}`);
      await expect(message(pr.page, ANSWER), "the provider reads the answer").toBeVisible({ timeout: 60_000 });
      await expect(pr.page.getByTestId("thread-counterparty"), "answering does not reveal the client").toContainText(s.label);
      await expect(pr.page.getByText(CLIENT_PERSON)).toHaveCount(0);
      await expect(pr.page.getByTestId("open-need-disclose"), "only the client may show its name").toHaveCount(0);
      await pr.page.goto(`${BASE}/en/dashboard/communication`);
      await expect(pr.page.getByText(s.label).first(), "the inbox names the client the same way").toBeVisible({ timeout: 60_000 });
      await expect(pr.page.getByText(CLIENT_PERSON)).toHaveCount(0);
      await pr.done();
    });

    test(`O-3 (${w.name}). the client shows its name; the provider sees it; it all survives a reload`, async ({ browser }) => {
      const cl = await open(browser, w, CLIENT);
      await cl.page.goto(`${BASE}/en/dashboard/communication/${s.conversationId}`);
      await cl.page.getByTestId("open-need-disclose").click();
      await expect(cl.page.getByTestId("open-need-identity-shown")).toBeVisible({ timeout: 60_000 });
      await cl.page.reload();
      await expect(cl.page.getByTestId("open-need-identity-shown"), "the choice is stored").toBeVisible({ timeout: 60_000 });
      await cl.done();
      expect(
        sql<{ n: string }>(`select count(*)::text as n from public.open_need_identity_disclosures where conversation_id = ${lit(s.conversationId)}`)[0]?.n,
      ).toBe("1");

      const pr = await open(browser, w, PROVIDER);
      await pr.page.goto(`${BASE}/en/dashboard/communication/${s.conversationId}`);
      await pr.page.reload();
      await expect(pr.page.getByTestId("thread-counterparty"), "now named").toContainText(CLIENT_PERSON, { timeout: 60_000 });
      for (const text of [ASK, ANSWER]) await expect(message(pr.page, text), `after a reload: ${text}`).toBeVisible();
      await pr.done();
    });

    test(`O-4 (${w.name}). the stranger reads nothing of the thread`, async ({ browser }) => {
      const st = await open(browser, w, STRANGER);
      const res = await st.page.goto(`${BASE}/en/dashboard/communication/${s.conversationId}`);
      expect(res?.status() ?? 0, "the thread URL answers without a server error").toBeLessThan(500);
      await expect(st.page.getByRole("main"), "the stranger's page rendered").toBeVisible({ timeout: 60_000 });
      for (const text of [ASK, ANSWER, CLIENT_PERSON, CLIENT_ORG]) {
        await expect(st.page.getByText(text), `the stranger never reads "${text}"`).toHaveCount(0);
      }
      await st.done();
      for (const path of [
        `conversation_messages?conversation_id=eq.${s.conversationId}&select=id`,
        `conversations?id=eq.${s.conversationId}&select=id`,
        `conversation_participants?conversation_id=eq.${s.conversationId}&select=profile_id`,
        `open_need_identity_disclosures?conversation_id=eq.${s.conversationId}&select=conversation_id`,
      ]) {
        expect(await rowsAs(STRANGER, path), `the stranger reads no ${path.split("?")[0]}`).toHaveLength(0);
      }
      expect(
        await rowsAs(CLIENT, `conversation_messages?conversation_id=eq.${s.conversationId}&select=id`),
        "a participant does read them (the read itself works)",
      ).toHaveLength(2);
    });
  });
}
