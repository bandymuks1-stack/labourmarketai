import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Workspace-scope isolation guard (PR A, Task 7).
 *
 * Owner concern: switching company → personal must not leave company context
 * inside personal pages. Investigation (see the audit doc) found the bridge is
 * already real and the leak is structurally impossible — this guard PINS both
 * facts so a future refactor cannot regress them:
 *
 *   1. The switch bridge: `switchActiveRole` overwrites `profiles.active_role`
 *      AND calls `revalidatePath("/", "layout")`, so the whole authenticated
 *      shell (nav + active-space label) re-resolves on the next request. The
 *      active workspace label therefore updates immediately on switch.
 *
 *   2. The personal journal is keyed to the signed-in PROFILE
 *      (`profile_id = user.id` / the user's `workers` row), never to a company,
 *      so company entries can never appear in the personal journal regardless
 *      of the previously-active role.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Guard: workspace switch resets scope (revalidates the layout)", () => {
  const actions = read("lib/auth/actions.ts");
  it("switchActiveRole exists and updates active_role", () => {
    expect(actions).toMatch(/export async function switchActiveRole/);
    expect(actions).toMatch(/\.update\(\{\s*active_role:\s*role\s*\}\)/);
  });
  it("switchActiveRole revalidates the whole layout so nav/scope re-resolve", () => {
    // Pin the scope-reset bridge: without this the header could keep showing
    // the previous workspace after a switch. The first layout revalidation
    // after the switchActiveRole definition is its own.
    const after = actions.slice(actions.indexOf("switchActiveRole"));
    expect(after).toMatch(/revalidatePath\(\s*["']\/["']\s*,\s*["']layout["']\s*\)/);
  });
});

describe("Guard: personal journal is profile-scoped, not company-scoped", () => {
  const journal = read("app/[locale]/dashboard/journal/page.tsx");
  it("the worker is resolved from the signed-in user's profile", () => {
    // worker = the user's own row (workers.profile_id = user.id). This is the
    // root of the personal scope — entries hang off this worker, never a company.
    expect(journal).toMatch(/from\(\s*["']workers["']\s*\)/);
    expect(journal).toMatch(/\.eq\(\s*["']profile_id["']\s*,\s*user\.id\s*\)/);
  });
  it("journal entries are keyed to that worker (worker_id), not a company", () => {
    expect(journal).toMatch(/from\(\s*["']journal_entries["']\s*\)/);
    expect(journal).toMatch(/\.eq\(\s*["']worker_id["']\s*,\s*worker\.id\s*\)/);
  });
  it("journal never scopes its entries by an active company / org id", () => {
    expect(journal).not.toMatch(/\.eq\(\s*["']company_id["']/);
  });
});
