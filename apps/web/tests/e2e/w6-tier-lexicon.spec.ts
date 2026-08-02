import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { dbOk, HAS_LOCAL_STACK } from "./market-map-db-state";

/**
 * W6 slice 1 — trust presentation truth (browser proof).
 *
 * 1. The SAME tier fact wears the SAME words on every surface (LT canon:
 *    "Patvirtinta vadovo įrašu"); the manager-verified count is no longer
 *    called "Susieti įgūdžiai" (Linked skills).
 * 2. The confidence-bin dots carry a legend (evidence assurance, not a person
 *    reputation); no numeric confidence renders anywhere.
 * 3. An auto-confirmed row is visibly qualified on the CV proof table and the
 *    decision timeline — automatic never looks identical to hand-confirmed.
 * 4. Desktop + 375px; no stars, no total score.
 *
 * DB state pinned via the service-role local helper (#958 method); seeded
 * rows are removed in afterAll.
 */
const WORKER_STATE = join(__dirname, ".storage-state.worker.json");
const COMPANY_STATE = join(__dirname, ".storage-state.company.json");
const HAS_SESSIONS = existsSync(WORKER_STATE) && existsSync(COMPANY_STATE);

const LT_MC = "Patvirtinta vadovo įrašu";
const LT_COUNT = "Vadovo patvirtinti įgūdžiai";
const LT_AUTO = "patvirtinta pagal iš anksto nustatytą taisyklę";

test.skip(
  !HAS_SESSIONS || !HAS_LOCAL_STACK,
  "needs the local stack + minted worker AND company sessions",
);

test.setTimeout(120_000);

/** Open every collapsed <details> so collapsed-by-default sections (older
 *  journal days, profile sub-sections) can be asserted the way a user sees
 *  them after one tap. */
async function openAllDetails(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("details:not([open])").forEach((d) => {
      (d as HTMLDetailsElement).open = true;
    });
  });
}


let workerId = "";
let skillId = "";
let createdWorkerSkill = false;
let confirmationId = "";

test.beforeAll(async () => {
  const w = (await (
    await dbOk(
      "GET",
      "workers?profile_id=eq.aaaaaaaa-0000-0000-0000-000000000001&select=id",
    )
  ).json()) as { id: string }[];
  if (!w[0]) throw new Error("fixture worker missing — run pnpm db:fixtures:local");
  workerId = w[0].id;

  // A linked skill (the drilldown-spec pattern): declare it verified so the
  // manager-record wording has a real row behind it, bin green for the dots.
  const link = (await (
    await dbOk(
      "GET",
      `journal_entry_skills?worker_id=eq.${workerId}&select=skill_id,journal_entry_id&limit=1`,
    )
  ).json()) as { skill_id: string; journal_entry_id: string }[];
  if (!link[0]) throw new Error("fixture journal skill links missing");
  skillId = link[0].skill_id;

  const existing = (await (
    await dbOk(
      "GET",
      `worker_skills?worker_id=eq.${workerId}&skill_id=eq.${skillId}&select=skill_id`,
    )
  ).json()) as unknown[];
  if (existing.length === 0) {
    await dbOk("POST", "worker_skills", {
      worker_id: workerId,
      skill_id: skillId,
      source: "manager_confirmed",
      verified: true,
      confidence_bin: "green",
      confidence_score: 10,
    });
    createdWorkerSkill = true;
  } else {
    await dbOk(
      "PATCH",
      `worker_skills?worker_id=eq.${workerId}&skill_id=eq.${skillId}`,
      { source: "manager_confirmed", verified: true, confidence_bin: "green" },
    );
  }

  // Seed ONE auto-confirm evidence row on a live fixture entry: resolve the
  // entry's org, then a manager/owner engagement in that org to satisfy the
  // NOT NULL FK + role CHECK (service role bypasses RLS, not constraints).
  const entries = (await (
    await dbOk(
      "GET",
      `journal_entries?worker_id=eq.${workerId}&deleted_at=is.null&superseded_by=is.null&select=id,engagement_context_id&limit=20`,
    )
  ).json()) as { id: string; engagement_context_id: string }[];
  if (entries.length === 0) throw new Error("no live fixture entry");
  // Personal engagements carry no organization — find an ORG-scoped entry.
  let entry: { id: string } | null = null;
  let orgId: string | null = null;
  for (const e of entries) {
    const ec = (await (
      await dbOk(
        "GET",
        `engagement_contexts?id=eq.${e.engagement_context_id}&select=organization_id`,
      )
    ).json()) as { organization_id: string | null }[];
    if (ec[0]?.organization_id) {
      entry = e;
      orgId = ec[0].organization_id;
      break;
    }
  }
  if (!entry || !orgId) throw new Error("no org-scoped fixture entry");
  const mgr = (await (
    await dbOk(
      "GET",
      `engagement_contexts?organization_id=eq.${orgId}&status=eq.active&relationship_slug=in.(manager,owner,external_manager)&select=id,profile_id,relationship_slug&limit=1`,
    )
  ).json()) as { id: string; profile_id: string; relationship_slug: string }[];
  if (!mgr[0]) throw new Error("no manager engagement in the entry's org");
  const ins = (await (
    await dbOk(
      "POST",
      "journal_entry_confirmations",
      {
        entry_id: entry.id,
        confirmer_id: mgr[0].profile_id,
        confirmer_engagement_context_id: mgr[0].id,
        confirmer_role: mgr[0].relationship_slug,
        confirmation_scope: {
          action: "auto_confirm",
          decision: "approved",
          policy_id: "w6-slice1-e2e",
          skills_confirmed: [],
        },
      },
      "return=representation",
    )
  ).json()) as { id: string }[];
  confirmationId = ins[0]?.id ?? "";
});

test.afterAll(async () => {
  if (confirmationId) {
    await dbOk("DELETE", `journal_entry_confirmations?id=eq.${confirmationId}`);
  }
  if (createdWorkerSkill && workerId && skillId) {
    await dbOk(
      "DELETE",
      `worker_skills?worker_id=eq.${workerId}&skill_id=eq.${skillId}`,
    );
  }
});

test.describe("worker self view", () => {
  test.use({ storageState: WORKER_STATE });

  test("profile: canonical count label + bin legend, no score, desktop", async ({ page }) => {
    await page.goto("/lt/dashboard/profile");
    const trust = page.getByTestId("trust-block").or(page.locator("text=" + LT_COUNT).first());
    await expect(page.locator(`text=${LT_COUNT}`).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("text=Susieti įgūdžiai")).toHaveCount(0);
    void trust;
    // The dots' legend (evidence assurance) — renders when skill dots exist
    // (inside a collapsed-by-default section: one tap opens it).
    await expect(page.getByTestId("confidence-bin-legend").first()).toBeAttached({
      timeout: 60_000,
    });
    await openAllDetails(page);
    await expect(page.getByTestId("confidence-bin-legend").first()).toBeVisible();
    // No numeric confidence anywhere on the page.
    await expect(page.locator("text=/confidence[_ ]?score/i")).toHaveCount(0);
  });

  test("CV: canonical tier heading + auto-confirm qualifier on the proof row", async ({ page }) => {
    await page.goto("/lt/cv");
    await expect(page.locator(`text=${LT_MC}`).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("text=Su įrašais")).toHaveCount(0);
    await expect(
      page.getByTestId("cv-proof-auto-confirm-qualifier").first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByTestId("cv-proof-auto-confirm-qualifier").first(),
    ).toContainText(LT_AUTO);
  });

  test("journal timeline shows the automatic qualifier, mobile 375px clean", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/lt/dashboard/journal");
    await expect(
      page.getByTestId("timeline-auto-confirm-qualifier").first(),
    ).toBeAttached({ timeout: 60_000 });
    await openAllDetails(page);
    await expect(
      page.getByTestId("timeline-auto-confirm-qualifier").first(),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("mobile 375px: profile legend fits without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/lt/dashboard/profile");
    await expect(page.getByTestId("confidence-bin-legend").first()).toBeAttached({
      timeout: 60_000,
    });
    await openAllDetails(page);
    await expect(page.getByTestId("confidence-bin-legend").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("employer view", () => {
  test.use({ storageState: COMPANY_STATE });

  test("person page: the SAME canonical tier wording as the worker's own surfaces", async ({ page }) => {
    await page.goto(`/lt/dashboard/people/${workerId}`);
    await expect(page.getByTestId("person-page")).toBeVisible({ timeout: 60_000 });
    // The verified chip uses the canonical wording — not "With manager record".
    await expect(page.locator(`text=${LT_MC}`).first()).toBeVisible({ timeout: 60_000 });
    // No stars, no total score, no numeric confidence for the employer.
    await expect(page.locator("text=/★|⭐/")).toHaveCount(0);
    await expect(page.locator("text=/confidence/i")).toHaveCount(0);
  });
});
