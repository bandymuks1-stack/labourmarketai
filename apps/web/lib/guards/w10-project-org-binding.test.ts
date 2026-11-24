import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * W10 — project creation must bind organization_id (no recurrence of stale data).
 *
 * The W10 backfill rerouted 4 legacy draft projects whose organization_id was
 * NULL. To stop that stale state from recurring, EVERY project-creation path must
 * resolve the canonical organization (via the legacy bridge) and include
 * organization_id in the insert. This guard pins both call sites + the shared
 * resolver, and pins the backfill migration + its scoped rollback.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

const CREATE_SITES = [
  "lib/projects/actions.ts",
  "lib/company/project-context-actions.ts",
];

describe("project creation binds the canonical organization_id", () => {
  it("a shared resolver exists that maps a legacy company to its organization", () => {
    const resolver = read(join(APP, "lib", "company", "resolve-organization-id.ts"));
    expect(resolver).toMatch(/export async function resolveOrganizationIdForCompany/);
    expect(resolver).toMatch(/legacy_company_id/);
    expect(resolver).toMatch(/from\("organizations"\)/);
  });

  it("THE ONE create core resolves and inserts organization_id (rebuild W5)", () => {
    // Both entry points now insert through lib/projects/create-project-core —
    // the W10 rule (never an org-less project) lives in exactly one place.
    const core = read(join(APP, "lib", "projects", "create-project-core.ts"));
    expect(core).toMatch(/resolveOrganizationIdForCompany/);
    expect(core).toMatch(/\.from\("projects"\)[\s\S]{0,300}?organization_id/);
  });

  for (const rel of CREATE_SITES) {
    it(`${rel} inserts ONLY through the shared core (no drifted second path)`, () => {
      const src = read(join(APP, rel));
      expect(src, `${rel} uses the core`).toMatch(/insertProjectForCompany/);
      // No direct projects-insert outside the core — the two paths may never
      // drift apart again.
      expect(src, `${rel} has no direct projects insert`).not.toMatch(
        /\.from\("projects"\)\s*\n?\s*\.insert/,
      );
    });
  }
});

describe("W10 backfill migration + scoped rollback are present", () => {
  const MIG = join(REPO, "supabase", "migrations", "20260627143433_w10_projects_org_backfill.sql");
  const DOWN = join(
    REPO,
    "supabase",
    "rollbacks",
    "20260627143433_w10_projects_org_backfill.down.sql",
  );

  it("the backfill is ambiguity-guarded and non-destructive", () => {
    const sql = read(MIG).toLowerCase();
    expect(sql).toMatch(/update public\.projects/);
    // only fills NULL org rows (idempotent / re-run safe)
    expect(sql).toMatch(/p\.organization_id is null/);
    // ambiguity guard: only companies that map to exactly one org
    expect(sql).toMatch(/=\s*1/);
    // never deletes; never touches other tables
    expect(sql).not.toMatch(/delete from|truncate|drop /);
    expect(sql).not.toMatch(/update public\.(?!projects)/);
  });

  it("the rollback is scoped to exactly the backfilled project ids", () => {
    expect(existsSync(DOWN), "rollback present").toBe(true);
    const down = read(DOWN).toLowerCase();
    expect(down).toMatch(/set organization_id = null/);
    expect(down).toMatch(/where id in \(/);
    expect(down).not.toMatch(/delete from|drop /);
  });
});
