import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { db, dbOk, HAS_LOCAL_STACK } from "./market-map-db-state";

/**
 * Register 2.24 — a dispute is opened, reviewed and decided, and a reply is
 * published, end to end in a real browser, on the LOCAL stack only.
 *
 * Three synthetic fixture accounts, no real person:
 *   - dev.worker  — the SUBJECT: opens the dispute, writes the reply;
 *   - dev.agency  — the AUTHOR of the experience (independent of the admin);
 *   - dev.company — the platform ADMINISTRATOR, granted out of band exactly
 *     as in w6-experience-moderation-admin.spec.ts and removed in afterAll.
 *
 * What it walks (owner rules of 2026-11-13):
 *   1. the subject disputes a published record; it stays visible and marked;
 *   2. the admin sees the reason and the dispute's date and age, takes it into
 *      review, is offered ONLY "upheld" and "removed" (never "changed");
 *   3. both parties read the decision and its reason;
 *   4. the subject's reply reaches a moderator queue and is published;
 *   5. on a record the admin WROTE, the admin gets no control at all.
 *
 * Gated behind W6_ADMIN_PROOF=1 (it grants a role in the local database).
 */
const WORKER_STATE = join(__dirname, ".storage-state.worker.json");
const COMPANY_STATE = join(__dirname, ".storage-state.company.json");
const AGENCY_STATE = join(__dirname, ".storage-state.agency.json");
const HAS_SESSIONS = [WORKER_STATE, COMPANY_STATE, AGENCY_STATE].every((f) => existsSync(f));

test.skip(
  !HAS_SESSIONS || !HAS_LOCAL_STACK || process.env.W6_ADMIN_PROOF !== "1",
  "dispute walk only: set W6_ADMIN_PROOF=1 with the local stack up and three sessions minted",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const EXPERIENCES = "/lt/dashboard?result=experiences";
const ADMIN = "/lt/dashboard/admin";
const MARK = "E2E-2.24:";
const REASON = `${MARK} taip nebuvo, darbas priimtas be pastabų.`;
const DECISION = `${MARK} patikrinta, įrašas nepagrįstas.`;
const REPLY = `${MARK} mano paaiškinimas.`;

let worker = "";
let company = "";
let agency = "";
let independentId = "";
let ownId = "";

async function profileId(email: string): Promise<string> {
  const rows = (await (await dbOk("GET", `profiles?email=eq.${email}&select=id`)).json()) as {
    id: string;
  }[];
  if (!rows[0]) throw new Error(`fixture profile missing: ${email}`);
  return rows[0].id;
}

/** Below `lg` the workspace result sits in a collapsed sheet; open it. */
async function openPanelFold(page: Page): Promise<void> {
  const toggle = page.getByTestId("context-panel-toggle");
  await toggle.waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await toggle.count()) === 0) return;
    if ((await toggle.getAttribute("aria-expanded")) !== "false") return;
    await toggle.click();
    await page.waitForTimeout(500);
  }
}

async function cleanup(): Promise<void> {
  if (!worker) return;
  const ids = (await (
    await dbOk("GET", `experience_records?subject_profile_id=eq.${worker}&body=like.${MARK}*&select=id`)
  ).json()) as { id: string }[];
  for (const { id } of ids) {
    await db("DELETE", `experience_responses?experience_record_id=eq.${id}`);
  }
  await db("DELETE", `experience_records?subject_profile_id=eq.${worker}&body=like.${MARK}*`);
}

test.beforeAll(async () => {
  worker = await profileId("dev.worker@local.test");
  company = await profileId("dev.company@local.test");
  agency = await profileId("dev.agency@local.test");
  await cleanup();
  const published = {
    subject_type: "worker",
    subject_profile_id: worker,
    interaction_kind: "accepted_booking",
    sentiment: "negative",
    moderation_status: "published",
    published_at: new Date(0).toISOString(),
    moderation_reason: "e2e seed",
  };
  const rows = (await (
    await dbOk("POST", "experience_records", [
      {
        ...published,
        author_profile_id: agency,
        interaction_id: "aaaaaaaa-0000-0000-0000-0000000e2401",
        body: `${MARK} nepriklausomo autoriaus įrašas.`,
        dispute_status: "none",
        dispute_reason: null,
      },
      {
        // Written by the account that will act as administrator: a party.
        ...published,
        author_profile_id: company,
        interaction_id: "aaaaaaaa-0000-0000-0000-0000000e2402",
        body: `${MARK} administratoriaus paties parašytas įrašas.`,
        dispute_status: "opened",
        dispute_reason: `${MARK} ginčas dėl administratoriaus įrašo.`,
      },
    ])
  ).json()) as { id: string }[];
  independentId = rows[0]?.id ?? "";
  ownId = rows[1]?.id ?? "";
  await dbOk("POST", "profile_roles", [{ profile_id: company, role: "admin" }]);
});

test.afterAll(async () => {
  if (company) await db("DELETE", `profile_roles?profile_id=eq.${company}&role=eq.admin`);
  await cleanup();
});

test.describe("1 — the subject disputes and replies", () => {
  test.use({ storageState: HAS_SESSIONS ? WORKER_STATE : undefined });

  test("opens a dispute with a reason; the record stays visible and marked", async ({ page }) => {
    await page.goto(EXPERIENCES);
    await openPanelFold(page);
    const card = page.locator(`[data-testid="experience-about-me-item"]`).filter({
      hasText: "nepriklausomo autoriaus",
    });
    await expect(card).toBeVisible({ timeout: 90_000 });
    await expect(card).toHaveAttribute("data-dispute", "none");

    await card.getByTestId("experience-dispute").locator("summary").click();
    await card.getByTestId("experience-dispute-reason").fill(REASON);
    await card.getByTestId("experience-dispute-submit").click();
    await expect(page.getByTestId("experience-dispute-opened")).toBeVisible({ timeout: 60_000 });

    await page.goto(EXPERIENCES);
    await openPanelFold(page);
    const after = page.locator(`[data-testid="experience-about-me-item"]`).filter({
      hasText: "nepriklausomo autoriaus",
    });
    await expect(after).toBeVisible({ timeout: 90_000 });
    await expect(after).toHaveAttribute("data-dispute", "opened");
    await expect(after).toHaveAttribute("data-moderation", "published");
    await expect(after.getByTestId("experience-dispute-marker")).toBeVisible();
  });

  test("writes a reply; it waits for moderation", async ({ page }) => {
    await page.goto(EXPERIENCES);
    await openPanelFold(page);
    const card = page.locator(`[data-testid="experience-about-me-item"]`).filter({
      hasText: "nepriklausomo autoriaus",
    });
    await expect(card).toBeVisible({ timeout: 90_000 });
    await card.locator(`details[data-testid="experience-response"] summary`).click();
    await card.getByTestId("experience-response-body").fill(REPLY);
    await card.getByTestId("experience-response-submit").click();
    await expect(page.getByTestId("experience-response-submitted")).toBeVisible({ timeout: 60_000 });
  });
});

test.describe("2 — the author cannot read an unpublished reply", () => {
  test.use({ storageState: HAS_SESSIONS ? AGENCY_STATE : undefined });

  test("sees the dispute marker, not the reply", async ({ page }) => {
    await page.goto(EXPERIENCES);
    await openPanelFold(page);
    const mine = page.getByTestId("experiences-mine");
    await expect(mine).toBeVisible({ timeout: 90_000 });
    const card = mine.locator(`[data-dispute="opened"]`).filter({ hasText: "nepriklausomo autoriaus" });
    await expect(card).toBeVisible();
    await expect(card.getByText(REPLY)).toHaveCount(0);
  });
});

test.describe("3 — the administrator reviews, decides and moderates", () => {
  test.use({ storageState: HAS_SESSIONS ? COMPANY_STATE : undefined });

  test("a record the administrator wrote offers no control", async ({ page }) => {
    await page.goto(ADMIN);
    const own = page.locator(`[data-testid="experience-dispute-item"][data-experience-id="${ownId}"]`);
    await expect(own).toBeVisible({ timeout: 90_000 });
    await expect(own.getByTestId("experience-dispute-conflict")).toBeVisible();
    await expect(own.getByTestId("experience-dispute-start-review")).toHaveCount(0);
    await expect(own.locator(`[data-testid^="experience-dispute-resolve-"]`)).toHaveCount(0);
  });

  test("sees the reason and the age, reviews, and decides with a reason", async ({ page }) => {
    await page.goto(ADMIN);
    const item = page.locator(
      `[data-testid="experience-dispute-item"][data-experience-id="${independentId}"]`,
    );
    await expect(item).toBeVisible({ timeout: 90_000 });
    await expect(item).toHaveAttribute("data-dispute", "opened");
    await expect(item.getByTestId("experience-dispute-reason")).toContainText(REASON);
    await expect(item.getByTestId("experience-dispute-age")).toBeVisible();
    await expect(item.getByTestId("experience-dispute-age").locator("time")).toHaveAttribute(
      "datetime",
      /^\d{4}-\d{2}-\d{2}T/,
    );
    // No decision is possible before the review step.
    await expect(item.locator(`[data-testid^="experience-dispute-resolve-"]`)).toHaveCount(0);

    await item.getByTestId("experience-dispute-start-review").click();
    await expect(item).toHaveAttribute("data-dispute", "under_review", { timeout: 60_000 });

    // Exactly two outcomes. "changed" is not offered.
    await expect(item.getByTestId("experience-dispute-resolve-upheld")).toBeVisible();
    await expect(item.getByTestId("experience-dispute-resolve-removed")).toBeVisible();
    await expect(item.getByTestId("experience-dispute-resolve-changed")).toHaveCount(0);

    await item.getByTestId("experience-dispute-resolve-reason").fill(DECISION);
    await item.getByTestId("experience-dispute-resolve-removed").click();
    // A decided dispute leaves the queue on the next render, so the proof is
    // the stored state, then the queue no longer listing it.
    await expect
      .poll(
        async () =>
          (
            (await (
              await dbOk("GET", `experience_records?id=eq.${independentId}&select=dispute_status`)
            ).json()) as { dispute_status: string }[]
          )[0]?.dispute_status,
        { timeout: 60_000 },
      )
      .toBe("resolved_removed");
    await page.goto(ADMIN);
    await expect(page.getByTestId("experience-dispute-queue")).toBeVisible({ timeout: 90_000 });
    await expect(item).toHaveCount(0);

    const rows = (await (
      await dbOk(
        "GET",
        `experience_records?id=eq.${independentId}&select=dispute_status,dispute_resolution_reason,moderation_status,body`,
      )
    ).json()) as Record<string, string>[];
    expect(rows[0]?.dispute_status).toBe("resolved_removed");
    expect(rows[0]?.dispute_resolution_reason).toBe(DECISION);
    // The decision rewrote nothing.
    expect(rows[0]?.moderation_status).toBe("published");
    expect(rows[0]?.body).toContain("nepriklausomo autoriaus");
  });

  test("the audit trail holds every step with its actor", async () => {
    const rows = (await (
      await dbOk(
        "GET",
        `audit_logs?entity_id=eq.${independentId}&select=action,actor_id&order=occurred_at.asc`,
      )
    ).json()) as { action: string; actor_id: string }[];
    expect(rows.map((r) => r.action)).toEqual([
      "dispute_opened",
      "dispute_review_started",
      "dispute_resolved",
    ]);
    expect(rows[0]?.actor_id).toBe(worker);
    expect(rows[1]?.actor_id).toBe(company);
    expect(rows[2]?.actor_id).toBe(company);
  });

  test("publishes the subject's reply from the reply queue", async ({ page }) => {
    await page.goto(ADMIN);
    const queue = page.getByTestId("experience-response-queue");
    await expect(queue).toBeVisible({ timeout: 90_000 });
    const item = queue.getByTestId("experience-response-moderation-item").filter({ hasText: REPLY });
    await expect(item).toBeVisible();
    await item.getByTestId("experience-response-moderation-reason").fill(`${MARK} atitinka taisykles.`);
    await item.getByTestId("experience-response-moderation-publish").click();
    await expect
      .poll(
        async () =>
          (
            (await (
              await dbOk(
                "GET",
                `experience_responses?experience_record_id=eq.${independentId}&select=moderation_status`,
              )
            ).json()) as { moderation_status: string }[]
          )[0]?.moderation_status,
        { timeout: 60_000 },
      )
      .toBe("published");
  });
});

test.describe("4 — both parties read the decision and its reason", () => {
  test.describe("the subject", () => {
    test.use({ storageState: HAS_SESSIONS ? WORKER_STATE : undefined });
    test("reads the outcome and why", async ({ page }) => {
      await page.goto(EXPERIENCES);
      await openPanelFold(page);
      const card = page.locator(`[data-testid="experience-about-me-item"]`).filter({
        hasText: "nepriklausomo autoriaus",
      });
      await expect(card).toBeVisible({ timeout: 90_000 });
      await expect(card).toHaveAttribute("data-dispute", "resolved_removed");
      await expect(card.getByTestId("experience-dispute-decision")).toContainText(DECISION);
    });
  });

  test.describe("the author", () => {
    test.use({ storageState: HAS_SESSIONS ? AGENCY_STATE : undefined });
    test("reads the outcome, why, and the now-published reply", async ({ page }) => {
      await page.goto(EXPERIENCES);
      await openPanelFold(page);
      const mine = page.getByTestId("experiences-mine");
      await expect(mine).toBeVisible({ timeout: 90_000 });
      const card = mine
        .locator(`[data-dispute="resolved_removed"]`)
        .filter({ hasText: "nepriklausomo autoriaus" });
      await expect(card).toBeVisible();
      await expect(card.getByTestId("experience-dispute-decision")).toContainText(DECISION);
      await expect(card.getByText(REPLY)).toBeVisible();
    });
  });
});
