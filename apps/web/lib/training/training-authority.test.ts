import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { deriveTrainingAuthority } from "./training-model";

/**
 * THE TRAINING REGISTER OFFERS ITS FORMS BY AUTHORITY, NOT BY DATA
 * (production walk row 11.8, 2026-10-25).
 *
 * The register opened its organization half — and with it the add-a-course
 * and assign forms — only when the reader could already read a course or an
 * assignment. So an organization with no course could never add its first
 * one, and any employee of an organization that had a course was offered
 * forms `create_training_program_v1` / `assign_training_v1` then refused.
 *
 * The forms now follow `getTrainingAuthority()`, which asks the database the
 * same predicates the write commands enforce.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("deriveTrainingAuthority — the same rule the write commands enforce", () => {
  it("an owner/admin of the active workspace may add a course to an EMPTY register", () => {
    const a = deriveTrainingAuthority({
      employerOrganizationId: ORG,
      platformAdmin: false,
      ownerAdmin: new Map([[ORG, true]]),
      demandAccess: new Map([[ORG, true]]),
    });
    expect(a.createOrganizationId).toBe(ORG);
    expect(a.editOrganizationIds.has(ORG)).toBe(true);
    expect(a.assignOrganizationIds.has(ORG)).toBe(true);
  });

  it("an employee who can only READ the courses is offered no form", () => {
    const a = deriveTrainingAuthority({
      employerOrganizationId: null,
      platformAdmin: false,
      ownerAdmin: new Map([[ORG, false]]),
      demandAccess: new Map([[ORG, false]]),
    });
    expect(a.createOrganizationId).toBeNull();
    expect(a.editOrganizationIds.size).toBe(0);
    expect(a.assignOrganizationIds.size).toBe(0);
  });

  it("a manager may assign (has_org_demand_access) but not add or edit a course (org_owner_admin_v1)", () => {
    const a = deriveTrainingAuthority({
      employerOrganizationId: ORG,
      platformAdmin: false,
      ownerAdmin: new Map([[ORG, false]]),
      demandAccess: new Map([[ORG, true]]),
    });
    expect(a.createOrganizationId).toBeNull();
    expect(a.editOrganizationIds.has(ORG)).toBe(false);
    expect(a.assignOrganizationIds.has(ORG)).toBe(true);
  });

  it("authority is per organization: owning one org grants nothing in another", () => {
    const a = deriveTrainingAuthority({
      employerOrganizationId: ORG,
      platformAdmin: false,
      ownerAdmin: new Map([
        [ORG, true],
        [OTHER, false],
      ]),
      demandAccess: new Map([
        [ORG, true],
        [OTHER, false],
      ]),
    });
    expect(a.editOrganizationIds.has(OTHER)).toBe(false);
    expect(a.assignOrganizationIds.has(OTHER)).toBe(false);
  });

  it("a platform admin may add and edit (is_admin()) but assigning still needs has_org_demand_access", () => {
    const a = deriveTrainingAuthority({
      employerOrganizationId: ORG,
      platformAdmin: true,
      ownerAdmin: new Map([[ORG, false]]),
      demandAccess: new Map([[ORG, false]]),
    });
    expect(a.createOrganizationId).toBe(ORG);
    expect(a.editOrganizationIds.has(ORG)).toBe(true);
    expect(a.assignOrganizationIds.has(ORG)).toBe(false);
  });

  it("no employer workspace = no add form, whatever else holds (the create action refuses it)", () => {
    const a = deriveTrainingAuthority({
      employerOrganizationId: null,
      platformAdmin: true,
      ownerAdmin: new Map([[ORG, true]]),
      demandAccess: new Map([[ORG, true]]),
    });
    expect(a.createOrganizationId).toBeNull();
  });
});

describe("the authority read asks the database's own predicates", () => {
  const service = code(read("lib/training/training.ts"));
  const sql = readFileSync(
    join(APP, "..", "..", "supabase", "migrations", "20260817230000_training_certification_v1.sql"),
    "utf8",
  );

  it("reads org_owner_admin_v1, has_org_demand_access and is_admin — the predicates in the write commands", () => {
    expect(service).toMatch(/rpc\(name, args\)/);
    expect(service).toMatch(/"org_owner_admin_v1", \{ p_organization_id: org \}/);
    expect(service).toMatch(/"has_org_demand_access", \{ org \}/);
    expect(service).toMatch(/yes\("is_admin"\)/);
    // …and those ARE the commands' rules.
    expect(sql).toMatch(/not public\.org_owner_admin_v1\(v_org\) and not public\.is_admin\(\)/);
    expect(sql).toMatch(/not public\.has_org_demand_access\(prog\.organization_id\)/);
  });

  it("the add-a-course target is the create action's own workspace resolution", () => {
    expect(service).toMatch(/await requireEmployerCompany\(\)/);
    expect(code(read("lib/training/training-actions.ts"))).toMatch(/await requireEmployerCompany\(\)/);
  });
});

describe("training-register.tsx renders its forms from that authority", () => {
  const ui = code(read("components/app/training-register.tsx"));

  it("no longer opens the organization half from 'the org already has data'", () => {
    expect(ui).not.toMatch(/canManage\s*=\s*overview\.programs\.length\s*>\s*0\s*\|\|\s*managed\.length\s*>\s*0/);
    expect(ui).toMatch(/await getTrainingAuthority\(/);
  });

  it("the add form renders only with create authority — and also when the register is empty", () => {
    expect(ui).toMatch(/const canCreate = authority\.createOrganizationId !== null;/);
    expect(ui).toMatch(/showOrganization =\s*canCreate \|\|/);
    expect(ui).toMatch(/\{canCreate \? \(\s*<form\s+action=\{createTrainingProgramAction\}/);
    // The honest empty state still renders under it.
    expect(ui).toMatch(/data-testid="training-programs-empty"/);
  });

  it("edit, assign, certificate and expiry forms each sit behind their own authority", () => {
    expect(ui).toMatch(
      /authority\.editOrganizationIds\.has\(p\.organizationId\) \? \(\s*<details data-testid="training-program-edit">/,
    );
    expect(ui).toMatch(
      /authority\.assignOrganizationIds\.has\(p\.organizationId\) \? \(\s*<form\s+action=\{assignTrainingAction\}/,
    );
    expect(ui).toMatch(/authority\.assignOrganizationIds\.has\(a\.organizationId\) &&\s*a\.status === "completed"/);
    expect(ui).toMatch(/authority\.assignOrganizationIds\.has\(a\.organizationId\) &&\s*a\.expiresOn/);
  });
});

describe("one organization's register per workspace (decision 0024)", () => {
  it("the organization half reads only the ACTIVE workspace's courses and managed assignments", () => {
    const ui = readFileSync(join(__dirname, "..", "..", "components", "app", "training-register.tsx"), "utf8");
    expect(ui).toContain("await getWorkspaceContext()");
    expect(ui).toMatch(/const programs = overview\.programs\.filter\(\(p\) => p\.organizationId === activeOrganizationId\)/);
    expect(ui).toMatch(/a\.organizationId === activeOrganizationId/);
    // Rendering uses the scoped list only.
    expect(ui).not.toMatch(/overview\.programs\.(map|length)/);
  });
});
