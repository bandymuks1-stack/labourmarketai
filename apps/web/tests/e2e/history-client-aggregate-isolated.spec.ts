import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  BASE,
  SB_ANON,
  SB_SERVICE,
  SB_URL,
  isolatedStack,
  lit,
  setUpCompany,
  signIn,
  signUp,
  sql,
  userId,
} from "./isolated-web-a-helpers";

/**
 * A CLIENT IS NOT THE COMPANY THAT DID THE WORK (decision 0033, #3739), on the
 * THROWAWAY local stack of .github/workflows/signup-isolated.yml. Synthetic
 * organizations and people only; a pass here is PASS_CI_ONLY.
 *
 *   C  owns the client organization;
 *   S  owns the subcontractor organization. S's own books hold the work it did
 *      for C: roster person SP, three records (two single days and one period
 *      total) at one place, each with a `client` party row naming C.
 *
 * HC-1  C's company history shows that work as ONE aggregate, "Work by your
 *       subcontractors", and nowhere on the page names SP, the place or S.
 * HC-2  S's company history lists its client, with the record count.
 * HC-3  Both at 1440, 390 and 375 px, with no sideways scroll; screenshots go
 *       to test-results/experience-integration/ (the job's existing artifact).
 *
 * Seeding: the two owners and organizations go through the product's own
 * sign-up and company setup. The imported rows (organization_people,
 * evidence_import_sessions, organization_evidence_records and the party rows)
 * are written with the local service key, as experience-integration does: the
 * CSV import UI is not what this walk is about.
 */

test.skip(!isolatedStack() || !SB_ANON, "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const mail = (who: string) => `client-aggregate.${who}.${RUN}@local.test`;
const OUT = join(process.cwd(), "test-results", "experience-integration");

const C = mail("client-owner");
const S = mail("sub-owner");
const ORG_C = `QA-SYNTHETIC Client Holding ${RUN}`;
const ORG_S = `QA-SYNTHETIC Subcontract Crew ${RUN}`;
const SP_NAME = `Synthetic Crew Member ${RUN}`;
const PLACE = `QA-SYNTHETIC site ${RUN}`;
const RECORDS = [
  { date: "2025-05-05", hours: 8 },
  { date: "2025-05-06", hours: 7 },
  { periodStart: "2025-06-01", periodEnd: "2025-06-30", hours: 120 },
] as const;

const s = { cId: "", sId: "", orgC: "", orgS: "" };

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

async function seed<T>(table: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SB_SERVICE,
      Authorization: `Bearer ${SB_SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`local seed ${table} → ${r.status} ${await r.text()}`);
  return ((await r.json()) as T[])[0]!;
}

function ownedOrg(profileId: string): string {
  const orgs = sql<{ id: string }>(
    `select id from public.organizations where owner_profile_id = ${lit(profileId)} and organization_type <> 'team'`,
  );
  if (orgs.length !== 1) throw new Error(`expected one owned organization, found ${orgs.length}`);
  return orgs[0]!.id;
}

async function owner(browser: Browser, address: string, name: string, org: string): Promise<void> {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  try {
    await signUp(page, BASE, address);
    await page.getByTestId("onboarding-intent-hire").click();
    await page.getByTestId("onboarding-intents-continue").click();
    await page.getByTestId("onboarding-display-name").fill(name);
    await page.getByTestId("onboarding-country").click();
    await page.getByRole("option", { name: /Lithuania/ }).first().click();
    await page.getByTestId("onboarding-submit").click();
    await setUpCompany(page, org);
  } finally {
    await ctx.close();
  }
}

async function history(page: Page): Promise<void> {
  await page.goto(`${BASE}/en/dashboard/company/history`);
  await expect(page.getByTestId("company-work-history")).toBeVisible({ timeout: 60_000 });
}

test("HC-0. two organizations through the product's own doors; S's books hold work done for C", async ({ browser }) => {
  await owner(browser, C, `Synthetic Client Owner ${RUN}`, ORG_C);
  await owner(browser, S, `Synthetic Sub Owner ${RUN}`, ORG_S);
  s.cId = await userId(C);
  s.sId = await userId(S);
  s.orgC = ownedOrg(s.cId);
  s.orgS = ownedOrg(s.sId);

  const person = await seed<{ id: string }>("organization_people", {
    organization_id: s.orgS,
    display_name: SP_NAME,
    normalized_name: SP_NAME.toLowerCase(),
    external_ref: `qa-crew-${RUN}`,
    relationship_kind: "employee",
    source_note: `client aggregate ${RUN}`,
    created_by: s.sId,
  });
  const file = `client-aggregate-${RUN}.csv`;
  const session = await seed<{ id: string }>("evidence_import_sessions", {
    organization_id: s.orgS,
    source_kind: "manual",
    source_filename: file,
    source_fingerprint: sha(`client-aggregate-session:${RUN}`),
    source_language: "en",
    supplied_by_organization_id: s.orgS,
    supplier_role: "employer",
    actor_kind: "human",
    created_by: s.sId,
    notes: `client aggregate ${RUN}`,
  });
  const importedAt = new Date().toISOString();
  let prev: string | null = null;
  for (const [i, r] of RECORDS.entries()) {
    const day = "date" in r ? r.date : null;
    const fingerprint = sha(`client-aggregate-record:${s.orgS}:${person.id}:${i}:${r.hours}:${RUN}`);
    const self = sha(`work-history-chain:v1:${prev ?? ""}:${fingerprint}:${importedAt}`);
    const rec = await seed<{ id: string }>("organization_evidence_records", {
      organization_id: s.orgS,
      organization_person_id: person.id,
      activity_kind: "work",
      outcome_kind: "hours_worked",
      context_label: PLACE,
      activity_date: day,
      period_start: "periodStart" in r ? r.periodStart : null,
      period_end: "periodEnd" in r ? r.periodEnd : null,
      hours: r.hours,
      original_text: `Recorded work ${i}`,
      original_language: "en",
      evidence_state: "LEGACY_IMPORTED",
      supplied_by_organization_id: s.orgS,
      supplier_role: "employer",
      supplied_by_profile_id: s.sId,
      imported_by_profile_id: s.sId,
      imported_at: importedAt,
      session_id: session.id,
      source_kind: "manual",
      source_filename: file,
      source_fact: { row: i },
      derived: {},
      record_fingerprint: fingerprint,
      hash_prev: prev,
      hash_self: self,
    });
    prev = self;
    // The client party row, labelled the way an import names the client: S is
    // not a member of C, so this label is what S's own screen can show.
    await seed("organization_evidence_parties", {
      organization_id: s.orgS,
      record_id: rec.id,
      party_role: "client",
      party_organization_id: s.orgC,
      party_label: ORG_C,
      created_by: s.sId,
    });
  }
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.organization_evidence_parties where party_role = 'client' and party_organization_id = ${lit(s.orgC)}`,
    )[0]?.n,
    "three records in S's books name C as their client",
  ).toBe(RECORDS.length);
});

const SIZES = [
  { label: "1440", viewport: { width: 1440, height: 900 } },
  { label: "390", viewport: { width: 390, height: 844 } },
  { label: "375", viewport: { width: 375, height: 812 } },
] as const;

for (const size of SIZES) {
  test(`HC-1 (${size.label}). C's history: one aggregate of the subcontracted work, with no person, place or partner name`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: size.viewport, timezoneId: "UTC" });
    const page = await ctx.newPage();
    try {
      await signIn(page, BASE, C);
      await history(page);
      const block = page.getByTestId("company-work-history-for-client");
      await expect(block, "the aggregate is shown").toBeVisible();
      await expect(block).toHaveAttribute("data-records", String(RECORDS.length));
      await expect(block).toHaveAttribute("data-confirmed", "0");
      await expect(block.getByRole("heading")).toHaveText("Work by your subcontractors");
      // ONE total, every hour once (decision 0025, #3773): 8 + 7 single days and
      // the June period, which no recorded day overlaps, so it is counted.
      await expect(block, "one total: 8 + 7 + 120").toContainText("135 h");
      const main = (await page.getByRole("main").first().innerText()).toLowerCase();
      for (const name of [SP_NAME, PLACE, ORG_S]) {
        expect(main.includes(name.toLowerCase()), `C's page never names "${name}"`).toBe(false);
      }
      await expect(page.getByTestId("company-work-history-for-client-unreadable")).toHaveCount(0);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, "no sideways scrolling").toBeLessThanOrEqual(1);
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: join(OUT, `client-aggregate-client-${size.label}.png`), fullPage: true });
    } finally {
      await ctx.close();
    }
  });

  test(`HC-2 (${size.label}). S's history lists its client with the record count`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: size.viewport, timezoneId: "UTC" });
    const page = await ctx.newPage();
    try {
      await signIn(page, BASE, S);
      await history(page);
      const clients = page.getByTestId("company-work-history-clients");
      await expect(clients, "the clients are listed").toBeVisible();
      await expect(clients.getByRole("heading")).toHaveText("Clients");
      const row = clients.getByTestId("company-work-history-client");
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute("data-records", String(RECORDS.length));
      await expect(row, "named by the label the records carry").toContainText(ORG_C);
      await expect(page.getByTestId("company-work-history-for-client"), "S did no work FOR itself").toHaveCount(0);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, "no sideways scrolling").toBeLessThanOrEqual(1);
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: join(OUT, `client-aggregate-subcontractor-${size.label}.png`), fullPage: true });
    } finally {
      await ctx.close();
    }
  });
}
