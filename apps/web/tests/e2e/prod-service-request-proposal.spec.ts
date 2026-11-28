import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { PROD_QA_SECOND_WORKER_EMAIL, PROD_QA_WORKER_EMAIL } from "../../lib/testing/prod-qa-guard";
import { bearerOf, qaApi, qaAppOrigin } from "./prod-qa-api";
import { expect, test, type Page } from "./prod-walk";

// Dispatch only. Use the same accepted pair as the marketplace walk without
// publishing a service, contacting a buyer or changing any earlier QA record.
test.skip(process.env.PROD_QA_WALK !== "1", "Requires the production QA walk");
test.use({ trace: "off", screenshot: "off", video: "off", actionTimeout: 15_000 });
test.describe.configure({ retries: 0 });

const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function read<T>(token: string, path: `/${string}`): Promise<T> {
  const response = await qaApi(path, token);
  if (!response.ok) throw new Error("QA read failed");
  return response.json() as Promise<T>;
}

async function actor(slot: string, expectedEmail: string) {
  const token = bearerOf(slot);
  const account = await read<{ id: string; email: string }>(token, "/auth/v1/user");
  if (account.email !== expectedEmail || !uuid.test(account.id)) throw new Error("QA slot mismatch");
  return { id: account.id, token };
}

type Proposal = {
  id: string; title: string; owner_id: string; status: string; amount_cents: number;
  sent_at: string | null; accepted_at: string | null;
};

async function linked(token: string, requestId: string) {
  return read<Proposal[]>(token, `/rest/v1/proposals?select=id,title,owner_id,status,amount_cents,sent_at,accepted_at&service_offering_request_id=eq.${requestId}`);
}

async function openRequest(page: Page, origin: string, requestId: string) {
  await page.goto(`${origin}/lt/dashboard/service-requests`);
  const row = page.getByRole("main").getByTestId("marketplace-incoming-row").filter({
    has: page.locator(`input[name="requestId"][value="${requestId}"]`),
  });
  const cta = row.getByTestId("marketplace-incoming-proposal-cta");
  await cta.waitFor({ state: "visible", timeout: 30_000 });
  const href = await cta.getAttribute("href");
  const target = new URL(href ?? "", origin);
  if (target.origin !== origin || target.pathname !== "/lt/dashboard/commercial" ||
      target.searchParams.get("serviceRequest") !== requestId) throw new Error("Wrong proposal destination");
  await cta.click();
  await page.getByRole("main").getByTestId("proposals-panel").waitFor({ state: "visible", timeout: 30_000 });
  return target;
}

test("An accepted synthetic service request opens one private draft twice and cleans it up", async ({ browser }) => {
  test.setTimeout(300_000);
  let stage = "check the synthetic pair";
  let outcome: string | undefined;
  let saveStarted = false;
  let draftId: string | undefined;
  const origin = qaAppOrigin();
  const title = `QA-SYNTHETIC 2946 ${randomUUID()}`;
  const providerContext = await browser.newContext({ storageState: state("worker"), locale: "lt-LT" });
  const buyerContext = await browser.newContext({ storageState: state("worker2"), locale: "lt-LT" });
  const providerPage = await providerContext.newPage();
  const buyerPage = await buyerContext.newPage();
  let provider: Awaited<ReturnType<typeof actor>> | undefined;
  let requestId: string | undefined;
  try {
    provider = await actor("worker", PROD_QA_SECOND_WORKER_EMAIL);
    const buyer = await actor("worker2", PROD_QA_WORKER_EMAIL);
    stage = "select an existing unused accepted QA request";
    const filter = new URLSearchParams({
      select: "id,service_offerings!inner(id),proposals()",
      provider_id: `eq.${provider.id}`, buyer_id: `eq.${buyer.id}`, status: "eq.accepted",
      "service_offerings.provider_id": `eq.${provider.id}`, "service_offerings.title": "like.QA-SYNTHETIC *",
      message: "like.QA-SYNTHETIC *", proposals: "is.null", order: "created_at.desc,id", limit: "1",
    });
    const [request] = await read<{ id: string }[]>(provider.token, `/rest/v1/service_offering_requests?${filter}`);
    if (!request || !uuid.test(request.id)) throw new Error("No eligible synthetic request");
    requestId = request.id;
    stage = "open the provider action in the personal workspace";
    const target = await openRequest(providerPage, origin, requestId);
    stage = "deny the same request link to its buyer";
    await buyerPage.goto(target.href);
    await buyerPage.waitForURL(url => url.origin === origin && url.pathname === "/lt/dashboard/service-requests", { timeout: 30_000 });

    stage = "save the private zero-value draft";
    const main = providerPage.getByRole("main");
    await main.getByTestId("proposal-title").fill(title);
    await main.getByTestId("proposal-amount").fill("0");
    saveStarted = true;
    await main.getByTestId("proposal-create").click();
    const draftRow = main.getByTestId("proposal-row").filter({ hasText: title });
    await draftRow.waitFor({ state: "visible", timeout: 30_000 });
    const [first, ...others] = await linked(provider.token, requestId);
    if (!first || others.length || first.owner_id !== provider.id || first.title !== title ||
        !uuid.test(first.id) || first.status !== "draft" || Number(first.amount_cents) !== 0 ||
        first.sent_at !== null || first.accepted_at !== null) throw new Error("Unexpected saved state");
    draftId = first.id;

    stage = "open the same draft again and verify privacy";
    await openRequest(providerPage, origin, requestId);
    await draftRow.waitFor({ state: "visible", timeout: 30_000 });
    const reopened = await linked(provider.token, request.id);
    const contracts = await read<{ id: string }[]>(provider.token, `/rest/v1/contracts?select=id&proposal_id=eq.${draftId}&limit=1`);
    if (await draftRow.getByTestId("proposal-status").inputValue() !== "draft" ||
        await main.getByTestId("proposal-create").count() !== 0 || reopened.length !== 1 ||
        reopened[0].id !== draftId || reopened[0].status !== "draft" || contracts.length ||
        (await linked(buyer.token, request.id)).length !== 0) throw new Error("Unexpected reopened state");
  } catch {
    outcome = stage;
  } finally {
    if (saveStarted && provider && requestId) {
      try {
        // A timed-out UI save might already have committed. Recover its ID only
        // from this request, this provider and this run's unguessable title.
        const current = provider;
        const id = requestId;
        const findOurs = async () => (await linked(current.token, id)).filter(p => p.title === title);
        await expect.poll(async () => (await findOurs()).length, { timeout: 15_000 }).toBe(1);
        const [ours] = await findOurs();
        if (!ours || !uuid.test(ours.id) || (draftId && ours.id !== draftId) || ours.status !== "draft" ||
            ours.owner_id !== current.id || ours.sent_at || ours.accepted_at ||
            Number(ours.amount_cents) !== 0) throw new Error("Cleanup refused");
        const contracts = await read<{ id: string }[]>(current.token, `/rest/v1/contracts?select=id&proposal_id=eq.${ours.id}&limit=1`);
        if (contracts.length) throw new Error("Cleanup refused");
        await openRequest(providerPage, origin, id);
        const row = providerPage.getByRole("main").getByTestId("proposal-row").filter({ hasText: title });
        await row.getByTestId("proposal-delete").click();
        await expect.poll(async () => (await findOurs()).length, { timeout: 30_000 }).toBe(0);
      } catch {
        outcome = outcome ? `${outcome}; cleanup unverified` : "cleanup unverified";
      }
    }
    await Promise.all([providerContext.close(), buyerContext.close()]);
  }
  // The public walk report contains only a stage. Browser errors can include
  // URLs, account information, titles or rendered locator excerpts.
  if (outcome) throw new Error(`Service-request proposal walk failed at ${outcome}`);
});
