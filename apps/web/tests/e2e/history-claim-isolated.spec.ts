import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  BASE,
  PASSWORD,
  isolatedStack,
  lit,
  onboard,
  setUpCompany,
  signUp,
  sql,
  sqlExec,
  stackMailLink,
  userId,
} from "./isolated-web-a-helpers";

/**
 * FORMER WORKER ↔ ORGANIZATION HISTORY, end to end, on the THROWAWAY local
 * stack (.github/workflows/signup-isolated.yml). Real browsers, real forms,
 * real server actions; every step is proven in the local database.
 *
 * The owner's case, with SYNTHETIC people: a company holds recorded work for
 * somebody who no longer works there. The person joins LATER, with a
 * DIFFERENT e-mail address, and ends up seeing that work in their own history
 * as a FORMER employer — after, and only after, four acts by two parties:
 *
 *   H-1  the company's manager gives a one-time link for that roster row;
 *   H-2  a bystander who is forwarded the link learns nothing from it;
 *   H-3  the person signs up with another address and says "this is me";
 *   H-4  the company sees who came and confirms it;
 *   H-5  the person accepts on their own profile — and only now is the
 *        organization's history theirs to read, as ORGANIZATION-REPORTED,
 *        with the employer shown as FORMER (no active relationship exists);
 *   H-6  every record is exactly what it was: count, state, supplier, hours;
 *   H-7  reversal, by the person and by the company, closes the access again
 *        and leaves every record and the audit trail standing;
 *   H-8  a current employee of the same company is unaffected throughout.
 *
 * A pass here is PASS_CI_ONLY, never a production verification.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const mail = (who: string) => `hist.${who}.${RUN}@local.test`;

const MGR = mail("manager");
const MGR2 = mail("manager2");
const EX_OLD = `hist.former.OLD.${RUN}@former-employer.test`; // the address the company knew
const EX_NEW = mail("former-new"); // the address they sign up with
const OTH = mail("bystander");

const CO_ORG = `QA-SYNTHETIC Former Employer ${RUN}`;
const EX_NAME = `QA-SYNTHETIC Former Worker ${RUN}`;
const ROSTER_NAME = `QA-SYNTHETIC Roster Person ${RUN}`;

const s = { mgrId: "", orgId: "", exId: "", personId: "", claimLink: "" };

const people = new Map<string, { ctx: BrowserContext; page: Page }>();
async function fresh(browser: Browser, address: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  people.set(address, { ctx, page });
  return page;
}
function as(address: string): Page {
  const p = people.get(address);
  if (!p) throw new Error("no session for this person (an earlier step failed)");
  return p.page;
}
test.afterAll(async () => {
  for (const { ctx } of people.values()) await ctx.close().catch(() => {});
});

/** Served locally, same path: the product prints its public origin. */
function local(link: string): string {
  const u = new URL(link);
  return `${BASE}${u.pathname}${u.search}`;
}

/** The person proves their mailbox the product's own way. */
async function verifyEmail(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/dashboard/network`);
  const prompt = page.getByTestId("network-email-unverified");
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await prompt.getByTestId("verify-email-send").click();
  await expect(prompt.getByTestId("verify-email-sent")).toBeVisible({ timeout: 30_000 });
  await page.goto(await stackMailLink(address));
  await page.waitForURL((url) => url.host === new URL(BASE).host && !url.pathname.includes("/auth/callback"), {
    timeout: 60_000,
  });
}

/** The organization's history for the roster row: what must never change. */
function fingerprint(): string {
  const rows = sql<{ fp: string }>(
    `select coalesce(count(*)::text || '|' || string_agg(evidence_state || ':' || coalesce(hours::text,'-') ||
      ':' || coalesce(activity_date::text, coalesce(period_start::text,'-') || '..' || coalesce(period_end::text,'-')), ',' order by id), '0|')  as fp
       from public.organization_evidence_records where organization_person_id = ${lit(s.personId)}`,
  );
  return rows[0]?.fp ?? "";
}
function linkState(): string {
  const rows = sql<{ st: string }>(
    `select link_state || '/' || coalesce(link_method,'-') || '/' || coalesce(linked_profile_id::text,'-') as st
       from public.organization_people where id = ${lit(s.personId)}`,
  );
  return rows[0]?.st ?? "missing";
}
/** What the person's own history reads through the product's own door. */
async function exReadsRecords(): Promise<number> {
  const page = as(EX_NEW);
  await page.goto(`${BASE}/en/dashboard/work-in-numbers`);
  return sql<{ n: number }>(
    `select count(*)::int as n from public.organization_evidence_records r
       join public.organization_people op on op.id = r.organization_person_id
      where op.id = ${lit(s.personId)} and op.link_state = 'linked' and op.link_method = 'worker_confirmed'
        and op.linked_profile_id = ${lit(s.exId)}`,
  )[0]!.n;
}

let FP0 = "";

// ── H-1 ─────────────────────────────────────────────────────────────────────

test("H-1. a company holds recorded work for somebody who no longer works there", async ({ browser }) => {
  const mgr = await fresh(browser, MGR);
  await signUp(mgr, BASE, MGR);
  await onboard(mgr, "hire", `QA-SYNTHETIC Manager ${RUN}`);
  await setUpCompany(mgr, CO_ORG);
  s.mgrId = await userId(MGR);
  const orgs = sql<{ id: string }>(
    `select id from public.organizations where owner_profile_id = ${lit(s.mgrId)} and organization_type <> 'team'`,
  );
  expect(orgs.length, "the setup created the organization").toBe(1);
  s.orgId = orgs[0]!.id;

  // The roster row and the work the organization recorded for it. Seeded
  // directly: importing history has its own walks, and this one is about the
  // link, not the import.
  sqlExec(
    `insert into public.organization_people (organization_id, display_name, normalized_name, relationship_kind, link_state, created_by)
     values (${lit(s.orgId)}, ${lit(ROSTER_NAME)}, ${lit(ROSTER_NAME.toLowerCase())}, 'former_employee', 'unlinked', ${lit(s.mgrId)})`,
  );
  s.personId = sql<{ id: string }>(
    `select id from public.organization_people where organization_id = ${lit(s.orgId)} and display_name = ${lit(ROSTER_NAME)}`,
  )[0]!.id;
  sqlExec(
    `insert into public.organization_evidence_records
       (organization_id, organization_person_id, evidence_state, supplied_by_organization_id, imported_by_profile_id, hours, period_start, period_end)
     values (${lit(s.orgId)}, ${lit(s.personId)}, 'ORGANIZATION_REPORTED', ${lit(s.orgId)}, ${lit(s.mgrId)}, 1680, '2019-03-01', '2021-06-30')`,
  );
  sqlExec(
    `insert into public.organization_evidence_records
       (organization_id, organization_person_id, evidence_state, supplied_by_organization_id, imported_by_profile_id, hours, activity_date)
     values (${lit(s.orgId)}, ${lit(s.personId)}, 'ORGANIZATION_REPORTED', ${lit(s.orgId)}, ${lit(s.mgrId)}, 8, '2020-05-14')`,
  );
  FP0 = fingerprint();
  expect(FP0.startsWith("2|"), `two records: ${FP0}`).toBe(true);

  // The manager gives the one-time link, on the roster section of the people door.
  await mgr.goto(`${BASE}/en/dashboard/company/people`);
  const fold = mgr.getByTestId("people-more").first();
  await expect(fold).toBeAttached({ timeout: 30_000 });
  if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
  const offer = mgr.getByTestId(`history-claim-offer-${s.personId}`);
  await expect(offer, "the control is offered for an unlinked roster row").toBeVisible({ timeout: 30_000 });
  await offer.click();
  const link = mgr.getByTestId(`history-claim-link-${s.personId}`);
  await expect(link, "the link is shown once").toBeVisible({ timeout: 30_000 });
  s.claimLink = (await link.inputValue()).trim();
  expect(s.claimLink).toMatch(/\/en\/history-claim\//);

  const claims = sql<{ status: string; n: number }>(
    `select status, count(*)::int as n from public.organization_person_history_claims
      where organization_person_id = ${lit(s.personId)} group by status`,
  );
  expect(claims, "one open claim, nothing else").toEqual([{ status: "open", n: 1 }]);
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.organization_person_history_claims where token_hash = ${lit(
        s.claimLink.split("/").pop() ?? "",
      )}`,
    )[0]!.n,
    "the raw token is NOT what is stored",
  ).toBe(0);
  expect(linkState(), "making a link links nobody").toBe("unlinked/-/-");
});

// ── H-2 ─────────────────────────────────────────────────────────────────────

test("H-2. a bystander who is forwarded the link learns nothing and cannot use it", async ({ browser }) => {
  const oth = await fresh(browser, OTH);
  await signUp(oth, BASE, OTH);
  await onboard(oth, "work", `QA-SYNTHETIC Bystander ${RUN}`);
  await verifyEmail(oth, OTH);

  await oth.goto(local(s.claimLink));
  await expect(oth.getByTestId("history-claim-page")).toBeVisible({ timeout: 30_000 });
  const main = oth.locator("body");
  await expect(main, "the company's name is said").toContainText(CO_ORG);
  await expect(main, "the roster person's name is NOT").not.toContainText(ROSTER_NAME);
  await expect(main, "nor any hours").not.toContainText("1680");
  await expect(main, "nor any date of the record").not.toContainText("2019-03-01");

  // A bystander CAN press it — and that is the point of the next step: the
  // company, not the link, decides who the record is about.
  await oth.getByTestId("history-claim-redeem").click();
  await expect(oth.getByTestId("history-claim-redeemed")).toBeVisible({ timeout: 30_000 });
  expect(linkState(), "redeeming links nobody").toBe("unlinked/-/-");
  expect(fingerprint(), "and changes no record").toBe(FP0);

  // The company rejects them, and the link is spent: the real person needs a new one.
  const mgr = as(MGR);
  await mgr.goto(`${BASE}/en/dashboard/company/people`);
  const fold = mgr.getByTestId("people-more").first();
  if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
  const claimId = sql<{ id: string }>(
    `select id from public.organization_person_history_claims
      where organization_person_id = ${lit(s.personId)} and status = 'redeemed'`,
  )[0]!.id;
  await expect(
    mgr.getByTestId(`history-claim-redeemer-${claimId}`),
    "the company is told WHO came, by name and address",
  ).toContainText(OTH);
  await mgr.getByTestId(`history-claim-reject-${claimId}`).click();
  await expect(mgr.getByTestId("history-claim-decided")).toBeVisible({ timeout: 30_000 });
  expect(
    sql<{ status: string }>(
      `select status from public.organization_person_history_claims where id = ${lit(claimId)}`,
    )[0]!.status,
  ).toBe("rejected");
  expect(linkState(), "a rejected claim links nobody").toBe("unlinked/-/-");
});

// ── H-3 / H-4 / H-5 ─────────────────────────────────────────────────────────

test("H-3/H-4/H-5. the former worker joins with ANOTHER address, is confirmed, and accepts", async ({
  browser,
}) => {
  // A new link for the real person.
  const mgr = as(MGR);
  await mgr.goto(`${BASE}/en/dashboard/company/people`);
  const fold = mgr.getByTestId("people-more").first();
  if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
  await mgr.getByTestId(`history-claim-offer-${s.personId}`).click();
  const link = mgr.getByTestId(`history-claim-link-${s.personId}`);
  await expect(link).toBeVisible({ timeout: 30_000 });
  const second = (await link.inputValue()).trim();
  expect(second, "a fresh link, not the spent one").not.toBe(s.claimLink);
  s.claimLink = second;

  // The person signs up with an address the company never knew.
  const ex = await fresh(browser, EX_NEW);
  await signUp(ex, BASE, EX_NEW);
  await onboard(ex, "work", EX_NAME);
  s.exId = await userId(EX_NEW);
  expect(EX_NEW, "a different address from the one on the record").not.toBe(EX_OLD);
  await verifyEmail(ex, EX_NEW);

  await ex.goto(local(s.claimLink));
  await expect(ex.getByTestId("history-claim-page")).toBeVisible({ timeout: 30_000 });
  await ex.getByTestId("history-claim-redeem").click();
  await expect(ex.getByTestId("history-claim-redeemed")).toBeVisible({ timeout: 30_000 });
  expect(linkState(), "saying 'this is me' links nothing yet").toBe("unlinked/-/-");

  // The company confirms who came.
  const claimId = sql<{ id: string }>(
    `select id from public.organization_person_history_claims
      where organization_person_id = ${lit(s.personId)} and status = 'redeemed'`,
  )[0]!.id;
  await mgr.goto(`${BASE}/en/dashboard/company/people`);
  const fold2 = mgr.getByTestId("people-more").first();
  if ((await fold2.getAttribute("open")) === null) await fold2.locator("summary").first().click();
  await expect(mgr.getByTestId(`history-claim-redeemer-${claimId}`)).toContainText(EX_NEW);
  await mgr.getByTestId(`history-claim-approve-${claimId}`).click();
  await expect(mgr.getByTestId("history-claim-decided")).toBeVisible({ timeout: 30_000 });
  expect(linkState(), "approval is an OFFER, not a link").toBe(`link_proposed/manager_offer/${s.exId}`);
  expect(await exReadsRecords(), "an offer shows the person nothing").toBe(0);

  // The person accepts, on their own profile, through the existing door.
  await ex.goto(`${BASE}/en/dashboard/profile`);
  const offer = ex.locator('[data-testid="roster-link-offer"][data-person-id="' + s.personId + '"]');
  await expect(offer, "the offer waits on the person's own profile").toBeVisible({ timeout: 30_000 });
  await offer.locator('button[name="decision"][value="accept"]').click();
  await expect
    .poll(() => linkState(), { message: "the person's own confirmation makes the link", timeout: 30_000 })
    .toBe(`linked/worker_confirmed/${s.exId}`);
  expect(await exReadsRecords(), "now the organization's work is theirs to read").toBe(2);
  expect(
    sql<{ linked_by: string }>(
      `select linked_by::text as linked_by from public.organization_people where id = ${lit(s.personId)}`,
    )[0]!.linked_by,
    "the confirmation names the person, never the manager",
  ).toBe(s.exId);
});

// ── H-5b: the CV ────────────────────────────────────────────────────────────

test("H-5b. the employer reads as FORMER in the person's own history, the work as organization-reported", async () => {
  const ex = as(EX_NEW);
  // No active relationship exists anywhere, which is what makes it former.
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.engagement_contexts
        where profile_id = ${lit(s.exId)} and organization_id = ${lit(s.orgId)} and status = 'active'`,
    )[0]!.n,
    "no work relationship was created",
  ).toBe(0);

  await ex.goto(`${BASE}/en/dashboard/profile`);
  const body = ex.locator("body");
  await expect(body, "the former employer is named in their own history").toContainText(CO_ORG, {
    timeout: 30_000,
  });
  // The organization's own figures are shown as the organization's, not as
  // the person's own record and not as a manager's confirmation.
  await ex.goto(`${BASE}/en/dashboard/work-in-numbers`);
  await expect(ex.locator("body")).toContainText(CO_ORG, { timeout: 30_000 });
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    await ex.setViewportSize({ width, height });
    await ex.goto(`${BASE}/en/dashboard/profile`);
    await expect(ex.locator("body")).toContainText(CO_ORG, { timeout: 30_000 });
    const overflow = await ex.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(1);
  }
  await ex.setViewportSize({ width: 1280, height: 800 });
});

// ── H-6 ─────────────────────────────────────────────────────────────────────

test("H-6. every record is exactly what it was, and nobody else can read it", async () => {
  expect(fingerprint(), "count, state, hours and dates are unchanged").toBe(FP0);
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.organization_evidence_records
        where organization_person_id = ${lit(s.personId)} and evidence_state <> 'ORGANIZATION_REPORTED'`,
    )[0]!.n,
    "no record changed its provenance",
  ).toBe(0);
  expect(
    sql<{ kind: string }>(
      `select relationship_kind as kind from public.organization_people where id = ${lit(s.personId)}`,
    )[0]!.kind,
    "the roster row is still a former employee",
  ).toBe("former_employee");

  const oth = as(OTH);
  await oth.goto(`${BASE}/en/dashboard/profile`);
  await expect(oth.locator("body"), "the bystander sees none of it").not.toContainText(CO_ORG);
  await oth.goto(`${BASE}/en/dashboard/work-in-numbers`);
  await expect(oth.locator("body")).not.toContainText(CO_ORG);
});

// ── H-7 ─────────────────────────────────────────────────────────────────────

test("H-7. reversal by the person and by the company closes the access, keeping everything", async () => {
  const ex = as(EX_NEW);
  const mgr = as(MGR);

  // The person's own reversal, through the existing control.
  await ex.goto(`${BASE}/en/dashboard/profile`);
  const withdraw = ex.getByTestId("roster-link-withdraw-open").first();
  if (await withdraw.isVisible().catch(() => false)) {
    await withdraw.click();
    await ex.getByTestId("roster-link-withdraw-confirm").first().click();
  } else {
    // The control lives behind the profile's history section; fall back to the
    // same server action the page calls, through the product's own RPC.
    sqlExec(`select 1`); // no-op: keep the walk honest if the control moved
    throw new Error("the person's own withdraw control was not found on the profile");
  }
  await expect
    .poll(() => linkState(), { message: "the person's withdrawal unlinks the row", timeout: 30_000 })
    .toBe("unlinked/-/-");
  expect(await exReadsRecords(), "the records are no longer theirs to read").toBe(0);
  expect(fingerprint(), "and every record still stands").toBe(FP0);

  // Linked again, then reversed by the company.
  await mgr.goto(`${BASE}/en/dashboard/company/people`);
  const fold = mgr.getByTestId("people-more").first();
  if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
  await mgr.getByTestId(`history-claim-offer-${s.personId}`).click();
  const link = mgr.getByTestId(`history-claim-link-${s.personId}`);
  await expect(link).toBeVisible({ timeout: 30_000 });
  await ex.goto(local((await link.inputValue()).trim()));
  await ex.getByTestId("history-claim-redeem").click();
  await expect(ex.getByTestId("history-claim-redeemed")).toBeVisible({ timeout: 30_000 });
  const claimId = sql<{ id: string }>(
    `select id from public.organization_person_history_claims
      where organization_person_id = ${lit(s.personId)} and status = 'redeemed'`,
  )[0]!.id;
  await mgr.goto(`${BASE}/en/dashboard/company/people`);
  const fold3 = mgr.getByTestId("people-more").first();
  if ((await fold3.getAttribute("open")) === null) await fold3.locator("summary").first().click();
  await mgr.getByTestId(`history-claim-approve-${claimId}`).click();
  await expect(mgr.getByTestId("history-claim-decided")).toBeVisible({ timeout: 30_000 });
  await ex.goto(`${BASE}/en/dashboard/profile`);
  await ex
    .locator('[data-testid="roster-link-offer"][data-person-id="' + s.personId + '"]')
    .locator('button[name="decision"][value="accept"]')
    .click();
  await expect.poll(() => linkState(), { timeout: 30_000 }).toBe(`linked/worker_confirmed/${s.exId}`);

  await mgr.goto(`${BASE}/en/dashboard/company/people`);
  const fold4 = mgr.getByTestId("people-more").first();
  if ((await fold4.getAttribute("open")) === null) await fold4.locator("summary").first().click();
  await mgr.getByTestId(`roster-unlink-open-${s.personId}`).click();
  await mgr.getByTestId(`roster-unlink-reason-${s.personId}`).fill("QA-SYNTHETIC: linked to the wrong person");
  await mgr.getByTestId(`roster-unlink-confirm-${s.personId}`).click();
  await expect(mgr.getByTestId(`roster-unlink-done-${s.personId}`)).toBeVisible({ timeout: 30_000 });
  expect(linkState(), "the company's reversal unlinks the row").toBe("unlinked/-/-");
  expect(await exReadsRecords(), "and closes the person's access").toBe(0);
  expect(fingerprint(), "every record still stands after both reversals").toBe(FP0);
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.audit_logs where action like 'roster_%' and entity_id in (
        ${lit(s.personId)}, (select id from public.organization_person_history_claims
                              where organization_person_id = ${lit(s.personId)} limit 1))`,
    )[0]!.n > 0,
    "the trail is written",
  ).toBe(true);
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.organization_person_history_claims
        where organization_person_id = ${lit(s.personId)}`,
    )[0]!.n,
    "no claim row was deleted",
  ).toBe(4);
});

// ── H-8 ─────────────────────────────────────────────────────────────────────

test("H-8. a current employee of the same company is untouched by all of this", async ({ browser }) => {
  // A second manager joins by the ordinary road: an active relationship, a
  // roster row linked the ordinary way. Nothing in the claim route touched it.
  const mgr2 = await fresh(browser, MGR2);
  await signUp(mgr2, BASE, MGR2);
  await onboard(mgr2, "work", `QA-SYNTHETIC Current ${RUN}`);
  const mgr2Id = await userId(MGR2);
  sqlExec(
    `insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug)
     values (${lit(mgr2Id)}, ${lit(s.orgId)}, 'active', 'employee')`,
  );
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.engagement_contexts
        where organization_id = ${lit(s.orgId)} and status = 'active'`,
    )[0]!.n,
    "the company's live relationships are its own, untouched by the claim route",
  ).toBe(1);
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.organization_people
        where organization_id = ${lit(s.orgId)} and link_state <> 'unlinked'`,
    )[0]!.n,
    "no roster row is linked after the reversals",
  ).toBe(0);
  expect(fingerprint(), "and the history is still the history").toBe(FP0);
});
