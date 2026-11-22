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
 *   O-2b the provider offers itself to the need: the sent offer does not name the client, the offer's
 *       thread is the same anonymous thread, and the offer read returns no client id;
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
  const s = { needId: "", role: "", providerOrgId: "", conversationId: "", label: "", clientId: "", alias: "" };

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
      s.clientId = owner;
      const needs = sql<{ id: string; role: string }>(
        `select id, coalesce(nullif(btrim(role_or_work_type), ''), title) as role from public.customer_requests
          where (title = ${lit(ROLE)} or role_or_work_type = ${lit(ROLE)}) and profile_id = ${lit(owner)}`,
      );
      expect(needs, "the need is stored once").toHaveLength(1);
      s.needId = needs[0]!.id;
      // The board and the thread show the need's stored role (the intake may normalize the typed text).
      s.role = needs[0]!.role;
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
      // Owner 2026-11-22 (20261122223000): the board names the need by the provider's own order
      // pseudonym, never by the need id.
      await expect(select.locator(`option[value="${s.needId}"]`), "the board never carries the need id").toHaveCount(0);
      // The pseudonym this organization was issued for this need — read by the test's own
      // service connection from the server-only ledger (no app role can read it).
      s.alias =
        sql<{ alias: string }>(
          `select alias::text from public.provider_need_aliases where provider_org_id = ${lit(s.providerOrgId)} and request_id = ${lit(s.needId)}`,
        )[0]?.alias ?? "";
      const option = select.locator(`option[value="${s.alias}"]`);
      await expect(option, "the need is on the board, under its pseudonym").toHaveCount(1);
      expect(s.alias, "an order pseudonym").toMatch(/^[0-9a-f-]{36}$/);
      expect(s.alias).not.toBe(s.needId);
      const optionText = (await option.textContent()) ?? "";
      expect(optionText, "the board names the role").toContain(s.role);
      expect(optionText, "the board does not name the client").not.toContain(CLIENT_ORG);
      await expect(section.getByText(CLIENT_ORG), "nowhere in the section").toHaveCount(0);
      await select.selectOption(s.alias);
      await fits(page, "the provider board");
      await section.getByTestId(`open-need-write-${s.providerOrgId}`).click();
      await page.waitForURL(/\/en\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
      s.conversationId = /\/communication\/([0-9a-f-]{36})/.exec(page.url())![1]!;
      const source = sql<{ source_id: string }>(
        `select source_id::text from public.conversations where id = ${lit(s.conversationId)}`,
      )[0]!.source_id;
      expect(source, "the thread's source is the pseudonym, never the need id").toBe(s.alias);
      s.label = `Client ${source.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
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
      // The client was told: a durable notification for the client, about this thread.
      await expect
        .poll(
          () =>
            sql<{ n: string }>(
              `select count(*)::text as n from public.notification_events where recipient_profile_id = ${lit(s.clientId)} and metadata->>'conversationId' = ${lit(s.conversationId)}`,
            )[0]?.n,
          { timeout: 30_000 },
        )
        .not.toBe("0");
    });

    test(`O-2 (${w.name}). the client reads it, is told it is hidden, and answers`, async ({ browser }) => {
      const cl = await open(browser, w, CLIENT);
      await cl.page.goto(`${BASE}/en/dashboard/communication/${s.conversationId}`);
      await expect(message(cl.page, ASK), "the client reads the question").toBeVisible({ timeout: 60_000 });
      await expect(cl.page.getByTestId("thread-counterparty")).toContainText(PROVIDER_PERSON);
      await expect(cl.page.getByTestId("thread-source")).toContainText(s.role);
      await expect(cl.page.getByTestId("open-need-identity-hidden")).toBeVisible();
      await expect(cl.page.getByTestId("communication-attachment-add"), "no file while unnamed: its path would carry the id").toHaveCount(0);
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

      // The SERVER rule (owner 2026-11-22): the provider's own API session never receives the
      // client's profile id — not in participant rows, not as a message author.
      const parts = (await rowsAs(PROVIDER, `conversation_participants?conversation_id=eq.${s.conversationId}&select=profile_id,added_by`)) as {
        profile_id: string;
        added_by: string | null;
      }[];
      expect(parts, "the provider reads only its own participant row").toHaveLength(1);
      const visible = (await rowsAs(PROVIDER, `conversation_messages_visible_v1?conversation_id=eq.${s.conversationId}&select=author_id`)) as {
        author_id: string;
      }[];
      expect(visible, "the provider reads both messages").toHaveLength(2);
      const raw = (await rowsAs(PROVIDER, `conversation_messages?conversation_id=eq.${s.conversationId}&select=author_id`)) as unknown[];
      expect(raw, "the table gives the provider only its own message").toHaveLength(1);
      const convRows = await rowsAs(PROVIDER, `conversations?id=eq.${s.conversationId}&select=id,source_id,subject`);
      const everything = JSON.stringify([parts, visible, raw, convRows]);
      expect(everything.includes(s.needId), "the need id is in nothing the provider received").toBe(false);
      expect(everything.includes(s.clientId), "the client's id is in nothing the provider received").toBe(false);
      expect(
        await rowsAs(PROVIDER, `conversation_participants?profile_id=eq.${s.clientId}&select=conversation_id`),
        "asking for the client's id directly returns nothing",
      ).toHaveLength(0);
    });

    test(`O-2b (${w.name}). an offer does not reveal the client; its thread is the same anonymous one`, async ({ browser }) => {
      const { page, done } = await open(browser, w, PROVIDER);
      await page.goto(`${BASE}/en/dashboard/company/people`);
      const section = page.getByTestId(`team-demand-offer-section-${s.providerOrgId}`);
      await expect(section).toBeVisible({ timeout: 60_000 });
      if ((await section.getAttribute("open")) === null) await section.locator("summary").click();
      await section.getByTestId(`team-offer-demand-${s.providerOrgId}`).selectOption(s.alias);
      await section.getByTestId(`team-offer-submit-${s.providerOrgId}`).click();
      const sent = section.getByTestId(`team-offer-sent-${s.providerOrgId}`);
      await expect(sent, "the offer is listed").toContainText(s.role, { timeout: 60_000 });
      await expect(sent.getByText(CLIENT_ORG), "the sent offer does not name the client").toHaveCount(0);
      const offerId = sql<{ id: string }>(
        `select id from public.team_demand_offers where request_id = ${lit(s.needId)} and team_org_id = ${lit(s.providerOrgId)}`,
      )[0]!.id;
      await section.getByTestId(`team-offer-sent-message-${offerId}`).click();
      await page.waitForURL(/\/en\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
      expect(/\/communication\/([0-9a-f-]{36})/.exec(page.url())![1], "the offer opens the same anonymous thread").toBe(s.conversationId);
      await expect(page.getByTestId("thread-counterparty")).toContainText(s.label);
      await done();
      const party = (await fetch(`${SB_URL}/rest/v1/rpc/team_offer_thread_party_v1`, {
        method: "POST",
        headers: {
          apikey: SB_ANON,
          Authorization: `Bearer ${await accessToken(PROVIDER)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_offer_id: offerId }),
      }).then((r) => r.json())) as { counterpart_profile_id: string | null }[];
      expect(party[0]?.counterpart_profile_id ?? null, "the offer read gives the supplier no client id").toBeNull();

      // The client answers the offer from its side: the SAME thread (one negotiation, Codex P2).
      const cl = await open(browser, w, CLIENT);
      await cl.page.goto(`${BASE}/en/dashboard/company/scouting?request=${s.needId}`);
      const msg = cl.page.getByTestId(`team-offer-message-${offerId}`);
      await expect(msg, "the client sees the offer").toBeVisible({ timeout: 60_000 });
      await msg.click();
      await cl.page.waitForURL(/\/en\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
      expect(/\/communication\/([0-9a-f-]{36})/.exec(cl.page.url())![1], "the client reaches the same thread").toBe(s.conversationId);
      await cl.done();
    });

    test(`O-3 (${w.name}). the client shows its name; the provider sees it; it all survives a reload`, async ({ browser }) => {
      const cl = await open(browser, w, CLIENT);
      await cl.page.goto(`${BASE}/en/dashboard/communication/${s.conversationId}`);
      await cl.page.getByTestId("open-need-disclose").click();
      await expect(cl.page.getByTestId("open-need-identity-shown")).toBeVisible({ timeout: 60_000 });
      await cl.page.reload();
      await expect(cl.page.getByTestId("open-need-identity-shown"), "the choice is stored").toBeVisible({ timeout: 60_000 });
      await expect(cl.page.getByTestId("communication-attachment-add"), "files are offered once named").toBeVisible();
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
      expect(
        await rowsAs(PROVIDER, `conversation_participants?conversation_id=eq.${s.conversationId}&select=profile_id`),
        "after the client's choice the provider reads both participants",
      ).toHaveLength(2);
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
