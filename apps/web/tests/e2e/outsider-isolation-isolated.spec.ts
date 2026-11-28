import { expect, test } from "@playwright/test";

import {
  BASE,
  PASSWORD,
  SB_ANON,
  SB_URL,
  isolatedStack,
  lit,
  onboard,
  setUpCompany,
  signUp,
  sql,
  userId,
} from "./isolated-web-a-helpers";

/**
 * Owner P0 2026-11-22 (1): a freshly signed-in account never sees another
 * organization's candidates, responses or commercial data.
 *
 * Runs on the throwaway stack of signup-isolated.yml after the walks whose
 * file names sort before it, which fill it with organizations, needs,
 * interest, shortlists, bookings, offers and agreements. A brand-new person signs up in Chromium, chooses
 * "I run a company" and sets one up, then reads every one of those tables
 * with THEIR OWN session (their JWT, their RLS): each answer must hold
 * nothing that is not theirs. Where the other walks wrote no row of a kind,
 * that kind proves nothing and the test says so instead of passing on empty.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.setTimeout(240_000);

const RUN = Date.now().toString(36);
const OUTSIDER = `outsider-${RUN}@example.test`;

async function token(address: string): Promise<string> {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: address, password: PASSWORD }),
  });
  const body = (await r.json()) as { access_token?: string };
  if (!body.access_token) throw new Error(`local sign-in → ${r.status}`);
  return body.access_token;
}

/** Tables a fresh company must not read a single foreign row of. */
const KINDS: readonly { table: string; mine: (uid: string) => string }[] = [
  { table: "demand_interest_signals", mine: () => "false" },
  { table: "demand_shortlist", mine: (u) => `owner_id = ${lit(u)}` },
  { table: "booking_requests", mine: (u) => `owner_id = ${lit(u)}` },
  { table: "customer_requests", mine: (u) => `profile_id = ${lit(u)}` },
  { table: "agency_candidate_offers", mine: () => "false" },
  { table: "contact_disclosure_requests", mine: (u) => `owner_id = ${lit(u)}` },
  { table: "agreements", mine: () => "false" },
  { table: "contracts", mine: (u) => `owner_id = ${lit(u)}` },
  { table: "proposals", mine: (u) => `owner_id = ${lit(u)}` },
];

test("OI-1. a fresh company account reads no other organization's interest, candidates, responses or commercial rows", async ({ page }) => {
  await signUp(page, BASE, OUTSIDER);
  await onboard(page, "hire", "Synthetic Outsider");
  await setUpCompany(page, `Synthetic Outsider Co ${RUN}`);
  const uid = await userId(OUTSIDER);
  const jwt = await token(OUTSIDER);
  await page.screenshot({ path: "test-results/invite-join/outsider-company-dashboard.png", fullPage: true });

  const proven: string[] = [];
  for (const k of KINDS) {
    const exists = sql<{ exists: boolean }>(`select to_regclass(${lit(`public.${k.table}`)}) is not null as exists`)[0]?.exists;
    if (!exists) continue;
    const foreign = sql<{ n: number }>(`select count(*)::int as n from public.${k.table} where not (${k.mine(uid)})`)[0]?.n ?? 0;
    const r = await fetch(`${SB_URL}/rest/v1/${k.table}?select=*`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${jwt}` },
    });
    if (r.status === 401 || r.status === 403) {
      proven.push(`${k.table}: refused (${r.status})`);
      continue;
    }
    expect(r.ok, `${k.table} read → ${r.status}`).toBe(true);
    const rows = (await r.json()) as unknown[];
    const mineCount = sql<{ n: number }>(`select count(*)::int as n from public.${k.table} where ${k.mine(uid)}`)[0]?.n ?? 0;
    expect(rows.length, `${k.table}: the outsider reads only their own rows (${foreign} foreign rows exist)`).toBe(mineCount);
    if (foreign > 0) proven.push(`${k.table}: 0 of ${foreign} foreign rows visible`);
  }
  console.log(`OUTSIDER_ISOLATION_PROVEN: ${proven.join("; ")}`);
  // Spec files run in name order, so how many kinds hold foreign rows here
  // depends on the walks before this one; every kind that does is proven
  // above and named in the log line. Foreign needs always exist by now.
  expect(proven.length, "at least one kind had foreign rows to prove against").toBeGreaterThanOrEqual(1);

  // The scouting door with another organization's need id shows nothing of it.
  const [foreignNeed] = sql<{ id: string }>(
    `select id from public.customer_requests where profile_id <> ${lit(uid)} and status = 'submitted' limit 1`,
  );
  if (foreignNeed) {
    await page.goto(`${BASE}/en/dashboard/company/scouting?request=${foreignNeed.id}`);
    await expect(page.getByRole("main")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('[data-testid="scouting-results"], [data-testid="scouting-hand-raisers-unassessed"], [data-testid="scouting-agency-offers"]'),
      "no candidate, hand-raiser or agency offer of another organization's need",
    ).toHaveCount(0);
    await page.screenshot({ path: "test-results/invite-join/outsider-foreign-need.png", fullPage: true });
  }
});
