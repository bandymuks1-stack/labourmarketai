import { test, expect } from "@playwright/test";

/**
 * Work Journal M1 e2e — the closed worker-declares → manager-confirms →
 * verified-skill loop (§13). Like auth.spec.ts, DB-dependent assertions are
 * gated on SUPABASE_TEST_URL and skipped with a detailed description until the
 * founder stands up a separate test Supabase project (see docs/TESTING.md).
 * The unauthenticated guards below run unconditionally.
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;

const requiresTestEnv = (): void => {
  test.skip(
    !HAS_TEST_SUPABASE,
    "SUPABASE_TEST_URL not configured — see docs/TESTING.md",
  );
};

test.describe("Work Journal — access control", () => {
  // No test env needed: the pages check auth.getUser() and bounce anonymous
  // visitors to /auth/login.
  test("anonymous /dashboard/journal redirects to /auth/login", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard/journal");
    await expect(page).toHaveURL(/\/lt\/auth\/login/);
  });

  test("anonymous /dashboard/inbox redirects to /auth/login", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard/inbox");
    await expect(page).toHaveURL(/\/lt\/auth\/login/);
  });
});

test.describe("Work Journal — closed loop (worker declares → manager confirms)", () => {
  test("worker logs a tiler entry, manager confirms, skill verifies and bin flips red→green", async () => {
    requiresTestEnv();
    test.skip(
      true,
      [
        "Requires authenticated test sessions for a worker + a manager who share an organization, plus DB introspection. Wire when SUPABASE_TEST_URL is provisioned (M1.x).",
        "Steps & assertions:",
        "1. As worker (active 'employee' engagement in org X), open /lt/dashboard/journal; the 'Mano dienoraštis' form is visible.",
        "2. Fill site_name + area_done (square_meters) and submit. Assert: a journal_entries row (worker_id=worker, engagement_context_id in org X, entry_type_slug='structured', visibility_scope='closed', hash_self set, hash_prev chained to the prior entry) + journal_entry_metrics rows (site_name text, area_done numeric+unit). Entry appears in the list with status 'submitted'.",
        "3. As manager (active 'manager'/'owner' engagement in org X), open /lt/dashboard/inbox; the worker's entry is listed.",
        "4. Click confirm. Assert: a journal_entry_confirmations row (confirmer_id=manager, confirmer_role in (manager,owner,external_manager), confirmation_scope.action='confirm'); the worker's self_declared worker_skills under the entry's profession flip verified=true (verified_by=manager, verified_at set).",
        "5. Assert confidence recompute (§6.1): affected worker_skills.confidence_score>0 and confidence_bin='green' (was 'red'); last_recompute_at set.",
        "6. Back as worker, the entry status now reads 'confirmed' and the self-progress counter moved one skill out of 'awaiting'.",
      ].join("\n"),
    );
  });
});
