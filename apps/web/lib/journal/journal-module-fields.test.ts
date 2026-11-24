import { describe, expect, it } from "vitest";
import {
  ALL_MODULE_SLUGS,
  allowedModuleSlugsFor,
  allowedModuleSlugsForRelationship,
  archetypesForSources,
  MODULE_FIELDS_MAX,
  MODULE_VALUE_MAX_LENGTH,
  moduleGroupsFor,
  moduleGroupsForRelationship,
  moduleMetricRows,
  parseModuleFields,
  readModuleFieldValues,
  serializeModuleFields,
} from "./journal-module-fields";
import { UNIVERSAL_CORE_SLUGS } from "./work-evidence-archetypes";
import { buildEditingEntry } from "./edit-entry";

/**
 * Archetype module fields (owner §12, issue #1689): the relationship the
 * work is done under decides which module fields an entry may carry; each
 * field is one metric row of the person's own words; the server accepts a
 * slug only inside the entry's own composition.
 */
describe("which fields a relationship composes", () => {
  it("a placement composes supervised practice: level, competency practised, learning outcome", () => {
    const groups = moduleGroupsForRelationship("student");
    expect(groups.map((g) => g.moduleId)).toEqual(["supervision"]);
    expect([...allowedModuleSlugsForRelationship("student")].sort()).toEqual([
      "competency_practiced",
      "learning_outcome",
      "supervision_level",
    ]);
  });
  it("volunteering composes the field project: place and crew, materials and tools, conditions and safety", () => {
    expect(moduleGroupsForRelationship("volunteer").map((g) => g.moduleId)).toEqual([
      "site_zone",
      "materials_tools",
      "weather_safety",
    ]);
  });
  it("an employee context adds nothing of its own — with no occupation in play, no generic form is manufactured", () => {
    expect(moduleGroupsForRelationship("employee")).toEqual([]);
    expect(allowedModuleSlugsForRelationship("employee").size).toBe(0);
  });
  it("unknown, empty and null relationships compose nothing", () => {
    for (const r of [null, undefined, "", "  ", "ceo", "manager"]) {
      expect(moduleGroupsForRelationship(r)).toEqual([]);
    }
  });
  it("no module slug is a universal-core slug", () => {
    for (const core of UNIVERSAL_CORE_SLUGS) expect(ALL_MODULE_SLUGS.has(core)).toBe(false);
  });
});

/**
 * The occupation path (re-audit 2026-09-11, gate 1 stale): the worker's own
 * profession → `professions.esco_uri` → `esco_occupations.isco_group` →
 * `archetypesForIsco`. The codes below are what production resolves today
 * (tiler 7122, software developer 2512, site manager 1323, welder 7212).
 */
describe("which fields an occupation composes", () => {
  it("a tiler (ISCO 7122 → 71) composes the construction trade's fields: place and crew, materials and tools, conditions and safety, inspection", () => {
    expect(moduleGroupsFor({ iscoGroups: ["7122"] }).map((g) => g.moduleId)).toEqual([
      "site_zone",
      "materials_tools",
      "weather_safety",
      "inspection",
    ]);
    expect(allowedModuleSlugsFor({ iscoGroups: ["7122"] }).has("inspection_result")).toBe(true);
    expect(allowedModuleSlugsFor({ iscoGroups: ["7122"] }).has("repository")).toBe(false);
  });
  it("a software developer (2512 → 25) composes software delivery and client/matter — nothing from the building site", () => {
    const groups = moduleGroupsFor({ iscoGroups: ["2512"], relationshipSlug: "employee" });
    expect(groups.map((g) => g.moduleId)).toEqual(["case_matter", "software_delivery"]);
    expect(allowedModuleSlugsFor({ iscoGroups: ["2512"] }).has("crew")).toBe(false);
  });
  it("occupation and relationship UNION: an apprentice welder gets the trade's fields AND the placement's supervision", () => {
    const ids = archetypesForSources({ iscoGroups: ["7212"], relationshipSlug: "student" });
    expect(ids).toContain("maintenance_repair");
    expect(ids).toContain("apprenticeship_training");
    const modules = moduleGroupsFor({ iscoGroups: ["7212"], relationshipSlug: "student" }).map((g) => g.moduleId);
    expect(modules).toContain("supervision");
    expect(modules).toContain("asset_fault");
    // each module once, in catalogue order, however many sources name it
    expect(new Set(modules).size).toBe(modules.length);
  });
  it("several own professions union too — the server's accept set is every family the worker holds", () => {
    const allowed = allowedModuleSlugsFor({ iscoGroups: ["7122", "2512"] });
    expect(allowed.has("inspection_result")).toBe(true);
    expect(allowed.has("repository")).toBe(true);
    expect(allowed.has("supervision_level")).toBe(false);
  });
  it("an unmapped profession (null ISCO — teacher, caregiver on production), a blank or a malformed code composes nothing: UNKNOWN is not a family", () => {
    for (const code of [null, undefined, "", "  ", "abc", "7-1", "12345"]) {
      expect(moduleGroupsFor({ iscoGroups: [code] })).toEqual([]);
    }
    expect(moduleGroupsFor({ iscoGroups: [null], relationshipSlug: "employee" })).toEqual([]);
    expect(moduleGroupsFor({})).toEqual([]);
  });
  it("a tiler's entry refuses a software field by name — the family, not the request, decides", () => {
    expect(
      moduleMetricRows(
        { inspection_result: "ok", ticket_ref: "LM-1" },
        allowedModuleSlugsFor({ iscoGroups: ["7122"], relationshipSlug: "employee" }),
      ),
    ).toEqual({ ok: false, refused: ["ticket_ref"] });
  });
  it("the relationship-only entry points are the same composition with no occupation", () => {
    expect(moduleGroupsForRelationship("student")).toEqual(moduleGroupsFor({ relationshipSlug: "student" }));
    expect([...allowedModuleSlugsForRelationship("volunteer")].sort()).toEqual(
      [...allowedModuleSlugsFor({ relationshipSlug: "volunteer", iscoGroups: [] })].sort(),
    );
  });
  it("no module slug is a universal-core slug (occupation path included)", () => {
    for (const core of UNIVERSAL_CORE_SLUGS) expect(ALL_MODULE_SLUGS.has(core)).toBe(false);
  });
});

describe("wire form: serialize ↔ parse", () => {
  it("serializes only non-empty trimmed values, null when nothing is there", () => {
    expect(serializeModuleFields({})).toBeNull();
    expect(serializeModuleFields({ crew: "  ", weather: "" })).toBeNull();
    expect(JSON.parse(serializeModuleFields({ crew: " 3 žmonės " })!)).toEqual({
      crew: "3 žmonės",
    });
  });
  it("parses an object of module slug → string, dropping everything else", () => {
    const parsed = parseModuleFields(
      JSON.stringify({
        crew: " 3 žmonės ",
        topic: "a core slug never rides here",
        quantity: "core",
        not_a_module_slug: "x",
        "Bad Slug": "x",
        weather: 7,
        materials: "",
      }),
    );
    expect(parsed).toEqual({ crew: "3 žmonės" });
  });
  it("caps a value at the field maximum and the field count at the hard cap", () => {
    const long = "x".repeat(MODULE_VALUE_MAX_LENGTH + 50);
    expect(parseModuleFields(JSON.stringify({ crew: long })).crew).toHaveLength(
      MODULE_VALUE_MAX_LENGTH,
    );
    const many = Object.fromEntries([...ALL_MODULE_SLUGS].map((s) => [s, "v"]));
    expect(Object.keys(parseModuleFields(JSON.stringify(many))).length).toBeLessThanOrEqual(
      MODULE_FIELDS_MAX,
    );
  });
  it("malformed input degrades to nothing, never a throw", () => {
    for (const raw of [null, undefined, "", "not json", "[]", "42", '"str"', "null"]) {
      expect(parseModuleFields(raw)).toEqual({});
    }
  });
});

describe("rows for the atomic save", () => {
  it("one worker_input row per accepted slug", () => {
    const r = moduleMetricRows(
      { supervision_level: "meistras šalia", learning_outcome: "glaistymas" },
      allowedModuleSlugsForRelationship("student"),
    );
    expect(r).toEqual({
      ok: true,
      rows: [
        { metric_slug: "supervision_level", value_text: "meistras šalia", source: "worker_input" },
        { metric_slug: "learning_outcome", value_text: "glaistymas", source: "worker_input" },
      ],
    });
  });
  it("a slug outside the entry's composition is refused by name — never silently dropped", () => {
    const r = moduleMetricRows(
      { supervision_level: "ok", crew: "a volunteer field on a placement" },
      allowedModuleSlugsForRelationship("student"),
    );
    expect(r).toEqual({ ok: false, refused: ["crew"] });
  });
  it("an employee context refuses every module slug (it composes none)", () => {
    expect(
      moduleMetricRows({ crew: "x" }, allowedModuleSlugsForRelationship("employee")),
    ).toEqual({ ok: false, refused: ["crew"] });
  });
});

describe("preload for an edit", () => {
  const metrics = [
    { metric_slug: "topic", value_text: "core, not a module", value_numeric: null, unit_slug: null },
    { metric_slug: "supervision_level", value_text: " meistras ", value_numeric: null, unit_slug: null },
    { metric_slug: "supervision_level", value_text: "second row loses", value_numeric: null, unit_slug: null },
    { metric_slug: "learning_outcome", value_text: "  ", value_numeric: null, unit_slug: null },
    { metric_slug: "fragment_time", value_text: "1", value_numeric: 4, unit_slug: "hours" },
  ];
  it("reads module rows only, first non-empty per slug, trimmed", () => {
    expect(readModuleFieldValues(metrics)).toEqual({ supervision_level: "meistras" });
    expect(readModuleFieldValues(null)).toEqual({});
  });
  it("buildEditingEntry carries them so an untouched edit re-sends them", () => {
    const entry = buildEditingEntry({ id: "e1", originalText: "t", metrics });
    expect(entry.moduleFields).toEqual({ supervision_level: "meistras" });
    expect(entry.topic).toBe("core, not a module");
  });
});
