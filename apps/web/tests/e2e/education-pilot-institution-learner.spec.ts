import { test, expect, type Page } from "@playwright/test";

import { db, HAS_LOCAL_STACK } from "./market-map-db-state";

/**
 * EDUCATION PILOT — an institution connects a LEARNER, and the learner stays a
 * learner.
 *
 * This is `docs/CAPABILITY_INVENTORY.md` §4 blocker 1, walked end to end:
 *
 *   "Institution ↔ learner link is MISSING. An institution can now declare
 *    what it is, and still cannot connect a student. No invite/join flow
 *    exists."
 *
 * The chain, across TWO real accounts and a real database:
 *
 *   institution (holds `training_provider`)
 *     → invites a person AS A LEARNER, in plain language
 *     → the invitation stores `student`, not `employee`
 *   learner
 *     → is TOLD which relationship they are accepting, before accepting
 *     → accepts
 *     → an engagement exists with relationship `student`
 *     → and the employment they ALREADY had is still there, untouched
 *
 * ── WHY THE LAST LINE IS THE POINT ─────────────────────────────────────────
 * `dev.worker` is deliberately already an EMPLOYEE of the same organization.
 * A learner link that quietly replaced, upgraded or duplicated that employment
 * would break invariant I-1 (one person, many contexts, held simultaneously).
 * The fixture makes the two relationships collide on purpose, so "multi-role
 * survives" is proven rather than assumed.
 *
 * ── AND WHY THE NEGATIVE CONTROL IS NOT OPTIONAL ───────────────────────────
 * Calling a person your student is a claim about what your organization DOES.
 * An organization that never declared it provides education must not be able
 * to make it — otherwise the capability declaration is decoration. The second
 * test drives an organization with NO declared capability and asserts the
 * screen says so, which is also what proves the first test's success was not
 * simply "everything is allowed".
 *
 * Local stack only (`pnpm e2e:local`), and it needs migration 20260827200000.
 */
const ORG_WITH_EDUCATION = "589620e6-4e36-4369-8cc7-0bb35b202ce3"; // Dev Construction
const ORG_WITHOUT_EDUCATION = "80472197-1c36-431b-9f78-04c0c1ed6966"; // Dev Staffing UAB

const INSTITUTION = { email: "dev.company@local.test", password: "password" };
const AGENCY = { email: "dev.agency@local.test", password: "password" };
const LEARNER = { email: "dev.worker@local.test", password: "password" };
const LEARNER_PROFILE = "aaaaaaaa-0000-0000-0000-000000000001";

async function loginAs(
  page: Page,
  creds: { email: string; password: string },
): Promise<void> {
  await page.goto("/lt/auth/logout").catch(() => {});
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

test.describe("education pilot — an institution connects a learner", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm e2e:local)");

  test.beforeEach(async () => {
    // Start from no learner link, whatever an earlier run left behind, so what
    // passes below is the ACT and never a leftover row. The employment
    // engagement is deliberately NOT touched — it is the thing that must
    // survive, so the test must not be the one that created it.
    await db(
      "DELETE",
      `engagement_contexts?profile_id=eq.${LEARNER_PROFILE}` +
        `&organization_id=eq.${ORG_WITH_EDUCATION}&relationship_slug=eq.student`,
    );
    await db("DELETE", `invitations?invited_email=eq.${LEARNER.email}`);
  });

  test.afterAll(async () => {
    // Remove ONLY what these tests created. The learner link changes the
    // work-log context fixture for every later spec (two contexts at one
    // organization make the form ask which), so this spec puts it back rather
    // than leaving the next failure to be diagnosed from scratch.
    await db(
      "DELETE",
      `engagement_contexts?profile_id=eq.${LEARNER_PROFILE}` +
        `&organization_id=eq.${ORG_WITH_EDUCATION}&relationship_slug=eq.student`,
    );
    await db("DELETE", `invitations?invited_email=eq.${LEARNER.email}`);
  });

  test("the learner is invited as a learner, told so, and stays an employee too", async ({
    page,
  }) => {
    // ── The employment that must survive ──────────────────────────────────
    const before = await rows(
      `engagement_contexts?profile_id=eq.${LEARNER_PROFILE}` +
        `&organization_id=eq.${ORG_WITH_EDUCATION}&select=id,relationship_slug,status`,
    );
    expect(
      before.map((r) => r.relationship_slug),
      "fixture drift: the learner must already be an employee for this to prove anything",
    ).toContain("employee");
    const employmentIdBefore = before.find(
      (r) => r.relationship_slug === "employee",
    )?.id;

    // ── The institution invites, in plain language ────────────────────────
    await loginAs(page, INSTITUTION);
    await page.goto(
      `/lt/dashboard/network?type=join_organization&org=${ORG_WITH_EDUCATION}`,
      { waitUntil: "domcontentloaded" },
    );

    const capacity = page.locator('[data-testid="invite-capacity"]');
    await expect(
      capacity,
      "the institution has no way to say WHAT it is inviting the person as",
    ).toBeVisible({ timeout: 60_000 });

    // The reader must never meet a database word.
    const panel = page.locator('[data-testid="invite-capacity"]');
    await expect(panel).not.toContainText(/training_provider|role_slug/);
    // …and the choice must be offered by its human name.
    await expect(panel.locator("option", { hasText: "Studentas" })).toHaveCount(1);

    await capacity.selectOption("student");
    // The organization HAS declared education, so nothing may be blocked here.
    await expect(
      page.locator('[data-testid="invite-capacity-blocked"]'),
      "the institution declared education and is still being refused",
    ).toHaveCount(0);

    // The address list is the panel's FIRST textarea (the optional personal
    // message is the second) — same order the panel renders them in.
    await page.locator("textarea").first().fill(LEARNER.email);
    await page.locator('[data-testid="invite-submit"]').click();

    await expect(
      page.locator('[data-testid="invite-result"]'),
      "the send produced no outcome at all",
    ).toBeVisible({ timeout: 60_000 });

    // ── The invitation stores the RELATIONSHIP, not an employment default ──
    const invites = await rows(
      `invitations?invited_email=eq.${LEARNER.email}` +
        `&select=id,relationship_slug,invitation_type,status`,
    );
    expect(invites.length, "no invitation row was created").toBe(1);
    expect(
      invites[0].relationship_slug,
      "the learner was invited as something other than a learner",
    ).toBe("student");
    // The anti-narrowing contract: NO new invitation_type was invented.
    expect(invites[0].invitation_type).toBe("join_organization");

    // ── The learner is TOLD what they are agreeing to ─────────────────────
    // The raw token exists only in the link handed to the inviter, so the
    // in-app path (an invitation listed for its own recipient) is used here —
    // it is the same acceptance RPC and the same disclosure.
    await loginAs(page, LEARNER);
    await page.goto("/lt/dashboard/network", { waitUntil: "domcontentloaded" });

    const incoming = page.locator('[data-testid="network-incoming"]');
    await expect(
      incoming,
      "the learner cannot see the invitation addressed to them",
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      incoming,
      "the learner is not told which relationship they are accepting",
    ).toContainText(/Studentas/i, { timeout: 60_000 });

    const accept = incoming
      .locator('[data-testid^="incoming-invitation-accept-"]')
      .first();
    await expect(accept).toBeVisible({ timeout: 60_000 });
    await accept.click();
    await page.waitForTimeout(4_000);

    // ── The relationship is real, and it is NOT employment ────────────────
    const after = await rows(
      `engagement_contexts?profile_id=eq.${LEARNER_PROFILE}` +
        `&organization_id=eq.${ORG_WITH_EDUCATION}&select=id,relationship_slug,status`,
    );
    const slugs = after.map((r) => r.relationship_slug);
    expect(slugs, "the learner link was never created").toContain("student");

    // I-1: one person, many contexts — held SIMULTANEOUSLY.
    expect(
      slugs,
      "the pre-existing employment disappeared when the learner link was made",
    ).toContain("employee");
    expect(
      after.find((r) => r.relationship_slug === "employee")?.id,
      "the employment row was replaced rather than left alone",
    ).toBe(employmentIdBefore);
  });

  test("an organization that never said it educates cannot name a learner", async ({
    page,
  }) => {
    await loginAs(page, AGENCY);
    await page.goto(
      `/lt/dashboard/network?type=join_organization&org=${ORG_WITHOUT_EDUCATION}`,
      { waitUntil: "domcontentloaded" },
    );

    const capacity = page.locator('[data-testid="invite-capacity"]');
    await expect(capacity).toBeVisible({ timeout: 60_000 });

    // The capacity is still OFFERED — hiding it would leave the reader with a
    // missing feature and no explanation. Selecting it explains what is
    // missing and where to fix it.
    await capacity.selectOption("student");
    const blocked = page.locator('[data-testid="invite-capacity-blocked"]');
    await expect(
      blocked,
      "an organization with no education capability was offered a learner invitation with no warning",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('[data-testid="invite-capacity-blocked-cta"]'),
      "the reader is told no and not told where to go",
    ).toBeVisible();

    // NEGATIVE CONTROL for the control itself: a capacity that requires no
    // capability must NOT be blocked, or the warning above would be a constant.
    await capacity.selectOption("employee");
    await expect(blocked).toHaveCount(0);
  });
});
