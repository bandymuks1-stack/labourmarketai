import { test, expect } from "@playwright/test";

/**
 * Work Journal M1 e2e — unauthenticated access-control guards (run
 * unconditionally). The authenticated closed loop (worker declares →
 * manager confirms) lives in `journal-confirm-loop.spec.ts` and runs
 * against the local Supabase stack via `pnpm e2e:local` (docs/TESTING.md).
 */
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

// The closed loop (worker declares → manager confirms) is now IMPLEMENTED in
// `journal-confirm-loop.spec.ts` — it runs against the local Supabase stack
// via `pnpm e2e:local` (docs/TESTING.md) in both dark and light theme. The
// long-standing skipped placeholder that lived here is retired.
