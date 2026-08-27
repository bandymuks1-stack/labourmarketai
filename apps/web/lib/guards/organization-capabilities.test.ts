import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EDUCATION_ROLE,
  LEGACY_TYPE_ROLE,
  hasCapability,
  isEducationInstitution,
  isKnownOrganizationRole,
  organizationCapabilities,
} from "@/lib/organizations/capabilities";
import { ORGANIZATION_ROLES } from "@/lib/product-gate/organization-roles";

/**
 * AN ORGANIZATION IS NOT ONE THING.
 *
 * Production held 10 'company' and 3 'agency' rows under a closed CHECK
 * (`company | agency | team | other`) — and no education value at all, so an
 * institution could register only by misdescribing itself. The owner rejected
 * the cheap repair (a fifth mutually exclusive value) because the binding
 * ORGANIZATION_ROLE_ORCHESTRATION_V1 says one organization holds MANY roles at
 * once, and PLATFORM_DOCTRINE §10 forbids a hardcoded enum for anything
 * extensible.
 *
 * This guard pins the three things that make the repair honest rather than
 * merely new: ONE vocabulary, a fallback that cannot lie before the migration
 * lands, and a backfill mapping that refuses to invent capabilities.
 */

const WEB = join(__dirname, "..", "..");
const ROOT = join(WEB, "..", "..");
const read = (...p: string[]) => readFileSync(join(...p), "utf8");

const MIGRATION = read(
  ROOT,
  "supabase",
  "migrations",
  "20260827050000_organization_roles_v1.sql",
);
const ROLLBACK = read(
  ROOT,
  "supabase",
  "rollbacks",
  "20260827050000_organization_roles_v1.down.sql",
);
const CAPABILITIES = read(WEB, "lib", "organizations", "capabilities.ts");

describe("there is ONE organization-role vocabulary", () => {
  it("the module imports the locked registry instead of restating it", () => {
    expect(CAPABILITIES).toContain(
      'from "@/lib/product-gate/organization-roles"',
    );
    // A second literal list is exactly how two vocabularies start.
    expect(CAPABILITIES).not.toMatch(/const\s+\w*ROLES\w*\s*=\s*\[/);
  });

  it("education is `training_provider` — no new name was invented", () => {
    expect(EDUCATION_ROLE).toBe("training_provider");
    expect(isKnownOrganizationRole(EDUCATION_ROLE)).toBe(true);
    // The pilot must not smuggle in an "education" role beside it.
    expect(isKnownOrganizationRole("education")).toBe(false);
  });

  it("the migration seeds exactly the locked list, no more and no less", () => {
    const seeded = [...MIGRATION.matchAll(/\('([a-z_]+)',\s*'[a-z_]+'\)/g)].map(
      (m) => m[1],
    );
    expect([...seeded].sort()).toEqual([...ORGANIZATION_ROLES].sort());
  });
});

describe("the fallback cannot lie before the migration lands", () => {
  it("a legacy company still reads as an employer with no role rows", () => {
    expect(organizationCapabilities({ legacyType: "company" })).toEqual([
      "employer",
    ]);
    expect(organizationCapabilities({ legacyType: "agency" })).toEqual([
      "workforce_provider",
    ]);
  });

  it("declared capabilities WIN — the old column stops being consulted", () => {
    // Otherwise an institution that declared itself a training provider would
    // silently keep the `employer` its legacy column implied.
    const org = { roleSlugs: ["training_provider"], legacyType: "company" };
    expect(organizationCapabilities(org)).toEqual(["training_provider"]);
    expect(isEducationInstitution(org)).toBe(true);
    expect(hasCapability(org, "employer")).toBe(false);
  });

  it("an organization really can hold several capabilities at once", () => {
    const org = {
      roleSlugs: ["employer", "training_provider", "project_operator"],
      legacyType: "company",
    };
    expect(organizationCapabilities(org)).toHaveLength(3);
    expect(isEducationInstitution(org)).toBe(true);
    expect(hasCapability(org, "employer")).toBe(true);
  });

  it("nothing known means nothing claimed", () => {
    expect(organizationCapabilities({ legacyType: "team" })).toEqual([]);
    expect(organizationCapabilities({ legacyType: "other" })).toEqual([]);
    expect(organizationCapabilities({})).toEqual([]);
    expect(isEducationInstitution({ legacyType: "company" })).toBe(false);
  });
});

describe("the backfill invents no capability", () => {
  it("only company and agency are mapped, in code and in SQL", () => {
    expect(Object.keys(LEGACY_TYPE_ROLE).sort()).toEqual(["agency", "company"]);
    expect(MIGRATION).toMatch(/organization_type = 'company'[\s\S]{0,80}?on conflict/);
    expect(MIGRATION).toMatch(/organization_type = 'agency'[\s\S]{0,80}?on conflict/);
    // 'team' / 'other' must never be backfilled into a capability.
    expect(MIGRATION).not.toMatch(/organization_type = 'team'\s*\n?on conflict/);
    expect(MIGRATION).not.toMatch(/select o\.id, '\w+' from public\.organizations o\s*where o\.organization_type = 'other'/);
  });
});

describe("the migration is additive and reversible", () => {
  it("it does not touch the legacy column at all", () => {
    for (const banned of [
      "drop column",
      "alter column",
      "drop constraint",
      "alter table public.organizations",
    ]) {
      expect(
        MIGRATION.toLowerCase(),
        `migration touched the legacy column: ${banned}`,
      ).not.toContain(banned);
    }
  });

  it("it mutates no existing row — inserts only", () => {
    // Comment-stripped: this must judge the SQL, not the prose ABOUT the SQL.
    // (The docblock legitimately names UPDATE/DELETE/TRUNCATE while explaining
    // that none of them occur — a raw substring check fails on its own
    // explanation.)
    const sql = MIGRATION.replace(/--.*$/gm, "").toLowerCase();
    expect(sql).not.toMatch(/(^|;)\s*update\s+\w/m);
    expect(sql).not.toMatch(/(^|;)\s*delete\s+from\s+\w/m);
    expect(sql).not.toContain("truncate");
  });

  it("the assignment table is scoped, not permissive", () => {
    const policy = MIGRATION.slice(
      MIGRATION.indexOf("create policy organization_roles_select"),
      MIGRATION.indexOf("create policy organization_roles_write"),
    );
    // `using (true)` here would disclose every organization's identity claims.
    expect(policy).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(policy).toContain("belongs_to_organization");
    expect(policy).toContain("owner_profile_id = auth.uid()");
  });

  it("the writer is owner-gated and additive", () => {
    const fn = MIGRATION.slice(
      MIGRATION.indexOf("create or replace function public.add_organization_role_v1"),
    );
    expect(fn).toContain("Not authenticated");
    expect(fn).toContain("Not permitted");
    // Membership must NOT be enough — a capability is an identity claim.
    expect(fn).toContain("o.owner_profile_id = uid");
    expect(fn).toContain("Invalid role");
    // Additive only: no removal path hides in the writer.
    expect(fn.toLowerCase()).not.toMatch(/delete\s+from/);
  });

  it("privileges are EXPLICIT, so local and production cannot disagree", () => {
    // Measured on a local `db reset` before this was added: the new table came
    // up with `anon` holding INSERT/UPDATE/DELETE, because the local stack
    // still carries Supabase's stock ALTER DEFAULT PRIVILEGES while this
    // project's production `pg_default_acl` for schema public is EMPTY. A
    // local test would then exercise a privilege surface production lacks.
    // Regex LITERALS, not a template-built RegExp: inside a template literal
    // `\.` collapses to `.` and `\s` to `s`, which would quietly turn these
    // into assertions that pass on the wrong text.
    expect(
      MIGRATION,
      "organization_role_types does not revoke inherited default privileges",
    ).toMatch(
      /revoke all on public\.organization_role_types\s+from public, anon, authenticated, service_role/,
    );
    expect(
      MIGRATION,
      "organization_roles does not revoke inherited default privileges",
    ).toMatch(
      /revoke all on public\.organization_roles\s+from public, anon, authenticated, service_role/,
    );
    // …and then grants back exactly one thing: read.
    expect(MIGRATION).toMatch(/grant select on public\.organization_roles\s+to authenticated/);
    expect(MIGRATION).not.toMatch(/grant (insert|update|delete)/i);
    // The SECURITY DEFINER writer must not be reachable by anon.
    expect(MIGRATION).toMatch(
      /revoke all on function public\.add_organization_role_v1\(uuid, text\) from public, anon/,
    );
  });

  it("the rollback refuses to silently discard a declared capability", () => {
    expect(ROLLBACK).toContain("Refusing rollback");
    expect(ROLLBACK).toContain("drop table if exists public.organization_roles");
    expect(ROLLBACK).toContain("drop function if exists public.add_organization_role_v1");
  });

  it("it is marked RED and never self-applies", () => {
    expect(MIGRATION).toContain("needs-human-gate");
    expect(MIGRATION).toContain("DO NOT APPLY automatically");
    // Self-approving the gate is the one thing that is never allowed.
    expect(MIGRATION).not.toContain("@human-gate-approved");
  });
});
