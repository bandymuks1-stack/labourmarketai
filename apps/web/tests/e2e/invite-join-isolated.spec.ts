import { expect, test, type Browser, type Page } from "@playwright/test";

import { BASE, PASSWORD, isolatedStack, lit, onboard, setUpCompany, signUp, sql, userId } from "./isolated-web-a-helpers";

/**
 * Owner P0 2026-11-22, on the THROWAWAY local stack of signup-isolated.yml
 * (synthetic people only), in Chromium:
 *
 *   IJ-1 (2) a person who opens a company's "join my organization" link and
 *        registers sees, on the sign-up form, who invited them, to which
 *        organization and what happens next;
 *   IJ-2 (3) onboarding asks no "what did you come for" question, and after
 *        it the person is a member of the inviting organization and owns no
 *        organization of their own — no duplicate is created by accident.
 *
 * Screenshots: test-results/invite-join/ (kept as a CI artifact).
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const RUN = Date.now().toString(36);
const OWNER = `ij-owner-${RUN}@example.test`;
const PERSON = `ij-person-${RUN}@example.test`;
const ORG = `Synthetic Join Co ${RUN}`;
const OWNER_NAME = "Synthetic Join Owner";
const PERSON_NAME = "Synthetic Join Person";
const SHOTS = "test-results/invite-join";

async function fresh(browser: Browser): Promise<Page> {
  return (await browser.newContext({ timezoneId: "UTC", viewport: { width: 1280, height: 900 } })).newPage();
}

const state = { link: "", orgId: "" };

test("IJ-1. the sign-up form says who invited, to which organization, and what happens next", async ({ browser }) => {
  const o = await fresh(browser);
  await signUp(o, BASE, OWNER);
  await onboard(o, "hire", OWNER_NAME);
  await setUpCompany(o, ORG);
  const ownerId = await userId(OWNER);
  const [org] = sql<{ id: string }>(
    `select id from public.organizations where owner_profile_id = ${lit(ownerId)} and organization_type <> 'team'`,
  );
  expect(org?.id, "the owner's organization").toBeTruthy();
  state.orgId = org!.id;

  await o.goto(`${BASE}/en/dashboard/network?invite=1&type=join_organization&org=${state.orgId}#network-invite`);
  const panel = o.getByRole("main").getByTestId("invite-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByTestId("invite-mode-link").click();
  await panel.getByTestId("invite-name").fill(PERSON_NAME);
  await panel.getByTestId("invite-submit").click();
  const copy = panel.getByTestId("invite-copy-link").first();
  await expect(copy).toBeVisible({ timeout: 30_000 });
  const raw = await copy.getAttribute("data-invite-link");
  expect(raw, "an invitation link").toBeTruthy();
  const u = new URL(raw!);
  state.link = `${BASE}${u.pathname}${u.search}`;

  const p = await fresh(browser);
  await p.goto(state.link);
  await p.screenshot({ path: `${SHOTS}/1-invitation-page.png`, fullPage: true });
  await p.getByTestId("invite-register").click();
  await p.waitForURL(/\/en\/auth\/signup/, { timeout: 30_000 });
  const context = p.getByTestId("signup-invite-context");
  await expect(context, "the sign-up form carries the invitation").toBeVisible({ timeout: 30_000 });
  await expect(context).toContainText(`${OWNER_NAME} invited you to ${ORG}.`);
  await expect(context).toContainText(`After sign-up you join ${ORG}.`);
  await p.screenshot({ path: `${SHOTS}/2-signup-with-invitation.png`, fullPage: true });

  await p.locator('input[type="email"]').fill(PERSON);
  await p.locator('input[name="password"]').fill(PASSWORD);
  const confirm = p.locator('input[name="confirm_password"]');
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await p.locator('form button[type="submit"]').click();
  await p.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });

  // IJ-2 starts here, on the same page: no role question.
  await expect(p.getByTestId("onboarding-display-name"), "onboarding opens on the profile step").toBeVisible({ timeout: 30_000 });
  await expect(p.getByTestId("onboarding-intent-hire"), "no 'I run a company' choice for a person joining one").toHaveCount(0);
  await p.screenshot({ path: `${SHOTS}/3-onboarding-without-role-question.png`, fullPage: true });
  await p.getByTestId("onboarding-display-name").fill(PERSON_NAME);
  await p.getByTestId("onboarding-country").click();
  await p.getByRole("option", { name: /Lithuania/ }).first().click();
  await p.getByTestId("onboarding-submit").click();
  await p.waitForURL(/\/en\/(dashboard|invite)/, { timeout: 60_000 });
  await p.screenshot({ path: `${SHOTS}/4-after-onboarding.png`, fullPage: true });
});

test("IJ-2. the person joined the inviting organization and owns no organization of their own", async () => {
  const personId = await userId(PERSON);
  await expect
    .poll(
      () =>
        sql<{ n: number }>(
          `select count(*)::int as n from public.engagement_contexts
            where profile_id = ${lit(personId)} and organization_id = ${lit(state.orgId)} and status = 'active'`,
        )[0]?.n ?? 0,
      { message: "the person is connected with the inviting organization", timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  const ownedOrgs = sql<{ n: number }>(
    `select count(*)::int as n from public.organizations where owner_profile_id = ${lit(personId)}`,
  );
  expect(ownedOrgs[0]?.n, "no organization was created for the person").toBe(0);
  const ownedCompanies = sql<{ n: number }>(
    `select count(*)::int as n from public.companies where profile_id = ${lit(personId)}`,
  );
  expect(ownedCompanies[0]?.n, "no company shell was created for the person").toBe(0);
  const [profile] = sql<{ active_role: string | null }>(`select active_role from public.profiles where id = ${lit(personId)}`);
  expect(profile?.active_role, "the person joins as themselves, not as a new company").toBe("worker");
});
