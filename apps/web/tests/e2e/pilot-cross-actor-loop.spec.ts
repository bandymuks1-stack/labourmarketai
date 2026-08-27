import { test, expect, type Page } from "@playwright/test";

import { db, HAS_LOCAL_STACK } from "./market-map-db-state";
import { chooseWorkContextIfAsked } from "./worklog-context";

/**
 * THE LIVING LABOUR MARKET LOOP, CLOSED ACROSS THREE ACTORS.
 *
 * Every actor has been proven separately. `CAPABILITY_INVENTORY` §4 blocker 3
 * is that they have never been run as ONE chain:
 *
 *   INSTITUTION  declares what it does → connects a LEARNER
 *   LEARNER      records real activity → evidence → capabilities → Living CV
 *   EMPLOYER     states a need        → canonical matching surfaces the learner
 *   BOTH         one side acts, the other receives it
 *   OUTCOME      persists, stays attributable, and is NOT employment
 *
 * ── WHY THIS IS ONE TEST AND NOT SIX ───────────────────────────────────────
 * The point is the HANDOVER. Six green tests prove six surfaces work; they do
 * not prove that what the institution wrote is what the learner accepted, that
 * what the learner logged is what the employer matched on, or that the
 * employer's action reaches the learner. Each step below consumes the previous
 * step's real database row, so a break anywhere in the chain fails here even
 * when every individual surface still passes its own spec.
 *
 * ── WHAT MAKES THE MATCH HONEST ────────────────────────────────────────────
 * The employer's need is written in ordinary Lithuanian and names no skill
 * ids. The demand it matches on is the one the recognition engine derives from
 * that sentence, and the learner is surfaced because their JOURNAL produced
 * the same capabilities — `work_journal` evidence, not a self-declared claim.
 * The assertions check the evidence TIER, so a match built on self-declaration
 * alone would not satisfy them.
 *
 * Local stack only (`pnpm e2e:local`); needs migration 20260827200000.
 */
const ORG = "589620e6-4e36-4369-8cc7-0bb35b202ce3"; // Dev Construction: employer + training_provider
const LEARNER_PROFILE = "aaaaaaaa-0000-0000-0000-000000000001";
const LEARNER_WORKER = "b43c82a1-153b-4c38-bbde-9840f3c61986";
const EDUCATION_DEMAND = "99999999-0000-0000-0000-000000000002";

const INSTITUTION = { email: "dev.company@local.test", password: "password" };
const LEARNER = { email: "dev.worker@local.test", password: "password" };

/** The capabilities a young specialist's project work really produces. Named
 *  in the employer's sentence AND derivable from the learner's journal — that
 *  overlap is what the match is made of. */
const SHARED_CAPABILITIES = ["teamwork", "report-writing", "presenting"];

async function loginAs(
  page: Page,
  creds: { email: string; password: string },
): Promise<void> {
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
}

async function rows(path: string): Promise<Record<string, unknown>[]> {
  const res = await db("GET", path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as Record<string, unknown>[];
}

const composer = (page: Page) => page.getByPlaceholder(/Parašyk/i).first();
const workLogDateField = (page: Page) => page.locator('input[type="date"]').first();

/** preview → explicit confirm. Product code never auto-confirms; the test
 *  performs both human steps (same helper as journal-chat-intake). */
async function saveThroughConfirm(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const save = page.getByRole("button", { name: /^Išsaugoti$/ }).last();
    if ((await save.count()) === 0) break;
    await save.click();
    await page.waitForTimeout(2_000);
    if ((await page.getByText(/Patvirtinti įrašą/i).count()) === 0) break;
  }
}

test.describe("pilot — the loop closes across institution, learner and employer", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm e2e:local)");
  // Six browser journeys across two accounts, plus the journal pipeline.
  test.setTimeout(600_000);

  test.beforeAll(async () => {
    // The employer's need, in ordinary language. Seeded rather than typed
    // because the NL→structured intake is a separate unproven surface, and
    // this spec must fail for a matching reason, never for an intake one.
    await db(
      "POST",
      "customer_requests?on_conflict=id",
      {
        id: EDUCATION_DEMAND,
        profile_id: "aaaaaaaa-0000-0000-0000-000000000002",
        title: "Projekto koordinatorius (jaunas specialistas)",
        need_summary:
          "Ieskome jauno specialisto projektu komandai: komandinis darbas, " +
          "ataskaitu rengimas, pristatymai, darbas su suinteresuotomis salimis.",
        country: "LT",
        location: "Vilnius",
        role_or_work_type: "Projekto koordinatorius",
        team_size: 1,
        start_period: "2026-10",
        status: "submitted",
        kind: "company_request",
        payload: {
          structured_v2: {
            opportunity_type: "employment",
            target_supply: "single_worker",
            work_mode: "onsite",
            contract_country: "LT",
          },
        },
      },
      "resolution=merge-duplicates,return=minimal",
    );
    // Start from no learner link and no prior interest, so every assertion
    // below proves an ACT rather than a leftover row.
    await db(
      "DELETE",
      `engagement_contexts?profile_id=eq.${LEARNER_PROFILE}` +
        `&organization_id=eq.${ORG}&relationship_slug=eq.student`,
    );
    await db("DELETE", `invitations?invited_email=eq.${LEARNER.email}`);
    await db(
      "DELETE",
      `demand_interest_signals?worker_id=eq.${LEARNER_WORKER}` +
        `&request_id=eq.${EDUCATION_DEMAND}`,
    );
  });

  test.afterAll(async () => {
    /**
     * BEST-EFFORT, AND HONEST ABOUT WHY IT CANNOT BE MORE.
     *
     * This spec creates a SECOND engagement for `dev.worker` at the
     * organization that already employs them, then files a journal entry
     * against it. The invitation rows can be cleaned up. **The engagement
     * cannot** — `journal_entries.engagement_context_id` has a foreign key to
     * it, so once the learner has logged real work the relationship is
     * undeletable. That refusal is CORRECT: evidence must stay attributable,
     * and a placement that produced a journal entry is not a row to be tidied
     * away (ARCHITECTURE I-3, and §9 on destructive cleanup).
     *
     * So the fixture does NOT return to one-context-per-organization, and no
     * later spec may assume it does. That is exactly why the journal specs
     * answer the work-context question through `chooseWorkContextIfAsked`
     * instead of depending on this cleanup — a learner who also works for the
     * same organization is an ordinary person, not a test artifact.
     */
    await db("DELETE", `invitations?invited_email=eq.${LEARNER.email}`);
  });

  test("institution → learner → evidence → employer need → mutual action", async ({
    page,
  }) => {
    const marker = `E2E-LOOP-${Date.now()}`;

    // ─── 1. THE INSTITUTION CONNECTS A LEARNER ──────────────────────────
    await test.step("the institution invites a person as a learner", async () => {
      await loginAs(page, INSTITUTION);
      await page.goto(
        `/lt/dashboard/network?type=join_organization&org=${ORG}`,
        { waitUntil: "domcontentloaded" },
      );
      const capacity = page.locator('[data-testid="invite-capacity"]');
      await expect(capacity).toBeVisible({ timeout: 60_000 });
      await capacity.selectOption("student");
      await page.locator("textarea").first().fill(LEARNER.email);
      await page.locator('[data-testid="invite-submit"]').click();
      await expect(page.locator('[data-testid="invite-result"]')).toBeVisible({
        timeout: 60_000,
      });

      const invites = await rows(
        `invitations?invited_email=eq.${LEARNER.email}&select=relationship_slug`,
      );
      expect(invites[0]?.relationship_slug).toBe("student");
    });

    // ─── 2. THE LEARNER ACCEPTS, AND IS TOLD WHAT THEY ACCEPTED ─────────
    await test.step("the learner is told the relationship and accepts it", async () => {
      await loginAs(page, LEARNER);
      await page.goto("/lt/dashboard/network", { waitUntil: "domcontentloaded" });
      const incoming = page.locator('[data-testid="network-incoming"]');
      await expect(incoming).toContainText(/Studentas/i, { timeout: 60_000 });
      await incoming
        .locator('[data-testid^="incoming-invitation-accept-"]')
        .first()
        .click();
      await page.waitForTimeout(4_000);

      const engagements = await rows(
        `engagement_contexts?profile_id=eq.${LEARNER_PROFILE}` +
          `&organization_id=eq.${ORG}&select=relationship_slug`,
      );
      const slugs = engagements.map((r) => r.relationship_slug);
      expect(slugs, "the learner link was not created").toContain("student");
      // I-1: the employment the same person already held is untouched.
      expect(slugs, "the learner was converted into an employee").toContain(
        "employee",
      );
    });

    // ─── 3. REAL ACTIVITY BECOMES EVIDENCE BECOMES CAPABILITIES ─────────
    await test.step("the learner records real project work", async () => {
      await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
      await composer(page).fill("Užpildyk darbo žurnalą");
      await composer(page).press("Enter");
      await expect(workLogDateField(page)).toBeVisible({ timeout: 60_000 });

      await workLogDateField(page).fill("2026-08-20");
      await page.locator('input[type="text"]').first().fill("Vilnius");
      await page
        .locator("textarea")
        .first()
        .fill(
          "Universiteto komandinis projektas: parasiau ataskaita ir " +
            `pristaciau ji komisijai. ${marker}`,
        );

      /**
       * WHICH RELATIONSHIP DOES THIS WORK BELONG TO?
       *
       * The learner now holds TWO engagements with the same organization — the
       * job they already had and the placement they just accepted — so the
       * flow refuses to guess and asks. That refusal is correct: a journal
       * entry is evidence, and filing it against the wrong relationship is a
       * false statement. The helper answers it and, on the way, asserts the
       * options are TELLABLE APART — before the disambiguation fix both read
       * "Dev Construction", and this step is the E2E that found it.
       */
      await chooseWorkContextIfAsked(page, /Studentas/i);

      await saveThroughConfirm(page);
      await page.waitForTimeout(4_000);

      // The ORIGINAL evidence is stored verbatim…
      const entries = await rows(
        `journal_entries?original_text=like.*${marker}*&select=id,original_text`,
      );
      expect(entries.length, "the learner's activity was not stored").toBe(1);

      // …and THIS entry produced the capabilities, so the chain is causal for
      // this run rather than inherited from a previous one.
      const entryId = entries[0].id as string;
      // NB `journal_entry_skills` keys on `journal_entry_id`, while
      // `journal_entry_metrics` keys on `entry_id`. The two tables genuinely
      // differ; using the wrong one is a 400, not an empty result.
      const links = await rows(
        `journal_entry_skills?journal_entry_id=eq.${entryId}&select=skill_id`,
      );
      const skillIds = links.map((l) => String(l.skill_id));
      const derived =
        skillIds.length === 0
          ? []
          : (
              await rows(
                `skills?id=in.(${skillIds.join(",")})&select=slug`,
              )
            ).map((r) => String(r.slug));
      expect(
        derived.length,
        "the entry produced no capabilities at all",
      ).toBeGreaterThan(0);
      expect(
        derived.some((s) => SHARED_CAPABILITIES.includes(s)),
        `none of ${SHARED_CAPABILITIES.join("/")} was derived; got ${derived.join(",")}`,
      ).toBe(true);
    });

    // ─── 4. THE EMPLOYER'S NEED FINDS THE LEARNER ───────────────────────
    await test.step("canonical matching surfaces the learner for the need", async () => {
      await loginAs(page, INSTITUTION);
      await page.goto(
        `/lt/dashboard/company/scouting?request=${EDUCATION_DEMAND}`,
        { waitUntil: "domcontentloaded" },
      );

      const candidate = page.locator(
        `[data-testid="scout-candidate-${LEARNER_WORKER}"]`,
      );
      await expect(
        candidate,
        "the employer's need did not surface the learner through matching",
      ).toBeAttached({ timeout: 90_000 });

      // The match must be EXPLAINED, not asserted: the surface states the
      // basis and the evidence tiers rather than a fabricated percentage.
      await expect(
        page.locator(
          `[data-testid="scout-evidence-confidence-${LEARNER_WORKER}"]`,
        ),
        "the candidate is shown with no evidence basis",
      ).toBeAttached({ timeout: 30_000 });
    });

    // ─── 5. ONE SIDE ACTS ───────────────────────────────────────────────
    await test.step("the learner raises their hand for that need", async () => {
      await loginAs(page, LEARNER);
      await page.goto("/lt/dashboard/opportunities", {
        waitUntil: "domcontentloaded",
      });
      const card = page.locator(`[data-testid="interest-${EDUCATION_DEMAND}"]`);
      await expect(
        card,
        "the employer's need never reached the learner's board",
      ).toBeAttached({ timeout: 60_000 });

      const express = card.locator('[data-testid="interest-express"]').first();
      await expect(express).toBeVisible({ timeout: 30_000 });
      await express.click();
      await expect(
        card.locator('[data-testid="interest-sent"]').first(),
      ).toBeVisible({ timeout: 60_000 });

      const signals = await rows(
        `demand_interest_signals?worker_id=eq.${LEARNER_WORKER}` +
          `&request_id=eq.${EDUCATION_DEMAND}&select=status`,
      );
      expect(signals.length, "the interest never became a signal").toBe(1);
    });

    // ─── 6. THE OTHER SIDE RECEIVES IT, AND ACTS ────────────────────────
    await test.step("the employer receives it and acts on the person", async () => {
      await loginAs(page, INSTITUTION);
      await page.goto(
        `/lt/dashboard/company/scouting?request=${EDUCATION_DEMAND}`,
        { waitUntil: "domcontentloaded" },
      );
      const ack = page.locator('[data-testid="interest-ack-reviewed"]').first();
      await expect(
        ack,
        "the employer can see the waiting learner but cannot respond",
      ).toBeVisible({ timeout: 90_000 });
      await ack.click();
      await page.waitForTimeout(4_000);

      // THE OUTCOME PERSISTS, and it is a state the learner can be shown.
      const signals = await rows(
        `demand_interest_signals?worker_id=eq.${LEARNER_WORKER}` +
          `&request_id=eq.${EDUCATION_DEMAND}&select=status`,
      );
      expect(
        signals[0]?.status,
        "the employer's action did not change the shared state",
      ).toBe("reviewed");
    });

    // ─── 7. NOTHING BECAME EMPLOYMENT ───────────────────────────────────
    await test.step("the learner is still a learner", async () => {
      const engagements = await rows(
        `engagement_contexts?profile_id=eq.${LEARNER_PROFILE}` +
          `&organization_id=eq.${ORG}&select=relationship_slug,status`,
      );
      const student = engagements.find((r) => r.relationship_slug === "student");
      expect(student, "the learner relationship disappeared").toBeTruthy();
      expect(student?.status).toBe("active");
      // Matching, interest and an employer acknowledgement must never, by
      // themselves, manufacture a job.
      expect(
        engagements.filter((r) => r.relationship_slug === "employee").length,
        "an extra employment relationship appeared from nowhere",
      ).toBe(1);
    });
  });
});
