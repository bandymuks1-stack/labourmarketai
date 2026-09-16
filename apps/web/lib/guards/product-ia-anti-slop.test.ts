import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ORGANIZATION_DOOR_ORDER,
  ORGANIZATION_DOOR_ROUTES,
} from "../company/organization-doors";
import { PRODUCT_SURFACES } from "../product-gate/surface-registry";
import { isSyntheticFixtureLabel } from "../qa/synthetic-fixture";
import { isoWeekOf, readWeekNumber, rowsFromGrid } from "../organization-evidence/parse-tabular";

/**
 * PRODUCT UX / IA ANTI-SLOP — the objective half of the owner's global rule
 * (docs/design/final/03-PRODUCT-IA-ANTI-SLOP-2026-09-16.md §6; owner directive
 * 2026-09-16 §17). Only regressions a file can prove are pinned here:
 *
 *   1. every organization door leads to a real, classified, declared route;
 *   2. the company hub cannot regrow into a capability dump;
 *   3. the chat's historical-import intent for an organization resolves to
 *      the canonical import door, never to the hours form;
 *   4. the importer's preview carries a PLAN and the commit applies it — a
 *      row whose only problem is "person not on roster" is committable;
 *   5. preview-before-commit stays mandatory (token + `persisted: false`);
 *   6. synthetic fixture rows are kept out of the shared cross-organization
 *      readers, and product copy carries no fixture / debug prose;
 *   7. the door namespace is real Lithuanian, not English literals;
 *   8. the source-week vs date comparison is deterministic.
 *
 * The subjective half ("remove the brand — is it still LabourMarket.ai?") is
 * a human review: docs/design/final/ANTI-SLOP-REVIEW-CHECKLIST.md.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const routeTruth = read("lib/guards/route-truth-map.test.ts");
const companyHub = read("app/[locale]/dashboard/company/page.tsx");
const companyLayout = read("app/[locale]/dashboard/company/layout.tsx");
const doorsStrip = read("components/app/organization/organization-doors.tsx");
const chat = read("components/app/conversation/chat/conversation-chat.tsx");
const hoursPage = read("app/[locale]/dashboard/hours/page.tsx");
const importCore = read("lib/organization-evidence/import-core.ts");
const importActions = read("lib/organization-evidence/import-actions.ts");
const importCaps = read("lib/capabilities/evidence-import-capabilities.ts");
const importSection = read("components/app/evidence-import-section.tsx");
const adminPage = read("app/[locale]/dashboard/admin/page.tsx");

// ── 1. doors ─────────────────────────────────────────────────────────────

describe("organization doors — every door is a real, classified, declared destination", () => {
  const declared = new Set(PRODUCT_SURFACES.map((s) => s.id));
  for (const id of ORGANIZATION_DOOR_ORDER) {
    const route = ORGANIZATION_DOOR_ROUTES[id];
    it(`${id} → ${route} exists as a page`, () => {
      const file = join(ROOT, "app", "[locale]", ...route.split("/").filter(Boolean), "page.tsx");
      expect(existsSync(file), `${route} has no page.tsx`).toBe(true);
    });
    it(`${id} → ${route} is classified in the route truth map`, () => {
      expect(routeTruth).toContain(`"${route.slice(1)}": "REAL_LAUNCH_SURFACE"`);
    });
    if (route.startsWith("/dashboard/company/") && route !== "/dashboard/company/planning") {
      it(`${id} → ${route} is declared in the surface registry`, () => {
        expect(declared.has(route), `${route} undeclared`).toBe(true);
      });
    }
  }

  it("the strip renders every door id with a data-testid and aria-current", () => {
    expect(doorsStrip).toMatch(/data-testid=\{`organization-door-\$\{door\.id\}`\}/);
    expect(doorsStrip).toMatch(/aria-current=\{active \? "page" : undefined\}/);
  });

  it("the company layout mounts the doors once for every organization route", () => {
    expect(companyLayout).toMatch(/<OrganizationDoorsServer\b/);
  });

  it("the Work door (projects) mounts the same strip on the manager branch", () => {
    expect(read("app/[locale]/dashboard/projects/page.tsx")).toMatch(/<OrganizationDoorsServer\b/);
  });
});

// ── 2. the hub may not regrow ─────────────────────────────────────────────

describe("the company hub (Dabar) stays a first screen, not a capability dump", () => {
  const MOVED_SECTIONS = [
    "CompanyWorkersSection",
    "TeamRecordedWork",
    "TeamBrigadesPanel",
    "PeopleImportPanel",
    "OrganizationRosterSection",
    "OrgMembersPanel",
    "LifecycleSection",
    "DemandRequestButton",
    "DemandRequestsReadback",
    "ClaimPublicIntakeCard",
    "PublicDemandSection",
    "AgencyClientsSection",
    "AgencyBridgeSection",
    "ClientAgencyBridgeSection",
    "InstitutionLearnersSection",
    "InstitutionProgramsSection",
    "EvidenceImportSection",
    "WorkObjectsSection",
    "CompanyGallerySection",
    "OrganizationCapabilitiesCard",
    "BusinessPublicProfilePanel",
    "HelpRequestPanel",
    "WorkerReadinessSummary",
  ];
  for (const name of MOVED_SECTIONS) {
    it(`does not mount ${name} (it lives behind its door)`, () => {
      expect(companyHub).not.toMatch(new RegExp(`<${name}\\b`));
    });
  }
  it("stays under the line budget of a first screen", () => {
    expect(companyHub.split("\n").length).toBeLessThan(420);
  });
  it("keeps the four questions: attention strip, home field, primary actions", () => {
    expect(companyHub).toMatch(/data-testid="company-decisions-strip"/);
    expect(companyHub).toMatch(/<CompanyHomeFieldSection\b/);
    expect(companyHub).toMatch(/data-testid="company-primary-actions"/);
  });
  it("has no in-page anchor links pretending to be navigation", () => {
    expect(companyHub).not.toMatch(/href="#/);
  });
});

// ── 3. chat → canonical historical import ────────────────────────────────

describe("chat: 'noriu įkelti istorinius duomenis' reaches the canonical import for an organization", () => {
  it("the organization branch of timesheetImport links the history door", () => {
    const start = chat.indexOf("timesheetImport: () =>");
    expect(start).toBeGreaterThan(-1);
    const executor = chat.slice(start, start + 700);
    expect(executor).toMatch(/link:\/dashboard\/company\/history/);
    expect(executor).not.toMatch(/hours\?import=1/);
  });
  it("the command registry's work-history import points at the history door", () => {
    expect(read("lib/navigation/command-registry.ts")).toMatch(
      /route: "\/dashboard\/company\/history#evidence-import"/,
    );
  });
  it("the hours page no-objects state is two doors, not a prerequisite", () => {
    expect(hoursPage).toMatch(/data-testid="hours-no-objects-import-door"/);
    expect(hoursPage).toMatch(/href="\/dashboard\/company\/history"/);
    const lt = JSON.parse(read("messages/lt.json")) as { workHours: { states: { noObjects: string } } };
    expect(lt.workHours.states.noObjects).not.toMatch(/sukurkite/i);
  });
});

// ── 4 + 5. the importer's plan, and preview-before-commit ────────────────

describe("historical import: the plan prepares what the source names; commit stays explicit", () => {
  it("the preview exposes a plan and a readyWithPlan row state", () => {
    expect(importCore).toMatch(/export interface ImportPlan\b/);
    expect(importCore).toMatch(/readonly readyWithPlan: boolean;/);
    expect(importCore).toMatch(/export function committableRows\(/);
  });
  it("a row whose only problem is person_not_on_roster is committable through the plan", () => {
    expect(importCore).toMatch(/const readyWithPlan =[\s\S]{0,160}personState === "unmatched"/);
  });
  it("commit applies the plan FIRST through the existing authorized writes", () => {
    const commit = importCore.slice(importCore.indexOf("export async function commitImport("));
    expect(commit).toMatch(/await applyPlan\(/);
    expect(importCore).toMatch(/createRosterPerson\(caller, \{/);
    expect(importCore).toMatch(/rpc\("create_work_object_v1"/);
  });
  it("the plan never invents a person from an ambiguous name", () => {
    const plan = importCore.slice(importCore.indexOf("async function applyPlan("));
    expect(plan).toMatch(/else if \(m\.kind === "ambiguous"\) continue;/);
  });
  it("both transports bind the commit token to committableRows", () => {
    expect(importActions).toMatch(/readyRows: committable/);
    expect(importCaps).toMatch(/readyRows: committable/);
    expect(importSection).toMatch(/const ready = committableRows\(preview\)/);
  });
  it("a persisted preview is still unrepresentable", () => {
    expect(importCore).toMatch(/readonly persisted: false;/);
    expect(importSection).toMatch(/confirmation_token|confirmationToken/);
  });
  it("the plan is shown before the commit control, in words", () => {
    expect(importSection).toMatch(/data-testid="evidence-import-plan"/);
    expect(importSection.indexOf('data-testid="evidence-import-plan"')).toBeLessThan(
      importSection.indexOf("<EvidenceCommitForm"),
    );
  });
});

// ── 6. fixture leakage + debug prose ─────────────────────────────────────

describe("synthetic fixtures stay out of normal surfaces", () => {
  it("the one predicate recognises the documented markers and nothing else", () => {
    expect(isSyntheticFixtureLabel("[QA-SYNTHETIC] testinis pasiulymas")).toBe(true);
    expect(isSyntheticFixtureLabel("QA-SYNTHETIC Alfa (testinis subjektas)")).toBe(true);
    expect(isSyntheticFixtureLabel(null, undefined, "Formwork — Amsterdam Zuid")).toBe(false);
    expect(isSyntheticFixtureLabel("Testų UAB")).toBe(false);
  });
  for (const file of [
    "lib/demand/canonical-demand.ts",
    "lib/opportunities/load-worker-opportunities.ts",
    "lib/supply/employer-supply-discovery.ts",
  ]) {
    it(`${file} applies the predicate`, () => {
      expect(read(file)).toMatch(/isSyntheticFixtureLabel|excludeSyntheticFixtures/);
    });
  }
  it("no active-locale product copy carries a fixture marker or QA instruction", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const text = read(`messages/${locale}.json`);
      expect(text, `${locale}: QA-SYNTHETIC`).not.toMatch(/QA[-_ ]SYNTHETIC/i);
      expect(text, `${locale}: E2E fixture`).not.toMatch(/E2E[-_ ]FIXTURE/i);
    }
  });
  it("engineering prose is contextual help on the admin console, not persistent copy", () => {
    expect(adminPage).not.toMatch(/room\.kpi\.monitoringNote/);
    expect(adminPage).toMatch(/<details data-testid="admin-request-review-how">/);
    expect(adminPage).not.toMatch(/data-testid="admin-overview-kpis"/);
    expect(adminPage).toMatch(/data-testid="admin-attention"/);
  });
});

// ── 7. LT product copy of the doors is Lithuanian ────────────────────────

describe("the organization-door copy is real Lithuanian", () => {
  const lt = JSON.parse(read("messages/lt.json")) as { organizationDoors: unknown };
  const leaves: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") leaves.push(v);
    else if (v && typeof v === "object") Object.values(v as object).forEach(walk);
  };
  walk(lt.organizationDoors);
  it("has no [EN] placeholders and no bare English door words", () => {
    expect(leaves.length).toBeGreaterThan(20);
    for (const s of leaves) {
      expect(s, s).not.toMatch(/\[EN\]/);
      expect(s, s).not.toMatch(/^(People|Work|Needs|Calendar|History|Settings|Learning|Now)$/);
    }
  });
});

// ── 8. source week vs explicit date ───────────────────────────────────────

describe("historical import: source week vs explicit date is compared, never rewritten", () => {
  it("ISO week arithmetic: Monday 2025-12-15 is week 51", () => {
    expect(isoWeekOf("2025-12-15")).toBe(51);
    expect(isoWeekOf("2026-01-01")).toBe(1);
    expect(isoWeekOf("2024-12-30")).toBe(1);
    expect(readWeekNumber("W50")).toBe(50);
    expect(readWeekNumber("50 sav.")).toBe(50);
    expect(readWeekNumber("")).toBeNull();
  });
  it("owner acceptance case: week 50 stated, date 2025-12-15 → conflict, canonical week 51, source preserved", () => {
    const grid = [
      ["Darbuotojas", "Objektas", "Savaitė", "Data", "Valandos", "Darbai"],
      ["Jonas", "Amsterdam Zuid", "50", "2025-12-15", "8", "formwork installation"],
    ];
    const { rows } = rowsFromGrid(grid);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.workDate).toBe("2025-12-15");
    expect(row.factFields).toContain("workDate");
    expect(row.raw["Savaitė"]).toBe("50");
    expect(row.derived.calendarWeek).toEqual({
      value: 51,
      method: "iso_week_conflicts_with_source_week",
      confidence: 1,
      note: "source_week=50",
    });
  });
  it("a consistent week is recorded as consistent; no week column → nothing derived", () => {
    const ok = rowsFromGrid([
      ["Darbuotojas", "Savaitė", "Data", "Valandos"],
      ["Jonas", "51", "2025-12-15", "8"],
    ]).rows[0];
    expect(ok.derived.calendarWeek).toEqual({
      value: 51,
      method: "iso_week_of_explicit_date",
      confidence: 1,
    });
    const none = rowsFromGrid([
      ["Darbuotojas", "Data", "Valandos"],
      ["Jonas", "2025-12-15", "8"],
    ]).rows[0];
    expect(none.derived.calendarWeek).toBeUndefined();
  });
});
