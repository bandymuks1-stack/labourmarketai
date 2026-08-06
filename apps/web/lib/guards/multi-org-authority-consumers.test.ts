import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  hasOrganizationCapability,
  isEmployerSurfaceRole,
  isGovernanceRole,
  type GovernanceRole,
  type OrganizationCapability,
} from "@/lib/company/role-capabilities";

/**
 * M-P0-4 consumer slice (§11) — organization authority consumers live on
 * canonical membership truth + the validated active workspace, expressed
 * through ONE role→capability matrix. Pinned:
 *
 *   1. the matrix itself — owner/admin govern, manager/external_manager are
 *      operational, member only belongs;
 *   2. the employer context's final gate is MEMBERSHIP truth with the
 *      creator-compatibility arm — never `profile_id !== user.id` alone;
 *   3. every roster/project/profile write action gates on a capability;
 *   4. the workspace-blind `companies.profile_id` singleton is gone from the
 *      description write and the market map;
 *   5. `getOwnCompany` callers are a RATCHET — the dead company-workers
 *      implementation stays deleted, and only the two recorded legacy
 *      fallbacks remain (company-setup internal legacy branch + the
 *      dashboard layout's no-organization display-name fallback).
 */

const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

const ROLES: GovernanceRole[] = ["owner", "admin", "manager", "external_manager", "member"];
const CAPS: OrganizationCapability[] = [
  "manage-company-profile",
  "administer-members",
  "manage-roster",
  "manage-projects",
  "manage-demand",
  "view-directory",
];

describe("§11 role → capability matrix", () => {
  it("owner and admin hold every capability", () => {
    for (const role of ["owner", "admin"] as const) {
      for (const cap of CAPS) {
        expect(hasOrganizationCapability(role, cap), `${role} ${cap}`).toBe(true);
      }
    }
  });

  it("manager-class roles are OPERATIONAL — no company identity, no member admin", () => {
    for (const role of ["manager", "external_manager"] as const) {
      expect(hasOrganizationCapability(role, "manage-company-profile")).toBe(false);
      expect(hasOrganizationCapability(role, "administer-members")).toBe(false);
      expect(hasOrganizationCapability(role, "manage-roster")).toBe(true);
      expect(hasOrganizationCapability(role, "manage-projects")).toBe(true);
      expect(hasOrganizationCapability(role, "manage-demand")).toBe(true);
      expect(hasOrganizationCapability(role, "view-directory")).toBe(true);
    }
  });

  it("member only belongs — directory, nothing else", () => {
    for (const cap of CAPS) {
      expect(hasOrganizationCapability("member", cap)).toBe(cap === "view-directory");
    }
    expect(isEmployerSurfaceRole("member")).toBe(false);
    for (const role of ["owner", "admin", "manager", "external_manager"] as const) {
      expect(isEmployerSurfaceRole(role)).toBe(true);
    }
  });

  it("isGovernanceRole accepts exactly the five roles", () => {
    for (const role of ROLES) expect(isGovernanceRole(role)).toBe(true);
    for (const bad of ["employee", "viewer", "", null, undefined, "OWNER"]) {
      expect(isGovernanceRole(bad as string | null | undefined)).toBe(false);
    }
  });
});

describe("§11 employer context — membership truth is the final gate", () => {
  const ctx = read(join(WEB, "lib", "company", "employer-company-context.ts"));

  it("reads the caller's own ACTIVE membership row", () => {
    expect(ctx).toMatch(/from\("company_memberships"\)/);
    expect(ctx).toMatch(/eq\("status", "active"\)/);
  });

  it("keeps the creator-compatibility arm and fails closed otherwise", () => {
    expect(ctx).toMatch(/company\.profile_id === user\.id\) role = "owner"/);
    expect(ctx).toMatch(/isEmployerSurfaceRole/);
    // The OLD sole gate (refuse unless creator) must be gone.
    expect(ctx).not.toMatch(/company\.profile_id !== user\.id/);
  });

  it("the resolved role rides in the ok context", () => {
    expect(ctx).toMatch(/readonly role: GovernanceRole/);
  });

  it("a membership read failure is an error, never a silent grant", () => {
    expect(ctx).toMatch(/membership read failed/);
  });
});

describe("§11 write actions gate on capabilities", () => {
  it("all four roster actions require manage-roster", () => {
    const actions = read(join(WEB, "lib", "company", "actions.ts"));
    const gates = actions.match(/hasOrganizationCapability\(company\.role, "manage-roster"\)/g);
    expect(gates?.length).toBe(4);
  });

  it("project creation requires manage-projects", () => {
    const project = read(join(WEB, "lib", "company", "project-context-actions.ts"));
    expect(project).toMatch(/hasOrganizationCapability\(company\.role, "manage-projects"\)/);
  });

  it("the description write requires manage-company-profile and the workspace company", () => {
    const desc = read(join(WEB, "lib", "company", "description-actions.ts"));
    expect(desc).toMatch(/requireEmployerCompany\(\)/);
    expect(desc).toMatch(/manage-company-profile/);
    expect(desc).not.toMatch(/eq\("profile_id"/);
  });
});

describe("§11 singleton-fallback ratchet", () => {
  it("company-workers.ts no longer exports getOwnCompany (dead impl deleted)", () => {
    const workers = read(join(WEB, "lib", "company", "company-workers.ts"));
    expect(workers).not.toMatch(/getOwnCompany/);
    expect(workers).not.toMatch(/interface OwnCompany/);
  });

  it("the market map resolves its company from the active workspace", () => {
    const map = read(
      join(WEB, "app", "[locale]", "dashboard", "market-map", "page.tsx"),
    );
    expect(map).toMatch(/resolveEmployerCompanyContext/);
    expect(map).not.toMatch(/getOwnCompany/);
  });

  it("getOwnCompany callers may only SHRINK (ratchet)", () => {
    // The two recorded legacy remainders:
    //   - company-setup.ts (own module: definition + the legacy
    //     `companyId === undefined` branch of saveCompanySetup);
    //   - dashboard layout.tsx (display-name fallback when NO organization
    //     mirror exists at all — not an authority decision).
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          scan(p);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
        if (readFileSync(p, "utf8").includes("getOwnCompany")) offenders.push(p);
      }
    };
    scan(join(WEB, "app"));
    scan(join(WEB, "lib"));
    const names = offenders.map((p) => p.replace(WEB, "").replace(/\\/g, "/")).sort();
    expect(names).toEqual([
      "/app/[locale]/dashboard/layout.tsx",
      "/lib/company/company-setup.ts",
      // comment-only mention (its doc explains the boundary cast mirrors
      // getOwnCompany) — no call.
      "/lib/company/owned-organizations.ts",
    ]);
  });
});
