import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  BASE,
  isolatedStack,
  lit,
  onboard,
  setUpCompany,
  signUp,
  sql,
  signIn,
  sqlExec,
  userId,
} from "./isolated-web-a-helpers";

/**
 * THE SIGNED-IN HOME, WALKED BY ROLE (owner P0 No. 1, 2026-11-12 — navigation
 * is the launch blocker), on the THROWAWAY LOCAL Supabase stack
 * (.github/workflows/signup-isolated.yml, the same job and contract as the
 * other *-isolated walks). Real browsers, real sign-up, real pages.
 *
 *   N-0  a worker, a company and a staffing agency sign up through the form;
 *   N-1  for each role, at 360 px and 1440 px, every top task is reached from
 *        the signed-in home and the navigation actions are COUNTED — a tap
 *        that opens a menu counts, a tap that follows a link counts. More
 *        than two fails the walk;
 *   N-2  keyboard only: the first goal and "Ask the assistant" are reached
 *        with Tab and opened with Enter;
 *   N-3  320–1440 px with reduced motion: the home does not scroll sideways
 *        and every goal card is a full touch target;
 *   N-4  a pin never grants access: a pin to an employer page stored for a
 *        worker is not drawn, the page itself still refuses, and the pin can
 *        be removed;
 *   N-5  pin · move (arrow keys, then a drag) · unpin in the row's Manage
 *        mode, each change proven in the stored rows;
 *   N-5b the pin toggle on a function card and the row are one list: a pin
 *        made on the card shows in the row and in the stored rows, and back;
 *   N-6  a pin survives sign-out and sign-in, and shows in a second session;
 *   N-7  EVERY function target is opened as each role and classified:
 *        works (opens and offers something to act on), empty (opens, nothing
 *        to act on), refused (the gate turns the person away). What the home
 *        offers a role must never be refused; the table is printed;
 *   N-8  the home at 360 and 1440 px in the light and the dark theme, with
 *        and without a goal open — screenshots for a person to look at.
 *
 * WHAT THIS DOES NOT PROVE. The owner's acceptance is that a NEW PERSON
 * understands the main choices within five seconds. A script that already
 * knows the test ids cannot show that. A green run here means "at most two
 * actions, measured"; whether people find the home obvious is NOT YET
 * CONFIRMED BY PEOPLE and must never be reported from this spec.
 *
 * It refuses to run anywhere but the local stack (`isolatedStack()`), creates
 * people only in a database that dies with the CI job, and keeps one kind of
 * evidence beyond Playwright's list output: screenshots of these synthetic
 * accounts' home screens (`test-results/app-nav-walk/`).
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const email = (who: string) => `navwalk.${who}.${RUN}@local.test`;
const SHOTS = path.join("test-results", "app-nav-walk");

/** The owner's bound: the START of a function in at most two actions. */
const MAX_ACTIONS = 2;

const VIEWPORTS = [
  { name: "360", width: 360, height: 780 },
  { name: "1440", width: 1440, height: 900 },
] as const;
type ViewportName = (typeof VIEWPORTS)[number]["name"];

type Person = "worker" | "company" | "agency";
type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;
const sessions = new Map<Person, Session>();

type Task = {
  /** What the person wants, in plain words (the report's row name). */
  readonly name: string;
  /** The goal card in the shared goal rail, and the function card under it. */
  readonly goal?: string;
  readonly fn?: string;
  /** A tracked door on the home itself (the employer's need door). */
  readonly door?: string;
  /** Otherwise the header destination (the core loop). */
  readonly nav?: string;
  /** Where the function starts. */
  readonly url: RegExp;
  /** A control that proves the function's start is on screen. */
  readonly start?: string;
};

/** The four roles of the audit. The employer and the service business are the
 *  SAME company account: one organization is often both. */
const ROLES: ReadonlyArray<{ role: string; person: Person; home: string; tasks: readonly Task[] }> = [
  {
    role: "worker",
    person: "worker",
    home: "today-screen",
    tasks: [
      { name: "find work", goal: "work", fn: "findWork", url: /\/en\/dashboard\/opportunities/ },
      { name: "record work", goal: "work", fn: "recordWork", url: /\/en\/dashboard\/journal/, start: "journal-quick-record-text" },
      { name: "my CV", goal: "work", fn: "myCv", url: /\/en\/cv(\?|$)/ },
      { name: "messages", nav: "communication", url: /\/en\/dashboard\/communication/ },
      { name: "calendar", nav: "planning", url: /\/en\/dashboard\/planning/ },
    ],
  },
  {
    role: "employer",
    person: "company",
    home: "company-model",
    tasks: [
      { name: "find workers", door: "company-model-primary", url: /\/en\/dashboard\/company\/needs/, start: "demand-role" },
      { name: "projects and teams", goal: "workers", fn: "projects", url: /\/en\/dashboard\/projects/ },
      { name: "my people", goal: "workers", fn: "people", url: /\/en\/dashboard\/company\/people/ },
      { name: "find candidates", goal: "workers", fn: "candidates", url: /\/en\/dashboard\/company\/scouting/ },
      { name: "messages", nav: "communication", url: /\/en\/dashboard\/communication/ },
      { name: "calendar", nav: "planning", url: /\/en\/dashboard\/planning/ },
    ],
  },
  {
    role: "service business",
    person: "company",
    home: "company-model",
    tasks: [
      { name: "offer services", goal: "services", fn: "offerServices", url: /\/en\/dashboard\/services/ },
      { name: "requests and orders", goal: "services", fn: "orders", url: /\/en\/dashboard\/service-requests/ },
      { name: "market listings", goal: "orders", fn: "listings", url: /\/en\/dashboard\/listings/ },
      { name: "proposals and contracts", goal: "orders", fn: "commercial", url: /\/en\/dashboard\/commercial/ },
      { name: "work and hours", goal: "workers", fn: "hours", url: /\/en\/dashboard\/hours/ },
    ],
  },
  {
    role: "agency",
    person: "agency",
    home: "company-model",
    tasks: [
      { name: "offer your people", goal: "agencies", fn: "offerPeople", url: /\/en\/dashboard\/company\/needs/ },
      { name: "clients", goal: "agencies", fn: "clients", url: /\/en\/dashboard\/company\/partners/ },
      { name: "my people", goal: "agencies", fn: "people", url: /\/en\/dashboard\/company\/people/ },
      { name: "find candidates", goal: "agencies", fn: "candidates", url: /\/en\/dashboard\/company\/scouting/ },
    ],
  },
];

// ── helpers ─────────────────────────────────────────────────────────────────

async function as(
  browser: Browser,
  person: Person,
  viewport: { width: number; height: number },
  opts: { reducedMotion?: boolean } = {},
): Promise<{ ctx: BrowserContext; page: Page }> {
  const storageState = sessions.get(person);
  if (!storageState) throw new Error(`${person} has no session (N-0 failed)`);
  const ctx = await browser.newContext({
    storageState,
    viewport,
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference",
  });
  return { ctx, page: await ctx.newPage() };
}

/** The organization a person owns, from the local database. */
function ownedOrg(ownerId: string): string {
  const rows = sql<{ id: string }>(
    `select id from public.organizations where owner_profile_id = ${lit(ownerId)} order by created_at limit 1`,
  );
  if (!rows[0]) throw new Error("the walk's owner has no organization");
  return rows[0].id;
}

/**
 * Open the signed-in home and wait for the role's home to be on screen. An
 * owner normally lands in their one organization; where the personal space is
 * active instead, the walk stands in the organization through the header's
 * own workspace switch (the product's control, not a database shortcut).
 */
async function openHome(page: Page, person: Person, home: string, orgId?: string): Promise<void> {
  await page.goto(`${BASE}/en/dashboard`);
  await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 60_000 });
  const landed = page.getByTestId(home);
  if (person !== "worker" && orgId && !(await landed.isVisible().catch(() => false))) {
    await page.waitForTimeout(3_000);
    if (!(await landed.isVisible().catch(() => false))) {
      const trigger = page
        .locator('[data-testid="workspace-chip"] button[aria-haspopup="menu"]')
        .filter({ visible: true })
        .first();
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click();
        await page.getByTestId(`workspace-option-${orgId}`).click();
      }
    }
  }
  await expect(landed, `the ${person}'s home is on screen`).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("home-goals"), "the goal cards lead the home").toBeVisible({ timeout: 30_000 });
}

/**
 * Reach the start of a task from the home the way a person would, and return
 * how many navigation actions it took. The affordance is chosen by what the
 * screen offers at this width: a goal card, the header's core row, or (on a
 * phone) the header's menu and then the destination.
 */
async function reach(page: Page, task: Task, viewport: ViewportName): Promise<number> {
  let actions = 0;
  if (task.door) {
    const door = page.getByTestId(task.door);
    await expect(door, `"${task.name}" is on the home itself`).toBeVisible();
    await door.click();
    actions += 1;
  } else if (task.goal && task.fn) {
    // The shared goal rail: choose the goal, then its function card.
    const goal = page.getByTestId("goal-rail").locator(`[data-card-id="${task.goal}"]`);
    await expect(goal, `the goal for "${task.name}" is in the rail`).toBeVisible();
    await goal.scrollIntoViewIfNeeded();
    await goal.click();
    actions += 1;
    await expect(page.getByTestId("goal-panel")).toHaveAttribute("data-goal", task.goal, { timeout: 15_000 });
    const card = page.getByTestId("function-rail").locator(`[data-card-id="${task.fn}"]`);
    await expect(card, `"${task.name}" is a function card of its goal`).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    actions += 1;
  } else {
    const direct = page.getByTestId(`header-core-nav-${task.nav}`);
    if (viewport === "1440") {
      await expect(direct, `"${task.name}" is in the header`).toBeVisible();
      await direct.click();
      actions += 1;
    } else {
      await page.getByTestId("header-nav-sheet-trigger").click();
      actions += 1;
      await page.getByTestId(`header-nav-sheet-${task.nav}`).click();
      actions += 1;
    }
  }
  await page.waitForURL(task.url, { timeout: 60_000 });
  expect(page.url(), `"${task.name}" was not refused`).not.toContain("notice=");
  await expect(page.getByRole("main").first(), `"${task.name}" opened a page`).toBeVisible({ timeout: 30_000 });
  if (task.start) {
    await expect(page.getByTestId(task.start).first(), `"${task.name}" starts here`).toBeVisible({ timeout: 30_000 });
  }
  return actions;
}

/** Which card of which rail (if any) holds keyboard focus: "goal-rail:work". */
function focusedCard(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const card = document.activeElement?.closest("[data-card-id]");
    const rail = card?.closest('[data-testid="goal-rail"], [data-testid="function-rail"]');
    return card && rail ? `${rail.getAttribute("data-testid")}:${card.getAttribute("data-card-id")}` : null;
  });
}
function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
}

/** Press Tab until `done()` holds; returns how many presses it took. */
async function tabUntil(page: Page, done: () => Promise<boolean>, max = 80): Promise<number> {
  for (let presses = 1; presses <= max; presses += 1) {
    await page.keyboard.press("Tab");
    if (await done()) return presses;
  }
  throw new Error(`keyboard focus did not arrive within ${max} Tab presses`);
}

const orgOf: Partial<Record<Person, string>> = {};

// ── N-0 · the three people ──────────────────────────────────────────────────

test("N-0a. a worker signs up and lands on a home that leads with goal cards", async ({ browser }) => {
  mkdirSync(SHOTS, { recursive: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, BASE, email("worker"));
  await onboard(page, "work", `QA-SYNTHETIC Nav Worker ${RUN}`);
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  await openHome(page, "worker", "today-screen");
  sessions.set("worker", await ctx.storageState());
  await ctx.close();
});

test("N-0b. a company signs up, sets up its organization and lands on the employer home", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, BASE, email("company"));
  await onboard(page, "hire", `QA-SYNTHETIC Nav Owner ${RUN}`);
  await setUpCompany(page, `QA-SYNTHETIC Nav Company ${RUN}`);
  orgOf.company = ownedOrg(await userId(email("company")));
  await openHome(page, "company", "company-model", orgOf.company);
  await expect(page.getByTestId("home-goals")).toHaveAttribute("data-role", "company");
  await expect(page.getByTestId("goal-rail").locator("[data-card-id]").first()).toHaveAttribute("data-card-id", "workers");
  await expect(page.getByTestId("goal-rail").locator('[data-card-id="agencies"]')).toHaveCount(0);
  sessions.set("company", await ctx.storageState());
  await ctx.close();
});

test("N-0c. a staffing agency signs up and its home opens on what it offers, never on a need", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, BASE, email("agency"));
  await onboard(page, "agency", `QA-SYNTHETIC Nav Agency Owner ${RUN}`);
  await setUpCompany(page, `QA-SYNTHETIC Nav Agency ${RUN}`);
  orgOf.agency = ownedOrg(await userId(email("agency")));
  await openHome(page, "agency", "company-model", orgOf.agency);
  await expect(page.getByTestId("home-goals")).toHaveAttribute("data-role", "agency");
  // DEMAND ≠ SUPPLY: the agency is not shown the employer's need door.
  await expect(page.getByTestId("company-model-primary")).toHaveCount(0);
  await expect(page.getByTestId("goal-rail").locator("[data-card-id]").first()).toHaveAttribute("data-card-id", "agencies");
  sessions.set("agency", await ctx.storageState());
  await ctx.close();
});

// ── N-1 · at most two actions to the start of every top task ────────────────

for (const viewport of VIEWPORTS) {
  for (const { role, person, home, tasks } of ROLES) {
    test(`N-1. ${role} at ${viewport.name} px: every top task starts within ${MAX_ACTIONS} actions`, async ({ browser }) => {
      const { ctx, page } = await as(browser, person, viewport);
      const counted: string[] = [];
      try {
        await openHome(page, person, home, orgOf[person]);
        await page.screenshot({ path: path.join(SHOTS, `after-${role.replace(/ /g, "-")}-${viewport.name}.png`) });
        for (const task of tasks) {
          await openHome(page, person, home, orgOf[person]);
          const actions = await reach(page, task, viewport.name);
          counted.push(`${task.name}=${actions}`);
          expect(actions, `${role} · ${task.name} · ${viewport.name} px`).toBeLessThanOrEqual(MAX_ACTIONS);
        }
      } finally {
        // The measured counts, in the list output (the PR's evidence table).
        console.log(`[app-nav-walk] ${role} @ ${viewport.name}px: ${counted.join(", ")}`);
        test.info().annotations.push({ type: "navigation-actions", description: counted.join(", ") });
        await ctx.close();
      }
    });
  }
}

// ── N-2 · keyboard only ─────────────────────────────────────────────────────

for (const { role, person, home, tasks } of ROLES.filter((r) => r.role !== "service business")) {
  test(`N-2. ${role}, keyboard only: the first goal and the assistant open with Tab and Enter`, async ({ browser }) => {
    const { ctx, page } = await as(browser, person, VIEWPORTS[1]);
    try {
      const first = tasks.find((t) => t.goal && t.fn)!;
      await openHome(page, person, home, orgOf[person]);
      await page.locator("body").focus();
      const toGoal = await tabUntil(page, async () => (await focusedCard(page)) === `goal-rail:${first.goal}`);
      // THE SKIP LINK: the first Tab of the screen lands on it, Enter moves
      // past the header, and the first goal is then a short way off.
      await openHome(page, person, home, orgOf[person]);
      await page.locator("body").focus();
      // What (if anything) takes the focus before it is recorded, not assumed:
      // the page may hold a control ahead of the header.
      const before: string[] = [];
      const toSkip = await tabUntil(
        page,
        async () => {
          if ((await focusedTestId(page)) === "app-skip-link") return true;
          before.push(
            await page.evaluate(() => {
              const el = document.activeElement;
              if (!el || el === document.body) return "nothing";
              const name = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? "";
              return `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? el.id ?? ""}] "${name}"`;
            }),
          );
          return false;
        },
        4,
      );
      await expect(page.getByTestId("app-skip-link")).toBeInViewport();
      await page.keyboard.press("Enter");
      const afterSkip = await tabUntil(page, async () => (await focusedCard(page)) === `goal-rail:${first.goal}`);
      expect(toSkip + 1 + afterSkip, "the skip link shortens the way to the first goal").toBeLessThan(toGoal);
      console.log(
        `[app-nav-walk] ${role} keyboard with the skip link: skip link after ${toSkip} Tab` +
          (before.length ? ` (before it: ${before.join(" · ")})` : "") +
          `, Enter, then the first goal card after ${afterSkip} Tab`,
      );
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("goal-panel")).toHaveAttribute("data-goal", first.goal!, { timeout: 15_000 });
      await tabUntil(page, async () => (await focusedCard(page)) === `function-rail:${first.fn}`);
      await page.keyboard.press("Enter");
      await page.waitForURL(first.url, { timeout: 60_000 });
      // Browser Back returns to the home with the goal's panel still open
      // (the goal is URL state), and Back again closes it.
      await page.goBack();
      await expect(page.getByTestId("goal-panel")).toHaveAttribute("data-goal", first.goal!, { timeout: 30_000 });

      await openHome(page, person, home, orgOf[person]);
      await page.locator("body").focus();
      const toAsk = await tabUntil(page, async () => (await focusedTestId(page)) === "home-ask-assistant");
      await page.keyboard.press("Enter");
      await expect
        .poll(() => focusedTestId(page), { message: "the assistant's composer takes the cursor", timeout: 10_000 })
        .toBe("composer-input");
      // Still the home: the entry opens the ONE conversation, not another place.
      expect(new URL(page.url()).pathname).toBe("/en/dashboard");
      console.log(`[app-nav-walk] ${role} keyboard: first goal card after ${toGoal} Tab, assistant after ${toAsk} Tab`);
    } finally {
      await ctx.close();
    }
  });
}

// ── N-3 · 320–1440 px, reduced motion ───────────────────────────────────────

for (const { role, person, home } of ROLES.filter((r) => r.role !== "service business")) {
  test(`N-3. ${role}: the home fits 320–1440 px with reduced motion, and every goal is a full touch target`, async ({ browser }) => {
    for (const width of [320, 360, 768, 1024, 1440]) {
      const { ctx, page } = await as(browser, person, { width, height: 800 }, { reducedMotion: true });
      try {
        await openHome(page, person, home, orgOf[person]);
        const sideways = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(sideways, `${role} at ${width}px scrolls sideways`).toBeLessThanOrEqual(1);
        const cards = await page.getByTestId("goal-rail").locator("[data-card-id]").evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { id: el.getAttribute("data-card-id"), height: r.height, width: r.width };
          }),
        );
        expect(cards.length, `${role} at ${width}px has goal cards`).toBeGreaterThanOrEqual(3);
        for (const card of cards) {
          // The rail scrolls sideways by design; each card is a full target.
          expect(card.height, `${card.id} at ${width}px is a touch target`).toBeGreaterThanOrEqual(44);
          expect(card.width, `${card.id} at ${width}px is a touch target`).toBeGreaterThanOrEqual(44);
        }
        const ask = await page.getByTestId("home-ask-assistant").boundingBox();
        expect(ask?.height ?? 0, `the assistant entry at ${width}px is a touch target`).toBeGreaterThanOrEqual(44);
      } finally {
        await ctx.close();
      }
    }
  });
}

// ── N-4 · a pin never grants access ─────────────────────────────────────────

const EMPLOYER_PIN = "link:/dashboard/company/people";
const OWN_PIN = "link:/dashboard/journal";

test("N-4. a pin to an employer page stored for a worker is not drawn, opens nothing, and can be removed", async ({ browser }) => {
  const workerId = await userId(email("worker"));
  // Stored directly in the local database: the product's own pin action would
  // also store it (a reference is not a permission) — the question is what
  // the home DRAWS.
  sqlExec(
    `insert into public.workspace_pins (profile_id, organization_id, kind, ref, label, original_language, position) values ` +
      `(${lit(workerId)}, null, 'view', ${lit(EMPLOYER_PIN)}, 'QA-SYNTHETIC employer page', 'en', 0), ` +
      `(${lit(workerId)}, null, 'view', ${lit(OWN_PIN)}, 'QA-SYNTHETIC journal', 'en', 1)`,
  );
  const { ctx, page } = await as(browser, "worker", VIEWPORTS[1]);
  try {
    await openHome(page, "worker", "today-screen");
    const row = page.getByTestId("my-space-row");
    await expect(row.locator(`[data-testid="my-space-pin"][data-ref="${OWN_PIN}"]`), "the worker's own pin is drawn").toBeVisible();
    await expect(
      page.locator(`[data-testid="my-space-pin"][data-ref="${EMPLOYER_PIN}"]`),
      "the employer pin is not drawn for a worker",
    ).toHaveCount(0);
    await expect(page.locator(`[data-testid="my-space-recent"][data-ref="${EMPLOYER_PIN}"]`)).toHaveCount(0);

    // The gate itself still refuses: a pin changed nothing about access.
    await page.goto(`${BASE}/en/dashboard/company/people`);
    await page.waitForURL(/\/en\/dashboard\?notice=needs_company_role/, { timeout: 60_000 });

    // It still counts toward the cap, so it can be removed — and only removed.
    await openHome(page, "worker", "today-screen");
    await page.getByTestId("my-space-manage").click();
    const withheld = page.locator(`[data-testid="my-space-withheld-item"][data-ref="${EMPLOYER_PIN}"]`);
    await expect(withheld, "the withheld pin is listed for removal").toBeVisible();
    await expect(withheld.locator("a, [data-testid='my-space-pin']")).toHaveCount(0);
    await withheld.getByTestId("my-space-withheld-remove").click();
    await expect(withheld).toHaveCount(0);
    await expect
      .poll(
        () =>
          sql<{ n: number }>(
            `select count(*)::int as n from public.workspace_pins where profile_id = ${lit(workerId)} and ref = ${lit(EMPLOYER_PIN)}`,
          )[0]?.n,
        { message: "the withheld pin's row is deleted", timeout: 30_000 },
      )
      .toBe(0);
  } finally {
    await ctx.close();
  }
});

// ── N-5 · pin · move · unpin ────────────────────────────────────────────────

test("N-5. a worker adds a shortcut, moves it, and removes it — each change is stored", async ({ browser }) => {
  const workerId = await userId(email("worker"));
  const stored = () =>
    sql<{ ref: string }>(
      `select ref from public.workspace_pins where profile_id = ${lit(workerId)} and organization_id is null order by position, ref`,
    ).map((r) => r.ref);
  const { ctx, page } = await as(browser, "worker", VIEWPORTS[0]);
  try {
    await openHome(page, "worker", "today-screen");
    await page.getByTestId("my-space-manage").click();
    const editor = page.getByTestId("my-space-editor");
    await expect(editor).toBeVisible();

    // ADD — the first destination the home offers that is not pinned yet.
    const add = editor.getByTestId("my-space-add").first();
    const added = await add.getAttribute("data-ref");
    expect(added, "the home offers something to pin").toBeTruthy();
    await add.click();
    // While managing, a shortcut is a chip with a handle and a small remove
    // control, in the row itself.
    const item = (ref: string) => page.locator(`[data-testid="my-space-edit-item"][data-ref="${ref}"]`);
    await expect(item(added!), "the new shortcut is in the row").toBeVisible({ timeout: 30_000 });
    await expect.poll(stored, { message: "the pin is stored", timeout: 30_000 }).toEqual([OWN_PIN, added]);
    // The home is still the home: editing did not start a conversation.
    await expect(page.getByTestId("today-screen")).toBeVisible();
    await expect(page.getByTestId("my-space-manage-hint")).toBeVisible();

    // MOVE BY KEYBOARD — focus the chip, press the left arrow: it goes before
    // the older one, and the focus stays on it.
    const handle = item(added!).getByTestId("my-space-handle");
    await handle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(stored, { message: "the new order is stored", timeout: 30_000 }).toEqual([added, OWN_PIN]);
    await expect(handle, "the moved chip keeps the focus").toBeFocused();
    await expect(page.getByTestId("my-space-status")).not.toHaveText("\u00a0", { timeout: 15_000 });

    // MOVE BY DRAG — press the chip, carry it over the other one, let go.
    const from = await item(added!).getByTestId("my-space-handle").boundingBox();
    const to = await item(OWN_PIN).getByTestId("my-space-handle").boundingBox();
    expect(from && to, "both chips are on screen").toBeTruthy();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(stored, { message: "the dragged order is stored", timeout: 30_000 }).toEqual([OWN_PIN, added]);
    // Managing opens nothing: the person is still on the home.
    expect(new URL(page.url()).pathname).toBe("/en/dashboard");

    // DONE ends managing; the chips are shortcuts again, in the stored order.
    await page.getByTestId("my-space-manage").click();
    await expect(page.getByTestId("my-space-edit-item")).toHaveCount(0);
    // A reload shows the same order: it came from the stored rows.
    await openHome(page, "worker", "today-screen");
    const refs = await page.getByTestId("my-space-pin").evaluateAll((els) => els.map((e) => e.getAttribute("data-ref")));
    expect(refs).toEqual([OWN_PIN, added]);

    // UNPIN both.
    await page.getByTestId("my-space-manage").click();
    for (const ref of [added!, OWN_PIN]) {
      await page
        .locator(`[data-testid="my-space-edit-item"][data-ref="${ref}"]`)
        .getByTestId("my-space-remove")
        .click();
      await expect(page.locator(`[data-testid="my-space-pin"][data-ref="${ref}"]`)).toHaveCount(0);
    }
    await expect.poll(stored, { message: "the pins are deleted", timeout: 30_000 }).toEqual([]);
  } finally {
    await ctx.close();
  }
});

// ── N-5b · the card's pin toggle and the row are one list ───────────────────

for (const viewport of VIEWPORTS) {
  test(`N-5b. at ${viewport.width} px a function card's pin toggle adds and removes the row's shortcut`, async ({ browser }) => {
    const workerId = await userId(email("worker"));
    const stored = () =>
      sql<{ ref: string }>(
        `select ref from public.workspace_pins where profile_id = ${lit(workerId)} and organization_id is null order by position, ref`,
      ).map((r) => r.ref);
    const { ctx, page } = await as(browser, "worker", viewport);
    try {
      expect(stored(), "the walk starts with nothing pinned").toEqual([]);
      await openHome(page, "worker", "today-screen");
      await page.getByTestId("goal-rail").locator('[data-card-id="work"]').click();
      const rail = page.getByTestId("function-rail");
      const toggle = rail.locator('[data-rail-pin="recordWork"]');
      await expect(toggle, "the card carries a pin toggle once the row is there").toBeVisible({ timeout: 30_000 });
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      // A separate control from the card's link, with its own name and a full
      // touch target.
      const box = await toggle.boundingBox();
      expect(box && box.width >= 44 && box.height >= 44, "the toggle is a 44 px target").toBe(true);
      expect(await toggle.evaluate((el) => el.closest("a") === null), "the toggle is not inside the card's link").toBe(true);
      expect((await toggle.getAttribute("aria-label"))?.length ?? 0).toBeGreaterThan(3);

      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
      await expect(page.locator(`[data-testid="my-space-pin"][data-ref="${OWN_PIN}"]`), "the row shows the same pin").toBeVisible();
      await expect.poll(stored, { message: "the pin is stored", timeout: 30_000 }).toEqual([OWN_PIN]);
      // Pinning did not navigate: the goal is still open on the home.
      await expect(rail).toBeVisible();

      // Keyboard: the toggle is its own focus stop and Enter unpins.
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-pressed", "false", { timeout: 30_000 });
      await expect(page.locator(`[data-testid="my-space-pin"][data-ref="${OWN_PIN}"]`)).toHaveCount(0);
      await expect.poll(stored, { message: "the pin is deleted", timeout: 30_000 }).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
}

// ── N-6 · pins persist across sign-out and in a second session ──────────────

test("N-6. a pin survives sign-out and sign-in, and a second session shows it", async ({ browser }) => {
  const address = email("worker");
  const workerId = await userId(address);
  const first = await as(browser, "worker", VIEWPORTS[1]);
  let pinned: string | null = null;
  try {
    await openHome(first.page, "worker", "today-screen");
    await first.page.getByTestId("my-space-manage").click();
    const add = first.page.getByTestId("my-space-editor").getByTestId("my-space-add").first();
    pinned = await add.getAttribute("data-ref");
    expect(pinned, "the home offers something to pin").toBeTruthy();
    await add.click();
    // While managing the shortcut is an editable chip; "Done" makes it a
    // shortcut again.
    await expect(
      first.page.locator(`[data-testid="my-space-edit-item"][data-ref="${pinned}"]`),
    ).toBeVisible({ timeout: 30_000 });
    await first.page.getByTestId("my-space-manage").click();
    const chip = (page: Page) => page.locator(`[data-testid="my-space-pin"][data-ref="${pinned}"]`);
    await expect(chip(first.page)).toBeVisible({ timeout: 30_000 });

    // Sign out: the session is gone. Sign in again: the pin is still there.
    await first.page.goto(`${BASE}/en/auth/logout`);
    await first.page.goto(`${BASE}/en/dashboard`);
    await first.page.waitForURL(/\/en\/auth\/login/, { timeout: 30_000 });
    await signIn(first.page, BASE, address);
    await openHome(first.page, "worker", "today-screen");
    await expect(chip(first.page), "the pin survives sign-out and sign-in").toBeVisible({ timeout: 30_000 });

    // A second device: a fresh browser context with its own sign-in.
    const secondCtx = await browser.newContext({ viewport: VIEWPORTS[0] });
    const second = await secondCtx.newPage();
    try {
      await signIn(second, BASE, address);
      await openHome(second, "worker", "today-screen");
      await expect(chip(second), "a second session shows the same pin").toBeVisible({ timeout: 30_000 });
      // Removed there, gone here after a reload: one stored list, not two.
      await second.getByTestId("my-space-manage").click();
      await second
        .locator(`[data-testid="my-space-edit-item"][data-ref="${pinned}"]`)
        .getByTestId("my-space-remove")
        .click();
      await expect(chip(second)).toHaveCount(0);
    } finally {
      await secondCtx.close();
    }
    await openHome(first.page, "worker", "today-screen");
    await expect(chip(first.page), "the removal reached the first session").toHaveCount(0);
    expect(
      sql<{ n: number }>(`select count(*)::int as n from public.workspace_pins where profile_id = ${lit(workerId)}`)[0]?.n,
    ).toBe(0);
    // The first context signed in again: later tests use this fresh session.
    sessions.set("worker", await first.ctx.storageState());
  } finally {
    await first.ctx.close();
  }
});

// ── N-7 · every function target, opened as each role ────────────────────────

/** Every function the signed-in goals can open (`lib/navigation/home-goals.ts`). */
const FUNCTION_TARGETS: ReadonlyArray<{ fn: string; route: string }> = [
  { fn: "find work", route: "/dashboard/opportunities" },
  { fn: "record work", route: "/dashboard/journal" },
  { fn: "my CV", route: "/cv" },
  { fn: "describe a need", route: "/dashboard/company/needs" },
  { fn: "my people", route: "/dashboard/company/people" },
  { fn: "find candidates", route: "/dashboard/company/scouting" },
  { fn: "projects and teams", route: "/dashboard/projects" },
  { fn: "work and hours", route: "/dashboard/hours" },
  { fn: "your services", route: "/dashboard/services" },
  { fn: "service requests", route: "/dashboard/service-requests" },
  { fn: "market listings", route: "/dashboard/listings" },
  { fn: "proposals and contracts", route: "/dashboard/commercial" },
  { fn: "your network", route: "/dashboard/network" },
  { fn: "clients", route: "/dashboard/company/partners" },
];

/** What the home OFFERS each person, by route — the claim this test checks. */
const OFFERED: Record<Person, (route: string) => boolean> = {
  // A worker is offered nothing in the employer space.
  worker: (route) => !route.startsWith("/dashboard/company"),
  // The walk's owners signed up as organizations and hold no worker role, so
  // the worker-only job board is not offered to them.
  company: (route) => route !== "/dashboard/opportunities",
  agency: (route) => route !== "/dashboard/opportunities",
};

type Verdict = "works" | "empty" | "refused";

/**
 * Open a route and say what the person got. `refused`: the gate sent them
 * away (to the home with a notice, or anywhere that is not the route).
 * `works`: the page opened and its main area offers at least one thing to act
 * on (a button, a field or a link). `empty`: it opened and offers nothing.
 * A fresh account has no data, so "works" here means "can start", not "has
 * content".
 */
async function classify(page: Page, route: string): Promise<{ verdict: Verdict; controls: number; text: number }> {
  await page.goto(`${BASE}/en${route}`);
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  const url = new URL(page.url());
  if (url.searchParams.has("notice") || url.pathname !== `/en${route}`) {
    return { verdict: "refused", controls: 0, text: 0 };
  }
  const main = page.getByRole("main").first();
  await expect(main).toBeVisible({ timeout: 30_000 });
  const controls = await main
    .locator("button:visible, a[href]:visible, input:visible, textarea:visible, select:visible")
    .count();
  const text = ((await main.innerText().catch(() => "")) ?? "").trim().length;
  return { verdict: controls > 0 && text > 0 ? "works" : "empty", controls, text };
}

for (const person of ["worker", "company", "agency"] as const) {
  test(`N-7. ${person}: every function target opened — works, empty or refused`, async ({ browser }) => {
    const { ctx, page } = await as(browser, person, VIEWPORTS[1]);
    const rows: string[] = [];
    const wrong: string[] = [];
    try {
      if (person !== "worker") await openHome(page, person, "company-model", orgOf[person]);
      for (const { fn, route } of FUNCTION_TARGETS) {
        const got = await classify(page, route);
        const offered = OFFERED[person](route);
        rows.push(`${fn} | ${route} | ${offered ? "offered" : "not offered"} | ${got.verdict} (controls ${got.controls}, text ${got.text})`);
        // What the home offers must open; what it hides in the employer space
        // must be refused by the gate itself (a card was never the barrier).
        if (offered && got.verdict === "refused") wrong.push(`${fn}: offered but refused`);
        if (!offered && route.startsWith("/dashboard/company") && got.verdict !== "refused") {
          wrong.push(`${fn}: not offered, yet the gate let the ${person} in`);
        }
      }
    } finally {
      console.log(`[app-nav-walk] function x role — ${person}\n` + rows.map((r) => `[app-nav-walk]   ${r}`).join("\n"));
      await ctx.close();
    }
    expect(wrong, `${person}: the home's offer and the gate disagree`).toEqual([]);
  });
}

// ── N-8 · the evidence set: light and dark, 375 and 1440 ────────────────────
//
// Screenshots a person can compare with the public landing's. Synthetic
// accounts only (every name carries "QA-SYNTHETIC"), on the throwaway stack.

const SHOT_VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
] as const;

const SHOT_ROLES = [
  { person: "worker", home: "today-screen", slug: "worker", goal: "work" },
  { person: "company", home: "company-model", slug: "employer", goal: "workers" },
  { person: "company", home: "company-model", slug: "service-business", goal: "services" },
  { person: "agency", home: "company-model", slug: "agency", goal: "agencies" },
] as const;

for (const theme of ["light", "dark"] as const) {
  test(`N-8. the homes in the ${theme} theme at 375 and 1440 px: home, a function panel, the pin row, Manage`, async ({ browser }) => {
    const setTheme = (ctx: BrowserContext) =>
      // The product's own theme choice (the one shared "theme" key).
      ctx.addInitScript((t) => {
        try {
          localStorage.setItem("theme", t);
        } catch {
          /* no storage */
        }
      }, theme);
    for (const { person, home, slug, goal } of SHOT_ROLES) {
      for (const viewport of SHOT_VIEWPORTS) {
        const { ctx, page } = await as(browser, person, viewport);
        try {
          await setTheme(ctx);
          await openHome(page, person, home, orgOf[person]);
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme, { timeout: 15_000 });
          await page.screenshot({ path: path.join(SHOTS, `home-${slug}-${viewport.name}-${theme}.png`) });
          await page.getByTestId("goal-rail").locator(`[data-card-id="${goal}"]`).click();
          await expect(page.getByTestId("goal-panel")).toHaveAttribute("data-goal", goal, { timeout: 15_000 });
          await expect(page.getByTestId("function-rail")).toBeVisible();
          await page.getByTestId("goal-panel").scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(SHOTS, `panel-${slug}-${viewport.name}-${theme}.png`) });
          // Nothing scrolls the page sideways in either theme.
          const sideways = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(sideways, `${slug} ${viewport.name}px ${theme}`).toBeLessThanOrEqual(1);
        } finally {
          await ctx.close();
        }
      }
    }

    // THE PIN ROW AND MANAGE — the worker pins two functions from their cards,
    // the row is captured as shortcuts and then while managing, and the walk
    // leaves nothing pinned behind.
    const workerId = await userId(email("worker"));
    const count = () =>
      sql<{ n: number }>(`select count(*)::int as n from public.workspace_pins where profile_id = ${lit(workerId)}`)[0]?.n;
    for (const viewport of SHOT_VIEWPORTS) {
      const { ctx, page } = await as(browser, "worker", viewport);
      try {
        await setTheme(ctx);
        await openHome(page, "worker", "today-screen");
        await page.getByTestId("goal-rail").locator('[data-card-id="work"]').click();
        for (const fn of ["recordWork", "myCv"]) {
          const toggle = page.getByTestId("function-rail").locator(`[data-rail-pin="${fn}"]`);
          await expect(toggle).toBeVisible({ timeout: 30_000 });
          await toggle.click();
          await expect(toggle).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
        }
        await expect(page.getByTestId("my-space-pin")).toHaveCount(2);
        await page.getByTestId("my-space").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, `pins-worker-${viewport.name}-${theme}.png`) });
        await page.getByTestId("my-space-manage").click();
        await expect(page.getByTestId("my-space-edit-item")).toHaveCount(2);
        await page.screenshot({ path: path.join(SHOTS, `manage-worker-${viewport.name}-${theme}.png`) });
        // ✕ on each chip removes it.
        for (let left = 2; left > 0; left -= 1) {
          await page.getByTestId("my-space-edit-item").first().getByTestId("my-space-remove").click();
          await expect(page.getByTestId("my-space-edit-item")).toHaveCount(left - 1, { timeout: 30_000 });
        }
        await expect.poll(count, { timeout: 30_000 }).toBe(0);
      } finally {
        await ctx.close();
      }
    }
  });
}
