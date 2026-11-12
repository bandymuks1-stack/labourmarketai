import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  BASE,
  PASSWORD,
  SB_ANON,
  SB_URL,
  accessToken,
  isolatedStack,
  lit,
  onboard,
  setUpCompany,
  signUp,
  sql,
  stackMailLink,
  userId,
} from "./isolated-web-a-helpers";

/**
 * TEAMS AND PROJECT PEOPLE, end to end, on the THROWAWAY local stack
 * (.github/workflows/signup-isolated.yml; the same contract as
 * role-journeys-isolated.spec.ts). Real browsers, real forms, real server
 * actions; each step is proven in the local database, not by the page saying
 * "done". A "team" here is generic (a kitchen shift, a care team, a crew).
 *
 * Launch scenarios (owner list 2026-11-12) this walk covers:
 *   T-3  a user creates a team and invites members;
 *   T-4  one member accepts, one DECLINES (decline had no walk anywhere);
 *   T-5  the company sees its teams and its workers;
 *   T-6  the company assigns the team to a project (one stored assignment);
 *   T-7  the project page shows the people, each person's position line, and
 *        WHICH team works there, by name;
 *   T-14 another organization sees none of it (browser + its own RLS reads).
 *
 * A pass here is PASS_CI_ONLY, never a production verification. People are
 * created only in a database that dies with the CI job.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const mail = (who: string) => `teams.${who}.${RUN}@local.test`;

const CO = mail("company");
const W1 = mail("accepts");
const W2 = mail("declines");
const OUT = mail("outsider");

const CO_ORG = `QA-SYNTHETIC Teams Co ${RUN}`;
const OUT_ORG = `QA-SYNTHETIC Teams Outsider ${RUN}`;
const W1_NAME = `Synthetic Accepting Cook ${RUN}`;
const W2_NAME = `Synthetic Declining Cook ${RUN}`;
const TEAM = `QA-SYNTHETIC evening kitchen shift ${RUN}`;
const PROJECT = `QA-SYNTHETIC banquet week ${RUN}`;

const s = { coId: "", coOrgId: "", w1Id: "", w2Id: "", teamId: "", projectId: "", w1Link: "", w2Link: "" };

// ── people: one browser context per person for the whole walk ──────────────
const people = new Map<string, { ctx: BrowserContext; page: Page }>();
async function fresh(browser: Browser, address: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  people.set(address, { ctx, page });
  return page;
}
function as(address: string): Page {
  const p = people.get(address);
  if (!p) throw new Error("this person has no session in the walk (an earlier step failed)");
  return p.page;
}
test.afterAll(async () => {
  for (const { ctx } of people.values()) await ctx.close().catch(() => {});
});

/** Served locally, same path: the product may print its public origin. */
function local(link: string): string {
  const u = new URL(link);
  return `${BASE}${u.pathname}${u.search}`;
}

/** A REST read AS a signed-in person: what row-level security lets THEM see. */
async function readAs<T>(address: string, path: string): Promise<T[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${await accessToken(address)}` },
  });
  if (r.status === 401 || r.status === 403) return [];
  if (!r.ok) throw new Error(`rls read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T[];
}

/** The person proves their mailbox the product's own way (an addressed
 *  invitation resolves only for a verified address). */
async function verifyEmail(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/dashboard/network`);
  const prompt = page.getByTestId("network-email-unverified");
  await expect(prompt, "a new account is asked to confirm its address").toBeVisible({ timeout: 30_000 });
  await prompt.getByTestId("verify-email-send").click();
  await expect(prompt.getByTestId("verify-email-sent")).toBeVisible({ timeout: 30_000 });
  await page.goto(await stackMailLink(address));
  await page.waitForURL((url) => url.host === new URL(BASE).host && !url.pathname.includes("/auth/callback"), {
    timeout: 60_000,
  });
}

/** The company hands a join-organization LINK; the worker registers through it. */
async function joinCompanyByLink(browser: Browser, co: Page, address: string, name: string): Promise<string> {
  await co.goto(`${BASE}/en/dashboard/network?invite=1&type=join_organization&org=${s.coOrgId}#network-invite`);
  const panel = co.getByTestId("invite-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByTestId("invite-mode-link").click();
  await panel.getByTestId("invite-name").fill(name);
  await panel.getByTestId("invite-submit").click();
  const copy = panel.getByTestId("invite-copy-link").first();
  await expect(copy, "the invitation link is handed to the company").toBeVisible({ timeout: 30_000 });
  const raw = await copy.getAttribute("data-invite-link");
  expect(raw, "an invitation link").toBeTruthy();

  const w = await fresh(browser, address);
  await w.goto(local(raw!));
  await w.getByTestId("invite-register").click();
  await w.waitForURL(/\/en\/auth\/signup/, { timeout: 30_000 });
  await w.locator('input[type="email"]').fill(address);
  await w.locator('input[name="password"]').fill(PASSWORD);
  const confirm = w.locator('input[name="confirm_password"]');
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await w.locator('form button[type="submit"]').click();
  await w.waitForURL(/\/en\/(onboarding|invite|dashboard)/, { timeout: 60_000 });
  if (/\/onboarding/.test(w.url())) await onboard(w, "work", name);
  await w.waitForURL(/\/en\/(dashboard|invite)/, { timeout: 60_000 });
  if (/\/invite\//.test(w.url())) {
    const accept = w.getByTestId("invite-accept");
    if (await accept.isVisible().catch(() => false)) await accept.click();
  }
  const id = await userId(address);
  await expect
    .poll(
      () =>
        sql<{ n: number }>(
          `select count(*)::int as n from public.engagement_contexts
            where profile_id = ${lit(id)} and organization_id = ${lit(s.coOrgId)}
              and relationship_slug = 'employee' and status = 'active'`,
        )[0]?.n ?? 0,
      { message: "registering through the link makes the worker the company's employee", timeout: 30_000 },
    )
    .toBe(1);
  return id;
}

function teamMembers(): string[] {
  return sql<{ profile_id: string }>(
    `select profile_id from public.engagement_contexts
      where organization_id = ${lit(s.teamId)} and status = 'active' and relationship_slug = 'employee'`,
  ).map((r) => r.profile_id);
}

function teamInvites(): Array<{ invited_email: string; status: string; accepted_by_profile_id: string | null }> {
  return sql(
    `select invited_email, status, accepted_by_profile_id from public.invitations
      where invitation_type = 'join_team' and organization_id = ${lit(s.teamId)} order by created_at`,
  );
}

/** The owner picks a person on the team card and gets a link for them. */
async function inviteToTeam(co: Page, name: string, address: string, previousLink: string): Promise<string> {
  const pick = co.locator(`[id="team-add-${s.teamId}"]`);
  await expect(pick, "the team card offers people to add").toBeVisible({ timeout: 30_000 });
  const options = await pick.locator("option").allInnerTexts();
  const label = options.find((o) => o.includes(name));
  expect(label, `the picker offers the company's own person (${options.length} options)`).toBeTruthy();
  await pick.selectOption({ label: label! });
  const add = co.getByTestId(`team-invite-member-${s.teamId}`);
  await add.click();
  const code = co.getByTestId("team-invite-link").locator("code");
  const typed = co.getByTestId(`team-invite-email-${s.teamId}`);
  const fresher = async () => {
    const text = (await code.innerText().catch(() => "")).trim();
    return text && text !== previousLink ? text : "";
  };
  // The owner may not be able to read the person's address; the product then
  // asks for it and the owner types it.
  const answered = await expect
    .poll(async () => (await fresher()) !== "" || (await typed.isVisible().catch(() => false)), { timeout: 30_000 })
    .toBe(true)
    .then(() => true)
    .catch(() => false);
  if (!answered) {
    // Say what the product said instead (synthetic names only), so a refusal
    // is read from the run and not guessed.
    const said = await co.getByTestId("team-brigades-msg").innerText().catch(() => "(no message)");
    const state = `picked=${await pick.inputValue()} add-disabled=${await add.isDisabled()}`;
    throw new Error(`no link and no address question after "add"; the product said: ${said} [${state}]`);
  }
  if ((await fresher()) === "") {
    await typed.fill(address);
    await add.click();
  }
  let link = "";
  await expect
    .poll(async () => (link = await fresher()), { message: "a fresh invitation link is shown", timeout: 30_000 })
    .not.toBe("");
  expect(link).toMatch(/\/[a-z]{2}\/invite\//);
  return link;
}

// ── T-3 ─────────────────────────────────────────────────────────────────────

test("T-3. a company owner creates a team and invites two of the company's people", async ({ browser }) => {
  const co = await fresh(browser, CO);
  await signUp(co, BASE, CO);
  await onboard(co, "hire", `Synthetic Teams Owner ${RUN}`);
  await setUpCompany(co, CO_ORG);
  s.coId = await userId(CO);
  const orgs = sql<{ id: string }>(
    `select id from public.organizations where owner_profile_id = ${lit(s.coId)} and organization_type <> 'team'`,
  );
  expect(orgs.length, "the setup created one organization").toBe(1);
  s.coOrgId = orgs[0]!.id;

  s.w1Id = await joinCompanyByLink(browser, co, W1, W1_NAME);
  s.w2Id = await joinCompanyByLink(browser, co, W2, W2_NAME);

  // The team is created on the company's people door.
  await co.goto(`${BASE}/en/dashboard/company/people`);
  await expect(co.getByTestId("team-brigades-panel")).toBeVisible({ timeout: 30_000 });
  await co.getByTestId("team-create-name").fill(TEAM);
  await co.getByTestId("team-create-submit").click();
  const card = co.locator('[data-testid^="team-brigade-"]', { hasText: TEAM });
  await expect(card, "the new team is listed without a reload").toBeVisible({ timeout: 30_000 });
  const teams = sql<{ id: string; organization_type: string }>(
    `select id, organization_type from public.organizations where display_name = ${lit(TEAM)}`,
  );
  expect(teams.length, "the team is stored once").toBe(1);
  expect(teams[0]!.organization_type).toBe("team");
  s.teamId = teams[0]!.id;
  expect(teamMembers(), "creating a team puts nobody in it").toEqual([]);

  // Two invitations, each a link the owner hands over. Nobody is a member yet.
  s.w1Link = await inviteToTeam(co, W1_NAME, W1, "");
  s.w2Link = await inviteToTeam(co, W2_NAME, W2, s.w1Link);
  expect(s.w2Link).not.toBe(s.w1Link);
  const invites = teamInvites();
  expect(invites.map((i) => i.invited_email).sort(), "one invitation per person").toEqual([W1, W2].sort());
  expect(invites.map((i) => i.status), "both wait for the person's own answer").toEqual(["pending", "pending"]);
  expect(teamMembers(), "an invitation is not a membership").toEqual([]);
});

// ── T-4 ─────────────────────────────────────────────────────────────────────

test("T-4. one invited person accepts and is in the team; the other declines and is not", async () => {
  expect(s.w2Link, "T-3 produced both links").toBeTruthy();
  const w1 = as(W1);
  const w2 = as(W2);
  await verifyEmail(w1, W1);
  await verifyEmail(w2, W2);

  await w1.goto(local(s.w1Link));
  await expect(w1.getByTestId("invite-page")).toBeVisible({ timeout: 30_000 });
  await expect(w1.getByTestId("invite-org"), "the invitation names the team").toContainText(TEAM);
  await w1.getByTestId("invite-accept").click();
  await w1.waitForURL((u) => !u.pathname.includes("/invite/"), { timeout: 30_000 });
  await expect.poll(() => teamMembers(), { message: "accepting makes the person a member", timeout: 30_000 }).toEqual([s.w1Id]);

  await w2.goto(local(s.w2Link));
  await expect(w2.getByTestId("invite-page")).toBeVisible({ timeout: 30_000 });
  await w2.getByTestId("invite-decline").click();
  await expect
    .poll(() => teamInvites().find((i) => i.invited_email === W2)?.status, {
      message: "the refusal is stored",
      timeout: 30_000,
    })
    .toBe("declined");

  const invites = teamInvites();
  const accepted = invites.find((i) => i.invited_email === W1);
  expect(accepted?.status).toBe("accepted");
  expect(accepted?.accepted_by_profile_id, "accepted by that person, nobody else").toBe(s.w1Id);
  expect(teamMembers(), "declining creates no membership").toEqual([s.w1Id]);

  // Both links are spent: neither can be used a second time.
  await w1.goto(local(s.w1Link));
  await expect(w1.getByTestId("invite-accepted-by-you").or(w1.getByTestId("invite-closed"))).toBeVisible({
    timeout: 30_000,
  });
  await w2.goto(local(s.w2Link));
  await expect(w2.getByTestId("invite-closed"), "a declined invitation is closed").toBeVisible({ timeout: 30_000 });
  await expect(w2.getByTestId("invite-accept")).toHaveCount(0);
  expect(teamMembers()).toEqual([s.w1Id]);
});

// ── T-5 ─────────────────────────────────────────────────────────────────────

test("T-5. the company sees its team with the member who accepted, and both of its workers", async () => {
  expect(s.teamId, "T-3 created the team").toBeTruthy();
  const co = as(CO);
  await co.goto(`${BASE}/en/dashboard/company/people`);
  const card = co.getByTestId(`team-brigade-${s.teamId}`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card, "the member who accepted is on the team").toContainText(W1_NAME);
  const main = co.getByRole("main");
  await expect(main, "the worker who accepted is one of the company's people").toContainText(W1_NAME);
  await expect(main, "the worker who declined the TEAM is still the company's person").toContainText(W2_NAME);
});

// ── T-6 / T-7 ───────────────────────────────────────────────────────────────

test("T-6/T-7. the company assigns the team to a project; the project page names the team and its people", async () => {
  expect(teamMembers(), "T-4 left one member").toEqual([s.w1Id]);
  const co = as(CO);

  await co.goto(`${BASE}/en/dashboard/company/projects/new`);
  const form = co.getByRole("main");
  await form.getByTestId("project-name-input").fill(PROJECT);
  await form.getByTestId("project-create-submit").click();
  const ok = form.getByTestId("project-context-created");
  const err = form.getByTestId("project-create-error");
  await expect(ok.or(err)).toBeVisible({ timeout: 30_000 });
  if (await err.isVisible()) throw new Error(`project not created: ${await err.getAttribute("data-code")}`);
  const projects = sql<{ id: string }>(`select id from public.projects where title = ${lit(PROJECT)}`);
  expect(projects.length, "the project is stored once").toBe(1);
  s.projectId = projects[0]!.id;

  // The whole team, as ONE assignment, from the team's own card.
  await co.goto(`${BASE}/en/dashboard/company/people`);
  const card = co.getByTestId(`team-brigade-${s.teamId}`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  const section = card.getByTestId("team-assign-section");
  if ((await section.getAttribute("open")) === null) await section.locator("summary").first().click();
  await section.getByTestId("team-assign-project").selectOption(s.projectId);
  await section.getByTestId("team-assign-submit").click();
  await expect(section.getByTestId("team-assign-ok"), "the assignment is accepted").toBeVisible({ timeout: 30_000 });
  const assignments = sql<{ id: string; ended_at: string | null }>(
    `select id, ended_at from public.team_assignments
      where team_org_id = ${lit(s.teamId)} and project_id = ${lit(s.projectId)}`,
  );
  expect(assignments.length, "ONE stored team assignment").toBe(1);
  expect(assignments[0]!.ended_at).toBeNull();
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.project_worker_assignments where project_id = ${lit(s.projectId)}`,
    )[0]?.n,
    "no per-person row is invented for a team member",
  ).toBe(0);

  // The project page: the person, their position line, and the team by name.
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [320, 640],
  ] as const) {
    await co.setViewportSize({ width, height });
    await co.goto(`${BASE}/en/dashboard/projects/${s.projectId}`);
    const field = co.getByTestId("stadium-field");
    await expect(field, "the manager's project page").toBeVisible({ timeout: 30_000 });
    const player = field.getByTestId("stadium-player").filter({ hasText: W1_NAME });
    await expect(player, "the team's member is on the project").toHaveCount(1);
    await expect(field, "a person who is not in the team is not on the project").not.toContainText(W2_NAME);
    await expect(player.getByTestId("stadium-player-teams"), "the person's card names the team").toContainText(TEAM);
    await expect(
      player.locator("a p").nth(1),
      "the card carries a position line (the person's profession, or that none is set)",
    ).not.toBeEmpty();
    const teams = co.getByTestId("stadium-teams");
    await expect(teams.getByTestId("stadium-team"), "one team on this project").toHaveCount(1);
    await expect(teams.getByTestId("stadium-team")).toContainText(TEAM);
    await expect(teams.getByTestId("stadium-team")).toContainText(W1_NAME);
    await expect(teams.getByTestId("stadium-team-count")).toContainText("1");
    await expect(teams.getByTestId("stadium-teams-unavailable")).toHaveCount(0);
    const overflow = await co.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(1);
  }
  await co.setViewportSize({ width: 1280, height: 800 });

  // The link under the section opens the place where teams are changed.
  await co.getByTestId("stadium-teams-manage").click();
  await co.waitForURL(/\/en\/dashboard\/projects(#.*)?$/, { timeout: 30_000 });
  await expect(co.locator("#project-teams")).toBeAttached({ timeout: 30_000 });
});

// ── T-14 ────────────────────────────────────────────────────────────────────

test("T-14. another organization sees neither the team, its people nor the project", async ({ browser }) => {
  expect(s.projectId, "T-6 created the project").toBeTruthy();
  const out = await fresh(browser, OUT);
  await signUp(out, BASE, OUT);
  await onboard(out, "hire", `Synthetic Teams Outsider ${RUN}`);
  await setUpCompany(out, OUT_ORG);

  await out.goto(`${BASE}/en/dashboard/company/people`);
  await expect(out.getByTestId("team-brigades-panel")).toBeVisible({ timeout: 30_000 });
  const people = (await out.getByRole("main").textContent()) ?? "";
  for (const secret of [TEAM, W1_NAME, W2_NAME, CO_ORG]) expect(people).not.toContain(secret);

  await out.goto(`${BASE}/en/dashboard/projects/${s.projectId}`);
  await expect(out.getByTestId("stadium-not-authorized"), "the project page refuses a stranger").toBeVisible({
    timeout: 30_000,
  });
  const page = (await out.getByRole("main").textContent()) ?? "";
  for (const secret of [TEAM, W1_NAME, PROJECT]) expect(page).not.toContain(secret);

  // The same answer from the database itself, as the outsider's own session.
  expect(await readAs(OUT, `organizations?id=eq.${s.teamId}&select=id`), "team row").toEqual([]);
  expect(await readAs(OUT, `team_assignments?project_id=eq.${s.projectId}&select=id`), "team assignment").toEqual([]);
  expect(await readAs(OUT, `projects?id=eq.${s.projectId}&select=id`), "project").toEqual([]);
  expect(
    await readAs(OUT, `engagement_contexts?organization_id=eq.${s.teamId}&select=id`),
    "team memberships",
  ).toEqual([]);
  expect(
    await readAs(OUT, `invitations?organization_id=eq.${s.teamId}&select=id`),
    "team invitations",
  ).toEqual([]);
});
