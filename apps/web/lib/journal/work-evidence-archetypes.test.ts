import { describe, expect, it } from "vitest";

import {
  archetypesForIsco,
  archetypesForRelationship,
  composeJournal,
  ISCO_ARCHETYPES,
  ISCO_SUB_MAJOR_GROUPS,
  JOURNAL_MODULES,
  RELATIONSHIP_ARCHETYPES,
  UNIVERSAL_CORE_SLUGS,
  WORK_EVIDENCE_ARCHETYPE_IDS,
  WORK_EVIDENCE_ARCHETYPES,
} from "./work-evidence-archetypes";

describe("the archetype catalogue is complete and closed", () => {
  it("defines every declared archetype exactly once", () => {
    const ids = WORK_EVIDENCE_ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...WORK_EVIDENCE_ARCHETYPE_IDS].sort());
  });

  it("every archetype names the real-world record it is modelled on", () => {
    for (const a of WORK_EVIDENCE_ARCHETYPES) {
      expect(a.modelledOn.length, a.id).toBeGreaterThan(20);
      expect(a.modules.length, a.id).toBeGreaterThan(0);
      expect(a.evidence.length, a.id).toBeGreaterThan(0);
    }
  });

  it("every archetype is used by an ISCO family or a relationship (no orphan patterns)", () => {
    const used = new Set([
      ...Object.values(ISCO_ARCHETYPES).flat(),
      ...Object.values(RELATIONSHIP_ARCHETYPES).flat(),
    ]);
    for (const id of WORK_EVIDENCE_ARCHETYPE_IDS) expect(used.has(id), id).toBe(true);
  });

  it("an apprentice electrician composes trade work AND supervised training", () => {
    const c = composeJournal([...archetypesForIsco("7411"), ...archetypesForRelationship("student")]);
    expect(c.modules).toContain("inspection");
    expect(c.modules).toContain("supervision");
    expect(c.regulatory).toEqual(expect.arrayContaining(["licence_hours", "supervised_practice"]));
    expect(archetypesForRelationship("employee")).toEqual([]);
  });
});

describe("ISCO-08 coverage — the full world of work", () => {
  it("every one of the 43 sub-major groups resolves to at least one archetype", () => {
    expect(ISCO_SUB_MAJOR_GROUPS).toHaveLength(43);
    for (const g of ISCO_SUB_MAJOR_GROUPS) {
      expect(archetypesForIsco(g).length, `ISCO ${g}`).toBeGreaterThan(0);
    }
  });

  it("a 4-digit unit group resolves through its minor group first, then sub-major", () => {
    expect(archetypesForIsco("2611")).toEqual(ISCO_ARCHETYPES["261"]); // lawyers
    expect(archetypesForIsco("2612")).toEqual(ISCO_ARCHETYPES["261"]); // judges
    expect(archetypesForIsco("2631")).toEqual(ISCO_ARCHETYPES["263"]); // economists
    expect(archetypesForIsco("2141")).toEqual(ISCO_ARCHETYPES["21"]); // industrial engineers
    expect(archetypesForIsco("8332")).toEqual(ISCO_ARCHETYPES["83"]); // heavy truck drivers
    expect(archetypesForIsco("8350")).toEqual(ISCO_ARCHETYPES["835"]); // ships' deck crews
    expect(archetypesForIsco("7126")).toEqual(ISCO_ARCHETYPES["71"]); // plumbers
    expect(archetypesForIsco("2221")).toEqual(ISCO_ARCHETYPES["22"]); // nurses
  });

  it("the owner's examples compose to the expected pattern mix", () => {
    // electrician (7411) → trade + maintenance; regulated evidence via safety/inspection
    const electrician = composeJournal(archetypesForIsco("7411"));
    expect(electrician.archetypes).toEqual(["maintenance_repair", "construction_trade"]);
    expect(electrician.modules).toContain("inspection");
    expect(electrician.modules).toContain("asset_fault");
    // software engineer (2512) → software + knowledge project; time never forced to a clock
    const dev = composeJournal(archetypesForIsco("2512"));
    expect(dev.timeModel).toBe("activity_duration");
    expect(dev.modules).toContain("software_delivery");
    expect(dev.evidence).toContain("system_record");
    // nurse (2221) → shift + clinical + supervised practice + case work; patient privacy
    const nurse = composeJournal(archetypesForIsco("2221"));
    expect(nurse.timeModel).toBe("shift");
    expect(nurse.privacy).toContain("patient_confidential");
    expect(nurse.regulatory).toContain("supervised_practice");
    expect(nurse.skillTimeAttribution).toBe("involvement");
    // manager (1212) → management + project/knowledge work
    const manager = composeJournal(archetypesForIsco("1212"));
    expect(manager.modules).toContain("management");
    expect(manager.skillTimeAttribution).toBe("involvement");
    // driver (8332) keeps driving / duty / rest apart
    const driver = composeJournal(archetypesForIsco("8332"));
    expect(driver.timeModel).toBe("driving_duty_rest");
    expect(driver.metricSlugs).toEqual(expect.arrayContaining(["driving_time", "duty_time", "rest_time"]));
  });

  it("unknown or malformed codes compose to the universal core alone", () => {
    expect(archetypesForIsco(null)).toEqual([]);
    expect(archetypesForIsco("x1")).toEqual([]);
    expect(archetypesForIsco("99")).toEqual([]);
    const empty = composeJournal([]);
    expect(empty.modules).toEqual([]);
    expect(empty.metricSlugs).toEqual([]);
    expect(empty.skillTimeAttribution).toBe("involvement");
  });
});

describe("composition — union of modules, strictest time, most cautious attribution", () => {
  it("never re-declares a universal core slug and keeps slugs lower_snake", () => {
    const core = new Set<string>(UNIVERSAL_CORE_SLUGS);
    for (const [mod, slugs] of Object.entries(JOURNAL_MODULES)) {
      for (const s of slugs) {
        expect(/^[a-z][a-z0-9_]{1,39}$/.test(s), `${mod}.${s}`).toBe(true);
        expect(core.has(s), `${mod}.${s} collides with the universal core`).toBe(false);
      }
    }
  });

  it("a surgeon is never shown construction quantity fields; a warehouse worker never clinical ones", () => {
    const surgeon = composeJournal(archetypesForIsco("2212"));
    expect(surgeon.modules).not.toContain("site_zone");
    expect(surgeon.modules).not.toContain("materials_tools");
    const warehouse = composeJournal(archetypesForIsco("4321"));
    expect(warehouse.modules).not.toContain("supervision");
    expect(warehouse.modules).not.toContain("care_visit");
    expect(warehouse.modules).not.toContain("software_delivery");
  });

  it("composition is deterministic and order-independent", () => {
    const a = composeJournal(["construction_trade", "maintenance_repair"]);
    const b = composeJournal(["maintenance_repair", "construction_trade", "maintenance_repair"]);
    expect(b.modules).toEqual(a.modules);
    expect(b.metricSlugs).toEqual(a.metricSlugs);
    expect(b.timeModel).toEqual(a.timeModel);
  });
});
